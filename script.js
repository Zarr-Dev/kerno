(() => {
"use strict";
const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
const DB_NAME = "kerno-workspaces";
const DB_VERSION = 1;
const FILE_LIMIT = 2 * 1024 * 1024;
const PROJECT_LIMIT = 20 * 1024 * 1024;
let database = null;
let monacoLoad = null;
let jszipLoad = null;
let monacoAssistRegistered = false;
const externalScriptLoads = new Map();
const quickCheckTimers = new WeakMap();

const DEFAULTS = {
  locale:"id", theme:"dark", accent:"sage", density:"balanced",
  autosave:true, confirmDestructive:true, startScreen:"welcome",
  editorFontSize:14, editorFontFamily:"DM Mono", tabSize:4, wordWrap:"off", lineNumbers:true, minimap:false,
  cursorStyle:"line", smoothScrolling:true, bracketPairColorization:true, renderWhitespace:"selection",
  autoSaveDelayMs:800, defaultTemplate:"kernel-text", uiScale:100, reduceMotion:false, motionLevel:"standard", quickDiagnostics:true, codeAssist:true, highContrastFocus:false,
  debugSymbols:true, warningsAsErrors:false, kernelLogLevel:"info", retainBuildLogs:true,
  grubTimeout:3, grubDefault:0, kernelCommandLine:"", qemuCpuModel:"max", qemuNetwork:"none", serialBackend:"file",
  cCompiler:"x86_64-elf-gcc", objcopy:"x86_64-elf-objcopy", readelf:"x86_64-elf-readelf",
  projectArchitecture:"x86_64", projectFirmware:"bios", projectBootloader:"grub",
  projectKernelLanguage:"cpp", projectOptimization:"debug",
  projectGuestMemoryMiB:512, projectHeapReserveMiB:16, projectStackReserveKiB:512,
  projectPageSize:"4KiB", projectKernelBase:"0x00100000",
  projectQemuBinary:"qemu-system-x86_64", projectQemuMachine:"q35", projectQemuDisplay:"std",
  projectQemuVcpus:2, projectQemuVncPort:5901, projectQemuAcceleration:"auto",
  projectQemuCpuModel:"max", projectQemuNetwork:"none",
  projectGrubTimeout:3, projectGrubDefault:0, projectKernelCommandLine:"",
  defaultArchitecture:"x86_64", defaultFirmware:"bios", defaultBootloader:"grub",
  defaultKernelLanguage:"cpp", optimization:"debug",
  guestMemoryMiB:512, heapReserveMiB:16, stackReserveKiB:512, pageSize:"4KiB", kernelBase:"0x00100000",
  qemuBinary:"qemu-system-x86_64", qemuMachine:"q35", qemuDisplay:"std", qemuVcpus:2, qemuCpuModel:"max", qemuNetwork:"none",
  qemuVncPort:5901, qemuAcceleration:"auto",
  localServiceUrl:"http://127.0.0.1:8765", localServiceToken:"",
  assembler:"nasm", crossCompiler:"x86_64-elf-g++", cCompiler:"x86_64-elf-gcc", linker:"x86_64-elf-ld", isoBuilder:"grub-mkrescue", objcopy:"x86_64-elf-objcopy", readelf:"x86_64-elf-readelf"
};

const LANGUAGES = {
  en:{startArrow:"Start a project →",openWorkspace:"Open workspace →",openSettings:"Open settings →",workspaceHistory:"WORKSPACE HISTORY",clearHistory:"Clear history",noAccount:"No account required · Project data stays in this browser until exported",newOsWorkspace:"New operating system workspace",newOsLead:"Choose the machine target and kernel foundation. Kerno creates the initial source tree and project configuration.",scaffoldNote:"These are editable source files. A verified boot image still requires a matching native toolchain and boot protocol.",machineDesc:"Live guest output is streamed from the connected local QEMU service.",buildConfiguration:"Build configuration",buildConfigurationDesc:"Review the target before invoking the connected native build service.",settings:"Settings",back:"Back",welcomeTitle:"Build an OS from the first instruction.",welcomeSubtitle:"Kerno is a focused IDE for writing C, C++, Assembly and Python, shaping a kernel project, validating a native build, and testing a bootable image in QEMU.",newProject:"New project",newProjectDesc:"Create a structured OS workspace from a kernel template.",loadProject:"Load project",loadProjectDesc:"Open a Kerno archive, project manifest or source directory.",configureIDE:"Configure IDE",configureDesc:"Set language, appearance, editor behavior and local tools.",recentProjects:"Recent projects",noRecent:"No recent projects",noRecentDesc:"Create or load an OS project to begin.",createWorkspace:"Create workspace",projectName:"Project name",starterTemplate:"Starter template",architecture:"Architecture",firmware:"Firmware",kernelLanguage:"Kernel language",bootloader:"Bootloader",guestMemory:"Guest RAM (MiB)",virtualCpus:"Virtual CPUs",applySettings:"Apply settings",general:"General",appearance:"Appearance",language:"Language",editor:"Editor",osArchitecture:"OS & Architecture",memory:"Memory",emulator:"QEMU & Emulator",toolchain:"Toolchain",storage:"Storage & Data",advanced:"Advanced",bootSettings:"Boot & Firmware",diagnostics:"Diagnostics",accessibility:"Accessibility",shortcuts:"Keyboard & Shortcuts",source:"Source",machine:"Machine",build:"Build",importFiles:"Import files",exportProject:"Export project",buildBoot:"Build & Boot",projectFiles:"Project files",cancel:"Cancel",machineDisplay:"Machine display",noMachineSession:"No machine session",connectQemuPrompt:"Connect Kerno Local Service to launch and display a QEMU guest."},
  id:{settings:"Pengaturan",back:"Kembali",welcomeTitle:"Bangun OS dari instruksi pertamanya.",welcomeSubtitle:"Kerno adalah IDE terfokus untuk menulis C, C++, Assembly, dan Python, menyusun proyek kernel, memvalidasi build native, serta menguji ISO bootable melalui QEMU.",newProject:"Proyek baru",newProjectDesc:"Buat workspace OS terstruktur dari template kernel.",loadProject:"Muat proyek",loadProjectDesc:"Buka arsip Kerno atau direktori source.",configureIDE:"Konfigurasi IDE",configureDesc:"Atur bahasa, tampilan, editor, dan tool lokal.",recentProjects:"Proyek terbaru",noRecent:"Belum ada proyek",noRecentDesc:"Buat atau muat proyek OS untuk memulai.",createWorkspace:"Buat workspace",projectName:"Nama proyek",starterTemplate:"Template awal",architecture:"Arsitektur",firmware:"Firmware",kernelLanguage:"Bahasa kernel",bootloader:"Bootloader",guestMemory:"RAM guest (MiB)",virtualCpus:"CPU virtual",applySettings:"Terapkan pengaturan",general:"Umum",appearance:"Tampilan",language:"Bahasa",editor:"Editor",osArchitecture:"OS & Arsitektur",memory:"Memori",emulator:"QEMU & Emulator",toolchain:"Toolchain",storage:"Penyimpanan & Data",advanced:"Lanjutan",bootSettings:"Boot & Firmware",diagnostics:"Diagnostik",accessibility:"Aksesibilitas",shortcuts:"Keyboard & Pintasan",source:"Source",machine:"Mesin",build:"Build",importFiles:"Impor file",exportProject:"Ekspor proyek",buildBoot:"Build & Boot",projectFiles:"File proyek",cancel:"Batal",machineDisplay:"Tampilan mesin",noMachineSession:"Belum ada sesi mesin",connectQemuPrompt:"Hubungkan Kerno Local Service untuk menjalankan guest QEMU."},
  ms:{settings:"Tetapan",back:"Kembali",welcomeTitle:"Bina sistem operasi anda.",welcomeSubtitle:"Persekitaran khusus untuk source kernel, konfigurasi mesin, memori dan emulator.",newProject:"Projek baharu",newProjectDesc:"Cipta workspace OS daripada templat kernel.",loadProject:"Muat projek",loadProjectDesc:"Buka arkib Kerno atau direktori source.",configureIDE:"Konfigurasi IDE",configureDesc:"Tetapkan bahasa, penampilan dan alat setempat.",recentProjects:"Projek terkini",noRecent:"Tiada projek terkini",noRecentDesc:"Cipta atau muat projek OS untuk bermula.",createWorkspace:"Cipta workspace",projectName:"Nama projek",starterTemplate:"Templat permulaan",architecture:"Seni bina",firmware:"Firmware",kernelLanguage:"Bahasa kernel",bootloader:"Bootloader",guestMemory:"RAM guest (MiB)",virtualCpus:"CPU maya",applySettings:"Gunakan tetapan",general:"Umum",appearance:"Penampilan",language:"Bahasa",editor:"Editor",osArchitecture:"OS & Seni bina",memory:"Memori",emulator:"QEMU & Emulator",toolchain:"Toolchain",storage:"Storan & Data",advanced:"Lanjutan",source:"Source",machine:"Mesin",build:"Build",importFiles:"Import fail",exportProject:"Eksport projek",buildBoot:"Build & Boot",projectFiles:"Fail projek",cancel:"Batal",machineDisplay:"Paparan mesin",noMachineSession:"Tiada sesi mesin",connectQemuPrompt:"Sambungkan Kerno Local Service untuk menjalankan QEMU."},
  zh:{settings:"设置",back:"返回",welcomeTitle:"构建你自己的操作系统。",welcomeSubtitle:"专注于内核源代码、机器配置、内存规划和模拟器工作流。",newProject:"新建项目",newProjectDesc:"从内核模板创建操作系统工作区。",loadProject:"加载项目",loadProjectDesc:"打开 Kerno 压缩包或源代码目录。",configureIDE:"配置 IDE",configureDesc:"设置语言、外观、编辑器和本地工具。",recentProjects:"最近项目",noRecent:"没有最近项目",noRecentDesc:"创建或加载操作系统项目以开始。",createWorkspace:"创建工作区",projectName:"项目名称",starterTemplate:"起始模板",architecture:"架构",firmware:"固件",kernelLanguage:"内核语言",bootloader:"引导程序",guestMemory:"客户机内存 (MiB)",virtualCpus:"虚拟 CPU",applySettings:"应用设置",general:"常规",appearance:"外观",language:"语言",editor:"编辑器",osArchitecture:"操作系统与架构",memory:"内存",emulator:"QEMU 与模拟器",toolchain:"工具链",storage:"存储与数据",advanced:"高级",source:"源代码",machine:"机器",build:"构建",importFiles:"导入文件",exportProject:"导出项目",buildBoot:"构建并启动",projectFiles:"项目文件",cancel:"取消",machineDisplay:"机器显示",noMachineSession:"没有机器会话",connectQemuPrompt:"连接 Kerno Local Service 以启动 QEMU 客户机。"},
  ja:{settings:"設定",back:"戻る",welcomeTitle:"自分のオペレーティングシステムを構築。",welcomeSubtitle:"カーネルソース、マシン構成、メモリ計画、エミュレーターに集中できる環境。",newProject:"新規プロジェクト",newProjectDesc:"カーネルテンプレートから OS ワークスペースを作成。",loadProject:"プロジェクトを読み込む",loadProjectDesc:"Kerno アーカイブまたはソースディレクトリを開く。",configureIDE:"IDE を設定",configureDesc:"言語、外観、エディター、ローカルツールを設定。",recentProjects:"最近のプロジェクト",noRecent:"最近のプロジェクトはありません",noRecentDesc:"OS プロジェクトを作成または読み込んで開始。",createWorkspace:"ワークスペースを作成",projectName:"プロジェクト名",starterTemplate:"開始テンプレート",architecture:"アーキテクチャ",firmware:"ファームウェア",kernelLanguage:"カーネル言語",bootloader:"ブートローダー",guestMemory:"ゲスト RAM (MiB)",virtualCpus:"仮想 CPU",applySettings:"設定を適用",general:"一般",appearance:"外観",language:"言語",editor:"エディター",osArchitecture:"OS とアーキテクチャ",memory:"メモリ",emulator:"QEMU とエミュレーター",toolchain:"ツールチェーン",storage:"ストレージとデータ",advanced:"詳細設定",source:"ソース",machine:"マシン",build:"ビルド",importFiles:"ファイルをインポート",exportProject:"プロジェクトをエクスポート",buildBoot:"ビルドして起動",projectFiles:"プロジェクトファイル",cancel:"キャンセル",machineDisplay:"マシン画面",noMachineSession:"マシンセッションなし",connectQemuPrompt:"Kerno Local Service に接続して QEMU を起動。"},
  ko:{settings:"설정",back:"뒤로",welcomeTitle:"나만의 운영체제를 만드세요.",welcomeSubtitle:"커널 소스, 머신 구성, 메모리 계획 및 에뮬레이터 환경입니다.",newProject:"새 프로젝트",newProjectDesc:"커널 템플릿으로 OS 작업 공간을 만듭니다.",loadProject:"프로젝트 불러오기",loadProjectDesc:"Kerno 아카이브 또는 소스 디렉터리를 엽니다.",configureIDE:"IDE 구성",configureDesc:"언어, 모양, 편집기 및 로컬 도구 설정.",recentProjects:"최근 프로젝트",noRecent:"최근 프로젝트가 없습니다",noRecentDesc:"OS 프로젝트를 만들거나 불러오세요.",createWorkspace:"작업 공간 만들기",projectName:"프로젝트 이름",starterTemplate:"시작 템플릿",architecture:"아키텍처",firmware:"펌웨어",kernelLanguage:"커널 언어",bootloader:"부트로더",guestMemory:"게스트 RAM (MiB)",virtualCpus:"가상 CPU",applySettings:"설정 적용",general:"일반",appearance:"모양",language:"언어",editor:"편집기",osArchitecture:"OS 및 아키텍처",memory:"메모리",emulator:"QEMU 및 에뮬레이터",toolchain:"도구체인",storage:"저장소 및 데이터",advanced:"고급",source:"소스",machine:"머신",build:"빌드",importFiles:"파일 가져오기",exportProject:"프로젝트 내보내기",buildBoot:"빌드 및 부팅",projectFiles:"프로젝트 파일",cancel:"취소",machineDisplay:"머신 디스플레이",noMachineSession:"머신 세션 없음",connectQemuPrompt:"Kerno Local Service에 연결하여 QEMU 실행."},
  de:{settings:"Einstellungen",back:"Zurück",welcomeTitle:"Baue dein eigenes Betriebssystem.",welcomeSubtitle:"Umgebung für Kernel-Quellcode, Maschinenkonfiguration, Speicher und Emulator.",newProject:"Neues Projekt",newProjectDesc:"OS-Arbeitsbereich aus Kernel-Vorlage erstellen.",loadProject:"Projekt laden",loadProjectDesc:"Kerno-Archiv oder Quellverzeichnis öffnen.",configureIDE:"IDE konfigurieren",configureDesc:"Sprache, Darstellung, Editor und lokale Tools einstellen.",recentProjects:"Zuletzt verwendete Projekte",noRecent:"Keine aktuellen Projekte",noRecentDesc:"Erstelle oder lade ein OS-Projekt.",createWorkspace:"Arbeitsbereich erstellen",projectName:"Projektname",starterTemplate:"Startvorlage",architecture:"Architektur",firmware:"Firmware",kernelLanguage:"Kernel-Sprache",bootloader:"Bootloader",guestMemory:"Gast-RAM (MiB)",virtualCpus:"Virtuelle CPUs",applySettings:"Einstellungen übernehmen",general:"Allgemein",appearance:"Darstellung",language:"Sprache",editor:"Editor",osArchitecture:"OS & Architektur",memory:"Speicher",emulator:"QEMU & Emulator",toolchain:"Toolchain",storage:"Speicher & Daten",advanced:"Erweitert",source:"Quellcode",machine:"Maschine",build:"Build",importFiles:"Dateien importieren",exportProject:"Projekt exportieren",buildBoot:"Build & Boot",projectFiles:"Projektdateien",cancel:"Abbrechen",machineDisplay:"Maschinenanzeige",noMachineSession:"Keine Maschinensitzung",connectQemuPrompt:"Verbinde Kerno Local Service, um QEMU zu starten."},
  fr:{settings:"Paramètres",back:"Retour",welcomeTitle:"Construisez votre système d’exploitation.",welcomeSubtitle:"Environnement dédié au noyau, à la configuration machine, à la mémoire et à l’émulation.",newProject:"Nouveau projet",newProjectDesc:"Créer un espace OS depuis un modèle de noyau.",loadProject:"Charger un projet",loadProjectDesc:"Ouvrir une archive Kerno ou un dossier source.",configureIDE:"Configurer l’IDE",configureDesc:"Régler la langue, l’apparence et les outils locaux.",recentProjects:"Projets récents",noRecent:"Aucun projet récent",noRecentDesc:"Créez ou chargez un projet OS.",createWorkspace:"Créer l’espace",projectName:"Nom du projet",starterTemplate:"Modèle de départ",architecture:"Architecture",firmware:"Firmware",kernelLanguage:"Langage du noyau",bootloader:"Chargeur d’amorçage",guestMemory:"RAM invitée (MiB)",virtualCpus:"CPU virtuels",applySettings:"Appliquer les paramètres",general:"Général",appearance:"Apparence",language:"Langue",editor:"Éditeur",osArchitecture:"OS & Architecture",memory:"Mémoire",emulator:"QEMU & Émulateur",toolchain:"Toolchain",storage:"Stockage & Données",advanced:"Avancé",source:"Sources",machine:"Machine",build:"Build",importFiles:"Importer fichiers",exportProject:"Exporter projet",buildBoot:"Build & Boot",projectFiles:"Fichiers du projet",cancel:"Annuler",machineDisplay:"Affichage machine",noMachineSession:"Aucune session machine",connectQemuPrompt:"Connectez Kerno Local Service pour lancer QEMU."},
  es:{settings:"Ajustes",back:"Volver",welcomeTitle:"Construye tu propio sistema operativo.",welcomeSubtitle:"Entorno centrado en código kernel, configuración de máquina, memoria y emulación.",newProject:"Nuevo proyecto",newProjectDesc:"Crea un espacio OS desde una plantilla kernel.",loadProject:"Cargar proyecto",loadProjectDesc:"Abre un archivo Kerno o directorio fuente.",configureIDE:"Configurar IDE",configureDesc:"Configura idioma, apariencia y herramientas locales.",recentProjects:"Proyectos recientes",noRecent:"No hay proyectos recientes",noRecentDesc:"Crea o carga un proyecto OS.",createWorkspace:"Crear espacio",projectName:"Nombre del proyecto",starterTemplate:"Plantilla inicial",architecture:"Arquitectura",firmware:"Firmware",kernelLanguage:"Lenguaje del kernel",bootloader:"Cargador de arranque",guestMemory:"RAM invitada (MiB)",virtualCpus:"CPU virtuales",applySettings:"Aplicar ajustes",general:"General",appearance:"Apariencia",language:"Idioma",editor:"Editor",osArchitecture:"SO y arquitectura",memory:"Memoria",emulator:"QEMU y emulador",toolchain:"Toolchain",storage:"Almacenamiento y datos",advanced:"Avanzado",source:"Código",machine:"Máquina",build:"Compilar",importFiles:"Importar archivos",exportProject:"Exportar proyecto",buildBoot:"Compilar y arrancar",projectFiles:"Archivos del proyecto",cancel:"Cancelar",machineDisplay:"Pantalla de máquina",noMachineSession:"Sin sesión de máquina",connectQemuPrompt:"Conecta Kerno Local Service para iniciar QEMU."},
  pt:{settings:"Configurações",back:"Voltar",welcomeTitle:"Construa seu próprio sistema operacional.",welcomeSubtitle:"Ambiente focado em kernel, máquina, memória e emulação.",newProject:"Novo projeto",newProjectDesc:"Crie um workspace OS a partir de um modelo kernel.",loadProject:"Carregar projeto",loadProjectDesc:"Abra um arquivo Kerno ou diretório de fontes.",configureIDE:"Configurar IDE",configureDesc:"Defina idioma, aparência e ferramentas locais.",recentProjects:"Projetos recentes",noRecent:"Nenhum projeto recente",noRecentDesc:"Crie ou carregue um projeto de SO.",createWorkspace:"Criar workspace",projectName:"Nome do projeto",starterTemplate:"Modelo inicial",architecture:"Arquitetura",firmware:"Firmware",kernelLanguage:"Linguagem do kernel",bootloader:"Bootloader",guestMemory:"RAM convidada (MiB)",virtualCpus:"CPUs virtuais",applySettings:"Aplicar configurações",general:"Geral",appearance:"Aparência",language:"Idioma",editor:"Editor",osArchitecture:"SO e arquitetura",memory:"Memória",emulator:"QEMU e emulador",toolchain:"Toolchain",storage:"Armazenamento e dados",advanced:"Avançado",source:"Código-fonte",machine:"Máquina",build:"Build",importFiles:"Importar arquivos",exportProject:"Exportar projeto",buildBoot:"Build & Boot",projectFiles:"Arquivos do projeto",cancel:"Cancelar",machineDisplay:"Tela da máquina",noMachineSession:"Nenhuma sessão",connectQemuPrompt:"Conecte Kerno Local Service para iniciar o QEMU."},
  ru:{settings:"Настройки",back:"Назад",welcomeTitle:"Создайте собственную операционную систему.",welcomeSubtitle:"Среда для ядра, конфигурации машины, памяти и эмулятора.",newProject:"Новый проект",newProjectDesc:"Создайте рабочую область ОС из шаблона ядра.",loadProject:"Загрузить проект",loadProjectDesc:"Откройте архив Kerno или каталог исходников.",configureIDE:"Настроить IDE",configureDesc:"Настройте язык, оформление и локальные инструменты.",recentProjects:"Недавние проекты",noRecent:"Нет недавних проектов",noRecentDesc:"Создайте или загрузите проект ОС.",createWorkspace:"Создать рабочую область",projectName:"Имя проекта",starterTemplate:"Шаблон",architecture:"Архитектура",firmware:"Прошивка",kernelLanguage:"Язык ядра",bootloader:"Загрузчик",guestMemory:"Память гостя (MiB)",virtualCpus:"Виртуальные CPU",applySettings:"Применить настройки",general:"Общие",appearance:"Оформление",language:"Язык",editor:"Редактор",osArchitecture:"ОС и архитектура",memory:"Память",emulator:"QEMU и эмулятор",toolchain:"Инструменты",storage:"Хранилище и данные",advanced:"Дополнительно",source:"Исходники",machine:"Машина",build:"Сборка",importFiles:"Импорт файлов",exportProject:"Экспорт проекта",buildBoot:"Сборка и запуск",projectFiles:"Файлы проекта",cancel:"Отмена",machineDisplay:"Экран машины",noMachineSession:"Нет сеанса машины",connectQemuPrompt:"Подключите Kerno Local Service для запуска QEMU."},
  tr:{settings:"Ayarlar",back:"Geri",welcomeTitle:"Kendi işletim sisteminizi oluşturun.",welcomeSubtitle:"Kernel kodu, makine, bellek ve emülasyon ortamı.",newProject:"Yeni proje",newProjectDesc:"Kernel şablonundan OS çalışma alanı oluşturun.",loadProject:"Projeyi yükle",loadProjectDesc:"Kerno arşivi veya kaynak klasörü açın.",configureIDE:"IDE'yi yapılandır",configureDesc:"Dil, görünüm ve yerel araçları ayarlayın.",recentProjects:"Son projeler",noRecent:"Yakın zamanda proje yok",noRecentDesc:"Bir OS projesi oluşturun veya yükleyin.",createWorkspace:"Çalışma alanı oluştur",projectName:"Proje adı",starterTemplate:"Başlangıç şablonu",architecture:"Mimari",firmware:"Firmware",kernelLanguage:"Kernel dili",bootloader:"Önyükleyici",guestMemory:"Konuk RAM (MiB)",virtualCpus:"Sanal CPU",applySettings:"Ayarları uygula",general:"Genel",appearance:"Görünüm",language:"Dil",editor:"Editör",osArchitecture:"OS ve Mimari",memory:"Bellek",emulator:"QEMU ve Emülatör",toolchain:"Araç zinciri",storage:"Depolama ve Veri",advanced:"Gelişmiş",source:"Kaynak",machine:"Makine",build:"Derleme",importFiles:"Dosyaları içe aktar",exportProject:"Projeyi dışa aktar",buildBoot:"Derle ve başlat",projectFiles:"Proje dosyaları",cancel:"İptal",machineDisplay:"Makine ekranı",noMachineSession:"Makine oturumu yok",connectQemuPrompt:"QEMU için Kerno Local Service'e bağlanın."},
  ar:{settings:"الإعدادات",back:"رجوع",welcomeTitle:"أنشئ نظام التشغيل الخاص بك.",welcomeSubtitle:"بيئة متخصصة للنواة وإعداد الجهاز والذاكرة والمحاكي.",newProject:"مشروع جديد",newProjectDesc:"إنشاء مساحة عمل من قالب نواة.",loadProject:"تحميل مشروع",loadProjectDesc:"افتح أرشيف Kerno أو مجلد المصدر.",configureIDE:"تكوين IDE",configureDesc:"اضبط اللغة والمظهر والأدوات المحلية.",recentProjects:"المشاريع الأخيرة",noRecent:"لا توجد مشاريع حديثة",noRecentDesc:"أنشئ مشروع نظام تشغيل أو حمّله.",createWorkspace:"إنشاء مساحة عمل",projectName:"اسم المشروع",starterTemplate:"القالب الأساسي",architecture:"المعمارية",firmware:"البرنامج الثابت",kernelLanguage:"لغة النواة",bootloader:"محمل الإقلاع",guestMemory:"ذاكرة الضيف (MiB)",virtualCpus:"وحدات CPU افتراضية",applySettings:"تطبيق الإعدادات",general:"عام",appearance:"المظهر",language:"اللغة",editor:"المحرر",osArchitecture:"النظام والمعمارية",memory:"الذاكرة",emulator:"QEMU والمحاكي",toolchain:"سلسلة الأدوات",storage:"التخزين والبيانات",advanced:"متقدم",source:"المصدر",machine:"الجهاز",build:"البناء",importFiles:"استيراد الملفات",exportProject:"تصدير المشروع",buildBoot:"بناء وتشغيل",projectFiles:"ملفات المشروع",cancel:"إلغاء",machineDisplay:"عرض الجهاز",noMachineSession:"لا توجد جلسة جهاز",connectQemuPrompt:"اتصل بخدمة Kerno المحلية لتشغيل QEMU."},
  hi:{settings:"सेटिंग्स",back:"वापस",welcomeTitle:"अपना ऑपरेटिंग सिस्टम बनाएं।",welcomeSubtitle:"कर्नेल स्रोत, मशीन कॉन्फ़िगरेशन, मेमोरी और एमुलेटर के लिए वातावरण।",newProject:"नया प्रोजेक्ट",newProjectDesc:"कर्नेल टेम्पलेट से OS वर्कस्पेस बनाएं।",loadProject:"प्रोजेक्ट लोड करें",loadProjectDesc:"Kerno आर्काइव या स्रोत फ़ोल्डर खोलें।",configureIDE:"IDE कॉन्फ़िगर करें",configureDesc:"भाषा, रूप और स्थानीय टूल सेट करें।",recentProjects:"हाल के प्रोजेक्ट",noRecent:"कोई हाल का प्रोजेक्ट नहीं",noRecentDesc:"OS प्रोजेक्ट बनाएं या लोड करें।",createWorkspace:"वर्कस्पेस बनाएं",projectName:"प्रोजेक्ट का नाम",starterTemplate:"स्टार्टर टेम्पलेट",architecture:"आर्किटेक्चर",firmware:"फर्मवेयर",kernelLanguage:"कर्नेल भाषा",bootloader:"बूटलोडर",guestMemory:"गेस्ट RAM (MiB)",virtualCpus:"वर्चुअल CPU",applySettings:"सेटिंग्स लागू करें",general:"सामान्य",appearance:"दिखावट",language:"भाषा",editor:"एडिटर",osArchitecture:"OS और आर्किटेक्चर",memory:"मेमोरी",emulator:"QEMU और एमुलेटर",toolchain:"टूलचेन",storage:"स्टोरेज और डेटा",advanced:"उन्नत",source:"स्रोत",machine:"मशीन",build:"बिल्ड",importFiles:"फ़ाइलें आयात करें",exportProject:"प्रोजेक्ट निर्यात करें",buildBoot:"बिल्ड और बूट",projectFiles:"प्रोजेक्ट फ़ाइलें",cancel:"रद्द करें",machineDisplay:"मशीन डिस्प्ले",noMachineSession:"कोई मशीन सत्र नहीं",connectQemuPrompt:"QEMU चलाने के लिए Kerno Local Service से कनेक्ट करें।"},
  it:{settings:"Impostazioni",back:"Indietro",welcomeTitle:"Costruisci il tuo sistema operativo.",welcomeSubtitle:"Ambiente dedicato a kernel, macchina, memoria ed emulazione.",newProject:"Nuovo progetto",newProjectDesc:"Crea un workspace OS da un modello kernel.",loadProject:"Carica progetto",loadProjectDesc:"Apri un archivio Kerno o una cartella sorgente.",configureIDE:"Configura IDE",configureDesc:"Imposta lingua, aspetto e strumenti locali.",recentProjects:"Progetti recenti",noRecent:"Nessun progetto recente",noRecentDesc:"Crea o carica un progetto OS.",createWorkspace:"Crea workspace",projectName:"Nome progetto",starterTemplate:"Modello iniziale",architecture:"Architettura",firmware:"Firmware",kernelLanguage:"Linguaggio kernel",bootloader:"Bootloader",guestMemory:"RAM guest (MiB)",virtualCpus:"CPU virtuali",applySettings:"Applica impostazioni",general:"Generale",appearance:"Aspetto",language:"Lingua",editor:"Editor",osArchitecture:"OS e Architettura",memory:"Memoria",emulator:"QEMU ed emulatore",toolchain:"Toolchain",storage:"Archiviazione e dati",advanced:"Avanzate",source:"Sorgente",machine:"Macchina",build:"Build",importFiles:"Importa file",exportProject:"Esporta progetto",buildBoot:"Build & Boot",projectFiles:"File progetto",cancel:"Annulla",machineDisplay:"Display macchina",noMachineSession:"Nessuna sessione",connectQemuPrompt:"Connetti Kerno Local Service per avviare QEMU."}
};

const UI_COPY = {
  "en": {
    "meta.title": "Kerno — Operating System Builder",
    "meta.description": "Kerno is an operating-system development environment for kernel projects, native builds and QEMU testing.",
    "landing.brand.aria": "Kerno — Operating System Development Environment",
    "landing.brand.tagline": "OS DEVELOPMENT ENVIRONMENT",
    "landing.nav.aria": "Explore Kerno",
    "landing.nav.platform": "Platform",
    "landing.nav.workflow": "Workflow",
    "landing.nav.academy": "Academy",
    "landing.nav.openFolder": "Open folder",
    "landing.nav.theme": "Theme",
    "landing.nav.themeTitle": "Change color theme",
    "landing.hero.kicker": "OS BUILDER IDE",
    "landing.hero.title": "Build an OS, starting with the kernel.",
    "landing.hero.subtitle": "Write kernel code. Build an ISO. Run it in QEMU.",
    "landing.hero.proof.kernel": "C / C++",
    "landing.hero.proof.boot": "Assembly",
    "landing.hero.proof.iso": "ISO + QEMU",
    "landing.hero.cta.primary": "Create an OS project",
    "landing.hero.cta.secondary": "Explore the workflow",
    "landing.hero.preview.label": "Example source · kernel.cpp",
    "landing.hero.preview.target": "x86_64 · C++",
    "landing.hero.preview.aria": "Example kernel source and boot sequence map",
    "landing.hero.preview.caption": "Visual example · not a live build",
    "landing.hero.preview.pipeline": "SOURCE → KERNEL.ELF → ISO",
    "landing.hero.boot.heading": "BOOT SEQUENCE",
    "landing.hero.boot.caption": "CONCEPT MAP · x86_64",
    "landing.hero.boot.qemu": "Virtual machine for testing the boot image",
    "landing.hero.boot.environment": "TEST ENVIRONMENT",
    "landing.hero.role.web": "Edit code",
    "landing.hero.role.local": "Build + QEMU",
    "landing.hero.target": "Target: x86_64 · BIOS · GRUB · Multiboot2",
    "landing.map.kicker": "INSIDE THE KERNEL",
    "landing.map.title": "Explore the kernel.",
    "landing.map.title.accent": "Build it step by step.",
    "landing.map.body": "Boot, memory, interrupts and virtual machines.",
    "landing.map.boot.title": "Boot and kernel entry",
    "landing.map.boot.body": "From GRUB to the kernel entry point.",
    "landing.map.boot.status": "Starter available",
    "landing.map.memory.title": "Memory management",
    "landing.map.memory.body": "Heap, stack, page size and basic allocation.",
    "landing.map.memory.status": "Starter available",
    "landing.map.interrupt.title": "Interrupts and the IDT",
    "landing.map.interrupt.body": "Explore the IDT, exceptions and interrupts.",
    "landing.map.interrupt.status": "Starter available",
    "landing.map.machine.title": "Test in QEMU",
    "landing.map.machine.body": "Set RAM and vCPUs. Inspect serial output.",
    "landing.map.machine.status": "Ready to test",
    "landing.map.note": "Starter means initial code to extend, not a complete subsystem.",
    "landing.map.action": "Learn ↗",
    "landing.action.new.title": "New project",
    "landing.action.new.body": "Create a structured OS workspace from a kernel template.",
    "landing.action.new.link": "Start a project →",
    "landing.action.load.title": "Load project",
    "landing.action.load.body": "Open a Kerno archive, project manifest or source directory.",
    "landing.action.load.link": "Open a workspace →",
    "landing.action.settings.title": "Configure Kerno",
    "landing.action.settings.body": "Adjust the interface, editor, project defaults and local tools.",
    "landing.action.settings.link": "Open settings →",
    "landing.platform.kicker": "KERNO TOOLS",
    "landing.platform.title": "The tools,",
    "landing.platform.title.accent": "in one workspace.",
    "landing.platform.body": "Write, build and test your kernel.",
    "landing.platform.source.index": "01 / SOURCE",
    "landing.platform.source.title": "Kernel source studio",
    "landing.platform.source.body": "Edit kernel source and boot files.",
    "landing.platform.source.tag.editor": "Monaco Editor",
    "landing.platform.source.tag.tree": "Project explorer",
    "landing.platform.source.tag.split": "Split editor",
    "landing.platform.machine.index": "02 / MACHINE",
    "landing.platform.machine.title": "Machine configuration",
    "landing.platform.machine.body": "Configure the virtual machine before boot.",
    "landing.platform.machine.tag.memory": "Guest memory",
    "landing.platform.build.index": "03 / BUILD",
    "landing.platform.build.title": "Native build pipeline",
    "landing.platform.build.body": "Compile, link and validate the ISO.",
    "landing.platform.build.tag.health": "Build checks",
    "landing.workflow.kicker": "WORKFLOW",
    "landing.workflow.title": "From source to boot.",
    "landing.workflow.body": "Source → Build → ISO → QEMU.",
    "landing.workflow.cta": "View guide",
    "landing.workflow.step1.title": "Setup",
    "landing.workflow.step1.body": "Connect the Local Service.",
    "landing.workflow.step2.title": "Create",
    "landing.workflow.step2.body": "Write kernel code.",
    "landing.workflow.step3.title": "Build and verify",
    "landing.workflow.step3.body": "Build and validate the ISO.",
    "landing.workflow.step4.title": "Boot and inspect",
    "landing.workflow.step4.body": "Run and inspect it in QEMU.",
    "landing.iso.kicker": "ISO WORKBENCH",
    "landing.iso.title": "Have an ISO file?",
    "landing.iso.body": "Import it, edit files, rebuild and test it in QEMU.",
    "landing.iso.cta": "ISO guide",
    "landing.recent.kicker": "WORKSPACE HISTORY",
    "landing.recent.title": "Recent projects",
    "landing.recent.clear": "Clear history",
    "landing.recent.empty.title": "No recent projects",
    "landing.recent.empty.body": "Create or load an OS project to get started.",
    "landing.footer.brand": "OS DEVELOPMENT ENVIRONMENT",
    "landing.footer.note": "No account · Projects stay in this browser",
    "landing.footer.academy": "Academy",
    "landing.footer.repo": "GitHub",
    "landing.footer.docs": "Local Service guide",
    "academy.header.back": "← Project Hub",
    "academy.header.label": "LEARNING PATH",
    "academy.header.level": "BEGINNER → BUILDER",
    "academy.header.reset": "Reset progress",
    "academy.hero.kicker": "KERNO ACADEMY / OS ENGINEERING",
    "academy.hero.title": "From the basics to",
    "academy.hero.title.accent": "your first kernel boot.",
    "academy.hero.body": "A guided course from learning the workspace to building and inspecting an x86_64 bootable ISO. Move through each stage at your own pace.",
    "academy.progress.title": "Your learning progress",
    "academy.progress.count": "0 of 9 stages completed",
    "academy.progress.start": "START HERE",
    "academy.progress.next": "Next: Understand Kerno",
    "academy.contents": "COURSE CONTENTS",
    "academy.stage0.nav": "00 · Understand Kerno",
    "academy.stage1.nav": "01 · Prepare your PC",
    "academy.stage2.nav": "02 · Create a kernel project",
    "academy.stage3.nav": "03 · Follow the boot chain",
    "academy.stage4.nav": "04 · Read the kernel layout",
    "academy.stage5.nav": "05 · Explore core subsystems",
    "academy.stage6.nav": "06 · Check the toolchain",
    "academy.stage7.nav": "07 · Build and validate an ISO",
    "academy.stage8.nav": "08 · Boot in QEMU",
    "academy.side.note.title": "Keep the checks separate",
    "academy.side.note.body": "A successful compiler exit is not enough. Kerno also checks the kernel format, boot header, ISO structure and emulator launch.",
    "academy.stage0.category": "FOUNDATION",
    "academy.stage0.title": "Understand what Kerno does",
    "academy.stage0.body": "Kerno has two parts. The website is the browser IDE for editing and project setup. Kerno Local Service is a separate program on your computer that runs the native compiler, GRUB tools and QEMU.",
    "academy.stage0.diagram.web": "Kerno Browser IDE",
    "academy.stage0.diagram.web.detail": "Editor · project · settings",
    "academy.stage0.diagram.local": "Kerno Local Service",
    "academy.stage0.diagram.local.detail": "Compiler · ISO · emulator",
    "academy.stage0.diagram.output": "Your OS image",
    "academy.stage0.diagram.output.detail": "Kernel ELF · bootable ISO",
    "academy.stage0.tip.title": "Key concept",
    "academy.stage0.tip.body": "The browser does not compile a kernel on its own. It sends a structured project manifest to the paired Local Service, which runs native tools on your computer.",
    "academy.complete": "Mark stage complete",
    "academy.stage1.category": "HOST SETUP",
    "academy.stage1.title": "Prepare your PC and connect the tools",
    "academy.stage1.body": "The first supported native target is x86_64 + BIOS + GRUB + Multiboot2. You need Python 3.10+, NASM, x86_64 C/C++ cross-compilers, an ELF linker, GRUB ISO tooling, xorriso and QEMU.",
    "academy.stage1.tip.title": "On Windows",
    "academy.stage1.tip.body": "Run local-agent/start-local-agent.bat. Copy the pairing token printed in the terminal into Settings → Advanced. Keep the service running while you build or test.",
    "academy.stage1.action": "Open toolchain settings ↗",
    "academy.stage1.docs": "Read the Local Service setup guide",
    "academy.stage2.category": "PROJECT SETUP",
    "academy.stage2.title": "Create your first kernel project",
    "academy.stage2.body": "Choose New Project and select x86_64, BIOS, GRUB, and C or C++. The generated scaffold includes the Multiboot2 entry, linker script, kernel source, serial console, memory helpers and starter IDT/PMM modules.",
    "academy.stage2.tip.title": "Why the target matters",
    "academy.stage2.tip.body": "Changing architecture metadata does not convert the boot assembly, ABI or linker layout. Only the x86_64 BIOS + GRUB + Multiboot2 path is currently enabled for native ISO builds.",
    "academy.stage2.action": "Create a new project ↗",
    "academy.stage3.category": "BOOT ARCHITECTURE",
    "academy.stage3.title": "Follow the boot chain",
    "academy.stage3.body": "On the current BIOS target, firmware loads GRUB. GRUB recognises the Multiboot2 header and transfers control to the kernel entry point. The x86_64 entry stub starts in 32-bit protected mode, checks CPU capabilities, creates an identity map for the first 1 GiB, enables PAE and long mode, then calls kernel_main.",
    "academy.stage3.tip.title": "What GRUB passes to the kernel",
    "academy.stage3.tip.body": "Multiboot2 provides a boot magic value and a pointer to boot information. Kerno's entry stub forwards these values so the kernel can inspect the memory map and other boot tags.",
    "academy.stage4.category": "KERNEL SOURCE",
    "academy.stage4.title": "Read the source files and linker layout",
    "academy.stage4.body": "The Assembly entry exports _start. The linker script places the Multiboot2 header near the beginning of the ELF image, then arranges text, read-only data, writable data and BSS at the configured kernel base. The kernel is freestanding: it cannot rely on a hosted operating-system runtime or standard startup code.",
    "academy.stage4.tip.title": "Freestanding compilation",
    "academy.stage4.tip.body": "The initial pipeline disables hosted assumptions such as built-in memory routines, stack protector, PIE and C++ exceptions/RTTI. New modules must still provide any runtime primitives they need.",
    "academy.stage5.category": "LOW-LEVEL SUBSYSTEMS",
    "academy.stage5.title": "Explore memory, console and interrupts",
    "academy.stage5.body": "The starter PMM uses the Multiboot2 memory map to manage 4 KiB physical frames within the first 1 GiB identity-mapped region. Serial output uses COM1 for diagnostics; the text console uses legacy VGA text memory. The IDT installs a fail-stop default handler.",
    "academy.stage5.tip.title": "Current limitations",
    "academy.stage5.tip.body": "This is a learning kernel foundation, not a complete OS. It does not yet include a general heap, complete virtual memory manager, interrupt controller/PIC/APIC, scheduler, drivers, filesystem or SMP. External interrupts remain disabled.",
    "academy.stage6.category": "PRE-BUILD CHECK",
    "academy.stage6.title": "Run the toolchain health check",
    "academy.stage6.body": "Open Settings → Toolchain and run the local scan. Confirm that NASM, both cross-compilers, the linker, GRUB and xorriso are available. QEMU is required for the final stage. Both compiler targets should report an x86_64 triple.",
    "academy.stage6.tip.title": "Do not skip this check",
    "academy.stage6.tip.body": "A compiler found on PATH is not necessarily configured for the right target. Kerno checks compiler target triples before compiling.",
    "academy.stage6.action": "Run the toolchain health check ↗",
    "academy.stage7.category": "BOOTABLE IMAGE",
    "academy.stage7.title": "Build and validate the ISO",
    "academy.stage7.body": "The native pipeline runs in stages. Kerno accepts an ISO only after the kernel and boot image pass the required independent checks.",
    "academy.stage7.step1.title": "Assemble",
    "academy.stage7.step1.body": "NASM → ELF64 objects",
    "academy.stage7.step2.title": "Compile",
    "academy.stage7.step2.body": "C/C++ → freestanding objects",
    "academy.stage7.step3.title": "Link",
    "academy.stage7.step3.body": "ELF64 x86_64 kernel",
    "academy.stage7.step4.title": "Verify kernel",
    "academy.stage7.step4.body": "Entry point + Multiboot2",
    "academy.stage7.step5.title": "Stage ISO files",
    "academy.stage7.step5.body": "/boot/kernel.elf + grub.cfg",
    "academy.stage7.step6.title": "Package",
    "academy.stage7.step6.body": "grub-mkrescue + xorriso",
    "academy.stage7.step7.title": "Inspect ISO",
    "academy.stage7.step7.body": "ISO9660 + El Torito + file paths",
    "academy.stage7.step8.title": "Register artifact",
    "academy.stage7.step8.body": "Only after every required check passes",
    "academy.stage7.tip.title": "What the ISO contains",
    "academy.stage7.tip.body": "The staging directory places the kernel at /boot/kernel.elf and the GRUB menu at /boot/grub/grub.cfg. The image must contain a valid ISO9660 volume descriptor and an El Torito boot catalog for legacy BIOS boot.",
    "academy.stage7.action": "Open the Build workspace ↗",
    "academy.stage8.category": "FIRST BOOT",
    "academy.stage8.title": "Boot the ISO in QEMU and inspect the output",
    "academy.stage8.body": "After verification, start the QEMU guest with the matching x86_64 BIOS profile. Inspect the VGA display and COM1 serial output. A QEMU process that remains open does not by itself prove that the kernel executed successfully.",
    "academy.stage8.tip.title": "When something fails",
    "academy.stage8.tip.body": "Start with the build health report, then inspect QEMU process logs and serial output. A valid ISO can still contain a kernel with a runtime fault, so image validation and successful guest execution are separate checks.",
    "academy.stage8.finish.title": "Your first kernel boot milestone",
    "academy.stage8.finish.body": "Save the project, export a source archive and keep the verified ISO together with its build logs.",
    "academy.stage8.action": "Start a kernel project",
    "academy.stage8.repo": "Explore the source repository",
    "academy.footer": "KERNO ACADEMY · LEARN BY BUILDING",
    "academy.footer.top": "Back to top ↑",
    "wizard.kicker": "PROJECT SCAFFOLDING",
    "wizard.step": "NEW WORKSPACE / 01",
    "wizard.aside": "PROJECT STRUCTURE",
    "settings.kicker": "ENVIRONMENT CONTROL",
    "settings.eyebrow": "ENVIRONMENT",
    "settings.description": "Control how Kerno behaves across projects.",
    "workspace.save": "Save",
    "workspace.newFile": "New file",
    "workspace.importFolder": "Import folder",
    "workspace.selectFile": "Select a source file",
    "workspace.split": "Split editor",
    "workspace.saveFile": "Save file",
    "workspace.exportFile": "Export file",
    "workspace.empty.title": "No source file selected",
    "workspace.empty.body": "Choose a file from the project tree or create a new source module.",
    "workspace.empty.action": "Create source file",
    "workspace.secondSource": "SECOND SOURCE",
    "workspace.ready": "Workspace ready",
    "workspace.quickCheck": "Quick check ready",
    "machine.kicker": "VIRTUAL MACHINE OUTPUT",
    "machine.notConnected": "QEMU not connected",
    "machine.serial": "SERIAL / COM1",
    "machine.clear": "Clear",
    "machine.profile": "MACHINE PROFILE",
    "machine.hardware": "Virtual hardware",
    "machine.architecture": "Architecture",
    "machine.type": "Machine type",
    "machine.memory": "Guest memory",
    "machine.cpus": "vCPU cores",
    "machine.display": "Display",
    "machine.cpu": "CPU model",
    "machine.acceleration": "Acceleration",
    "machine.network": "Network",
    "machine.backend": "Serial backend",
    "machine.connect": "Connect local service",
    "machine.start": "Start QEMU",
    "machine.stop": "Stop machine",
    "machine.note": "QEMU is managed by Kerno Local Service. The browser does not execute native emulator processes.",
    "build.kicker": "NATIVE TOOLCHAIN",
    "build.target": "Target",
    "build.bootloader": "Bootloader",
    "build.language": "Kernel language",
    "build.output": "Output format",
    "build.run": "Run native build",
    "build.configure": "Configure toolchain",
    "build.disclaimer": "A build is only reported as successful after the local service returns a verified artifact and a successful process status.",
    "build.events": "BUILD EVENTS",
    "build.none": "NO BUILD RUN",
    "build.empty": "No build has been requested.",
    "newOsWorkspace": "New operating system workspace",
    "newOsLead": "Choose the machine target and kernel foundation. Kerno creates the initial source tree and project configuration.",
    "scaffoldNote": "These are editable source files. A verified boot image still requires a matching native toolchain and boot protocol.",
    "machineDesc": "Live guest output is streamed from the connected local QEMU service.",
    "buildConfiguration": "Build configuration",
    "buildConfigurationDesc": "Review the target before invoking the connected native build service."
  },
  "id": {
    "meta.title": "Kerno — Lingkungan Pengembangan Sistem Operasi",
    "meta.description": "Kerno adalah lingkungan pengembangan sistem operasi untuk proyek kernel, build native, dan pengujian melalui QEMU.",
    "landing.brand.aria": "Kerno — Lingkungan Pengembangan Sistem Operasi",
    "landing.brand.tagline": "LINGKUNGAN PENGEMBANGAN OS",
    "landing.nav.aria": "Jelajahi Kerno",
    "landing.nav.platform": "Fitur",
    "landing.nav.workflow": "Alur kerja",
    "landing.nav.academy": "Akademi",
    "landing.nav.openFolder": "Buka folder",
    "landing.nav.theme": "Tema",
    "landing.nav.themeTitle": "Ganti tema warna",
    "landing.hero.kicker": "OS BUILDER IDE",
    "landing.hero.title": "Buat OS, mulai dari kernel.",
    "landing.hero.subtitle": "Tulis kode kernel. Bangun ISO. Jalankan dan uji di QEMU.",
    "landing.hero.proof.kernel": "C / C++",
    "landing.hero.proof.boot": "Assembly",
    "landing.hero.proof.iso": "ISO + QEMU",
    "landing.hero.cta.primary": "Buat proyek OS",
    "landing.hero.cta.secondary": "Pelajari alur kerja",
    "landing.hero.preview.label": "Contoh source · kernel.cpp",
    "landing.hero.preview.target": "x86_64 · C++",
    "landing.hero.preview.aria": "Contoh source kernel dan peta urutan boot",
    "landing.hero.preview.caption": "Contoh visual · bukan build aktif",
    "landing.hero.preview.pipeline": "SOURCE → KERNEL.ELF → ISO",
    "landing.hero.boot.heading": "RANTAI BOOT",
    "landing.hero.boot.caption": "PETA KONSEP · x86_64",
    "landing.hero.boot.qemu": "Mesin virtual untuk menguji hasil boot",
    "landing.hero.boot.environment": "LINGKUNGAN UJI",
    "landing.hero.role.web": "Edit kode",
    "landing.hero.role.local": "Build + QEMU",
    "landing.hero.target": "Target: x86_64 · BIOS · GRUB · Multiboot2",
    "landing.map.kicker": "DI DALAM KERNEL",
    "landing.map.title": "Kenali bagian-bagian kernel.",
    "landing.map.title.accent": "Bangun satu per satu.",
    "landing.map.body": "Boot, memori, interupsi, dan mesin virtual.",
    "landing.map.boot.title": "Boot dan kernel entry",
    "landing.map.boot.body": "Dari GRUB ke entry point kernel.",
    "landing.map.boot.status": "Starter tersedia",
    "landing.map.memory.title": "Manajemen memori",
    "landing.map.memory.body": "Heap, stack, page size, dan allocator dasar.",
    "landing.map.memory.status": "Starter tersedia",
    "landing.map.interrupt.title": "Interupsi dan IDT",
    "landing.map.interrupt.body": "Mengenal IDT, exception, dan interrupt.",
    "landing.map.interrupt.status": "Starter tersedia",
    "landing.map.machine.title": "Uji di QEMU",
    "landing.map.machine.body": "Atur RAM, vCPU, dan lihat output serial.",
    "landing.map.machine.status": "Siap diuji",
    "landing.map.note": "Starter = kode awal untuk dikembangkan, bukan subsistem lengkap.",
    "landing.map.action": "Pelajari ↗",
    "landing.action.new.title": "Proyek baru",
    "landing.action.new.body": "Buat workspace OS terstruktur dari template kernel.",
    "landing.action.new.link": "Mulai proyek →",
    "landing.action.load.title": "Muat proyek",
    "landing.action.load.body": "Buka arsip Kerno, manifest proyek, atau direktori source.",
    "landing.action.load.link": "Buka workspace →",
    "landing.action.settings.title": "Atur Kerno",
    "landing.action.settings.body": "Sesuaikan antarmuka, editor, default proyek, dan tool lokal.",
    "landing.action.settings.link": "Buka pengaturan →",
    "landing.platform.kicker": "TOOLS KERNO",
    "landing.platform.title": "Semua alat,",
    "landing.platform.title.accent": "satu workspace.",
    "landing.platform.body": "Tulis, bangun, dan uji kernel.",
    "landing.platform.source.index": "01 / SOURCE",
    "landing.platform.source.title": "Studio source kernel",
    "landing.platform.source.body": "Edit source kernel dan file boot.",
    "landing.platform.source.tag.editor": "Monaco Editor",
    "landing.platform.source.tag.tree": "Penjelajah proyek",
    "landing.platform.source.tag.split": "Editor terpisah",
    "landing.platform.machine.index": "02 / MESIN",
    "landing.platform.machine.title": "Konfigurasi mesin",
    "landing.platform.machine.body": "Atur mesin virtual sebelum boot.",
    "landing.platform.machine.tag.memory": "Memori guest",
    "landing.platform.build.index": "03 / BUILD",
    "landing.platform.build.title": "Pipeline build native",
    "landing.platform.build.body": "Compile, link, dan periksa hasil ISO.",
    "landing.platform.build.tag.health": "Pemeriksaan build",
    "landing.workflow.kicker": "ALUR KERJA",
    "landing.workflow.title": "Dari source ke boot.",
    "landing.workflow.body": "Source → Build → ISO → QEMU.",
    "landing.workflow.cta": "Lihat panduan",
    "landing.workflow.step1.title": "Persiapan",
    "landing.workflow.step1.body": "Hubungkan Local Service.",
    "landing.workflow.step2.title": "Buat proyek",
    "landing.workflow.step2.body": "Tulis kode kernel.",
    "landing.workflow.step3.title": "Build dan verifikasi",
    "landing.workflow.step3.body": "Build dan validasi ISO.",
    "landing.workflow.step4.title": "Boot dan amati",
    "landing.workflow.step4.body": "Jalankan dan amati di QEMU.",
    "landing.iso.kicker": "ISO WORKBENCH",
    "landing.iso.title": "Punya file ISO?",
    "landing.iso.body": "Impor, edit isi, build ulang, lalu uji di QEMU.",
    "landing.iso.cta": "Panduan ISO",
    "landing.recent.kicker": "RIWAYAT WORKSPACE",
    "landing.recent.title": "Proyek terbaru",
    "landing.recent.clear": "Hapus riwayat",
    "landing.recent.empty.title": "Belum ada proyek",
    "landing.recent.empty.body": "Buat atau muat proyek OS untuk memulai.",
    "landing.footer.brand": "LINGKUNGAN PENGEMBANGAN SISTEM OPERASI",
    "landing.footer.note": "Tanpa akun · Proyek tersimpan di browser",
    "landing.footer.academy": "Akademi",
    "landing.footer.repo": "GitHub",
    "landing.footer.docs": "Panduan Local Service",
    "academy.header.back": "← Beranda proyek",
    "academy.header.label": "JALUR PEMBELAJARAN",
    "academy.header.level": "PEMULA → PEMBANGUN",
    "academy.header.reset": "Atur ulang progres",
    "academy.hero.kicker": "KERNO ACADEMY / REKAYASA SISTEM OPERASI",
    "academy.hero.title": "Dari dasar hingga",
    "academy.hero.title.accent": "kernel pertama berhasil boot.",
    "academy.hero.body": "Kursus bertahap mulai dari memahami workspace hingga membangun dan memeriksa ISO bootable x86_64. Pelajari setiap tahap sesuai ritmemu.",
    "academy.progress.title": "Progres belajar",
    "academy.progress.count": "0 dari 9 tahap selesai",
    "academy.progress.start": "MULAI DI SINI",
    "academy.progress.next": "Berikutnya: Mengenal Kerno",
    "academy.contents": "MATERI PEMBELAJARAN",
    "academy.stage0.nav": "00 · Mengenal Kerno",
    "academy.stage1.nav": "01 · Menyiapkan komputer",
    "academy.stage2.nav": "02 · Membuat proyek kernel",
    "academy.stage3.nav": "03 · Memahami rantai boot",
    "academy.stage4.nav": "04 · Membaca tata letak kernel",
    "academy.stage5.nav": "05 · Mengenal subsistem inti",
    "academy.stage6.nav": "06 · Memeriksa toolchain",
    "academy.stage7.nav": "07 · Build dan validasi ISO",
    "academy.stage8.nav": "08 · Boot melalui QEMU",
    "academy.side.note.title": "Pisahkan setiap pemeriksaan",
    "academy.side.note.body": "Proses compiler yang berhasil belum cukup. Kerno juga memeriksa format kernel, header boot, struktur ISO, dan peluncuran emulator.",
    "academy.stage0.category": "DASAR",
    "academy.stage0.title": "Memahami fungsi Kerno",
    "academy.stage0.body": "Kerno terdiri dari dua bagian. Situs ini adalah IDE berbasis browser untuk menyunting source dan mengatur proyek. Kerno Local Service adalah program terpisah di komputer yang menjalankan compiler native, tool GRUB, dan QEMU.",
    "academy.stage0.diagram.web": "Kerno Browser IDE",
    "academy.stage0.diagram.web.detail": "Editor · proyek · pengaturan",
    "academy.stage0.diagram.local": "Kerno Local Service",
    "academy.stage0.diagram.local.detail": "Compiler · ISO · emulator",
    "academy.stage0.diagram.output": "Citra sistem operasi",
    "academy.stage0.diagram.output.detail": "Kernel ELF · ISO bootable",
    "academy.stage0.tip.title": "Konsep utama",
    "academy.stage0.tip.body": "Browser tidak mengompilasi kernel dengan sendirinya. Browser mengirim manifest proyek terstruktur ke Local Service yang telah dipasangkan, lalu layanan itu menjalankan tool native di komputer.",
    "academy.complete": "Tandai tahap selesai",
    "academy.stage1.category": "PERSIAPAN KOMPUTER",
    "academy.stage1.title": "Siapkan komputer dan hubungkan tool",
    "academy.stage1.body": "Target native pertama yang didukung adalah x86_64 + BIOS + GRUB + Multiboot2. Siapkan Python 3.10+, NASM, cross-compiler C/C++ x86_64, linker ELF, tool ISO GRUB, xorriso, dan QEMU.",
    "academy.stage1.tip.title": "Pada Windows",
    "academy.stage1.tip.body": "Jalankan local-agent/start-local-agent.bat. Salin pairing token yang muncul di terminal ke Pengaturan → Lanjutan. Biarkan layanan tetap berjalan selama proses build atau pengujian.",
    "academy.stage1.action": "Buka pengaturan toolchain ↗",
    "academy.stage1.docs": "Baca panduan Kerno Local Service",
    "academy.stage2.category": "PENYIAPAN PROYEK",
    "academy.stage2.title": "Buat proyek kernel pertamamu",
    "academy.stage2.body": "Pilih Proyek Baru, lalu tentukan x86_64, BIOS, GRUB, dan C atau C++. Template awal mencakup entry Multiboot2, linker script, source kernel, konsol serial, helper memori, serta modul awal IDT/PMM.",
    "academy.stage2.tip.title": "Mengapa target ini penting",
    "academy.stage2.tip.body": "Mengubah metadata arsitektur tidak otomatis mengubah boot assembly, ABI, atau tata letak linker. Jalur native ISO yang saat ini aktif hanya x86_64 + BIOS + GRUB + Multiboot2.",
    "academy.stage2.action": "Buat proyek baru ↗",
    "academy.stage3.category": "ARSITEKTUR BOOT",
    "academy.stage3.title": "Pahami rantai boot",
    "academy.stage3.body": "Pada target BIOS saat ini, firmware memuat GRUB. GRUB mengenali header Multiboot2 lalu memindahkan kontrol ke entry point kernel. Entry stub x86_64 dimulai dalam protected mode 32-bit, memeriksa kemampuan CPU, membuat identity map untuk 1 GiB pertama, mengaktifkan PAE dan long mode, lalu memanggil kernel_main.",
    "academy.stage3.tip.title": "Informasi yang diberikan GRUB",
    "academy.stage3.tip.body": "Multiboot2 menyediakan nilai boot magic dan pointer ke informasi boot. Entry stub Kerno meneruskan nilai tersebut agar kernel dapat membaca memory map dan tag boot lainnya.",
    "academy.stage4.category": "SOURCE KERNEL",
    "academy.stage4.title": "Baca berkas source dan tata letak linker",
    "academy.stage4.body": "Entry Assembly mengekspor simbol _start. Linker script menempatkan header Multiboot2 di bagian awal citra ELF, lalu mengatur bagian text, data read-only, data writable, dan BSS pada alamat dasar kernel. Kernel bersifat freestanding: kernel tidak dapat mengandalkan runtime sistem operasi atau kode startup standar.",
    "academy.stage4.tip.title": "Kompilasi freestanding",
    "academy.stage4.tip.body": "Pipeline awal menonaktifkan asumsi lingkungan hosted seperti fungsi memori bawaan, stack protector, PIE, serta exception/RTTI C++. Modul baru tetap harus menyediakan primitive runtime yang dibutuhkannya.",
    "academy.stage5.category": "SUBSISTEM LOW-LEVEL",
    "academy.stage5.title": "Kenali memori, konsol, dan interrupt",
    "academy.stage5.body": "PMM awal menggunakan memory map Multiboot2 untuk mengelola frame fisik 4 KiB di dalam wilayah identity map 1 GiB pertama. Keluaran serial memakai COM1 untuk diagnostik; konsol teks memakai memori teks VGA lama. IDT memasang handler default fail-stop.",
    "academy.stage5.tip.title": "Batas implementasi saat ini",
    "academy.stage5.tip.body": "Ini adalah fondasi kernel untuk pembelajaran, bukan OS lengkap. Implementasi saat ini belum mencakup heap umum, virtual memory manager lengkap, interrupt controller/PIC/APIC, scheduler, driver, filesystem, atau SMP. Interrupt eksternal masih dinonaktifkan.",
    "academy.stage6.category": "PEMERIKSAAN SEBELUM BUILD",
    "academy.stage6.title": "Jalankan pemeriksaan kesehatan toolchain",
    "academy.stage6.body": "Buka Pengaturan → Toolchain, lalu jalankan pemindaian lokal. Pastikan NASM, kedua cross-compiler, linker, GRUB, dan xorriso tersedia. QEMU dibutuhkan pada tahap akhir. Target kedua compiler harus menunjukkan triple x86_64.",
    "academy.stage6.tip.title": "Jangan lewatkan pemeriksaan ini",
    "academy.stage6.tip.body": "Compiler yang ditemukan melalui PATH belum tentu dikonfigurasi untuk target yang benar. Kerno memeriksa target triple compiler sebelum proses kompilasi.",
    "academy.stage6.action": "Jalankan pemeriksaan toolchain ↗",
    "academy.stage7.category": "CITRA BOOTABLE",
    "academy.stage7.title": "Build dan validasi ISO",
    "academy.stage7.body": "Pipeline native berjalan melalui beberapa tahap. Kerno hanya menerima ISO setelah kernel dan citra boot melewati seluruh pemeriksaan yang diwajibkan.",
    "academy.stage7.step1.title": "Assemble",
    "academy.stage7.step1.body": "NASM → objek ELF64",
    "academy.stage7.step2.title": "Compile",
    "academy.stage7.step2.body": "C/C++ → objek freestanding",
    "academy.stage7.step3.title": "Link",
    "academy.stage7.step3.body": "Kernel ELF64 x86_64",
    "academy.stage7.step4.title": "Verifikasi kernel",
    "academy.stage7.step4.body": "Entry point + Multiboot2",
    "academy.stage7.step5.title": "Siapkan isi ISO",
    "academy.stage7.step5.body": "/boot/kernel.elf + grub.cfg",
    "academy.stage7.step6.title": "Paketkan ISO",
    "academy.stage7.step6.body": "grub-mkrescue + xorriso",
    "academy.stage7.step7.title": "Periksa ISO",
    "academy.stage7.step7.body": "ISO9660 + El Torito + path berkas",
    "academy.stage7.step8.title": "Daftarkan artefak",
    "academy.stage7.step8.body": "Hanya jika semua pemeriksaan wajib lolos",
    "academy.stage7.tip.title": "Isi di dalam ISO",
    "academy.stage7.tip.body": "Direktori staging menempatkan kernel di /boot/kernel.elf dan menu GRUB di /boot/grub/grub.cfg. Citra harus memiliki volume descriptor ISO9660 yang valid serta katalog boot El Torito untuk BIOS legacy.",
    "academy.stage7.action": "Buka workspace Build ↗",
    "academy.stage8.category": "BOOT PERTAMA",
    "academy.stage8.title": "Jalankan ISO di QEMU dan periksa keluarannya",
    "academy.stage8.body": "Setelah verifikasi, jalankan guest QEMU dengan profil BIOS x86_64 yang sesuai. Periksa tampilan VGA dan keluaran serial COM1. Proses QEMU yang tetap terbuka tidak otomatis membuktikan bahwa kernel berhasil dieksekusi.",
    "academy.stage8.tip.title": "Saat terjadi kegagalan",
    "academy.stage8.tip.body": "Mulai dari laporan kesehatan build, kemudian periksa log proses QEMU dan keluaran serial. ISO yang valid masih dapat berisi kernel dengan kesalahan runtime; validasi citra dan keberhasilan eksekusi guest adalah dua pemeriksaan berbeda.",
    "academy.stage8.finish.title": "Tonggak boot kernel pertamamu",
    "academy.stage8.finish.body": "Simpan proyek, ekspor arsip source, dan simpan ISO yang telah diverifikasi bersama log build.",
    "academy.stage8.action": "Mulai proyek kernel",
    "academy.stage8.repo": "Lihat repositori source",
    "academy.footer": "KERNO ACADEMY · BELAJAR DENGAN MEMBANGUN",
    "academy.footer.top": "Kembali ke atas ↑",
    "wizard.kicker": "PENYUSUNAN PROYEK",
    "wizard.step": "WORKSPACE BARU / 01",
    "wizard.aside": "STRUKTUR PROYEK",
    "settings.kicker": "KONTROL LINGKUNGAN",
    "settings.eyebrow": "LINGKUNGAN",
    "settings.description": "Atur perilaku Kerno untuk seluruh proyek.",
    "workspace.save": "Simpan",
    "workspace.newFile": "Berkas baru",
    "workspace.importFolder": "Impor folder",
    "workspace.selectFile": "Pilih berkas source",
    "workspace.split": "Editor terpisah",
    "workspace.saveFile": "Simpan berkas",
    "workspace.exportFile": "Ekspor berkas",
    "workspace.empty.title": "Belum ada berkas source dipilih",
    "workspace.empty.body": "Pilih berkas dari penjelajah proyek atau buat modul source baru.",
    "workspace.empty.action": "Buat berkas source",
    "workspace.secondSource": "SOURCE KEDUA",
    "workspace.ready": "Workspace siap",
    "workspace.quickCheck": "Pemeriksaan cepat siap",
    "machine.kicker": "KELUARAN MESIN VIRTUAL",
    "machine.notConnected": "QEMU belum terhubung",
    "machine.serial": "SERIAL / COM1",
    "machine.clear": "Bersihkan",
    "machine.profile": "PROFIL MESIN",
    "machine.hardware": "Perangkat keras virtual",
    "machine.architecture": "Arsitektur",
    "machine.type": "Jenis mesin",
    "machine.memory": "Memori guest",
    "machine.cpus": "Inti vCPU",
    "machine.display": "Tampilan",
    "machine.cpu": "Model CPU",
    "machine.acceleration": "Akselerasi",
    "machine.network": "Jaringan",
    "machine.backend": "Backend serial",
    "machine.connect": "Hubungkan layanan lokal",
    "machine.start": "Jalankan QEMU",
    "machine.stop": "Hentikan mesin",
    "machine.note": "QEMU dikelola oleh Kerno Local Service. Browser tidak menjalankan proses emulator native.",
    "build.kicker": "TOOLCHAIN NATIVE",
    "build.target": "Target",
    "build.bootloader": "Bootloader",
    "build.language": "Bahasa kernel",
    "build.output": "Format keluaran",
    "build.run": "Jalankan build native",
    "build.configure": "Konfigurasi toolchain",
    "build.disclaimer": "Build hanya dinyatakan berhasil setelah layanan lokal mengembalikan artefak yang telah diverifikasi dan status proses yang sukses.",
    "build.events": "AKTIVITAS BUILD",
    "build.none": "BELUM ADA BUILD",
    "build.empty": "Belum ada build yang dijalankan.",
    "newOsWorkspace": "Workspace sistem operasi baru",
    "newOsLead": "Pilih target mesin dan fondasi kernel. Kerno akan membuat struktur kode sumber awal beserta konfigurasi proyek.",
    "scaffoldNote": "Berkas kode sumber ini dapat disunting. Citra boot yang tervalidasi tetap memerlukan toolchain native dan protokol boot yang sesuai.",
    "machineDesc": "Keluaran guest secara langsung dialirkan dari layanan QEMU lokal yang terhubung.",
    "buildConfiguration": "Konfigurasi build",
    "buildConfigurationDesc": "Periksa target proyek sebelum menjalankan layanan build native yang terhubung."
  }
};

const state={settings:Object.assign({},DEFAULTS),project:null,recent:[],screen:"welcome",settingsReturn:"welcome",newProjectReturn:"welcome",category:"general",models:{},editor:null,splitEditor:null,activeFile:null,tabs:[],splitFile:null,localConnected:false,qemuPollTimer:null,currentDisplayUrl:"",lastSerialOutput:"",kernelEntryConfirmed:false,qemuStartedAt:0,qemuBootTimeoutShown:false,tutorialCompleted:[],tutorialObserver:null,landingRevealObserver:null,importedIso:null,isoArchive:null,isoEditorWorkspace:null,isoEditorFiles:[],isoEditorSelectedPath:"",isoEditorDirty:false,isoEditorOpen:false};
function activeLocale(){
  const requested=state.settings.locale||"id";
  if(requested==="id"||requested==="en")return requested;
  if(requested!=="auto"){state.settings.locale="en";return "en";}
  const detected=String(navigator.language||"id").split("-")[0].toLowerCase();
  return detected==="id"?"id":"en";
}
function tr(k){const locale=activeLocale();return (LANGUAGES[locale]&&LANGUAGES[locale][k])||LANGUAGES.en[k]||k;}
const EDITOR_MESSAGES = {
  en:{loadingTitle:"Loading Monaco Editor",loadingDetail:"Preparing syntax highlighting, completions and diagnostics…",fallbackTitle:"Advanced editor unavailable",fallbackBody:"Basic text editing is active. Syntax highlighting and live diagnostics are unavailable until Monaco loads. Check your connection, then retry.",retry:"Retry editor",loadingStatus:"Loading editor engine…",ready:"Monaco Editor ready",basicReady:"Basic text editor active",modified:"Modified · autosave scheduled",saved:"Workspace saved in this browser",clean:"No structural issues detected",count:"{errors} error(s) · {warnings} warning(s)",paused:"Live checks paused for this large file",stringLine:"String literal is not closed on this line.",stringOpen:"String literal is not closed.",commentOpen:"Block comment is not closed.",unexpectedClose:"Unexpected closing {token}.",unexpectedExpected:"Unexpected {token}; expected {expected}.",openingMissing:"Opening {token} has no matching {expected}.",jsonError:"Invalid JSON syntax: {message}"},
  id:{loadingTitle:"Memuat Monaco Editor",loadingDetail:"Menyiapkan pewarnaan sintaks, pelengkapan otomatis, dan diagnostik…",fallbackTitle:"Editor lanjutan tidak tersedia",fallbackBody:"Mode teks dasar tetap dapat digunakan. Pewarnaan sintaks dan diagnostik langsung belum tersedia sampai Monaco berhasil dimuat. Periksa koneksi internet, lalu coba lagi.",retry:"Coba muat ulang editor",loadingStatus:"Memuat mesin editor…",ready:"Monaco Editor siap",basicReady:"Editor teks dasar aktif",modified:"Diubah · penyimpanan otomatis dijadwalkan",saved:"Workspace tersimpan di browser ini",clean:"Tidak ditemukan masalah struktur",count:"{errors} error · {warnings} peringatan",paused:"Pemeriksaan langsung dijeda untuk file berukuran besar",stringLine:"Literal string belum ditutup pada baris ini.",stringOpen:"Literal string belum ditutup.",commentOpen:"Komentar blok belum ditutup.",unexpectedClose:"Kurung penutup {token} tidak memiliki pasangan.",unexpectedExpected:"Token {token} tidak sesuai; seharusnya {expected}.",openingMissing:"Kurung pembuka {token} belum memiliki pasangan {expected}.",jsonError:"Sintaks JSON tidak valid: {message}"}
};
function editorText(key, values={}){const locale=activeLocale(),dict=EDITOR_MESSAGES[locale]||EDITOR_MESSAGES.en,template=dict[key]||EDITOR_MESSAGES.en[key]||key;return String(template).replace(/\{(\w+)\}/g,(_,name)=>String(values[name]??""));}
function refreshEditorLabels(){const labels={editorLoadingTitle:"loadingTitle",editorLoadingDetail:"loadingDetail",editorFallbackTitle:"fallbackTitle",editorFallbackMessage:"fallbackBody"};for(const [id,key] of Object.entries(labels)){const node=$("#"+id);if(node)node.textContent=editorText(key);}const retry=$("#retryEditorButton");if(retry)retry.textContent=editorText("retry");}
function loadExternalScript(src,key,ready){
  if(ready())return Promise.resolve();
  if(externalScriptLoads.has(key))return externalScriptLoads.get(key);
  const task=new Promise((resolve,reject)=>{
    const script=document.createElement("script");let settled=false;
    let timer;
    const finish=error=>{if(settled)return;settled=true;window.clearTimeout(timer);if(error)reject(error);else resolve();};
    timer=window.setTimeout(()=>finish(new Error("Timed out while loading "+key+".")),25000);
    script.src=src;script.async=true;script.dataset.kernoLoader=key;
    script.onload=()=>ready()?finish():finish(new Error(key+" loaded without exposing the expected API."));
    script.onerror=()=>finish(new Error("Could not load "+key+" from the CDN."));
    document.head.append(script);
  }).catch(error=>{const script=document.querySelector('script[data-kerno-loader="'+key+'"]');if(script)script.remove();externalScriptLoads.delete(key);throw error;});
  externalScriptLoads.set(key,task);return task;
}
function loadJSZip(){
  if(typeof window.JSZip==="function")return Promise.resolve(window.JSZip);
  if(!jszipLoad)jszipLoad=loadExternalScript("https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js","jszip",()=>typeof window.JSZip==="function").then(()=>window.JSZip).catch(error=>{jszipLoad=null;throw error;});
  return jszipLoad;
}
const INDONESIAN_NOTIFICATIONS={"Theme changed":"Tema berhasil diubah","Settings could not be saved":"Pengaturan tidak dapat disimpan","Browser storage is unavailable.":"Penyimpanan browser tidak tersedia.","Tutorial progress could not be saved":"Progres tutorial tidak dapat disimpan","Learning path completed":"Jalur pembelajaran selesai","You have checked off every Kerno tutorial stage.":"Semua tahap tutorial Kerno telah ditandai selesai.","Create a project first":"Buat proyek terlebih dahulu","The Build workspace needs a kernel project.":"Workspace Build memerlukan proyek kernel.","Invalid project name":"Nama proyek tidak valid","Use letters, numbers, spaces, dots, dashes or underscores.":"Gunakan huruf, angka, spasi, titik, tanda hubung, atau garis bawah.","Invalid resources":"Konfigurasi sumber daya tidak valid","RAM must be 64–32768 MiB; vCPU must be 1–32.":"RAM harus 64–32768 MiB; vCPU harus 1–32.","OS workspace created":"Workspace OS berhasil dibuat","Workspace exceeds browser project limit":"Ukuran workspace melebihi batas browser","Export files in smaller groups or remove large text artifacts.":"Ekspor file dalam kelompok lebih kecil atau hapus artefak teks berukuran besar.","Workspace saved":"Workspace tersimpan","Project files are stored locally in IndexedDB.":"File proyek disimpan secara lokal di IndexedDB.","Save failed":"Penyimpanan gagal","File tab closed":"Tab file ditutup","Could not load project":"Proyek tidak dapat dimuat","Invalid source path":"Path source tidak valid","Use a new relative path such as src/interrupts.cpp.":"Gunakan path relatif baru, misalnya src/interrupts.cpp.","Source file created":"File source berhasil dibuat","Source file exported":"File source berhasil diekspor","Project archive exported":"Arsip proyek berhasil diekspor","Settings need attention":"Pengaturan memerlukan perhatian","Settings applied":"Pengaturan diterapkan","No projects to export":"Tidak ada proyek untuk diekspor","ZIP library unavailable":"Library ZIP tidak tersedia","Local project storage cleared":"Penyimpanan proyek lokal telah dibersihkan","Local service connected":"Layanan lokal terhubung","Local service unavailable":"Layanan lokal tidak tersedia","Kernel entry not confirmed":"Entri kernel belum terkonfirmasi","QEMU session started":"Sesi QEMU dimulai","QEMU could not start":"QEMU tidak dapat dijalankan","Local service is not connected":"Layanan lokal belum terhubung","Could not stop QEMU":"QEMU tidak dapat dihentikan","No tutorial progress to reset":"Tidak ada progres tutorial untuk direset","Could not read emulator status":"Status emulator tidak dapat dibaca","Invalid emulator display URL":"URL tampilan emulator tidak valid","Display URL rejected":"URL tampilan ditolak","The QEMU display must use a loopback address.":"Tampilan QEMU harus menggunakan alamat loopback.","Process confirmed. Kerno will verify kernel entry using the serial marker.":"Proses terkonfirmasi. Kerno akan memverifikasi entri kernel melalui penanda serial.","Process confirmed. Kernel entry will be verified from serial output.":"Proses terkonfirmasi. Entri kernel akan diverifikasi melalui keluaran serial.","QEMU stopped":"QEMU dihentikan","Kernel entry confirmed":"Entri kernel terkonfirmasi","ISO artifact downloaded":"Artefak ISO berhasil diunduh","ISO download failed":"Pengunduhan ISO gagal","Native build completed":"Build native selesai","Build / Boot operation failed":"Operasi Build / Boot gagal","PC diagnostics completed":"Diagnostik PC selesai","PC diagnostics unavailable":"Diagnostik PC tidak tersedia","CMD diagnostics copied":"Diagnostik CMD disalin","Could not copy CMD checks":"Pemeriksaan CMD tidak dapat disalin","File not found":"File tidak ditemukan","No matching source file":"Tidak ditemukan file source yang cocok","Project loaded":"Proyek berhasil dimuat","Tutorial progress reset":"Progres tutorial berhasil direset","Project load failed":"Pemuatan proyek gagal","No supported source files found":"Tidak ditemukan file source yang didukung","No open file":"Tidak ada file terbuka","IndexedDB unavailable":"IndexedDB tidak tersedia"};
function notificationText(value){const text=String(value??"");if(activeLocale()!=="id")return text;return INDONESIAN_NOTIFICATIONS[text]||(text.startsWith("Native build ")?"Build native "+text.slice("Native build ".length):text);}
function translate(){
  const locale=activeLocale(),copy=UI_COPY[locale]||UI_COPY.en;
  $$("[data-i18n]").forEach(node=>{const key=node.dataset.i18n,value=copy[key]??tr(key);if(value!==undefined&&value!==key)node.textContent=value;});
  $$("[data-i18n-aria]").forEach(node=>{const key=node.dataset.i18nAria,value=copy[key]??tr(key);if(value!==key)node.setAttribute("aria-label",value);});
  $$("[data-i18n-title]").forEach(node=>{const key=node.dataset.i18nTitle,value=copy[key]??tr(key);if(value!==key)node.setAttribute("title",value);});
  document.documentElement.lang=locale;
  document.documentElement.dir="ltr";
  document.title=copy["meta.title"]||"Kerno — Operating System Builder";
  const description=$('meta[name="description"]');if(description)description.content=copy["meta.description"]||"Kerno is an operating-system development environment.";
  refreshEditorLabels();
  translateIsoWorkbench();
}
function notify(title,detail,type){
  const region=$("#toastRegion");
  if(!region){console[type==="error"?"error":"log"]("[Kerno]",title,detail||"");return;}
  while(region.children.length>=4)region.firstElementChild.remove();
  const kind=type||(/fail|error|unavailable|could not|invalid/i.test(String(title))?"error":"success");
  const node=document.createElement("div");
  node.className="toast toast-"+kind;
  node.setAttribute("role",kind==="error"?"alert":"status");
  const mark=document.createElement("span");mark.className="toast-mark";mark.textContent=kind==="error"?"!":"✓";
  const copy=document.createElement("div");copy.className="toast-copy";
  const heading=document.createElement("strong");heading.textContent=notificationText(title||"Kerno");
  copy.append(heading);
  if(detail){const small=document.createElement("small");small.textContent=notificationText(detail);copy.append(small);}
  const dismiss=document.createElement("button");dismiss.className="toast-dismiss";dismiss.type="button";dismiss.textContent="×";dismiss.setAttribute("aria-label","Dismiss notification");
  dismiss.onclick=()=>node.remove();
  node.append(mark,copy,dismiss);region.append(node);
  window.setTimeout(()=>{if(node.isConnected)node.remove();},kind==="error"?6000:4200);
}
let modalResolver=null;
let modalEscapeHandler=null;
function showInAppDialog(options){
  const opts=Object.assign({title:"Kerno",message:"",confirmLabel:"Continue",cancelLabel:"Cancel",input:false,initialValue:"",placeholder:"",danger:false,eyebrow:"KERNO WORKSPACE"},options||{});
  const modal=$("#kernoModal"),input=$("#modalInput"),confirmButton=$("#modalConfirmButton");
  if(modalResolver){modalResolver(null);modalResolver=null;}
  $("#modalEyebrow").textContent=opts.eyebrow;
  $("#modalTitle").textContent=opts.title;
  $("#modalMessage").textContent=opts.message;
  $("#modalError").textContent="";
  $("#modalError").classList.add("hidden");
  confirmButton.textContent=opts.confirmLabel;
  confirmButton.classList.toggle("danger-button",!!opts.danger);
  $("#modalCancelButton").textContent=opts.cancelLabel;
  input.classList.toggle("hidden",!opts.input);
  input.value=opts.initialValue||"";
  input.placeholder=opts.placeholder||"";
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden","false");
  return new Promise(resolve=>{
    let finished=false;
    const finish=value=>{
      if(finished)return;
      finished=true;
      modal.classList.add("hidden");
      modal.setAttribute("aria-hidden","true");
      confirmButton.onclick=null;$("#modalCancelButton").onclick=null;$("#modalDismissButton").onclick=null;
      modal.onclick=null;
      if(modalEscapeHandler){document.removeEventListener("keydown",modalEscapeHandler);modalEscapeHandler=null;}
      modalResolver=null;
      resolve(value);
    };
    modalResolver=finish;
    confirmButton.onclick=()=>finish(opts.input?input.value.trim():true);
    $("#modalCancelButton").onclick=()=>finish(null);
    $("#modalDismissButton").onclick=()=>finish(null);
    modal.onclick=e=>{if(e.target===modal)finish(null);};
    modalEscapeHandler=e=>{if(e.key==="Escape"){e.preventDefault();finish(null);}else if(e.key==="Enter"&&opts.input&&document.activeElement===input){e.preventDefault();finish(input.value.trim());}};
    document.addEventListener("keydown",modalEscapeHandler);
    window.requestAnimationFrame(()=>opts.input?input.focus():confirmButton.focus());
  });
}
async function confirmInApp(message,title="Confirm action"){
  return (await showInAppDialog({title,message,confirmLabel:"Confirm",danger:true}))===true;
}
async function promptInApp(message,initialValue="",title="Enter a value"){
  return await showInAppDialog({title,message,input:true,initialValue,placeholder:"Type here",confirmLabel:"Create"});
}
function cycleTheme(){
  const order=["dark","light","mono"];
  const current=order.indexOf(state.settings.theme);
  state.settings.theme=order[(current+1)%order.length];
  applyTheme();
  const select=$('[data-setting="theme"]');
  if(select)select.value=state.settings.theme;
  saveSettings();
  const label=state.settings.theme==="mono"?"Black & white":state.settings.theme==="light"?"Light":"Dark";
  notify("Theme changed",label+" appearance applied across Kerno.");
}
function makeId(){return crypto&&crypto.randomUUID?crypto.randomUUID():"kerno-"+Date.now()+"-"+Math.random().toString(36).slice(2);}
function dbOpen(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB_NAME,DB_VERSION);r.onupgradeneeded=()=>{const d=r.result;if(!d.objectStoreNames.contains("projects"))d.createObjectStore("projects",{keyPath:"id"});if(!d.objectStoreNames.contains("meta"))d.createObjectStore("meta",{keyPath:"key"});};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
function dbReq(store,mode,fn){return new Promise((resolve,reject)=>{const tx=database.transaction(store,mode),r=fn(tx.objectStore(store));r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);tx.onabort=()=>reject(tx.error||Error("Storage transaction aborted"));});}
const get=(s,k)=>dbReq(s,"readonly",o=>o.get(k)), put=(s,v)=>dbReq(s,"readwrite",o=>o.put(v)), all=s=>dbReq(s,"readonly",o=>o.getAll()), clear=s=>dbReq(s,"readwrite",o=>o.clear());
async function loadSettings(){try{const x=await get("meta","settings");if(x&&x.value)state.settings=Object.assign({},DEFAULTS,x.value);}catch(_){try{state.settings=Object.assign({},DEFAULTS,JSON.parse(localStorage.getItem("kerno-settings")||"{}"));}catch(__){}}}
async function saveSettings(){try{await put("meta",{key:"settings",value:state.settings});}catch(_){try{localStorage.setItem("kerno-settings",JSON.stringify(state.settings));}catch(__){notify("Settings could not be saved","Browser storage is unavailable.");}}}
function normalizePath(p){const raw=String(p||"").split(String.fromCharCode(92)).join("/").replace(/^\/+/,"");const parts=[];for(const x of raw.split("/")){if(!x||x===".")continue;if(x===".."||/[\x00-\x1f]/.test(x))return "";parts.push(x);}return parts.join("/");}
function safeName(n){return String(n||"kerno-project").trim().replace(/[^a-z0-9_-]+/gi,"-").replace(/^-+|-+$/g,"")||"kerno-project";}
function fileSize(p){return Object.values(p.files||{}).reduce((n,x)=>n+new Blob([x]).size,0);}
function formatBytes(n){return n<1024?n+" B":n<1048576?(n/1024).toFixed(1)+" KB":(n/1048576).toFixed(2)+" MB";}
function download(blob,name){const u=URL.createObjectURL(blob),a=document.createElement("a");a.href=u;a.download=name;a.style.display="none";document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1400);}
function langOf(path){
  const leaf=path.split("/").pop();
  const ext=leaf.split(".").pop().toLowerCase();
  if(["asm","inc"].includes(ext))return "kerno-asm";
  if(ext==="s")return "kerno-gas";
  if(["c","h"].includes(ext))return "c";
  if(["cpp","cc","cxx","hpp","hh","hxx"].includes(ext))return "cpp";
  if(ext==="ld")return "kerno-linker";
  if(["py","pyi","pyw"].includes(ext))return "python";
  if(ext==="json")return "json";
  if(ext==="md")return "markdown";
  if(["cfg","ini"].includes(ext))return "ini";
  return "plaintext";
}
function langLabel(p){return ({"kerno-asm":"Assembly / NASM","kerno-gas":"Assembly / GNU AS",cpp:"C++",c:"C",python:"Python","kerno-linker":"Linker Script",json:"JSON",markdown:"Markdown",ini:"GRUB Config",plaintext:"Text"})[langOf(p)]||"Text";}
function fileBadge(p){const x=langOf(p);return x==="kerno-asm"?["A","mark-asm"]:x==="kerno-gas"?["ASM","mark-asm"]:x==="python"?["Py","mark-python"]:x==="cpp"||x==="c"?["C","mark-cpp"]:x==="json"?["{}","mark-json"]:x==="ini"?["≡","mark-config"]:x==="kerno-linker"?["L","mark-linker"]:["·","mark-doc"];}
function show(name){state.screen=name;["welcome","newProject","settings","app","tutorial"].forEach(x=>{const screen=$("#"+x+"Screen");if(screen)screen.classList.toggle("hidden",x!==name);});const active=$("#"+name+"Screen");if(active){active.scrollTop=0;active.classList.remove("screen-enter");requestAnimationFrame(()=>active.classList.add("screen-enter"));}if(name==="welcome"){refreshRecent();setupLandingReveal();}if(name==="tutorial"){renderTutorialProgress();setupTutorialObserver();}}

const TUTORIAL_STAGES=[
  "Understand Kerno","Prepare your PC","Create a kernel project","Understand the boot chain",
  "Read the kernel structure","Memory and core modules","Toolchain health","Build and validate ISO","Boot in QEMU"
];
async function loadTutorialProgress(){
  try{
    const saved=await get("meta","tutorialCompleted");
    state.tutorialCompleted=Array.isArray(saved&&saved.value)?saved.value.filter(n=>Number.isInteger(n)&&n>=0&&n<TUTORIAL_STAGES.length):[];
  }catch(_){state.tutorialCompleted=[];}
  renderTutorialProgress();
}
async function saveTutorialProgress(){
  state.tutorialCompleted=[...new Set(state.tutorialCompleted)].sort((a,b)=>a-b);
  try{await put("meta",{key:"tutorialCompleted",value:state.tutorialCompleted});}
  catch(error){notify("Tutorial progress could not be saved",error.message,"error");}
  renderTutorialProgress();
}
function renderTutorialProgress(){
  const completed=new Set(state.tutorialCompleted||[]);
  const total=TUTORIAL_STAGES.length,done=completed.size,percent=Math.round(done/total*100);
  const fill=$("#tutorialProgressFill"),text=$("#tutorialProgressText"),pct=$("#tutorialProgressPercent"),next=$("#tutorialProgressNext");
  if(fill)fill.style.width=percent+"%";
  if(text)text.textContent=done+" of "+total+" stages completed";
  if(pct)pct.textContent=percent+"%";
  const nextIndex=TUTORIAL_STAGES.findIndex((_,index)=>!completed.has(index));
  if(next)next.textContent=nextIndex<0?"All stages completed":("Next: "+TUTORIAL_STAGES[nextIndex]);
  $("[data-tutorial-step]").forEach(card=>{
    const index=Number(card.dataset.tutorialStep),isDone=completed.has(index);
    card.classList.toggle("completed",isDone);
    const button=$('[data-complete-step="'+index+'"]',card);
    if(button){button.textContent=isDone?"Completed ✓ · Undo":"Mark stage complete";button.setAttribute("aria-pressed",String(isDone));}
  });
  $("#tutorialContents a").forEach((link,index)=>link.classList.toggle("completed",completed.has(index)));
}
async function toggleTutorialStep(index){
  if(!Number.isInteger(index)||index<0||index>=TUTORIAL_STAGES.length)return;
  const completed=new Set(state.tutorialCompleted);
  if(completed.has(index))completed.delete(index);else completed.add(index);
  state.tutorialCompleted=[...completed];
  await saveTutorialProgress();
  const isDone=completed.has(index);
  notify(isDone?"Stage completed":"Stage reopened",TUTORIAL_STAGES[index]);
  if(completed.size===TUTORIAL_STAGES.length)notify("Learning path completed","You have checked off every Kerno tutorial stage.");
}
function openTutorial(){
  show("tutorial");
  const screen=$("#tutorialScreen");if(screen)screen.scrollTop=0;
}
function setupTutorialObserver(){
  if(state.tutorialObserver){state.tutorialObserver.disconnect();state.tutorialObserver=null;}
  if(!("IntersectionObserver" in window))return;
  const screen=$("#tutorialScreen");
  const links=$("#tutorialContents a");
  const observer=new IntersectionObserver(entries=>{
    entries.forEach(entry=>{
      if(entry.isIntersecting){
        const index=Number(entry.target.dataset.tutorialStep);
        links.forEach((link,i)=>link.classList.toggle("active",i===index));
      }
    });
  },{root:screen,rootMargin:"-15% 0px -70% 0px",threshold:0});
  $("[data-tutorial-step]").forEach(card=>observer.observe(card));
  state.tutorialObserver=observer;
}
function setupLandingReveal(){
  if(state.landingRevealObserver){state.landingRevealObserver.disconnect();state.landingRevealObserver=null;}
  const root=$("#welcomeScreen");
  const targets=root?$(".landing-section,.recent-section",root):[];
  const prefersReduced=!!(window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  document.body.classList.remove("reveal-ready");
  targets.forEach(el=>el.classList.remove("is-visible"));
  if(!root||!targets.length||!("IntersectionObserver" in window)||state.settings.reduceMotion||prefersReduced){
    targets.forEach(el=>el.classList.add("is-visible"));
    return;
  }
  document.body.classList.add("reveal-ready");
  const observer=new IntersectionObserver(entries=>{
    entries.forEach(entry=>{
      if(!entry.isIntersecting)return;
      entry.target.classList.add("is-visible");
      observer.unobserve(entry.target);
    });
  },{root,threshold:0.08,rootMargin:"0px 0px -36px 0px"});
  targets.forEach(el=>observer.observe(el));
  state.landingRevealObserver=observer;
}
function landingScrollBehavior(){
  return state.settings.reduceMotion||(window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches)?"auto":"smooth";
}
function scrollLandingTo(id){
  const target=$("#"+id);
  if(target)target.scrollIntoView({behavior:landingScrollBehavior(),block:"start"});
}
function openTutorialStage(index){
  const stage=Number(index);
  const target=$("#tutorial-stage-"+stage);
  if(!Number.isInteger(stage)||stage<0||stage>8||!target){
    notify("Tutorial stage unavailable","The selected learning section could not be found.","error");
    return;
  }
  openTutorial();
  window.requestAnimationFrame(()=>target.scrollIntoView({behavior:landingScrollBehavior(),block:"start"}));
}
async function handleTutorialAction(action){
  if(action==="settings-toolchain"){
    state.category="toolchain";openSettings("tutorial");return;
  }
  if(action==="new-project"){
    state.newProjectReturn="tutorial";syncWizardDefaults();show("newProject");return;
  }
  if(action==="build"){
    if(!state.project){notify("Create a project first","The Build workspace needs a kernel project.");state.newProjectReturn="tutorial";syncWizardDefaults();show("newProject");return;}
    show("app");switchWorkspace("build");return;
  }
}

function emptyRecent(){const d=document.createElement("div");d.className="recent-empty";d.innerHTML="<span>⌁</span><div><strong></strong><p></p></div>";$("strong",d).textContent=tr("noRecent");$("p",d).textContent=tr("noRecentDesc");return d;}
async function refreshRecent(){try{const hidden=await get("meta","hiddenRecent");const hiddenIds=new Set(hidden&&hidden.value||[]);state.recent=(await all("projects")).filter(p=>!hiddenIds.has(p.id)).sort((a,b)=>b.updatedAt-a.updatedAt).slice(0,12);}catch(_){state.recent=[];}const host=$("#recentProjects");host.innerHTML="";if(!state.recent.length){host.append(emptyRecent());return;}state.recent.forEach(p=>{const b=document.createElement("button");b.className="recent-item";b.innerHTML='<span class="recent-icon">K</span><span class="recent-copy"><strong></strong><small></small></span><span class="recent-open">OPEN →</span>';$("strong",b).textContent=p.name;$("small",b).textContent=(p.config.architecture||"unknown")+" · "+Object.keys(p.files).length+" files · "+new Date(p.updatedAt).toLocaleDateString();b.onclick=()=>loadProject(p.id);host.append(b);});}
function configFor(name){const s=state.settings;return {
  name:name,architecture:s.defaultArchitecture,firmware:s.defaultFirmware,bootloader:s.defaultBootloader,
  kernelLanguage:s.defaultKernelLanguage,optimization:s.optimization,
  memory:{guestMiB:s.guestMemoryMiB,heapReserveMiB:s.heapReserveMiB,stackReserveKiB:s.stackReserveKiB,pageSize:s.pageSize,kernelBase:s.kernelBase},
  qemu:{binary:s.qemuBinary,machine:s.qemuMachine,display:s.qemuDisplay,vcpus:s.qemuVcpus,vncPort:s.qemuVncPort,acceleration:s.qemuAcceleration,cpuModel:s.qemuCpuModel,network:s.qemuNetwork},
  boot:{grubTimeout:s.grubTimeout,grubDefault:s.grubDefault,kernelCommandLine:s.kernelCommandLine},
  diagnostics:{debugSymbols:s.debugSymbols,warningsAsErrors:s.warningsAsErrors,logLevel:s.kernelLogLevel,serialBackend:s.serialBackend,retainBuildLogs:s.retainBuildLogs}
};}
function scaffold(c,template){
const ext=c.kernelLanguage==="c"?"c":"cpp";
const f={};
const x86=c.architecture==="x86_64"||c.architecture==="i686";
let entry="";
if(c.architecture==="x86_64"){
entry=[
"; Kerno x86_64 Multiboot2 entry. GRUB enters in 32-bit protected mode.",
"; This stub checks long-mode support, builds a 1 GiB identity map, then enters long mode.",
"BITS 32",
"SECTION .multiboot",
"ALIGN 8",
"mb2_header_start:",
"    dd 0xE85250D6",
"    dd 0",
"    dd mb2_header_end - mb2_header_start",
"    dd -(0xE85250D6 + (mb2_header_end - mb2_header_start))",
"    dw 0",
"    dw 0",
"    dd 8",
"mb2_header_end:",
"",
"SECTION .bss",
"ALIGN 4096",
"pml4: RESQ 512",
"pdpt: RESQ 512",
"pd:   RESQ 512",
"ALIGN 16",
"kernel_stack_bottom: RESB 16384",
"kernel_stack_top:",
"boot_magic: RESD 1",
"boot_info:  RESD 1",
"",
"SECTION .rodata",
"ALIGN 8",
"gdt64:",
"    dq 0x0000000000000000",
"    dq 0x00AF9A000000FFFF",
"    dq 0x00CF92000000FFFF",
"gdt64_pointer:",
"    dw gdt64_pointer - gdt64 - 1",
"    dd gdt64",
"",
"SECTION .text",
"GLOBAL _start",
"EXTERN kernel_main",
"_start:",
"    cli",
"    mov [boot_magic], eax",
"    mov [boot_info], ebx",
"    mov esp, kernel_stack_top",
"",
"    ; Confirm CPUID and extended long-mode support.",
"    pushfd",
"    pop eax",
"    mov ecx, eax",
"    xor eax, 1 << 21",
"    push eax",
"    popfd",
"    pushfd",
"    pop eax",
"    push ecx",
"    popfd",
"    cmp eax, ecx",
"    je .halt32",
"    mov eax, 0x80000000",
"    cpuid",
"    cmp eax, 0x80000001",
"    jb .halt32",
"    mov eax, 0x80000001",
"    cpuid",
"    bt edx, 29",
"    jnc .halt32",
"    bt edx, 6",
"    jnc .halt32",
"",
"    ; Map the first 1 GiB with 2 MiB identity pages.",
"    mov edi, pd",
"    mov ecx, 512",
"    mov ebx, 0x00000083",
".map_page:",
"    mov [edi], ebx",
"    mov dword [edi + 4], 0",
"    add ebx, 0x00200000",
"    add edi, 8",
"    loop .map_page",
"    mov dword [pml4], pdpt + 3",
"    mov dword [pml4 + 4], 0",
"    mov dword [pdpt], pd + 3",
"    mov dword [pdpt + 4], 0",
"",
"    mov eax, cr4",
"    or eax, 1 << 5",
"    mov cr4, eax",
"    mov eax, pml4",
"    mov cr3, eax",
"    mov ecx, 0xC0000080",
"    rdmsr",
"    or eax, 1 << 8",
"    wrmsr",
"    lgdt [gdt64_pointer]",
"    mov eax, cr0",
"    or eax, 0x80000001",
"    mov cr0, eax",
"    jmp 0x08:long_mode_start",
"",
".halt32:",
"    cli",
".halt32_loop:",
"    hlt",
"    jmp .halt32_loop",
"",
"BITS 64",
"long_mode_start:",
"    mov ax, 0x10",
"    mov ds, ax",
"    mov es, ax",
"    mov ss, ax",
"    xor eax, eax",
"    mov fs, ax",
"    mov gs, ax",
"    mov edi, [rel boot_magic]",
"    mov esi, [rel boot_info]",
"    lea rsp, [rel kernel_stack_top]",
"    and rsp, -16",
"    call kernel_main",
".halt64:",
"    cli",
"    hlt",
"    jmp .halt64",
""
].join("\n");
}else if(c.architecture==="i686"){
entry=[
"; Kerno i686 Multiboot2 32-bit entry scaffold.",
"BITS 32","SECTION .multiboot","ALIGN 8","mb2_header_start:",
"    dd 0xE85250D6","    dd 0","    dd mb2_header_end - mb2_header_start",
"    dd -(0xE85250D6 + (mb2_header_end - mb2_header_start))",
"    dw 0","    dw 0","    dd 8","mb2_header_end:",
"SECTION .bss","ALIGN 16","kernel_stack: RESB 16384","kernel_stack_top:",
"SECTION .text","GLOBAL _start","EXTERN kernel_main","_start:",
"    cli","    mov esp, kernel_stack_top","    push ebx","    push eax","    call kernel_main",
".halt: hlt","    jmp .halt",""
].join("\n");
}else{
entry=c.architecture==="aarch64"?[
"// AArch64 EL1 entry template. Platform/firmware handoff must be validated.",
".section .text.boot"," .align 4",".global _start","_start:",
"    msr daifset, #0xf","    adrp x0, kernel_stack_top","    add x0, x0, :lo12:kernel_stack_top",
"    mov sp, x0","    bl kernel_main","1:  wfe","    b 1b",
".section .bss"," .align 12","kernel_stack: .skip 16384","kernel_stack_top:",""
].join("\n"):[
"# RISC-V 64 entry template. Privilege level and platform ABI must be validated.",
".section .text.init"," .align 12",".globl _start","_start:",
"    la sp, kernel_stack_top","    call kernel_main","1:  wfi","    j 1b",
".section .bss"," .align 12","kernel_stack: .space 16384","kernel_stack_top:",""
].join("\n");
}
if(x86)f["boot/entry.asm"]=entry;
else f["boot/entry.S"]=entry;
f["boot/interrupts.asm"]=[
"; Default x86_64 interrupt fallback. Interrupts remain disabled until an",
"; architecture-specific controller and handlers have been configured.",
"BITS 64","SECTION .text","GLOBAL kerno_default_interrupt_stub",
"kerno_default_interrupt_stub:","    cli",".halt_interrupt:","    hlt","    jmp .halt_interrupt",""
].join("\n");
if(c.bootloader==="grub"){
f["boot/grub.cfg"]=x86?[
"set timeout="+Number((c.boot||{}).grubTimeout??3),"set default="+Number((c.boot||{}).grubDefault??0),"","menuentry '"+c.name+"' {",
"    multiboot2 /boot/kernel.elf"+(((c.boot||{}).kernelCommandLine||"").trim()?" "+String(c.boot.kernelCommandLine).trim():""),"    boot","}",""
].join("\n"):[
"# Kerno scaffold only: this target does not yet have a validated GRUB handoff.",
"# Do not treat this template as a bootable image."
].join("\n");
}
f["include/kernel/types.h"]=[
"#pragma once","#include <stdint.h>","#include <stddef.h>",
"typedef uintptr_t kerno_addr_t;","typedef uint64_t kerno_size_t;",""
].join("\n");
f["include/kernel/boot.h"]=[
"#pragma once","#include <stdint.h>",
"#define KERNO_MULTIBOOT2_BOOT_MAGIC 0x36D76289u",
"typedef struct __attribute__((packed)) { uint32_t total_size; uint32_t reserved; } kerno_mb2_info_t;",
"typedef struct __attribute__((packed)) { uint32_t type; uint32_t size; } kerno_mb2_tag_t;",
"typedef struct __attribute__((packed)) { uint32_t type; uint32_t size; uint32_t entry_size; uint32_t entry_version; } kerno_mb2_mmap_tag_t;",
"typedef struct __attribute__((packed)) { uint64_t address; uint64_t length; uint32_t type; uint32_t reserved; } kerno_mb2_mmap_entry_t;",
""
].join("\n");
f["include/kernel/serial.h"]=[
"#pragma once","void kerno_serial_initialize(void);","void kerno_serial_write(const char* text);",""
].join("\n");
f["include/kernel/console.h"]=[
"#pragma once","void kerno_console_initialize(void);","void kerno_console_write(const char* text);",""
].join("\n");
f["include/kernel/memory.h"]=[
"#pragma once","#include <stddef.h>",
"void* kerno_memset(void* destination, int value, size_t size);",
"void* kerno_memcpy(void* destination, const void* source, size_t size);",""
].join("\n");
f["include/kernel/pmm.h"]=[
"#pragma once","#include <stdint.h>",
"int kerno_pmm_initialize(uint32_t boot_magic, uintptr_t boot_info);",
"uintptr_t kerno_pmm_allocate_frame(void);",
"int kerno_pmm_release_frame(uintptr_t physical_address);",
"uint32_t kerno_pmm_free_frames(void);",""
].join("\n");
f["include/kernel/interrupts.h"]=[
"#pragma once","void kerno_interrupts_initialize(void);",""
].join("\n");
f["src/kernel."+ext]=[
"#include <stdint.h>","#include \"kernel/boot.h\"","#include \"kernel/serial.h\"",
"#include \"kernel/console.h\"","#include \"kernel/pmm.h\"","#include \"kernel/interrupts.h\"",
"#ifdef __cplusplus","extern \"C\"","#endif",
"void kernel_main(uint32_t boot_magic, uintptr_t boot_info) {",
"    kerno_serial_initialize();",
"    kerno_console_initialize();",
"#if KERNO_KERNEL_LOG_LEVEL >= 3",
"    kerno_console_write(\"KERNO kernel entry reached.\\n\");",
"    kerno_serial_write(\"KERNO: kernel entry reached.\\r\\n\");",
"#endif",
"    if (boot_magic != KERNO_MULTIBOOT2_BOOT_MAGIC) {",
"#if KERNO_KERNEL_LOG_LEVEL >= 1",
"        kerno_serial_write(\"KERNO: invalid Multiboot2 boot magic.\\r\\n\");",
"#endif",
"        for (;;) { __asm__ volatile (\"hlt\"); }",
"    }",
"    if (kerno_pmm_initialize(boot_magic, boot_info)) {",
"#if KERNO_KERNEL_LOG_LEVEL >= 3",
"        kerno_serial_write(\"KERNO: physical memory map initialized.\\r\\n\");",
"        kerno_console_write(\"Physical memory map initialized.\\n\");",
"#endif",
"    } else {",
"#if KERNO_KERNEL_LOG_LEVEL >= 2",
"        kerno_serial_write(\"KERNO: memory map unavailable; PMM is offline.\\r\\n\");",
"        kerno_console_write(\"Memory map unavailable; PMM offline.\\n\");",
"#endif",
"    }",
"    kerno_interrupts_initialize();",
"#if KERNO_KERNEL_LOG_LEVEL >= 3",
"    kerno_serial_write(\"KERNO: IDT installed; external interrupts remain disabled.\\r\\n\");",
"#endif",
"    for (;;) { __asm__ volatile (\"hlt\"); }",
"}",""
].join("\n");
f["src/console."+ext]=[
"#include <stdint.h>","#include \"kernel/console.h\"",
"#if defined(__x86_64__) || defined(__i386__)",
"static volatile uint16_t* const vga=(volatile uint16_t*)0xB8000;",
"void kerno_console_initialize(void){ for(uint32_t i=0;i<80u*25u;++i)vga[i]=(uint16_t)(' '|0x0700); }",
"void kerno_console_write(const char* text){ static uint32_t cursor=0; if(!text)return; while(*text&&cursor<80u*25u){ if(*text=='\\n'){cursor=((cursor/80u)+1u)*80u;}else{vga[cursor++]=(uint16_t)(uint8_t)*text|0x0700;} ++text; } }",
"#else",
"void kerno_console_initialize(void){}",
"void kerno_console_write(const char* text){(void)text;}",
"#endif",""
].join("\n");
f["src/memory."+ext]=[
"#include <stddef.h>","#include <stdint.h>",
"void* kerno_memset(void* destination,int value,size_t size){uint8_t* out=(uint8_t*)destination;for(size_t i=0;i<size;++i)out[i]=(uint8_t)value;return destination;}",
"void* kerno_memcpy(void* destination,const void* source,size_t size){uint8_t* out=(uint8_t*)destination;const uint8_t* in=(const uint8_t*)source;for(size_t i=0;i<size;++i)out[i]=in[i];return destination;}",
""
].join("\n");
f["src/serial."+ext]=[
"#include <stdint.h>","#include \"kernel/serial.h\"",
"#if defined(__x86_64__) || defined(__i386__)",
"static inline void outb(uint16_t port,uint8_t value){__asm__ volatile(\"outb %0,%1\"::\"a\"(value),\"Nd\"(port));}",
"static inline uint8_t inb(uint16_t port){uint8_t value;__asm__ volatile(\"inb %1,%0\":\"=a\"(value):\"Nd\"(port));return value;}",
"void kerno_serial_initialize(void){outb(0x3F9,0x00);outb(0x3FB,0x80);outb(0x3F8,0x03);outb(0x3F9,0x00);outb(0x3FB,0x03);outb(0x3FA,0xC7);outb(0x3FC,0x0B);}",
"void kerno_serial_write(const char* text){if(!text)return;while(*text){uint32_t timeout=1000000;while(!(inb(0x3FD)&0x20)&&--timeout){}if(!timeout)return;outb(0x3F8,(uint8_t)*text++);}}",
"#else",
"void kerno_serial_initialize(void){}",
"void kerno_serial_write(const char* text){(void)text;}",
"#endif",""
].join("\n");
f["src/pmm."+ext]=[
"#include <stdint.h>","#include \"kernel/boot.h\"","#include \"kernel/pmm.h\"","#include \"kernel/memory.h\"",
"#define KERNO_FRAME_SIZE 4096ULL",
"#define KERNO_PMM_LIMIT (1ULL<<30)",
"#define KERNO_FRAME_COUNT (KERNO_PMM_LIMIT/KERNO_FRAME_SIZE)",
"#define KERNO_BITMAP_BYTES (KERNO_FRAME_COUNT/8ULL)",
"extern uint8_t __kernel_start;","extern uint8_t __kernel_end;",
"static uint8_t frame_bitmap[KERNO_BITMAP_BYTES];",
"static uint8_t allocation_bitmap[KERNO_BITMAP_BYTES];",
"static uint32_t free_frame_count=0;",
"static int pmm_ready=0;",
"static void frame_mark(uint64_t frame,int used){uint8_t mask=(uint8_t)(1u<<(frame&7u));uint8_t* cell=&frame_bitmap[frame>>3u];if(used){if(!(*cell&mask)){*cell|=mask;if(free_frame_count) --free_frame_count;}}else{if(*cell&mask){*cell&=(uint8_t)~mask;++free_frame_count;}}}",
"static void reserve_range(uint64_t start,uint64_t end){if(end>KERNO_PMM_LIMIT)end=KERNO_PMM_LIMIT;if(start>=end)return;uint64_t first=start/KERNO_FRAME_SIZE;uint64_t last=(end+KERNO_FRAME_SIZE-1u)/KERNO_FRAME_SIZE;for(uint64_t frame=first;frame<last&&frame<KERNO_FRAME_COUNT;++frame)frame_mark(frame,1);}",
"int kerno_pmm_initialize(uint32_t boot_magic,uintptr_t boot_info){",
"    if(boot_magic!=KERNO_MULTIBOOT2_BOOT_MAGIC||!boot_info)return 0;",
"    pmm_ready=0;kerno_memset(frame_bitmap,0xFF,(size_t)KERNO_BITMAP_BYTES);kerno_memset(allocation_bitmap,0,(size_t)KERNO_BITMAP_BYTES);free_frame_count=0;",
"    const kerno_mb2_info_t* info=(const kerno_mb2_info_t*)boot_info;",
"    if(info->total_size<16u||info->total_size>1024u*1024u)return 0;",
"    const uint8_t* cursor=(const uint8_t*)boot_info+8u;const uint8_t* limit=(const uint8_t*)boot_info+info->total_size;int found=0;",
"    while(cursor+8u<=limit){const kerno_mb2_tag_t* tag=(const kerno_mb2_tag_t*)cursor;if(tag->size<8u||cursor+tag->size>limit)break;if(tag->type==0u)break;",
"      if(tag->type==6u&&tag->size>=16u){const kerno_mb2_mmap_tag_t* map=(const kerno_mb2_mmap_tag_t*)tag;if(map->entry_size<sizeof(kerno_mb2_mmap_entry_t))return 0;const uint8_t* item=cursor+16u;const uint8_t* end=cursor+tag->size;while(item+map->entry_size<=end){const kerno_mb2_mmap_entry_t* entry=(const kerno_mb2_mmap_entry_t*)item;if(entry->type==1u&&entry->length&&entry->address<KERNO_PMM_LIMIT&&entry->address+entry->length>entry->address){uint64_t start=(entry->address+KERNO_FRAME_SIZE-1u)&~(KERNO_FRAME_SIZE-1u);uint64_t finish=entry->address+entry->length;if(finish>KERNO_PMM_LIMIT)finish=KERNO_PMM_LIMIT;uint64_t last=finish/KERNO_FRAME_SIZE;for(uint64_t frame=start/KERNO_FRAME_SIZE;frame<last&&frame<KERNO_FRAME_COUNT;++frame)frame_mark(frame,0);found=1;}item+=map->entry_size;}}",
"      uint64_t next=((uint64_t)(uintptr_t)cursor+tag->size+7u)&~7ULL;if(next<=(uint64_t)(uintptr_t)cursor)break;cursor=(const uint8_t*)(uintptr_t)next;",
"    }",
"    if(!found)return 0;reserve_range(0,0x100000ULL);reserve_range((uintptr_t)&__kernel_start,(uintptr_t)&__kernel_end);pmm_ready=1;return 1;",
"}",
"uintptr_t kerno_pmm_allocate_frame(void){if(!pmm_ready)return 0;for(uint64_t frame=256u;frame<KERNO_FRAME_COUNT;++frame){uint8_t mask=(uint8_t)(1u<<(frame&7u));if(!(frame_bitmap[frame>>3u]&mask)){frame_mark(frame,1);allocation_bitmap[frame>>3u]|=mask;return (uintptr_t)(frame*KERNO_FRAME_SIZE);}}return 0;}",
"int kerno_pmm_release_frame(uintptr_t address){if(!pmm_ready||address<0x100000u||(address&(KERNO_FRAME_SIZE-1u))||address>=KERNO_PMM_LIMIT)return 0;uint64_t frame=(uint64_t)address/KERNO_FRAME_SIZE;uint8_t mask=(uint8_t)(1u<<(frame&7u));uint8_t* allocated=&allocation_bitmap[frame>>3u];if(!(*allocated&mask))return 0;*allocated&=(uint8_t)~mask;frame_mark(frame,0);return 1;}",
"uint32_t kerno_pmm_free_frames(void){return free_frame_count;}",
""
].join("\n");
if(c.architecture==="x86_64")f["boot/interrupts.asm"]=[
"; Default exception/interrupt fallback for the x86_64 IDT.",
"BITS 64","SECTION .text","GLOBAL kerno_default_interrupt_stub",
"kerno_default_interrupt_stub:","    cli",".halt_forever:","    hlt","    jmp .halt_forever",""
].join("\n");
f["src/interrupts."+ext]=[
"#include <stdint.h>","#include \"kernel/interrupts.h\"",
"#if defined(__x86_64__)",
"typedef struct __attribute__((packed)){uint16_t low;uint16_t selector;uint8_t ist;uint8_t flags;uint16_t middle;uint32_t high;uint32_t reserved;} kerno_idt_entry_t;",
"typedef struct __attribute__((packed)){uint16_t limit;uint64_t base;} kerno_idtr_t;",
"static kerno_idt_entry_t idt[256];",
"#ifdef __cplusplus","extern \"C\" {","#endif","void kerno_default_interrupt_stub(void);","#ifdef __cplusplus","}","#endif",
"void kerno_interrupts_initialize(void){uintptr_t handler=(uintptr_t)&kerno_default_interrupt_stub;for(uint32_t i=0;i<256u;++i){idt[i].low=(uint16_t)(handler&0xFFFFu);idt[i].selector=0x08;idt[i].ist=0;idt[i].flags=0x8E;idt[i].middle=(uint16_t)((handler>>16)&0xFFFFu);idt[i].high=(uint32_t)(handler>>32);idt[i].reserved=0;}kerno_idtr_t descriptor={(uint16_t)(sizeof(idt)-1u),(uint64_t)(uintptr_t)idt};__asm__ volatile(\"lidt %0\"::\"m\"(descriptor));}",
"#else",
"void kerno_interrupts_initialize(void){}",
"#endif",""
].join("\n");
const outputFormat=c.architecture==="i686"?"elf32-i386":c.architecture==="aarch64"?"elf64-littleaarch64":c.architecture==="riscv64"?"elf64-littleriscv":"elf64-x86-64";
f["linker.ld"]=[
"OUTPUT_FORMAT("+outputFormat+")","ENTRY(_start)","SECTIONS","{",
"    . = "+c.memory.kernelBase+";",
"    __kernel_start = .;",
"    .multiboot ALIGN(8) : { KEEP(*(.multiboot)) }",
"    .text ALIGN(4K) : { *(.text .text.*) }",
"    .rodata ALIGN(4K) : { *(.rodata .rodata.*) }",
"    .data ALIGN(4K) : { *(.data .data.*) }",
"    .bss ALIGN(4K) : { *(COMMON) *(.bss .bss.*) }",
"    __kernel_end = .;",
"}",""
].join("\n");
f["kerno.project.json"]=JSON.stringify({format:"kerno-project",version:2,name:c.name,config:c,buildSupport:c.architecture==="x86_64"&&c.firmware==="bios"&&c.bootloader==="grub"?"x86_64-bios-grub-multiboot2":"scaffold-only"},null,2)+"\n";
f["docs/architecture.md"]=[
"# "+c.name,"","## Machine target","- Architecture: "+c.architecture,
"- Firmware: "+c.firmware,"- Bootloader: "+c.bootloader,"- Kernel language: "+c.kernelLanguage,
"","## Low-level modules","- boot/entry: CPU entry and boot handoff.",
"- src/pmm: 4 KiB physical-frame bitmap manager for the first 1 GiB identity-mapped region.",
"- src/serial: COM1 serial output for QEMU diagnostics on x86.",
"- src/interrupts: IDT installation with a fail-stop default handler.",
"- src/memory: freestanding memory primitives.",
"","## Important boundaries","- The first native build service target is x86_64 + BIOS + GRUB + Multiboot2.",
"- Other architecture selections create learning scaffolds only and are not claimed to boot.",
"- The memory manager consumes the Multiboot2 memory map and is limited to the first 1 GiB identity map in this starter.",
"- Interrupts are not enabled; APIC/PIC initialization and proper per-vector handlers are future work.",
""
].join("\n");
f["README.md"]="# "+c.name+"\n\nKerno kernel workspace. Review docs/architecture.md and validate the selected boot protocol before using native builds.\n";
return f;
}
function validName(x){return /^[A-Za-z0-9][A-Za-z0-9 _.-]{0,47}$/.test(x);}
async function createProject(){const name=$("#projectNameInput").value.trim();if(!validName(name)){notify("Invalid project name","Use letters, numbers, spaces, dots, dashes or underscores.");return;}const c=configFor(name);c.architecture=$("#architectureSelect").value;c.firmware=$("#firmwareSelect").value;c.kernelLanguage=$("#kernelLanguageSelect").value;c.bootloader=$("#bootloaderSelect").value;c.memory.guestMiB=Number($("#guestMemoryInput").value);c.qemu.vcpus=Number($("#cpuCountInput").value);c.qemu.machine=["aarch64","riscv64"].includes(c.architecture)?"virt":"q35";if(!Number.isInteger(c.memory.guestMiB)||c.memory.guestMiB<64||c.memory.guestMiB>32768||!Number.isInteger(c.qemu.vcpus)||c.qemu.vcpus<1||c.qemu.vcpus>32){notify("Invalid resources","RAM must be 64–32768 MiB; vCPU must be 1–32.");return;}state.settings.defaultArchitecture=c.architecture;state.settings.defaultFirmware=c.firmware;state.settings.defaultBootloader=c.bootloader;state.settings.defaultKernelLanguage=c.kernelLanguage;state.settings.guestMemoryMiB=c.memory.guestMiB;state.settings.qemuVcpus=c.qemu.vcpus;await saveSettings();state.project={id:makeId(),name,config:c,files:scaffold(c,$("#templateSelect").value),template:$("#templateSelect").value,createdAt:Date.now(),updatedAt:Date.now()};await saveProject(true);await openProject();notify("OS workspace created",Object.keys(state.project.files).length+" editable source/config files generated.");}
function renderTree(){const host=$("#sourceTree");if(!host||!state.project)return;host.innerHTML="";const root={dirs:{},files:[]};Object.keys(state.project.files).sort().forEach(path=>{let n=root;const parts=path.split("/");parts.slice(0,-1).forEach(dir=>{if(!n.dirs[dir])n.dirs[dir]={dirs:{},files:[]};n=n.dirs[dir];});n.files.push({path,name:parts[parts.length-1]});});function draw(parent,node){Object.keys(node.dirs).sort().forEach(name=>{const wrap=document.createElement("div");wrap.className="tree-folder";const head=document.createElement("button");head.className="tree-folder-head";head.innerHTML='<span class="folder-arrow">⌄</span><span class="folder-icon">▰</span><span></span>';$("span:last-child",head).textContent=name;const content=document.createElement("div");content.className="folder-contents";head.onclick=()=>{content.classList.toggle("hidden");$(".folder-arrow",head).textContent=content.classList.contains("hidden")?"›":"⌄";};wrap.append(head,content);draw(content,node.dirs[name]);parent.append(wrap);});node.files.forEach(file=>{const b=document.createElement("button");b.className="tree-file"+(file.path===state.activeFile?" active":"");const ic=fileBadge(file.path);b.innerHTML='<span class="file-type-mark"></span><span class="tree-file-name"></span>';$("span:first-child",b).classList.add(ic[1]);$("span:first-child",b).textContent=ic[0];$(".tree-file-name",b).textContent=file.name;b.onclick=()=>openFile(file.path);parent.append(b);});}draw(host,root);$("#sourceCount").textContent=Object.keys(state.project.files).length+" files";$("#projectStorageSize").textContent=formatBytes(fileSize(state.project));}
function renderTabs(){const host=$("#sourceTabs");host.innerHTML="";state.tabs.forEach(path=>{if(!(path in state.project.files))return;const b=document.createElement("button");b.className="source-tab"+(path===state.activeFile?" active":"");const ic=fileBadge(path);b.innerHTML='<span class="file-type-mark"></span><span></span><span class="tab-close">×</span>';$("span:first-child",b).classList.add(ic[1]);$("span:first-child",b).textContent=ic[0];$("span:nth-child(2)",b).textContent=path.split("/").pop();b.onclick=e=>{if(e.target.classList.contains("tab-close"))closeTab(path);else openFile(path);};host.append(b);});}
function ensureModel(path){
  if(!window.monaco||!state.project||!(path in state.project.files))return null;
  if(state.models[path])return state.models[path];
  const uri=window.monaco.Uri.parse("file:///kerno/"+path.split("/").map(encodeURIComponent).join("/"));
  const m=window.monaco.editor.getModel(uri)||window.monaco.editor.createModel(state.project.files[path],langOf(path),uri);
  m.onDidChangeContent(()=>{
    state.project.files[path]=m.getValue();
    $("#editorStatus").textContent=editorText("modified");
    scheduleQuickDiagnostics(m);
    if(state.settings.autosave){clearTimeout(state.saveTimer);state.saveTimer=setTimeout(()=>saveProject(true),Math.max(250,Math.min(5000,Number(state.settings.autoSaveDelayMs)||800)));}
  });
  state.models[path]=m;scheduleQuickDiagnostics(m);return m;
}
function saveProject(silent){
  if(!state.project) return Promise.resolve(false);
  syncEditor();
  const size=fileSize(state.project);
  if(size>PROJECT_LIMIT){
    if(!silent) notify("Workspace exceeds browser project limit","Export files in smaller groups or remove large text artifacts.");
    return Promise.resolve(false);
  }
  state.project.updatedAt=Date.now();
  return put("projects",state.project).then(()=>{
    if($("#editorStatus")) $("#editorStatus").textContent=editorText("saved");
    if($("#editorStatus")) $("#editorStatus").style.color="";
    if($("#sourceTree")) renderTree();
    if(!silent) notify("Workspace saved","Project files are stored locally in IndexedDB.");
    return true;
  }).catch(error=>{
    if(!silent) notify("Save failed",error.message||"Export the project to keep a backup.");
    return false;
  });
}
function syncWizardDefaults(){
  const s=state.settings;
  $("#projectNameInput").value="My First OS";
  $("#templateSelect").value=s.defaultTemplate||"kernel-text";
  $("#architectureSelect").value=s.defaultArchitecture;
  $("#firmwareSelect").value=s.defaultFirmware;
  $("#bootloaderSelect").value=s.defaultBootloader;
  $("#kernelLanguageSelect").value=s.defaultKernelLanguage;
  $("#guestMemoryInput").value=s.guestMemoryMiB;
  $("#cpuCountInput").value=s.qemuVcpus;
  const arch=s.defaultArchitecture;
  $("#scaffoldPreview").textContent=arch+" target\\n├── boot/\\n│   └── entry.asm\\n├── include/kernel/\\n├── src/\\n│   ├── kernel."+s.defaultKernelLanguage+"\\n│   ├── console."+s.defaultKernelLanguage+"\\n│   └── memory."+s.defaultKernelLanguage+"\\n├── linker.ld\\n└── kerno.project.json";
}
function syncEditor(){if(!state.project||!state.activeFile)return;if(state.models[state.activeFile])state.project.files[state.activeFile]=state.models[state.activeFile].getValue();else if($("#plainEditor").style.display==="block")state.project.files[state.activeFile]=$("#plainEditor").value;}
function renderEditor(){if(!state.project)return;const empty=!state.activeFile||!(state.activeFile in state.project.files);$("#editorEmpty").classList.toggle("hidden",!empty);if(empty){$("#editorBreadcrumb").textContent=activeLocale()==="id"?"Pilih file source":"No source file selected";$("#plainEditor").style.display="none";$("#editorLoading").classList.add("hidden");$("#editorEngineFallback").classList.add("hidden");return;}$("#editorBreadcrumb").textContent=state.activeFile;$("#languageMode").textContent=langLabel(state.activeFile);const model=state.editor&&window.monaco?ensureModel(state.activeFile):null;if(state.editor&&model){if(state.editor.getModel()!==model)state.editor.setModel(model);$("#plainEditor").style.display="none";}else{$("#plainEditor").value=state.project.files[state.activeFile];$("#plainEditor").style.display="block";}}
function openFile(path){if(!state.project||!(path in state.project.files))return;syncEditor();state.activeFile=path;if(!state.tabs.includes(path))state.tabs.push(path);renderTree();renderTabs();renderEditor();if(state.editor){const model=ensureModel(path);if(model&&state.editor.getModel()!==model)state.editor.setModel(model);}}
function closeTab(path){
  if(!state.project||!path)return;
  syncEditor();
  const wasActive=state.activeFile===path;
  state.tabs=state.tabs.filter(x=>x!==path);
  if(wasActive)state.activeFile=state.tabs[state.tabs.length-1]||null;
  renderTabs();renderTree();renderEditor();
  if(state.editor)state.editor.setModel(state.activeFile?ensureModel(state.activeFile):null);
  if(state.splitEditor&&state.splitFile===path){
    state.splitFile=Object.keys(state.project.files).find(x=>x!==state.activeFile)||state.activeFile;
    if(state.splitFile)state.splitEditor.setModel(ensureModel(state.splitFile));
  }
  saveProject(true);
  if(wasActive)notify("File tab closed",path);
}
function disposeEditors(){Object.values(state.models).forEach(m=>{const timer=quickCheckTimers.get(m);if(timer)clearTimeout(timer);try{m.dispose();}catch(_){}});state.models={};if(state.editor){state.editor.dispose();state.editor=null;}if(state.splitEditor){state.splitEditor.dispose();state.splitEditor=null;}}
function defineLanguages(m){
m.languages.register({id:"kerno-gas",extensions:[".s",".S"],aliases:["GNU Assembler","GAS"]});
m.languages.setMonarchTokensProvider("kerno-gas",{tokenizer:{root:[
[/#.*$/,"comment"],
[/\.section|\.global|\.globl|\.align|\.type|\.size|\.word|\.quad|\.zero|\.space|\.text|\.data|\.bss/,"keyword"],
[/\b(mov|add|sub|mul|div|cmp|jmp|call|ret|push|pop|wfi|wfe|mrs|msr|ldr|str|la|li|csrw|csrr)\b/i,"keyword"],
[/\b(x[0-9]+|a[0-7]|s[0-9]+|t[0-6]|sp|ra|gp|tp|eax|rax|rsp|rbp)\b/i,"variable"],
[/0x[0-9a-f]+|\b[0-9]+\b/i,"number"],
[/[a-zA-Z_][\w]*:/,"type"],
[/".*?"/,"string"]
]}});
m.languages.register({id:"kerno-asm",extensions:[".asm",".inc"],aliases:["NASM","Assembly"]});
m.languages.setMonarchTokensProvider("kerno-asm",{tokenizer:{root:[
[/;.*$/,"comment"],
[/\b(section|global|extern|align|times|bits|default|db|dw|dd|dq|resb|resw|resd|equ)\b/i,"keyword"],
[/\b(mov|add|sub|mul|div|cmp|jmp|je|jne|call|ret|push|pop|cli|sti|hlt|xor|lea|int|and|or|in|out|test|shl|shr)\b/i,"keyword"],
[/\b(rax|rbx|rcx|rdx|rsi|rdi|rsp|rbp|eax|ebx|ecx|edx|ax|bx|cx|dx|al|ah)\b/i,"variable"],
[/0x[0-9a-f]+|\b\d+\b/i,"number"],
[/\.[\w.]+/,"type"],
[/\b[\w]+:/,"type"]
]}});
m.languages.register({id:"kerno-linker",extensions:[".ld"],aliases:["Linker Script"]});
m.languages.setMonarchTokensProvider("kerno-linker",{tokenizer:{root:[
[/\/\*.*?\*\//,"comment"],
[/\/\/.*$/,"comment"],
[/\b(ENTRY|SECTIONS|KEEP|ALIGN|PROVIDE|ASSERT|ORIGIN|LENGTH)\b/,"keyword"],
[/\.[\w.]+/,"type"],
[/0x[0-9a-f]+|\b\d+[kKmM]?\b/i,"number"]
]}});
}
function registerEditorEnhancements(m){
  if(monacoAssistRegistered)return;
  const snippets={
    c:[["kernel_main","Kernel entry","void kernel_main(void) {\n    $0\n}"],["stdint","Fixed-width integers","#include <stdint.h>\n$0"],["for","C loop","for (size_t i = 0; i < $1; ++i) {\n    $0\n}"]],
    cpp:[["kernel_main","C-linkage kernel entry","extern \"C\" void kernel_main(uint32_t magic, uint32_t mbi_addr) {\n    $0\n}"],["namespace","Namespace","namespace $1 {\n    $0\n}"],["class","C++ class","class $1 {\npublic:\n    $1() = default;\nprivate:\n    $0\n};"]],
    python:[["main","Python main function","def main():\n    $0\n\nif __name__ == \"__main__\":\n    main()"],["try","Try / except","try:\n    $1\nexcept Exception as error:\n    print(error)\n    $0"],["class","Python class","class $1:\n    def __init__(self):\n        $0"]],
    "kerno-asm":[["boot entry","NASM entry","bits 32\nsection .text\nglobal _start\n_start:\n    cli\n    $0\n    hlt"],["halt loop","Halt loop",".halt:\n    hlt\n    jmp .halt"]],
    "kerno-gas":[["global entry","GNU Assembly entry",".section .text\n.global _start\n_start:\n    cli\n    $0\n    hlt"],["label","Assembly label","$1:\n    $0"]]
  };
  Object.entries(snippets).forEach(([language,items])=>{
    m.languages.registerCompletionItemProvider(language,{
      triggerCharacters:["."],
      provideCompletionItems(model,position){
        if(!state.settings.codeAssist)return {suggestions:[]};
        const word=model.getWordUntilPosition(position);
        const range={startLineNumber:position.lineNumber,startColumn:word.startColumn,endLineNumber:position.lineNumber,endColumn:word.endColumn};
        return {suggestions:items.map((item,index)=>({label:item[0],kind:m.languages.CompletionItemKind.Snippet,detail:"Kerno · "+item[1],insertText:item[2],insertTextRules:m.languages.CompletionItemInsertTextRule.InsertAsSnippet,range,sortText:"0"+index}))};
      }
    });
  });
  monacoAssistRegistered=true;
}
function scheduleQuickDiagnostics(model){
  if(!window.monaco||!model)return;
  const previous=quickCheckTimers.get(model);if(previous)clearTimeout(previous);
  if(!state.settings.quickDiagnostics){
    window.monaco.editor.setModelMarkers(model,"kerno-quick-check",[]);
    updateQuickDiagnosticSummary(model,[]);return;
  }
  quickCheckTimers.set(model,setTimeout(()=>runQuickDiagnostics(model),280));
}
function updateQuickDiagnosticSummary(model,markers){
  const summary=$("#diagnosticSummary");
  if(!summary||!state.project||state.models[state.activeFile]!==model)return;
  const errors=markers.filter(item=>item.severity===window.monaco.MarkerSeverity.Error).length,warnings=markers.length-errors;
  summary.textContent=markers.length?editorText("count",{errors,warnings}):editorText("clean");
  summary.classList.toggle("has-issues",warnings>0);summary.classList.toggle("has-errors",errors>0);
}
function runQuickDiagnostics(model){
  if(!window.monaco||!model)return;
  if(!state.settings.quickDiagnostics){window.monaco.editor.setModelMarkers(model,"kerno-quick-check",[]);updateQuickDiagnosticSummary(model,[]);return;}
  const language=model.getLanguageId();
  const source=model.getValue();
  if(source.length>600000){window.monaco.editor.setModelMarkers(model,"kerno-quick-check",[]);const status=$("#diagnosticSummary");if(status&&state.models[state.activeFile]===model)status.textContent=editorText("paused");return;}
  if(language==="json"){
    const jsonMarkers=[];
    try{JSON.parse(source);}catch(error){
      const match=String(error&&error.message||"").match(/position\s+(\d+)/i);
      const offset=match?Math.max(0,Math.min(source.length,Number(match[1]))):0;
      let line=1,column=1;for(let i=0;i<offset;i++){if(source[i]==="\n"){line++;column=1;}else column++;}
      jsonMarkers.push({severity:window.monaco.MarkerSeverity.Error,message:editorText("jsonError",{message:String(error&&error.message||"Invalid JSON")}),source:"Kerno Diagnostics",startLineNumber:line,startColumn:column,endLineNumber:line,endColumn:column+1});
    }
    window.monaco.editor.setModelMarkers(model,"kerno-quick-check",jsonMarkers);updateQuickDiagnosticSummary(model,jsonMarkers);return;
  }
  if(!["c","cpp","python","kerno-asm","kerno-gas","kerno-linker"].includes(language)){window.monaco.editor.setModelMarkers(model,"kerno-quick-check",[]);updateQuickDiagnosticSummary(model,[]);return;}
  const markers=[],stack=[],pairs={"(":")","[":"]","{":"}"},reverse={")":"(","]":"[","}":"{"};
  const blockComments=["c","cpp","kerno-linker"].includes(language),slashComments=["c","cpp","kerno-linker","kerno-gas"].includes(language);
  const hashComments=["python","kerno-gas"].includes(language),semicolonComments=language==="kerno-asm";
  let index=0,line=1,column=1,blockComment=false,lineComment=false,quote=null,triple=false,escaped=false,quoteStart=null;
  const advance=()=>{if(source[index]==="\n"){index++;line++;column=1;}else{index++;column++;}};
  const add=(severity,message,startLine,startColumn)=>markers.push({severity,message,source:"Kerno Diagnostics",startLineNumber:startLine,startColumn:startColumn,endLineNumber:startLine,endColumn:startColumn+1});
  while(index<source.length&&markers.length<24){
    const ch=source[index],next=source[index+1];
    if(blockComment){if(ch==="*"&&next==="/"){advance();advance();blockComment=false;continue;}advance();continue;}
    if(lineComment){if(ch==="\n")lineComment=false;else{advance();continue;}}
    if(quote){
      if(escaped){escaped=false;advance();continue;}
      if(ch==="\\"){escaped=true;advance();continue;}
      if(triple&&source.startsWith(quote.repeat(3),index)){advance();advance();advance();quote=null;triple=false;quoteStart=null;continue;}
      if(!triple&&ch===quote){advance();quote=null;quoteStart=null;continue;}
      if(ch==="\n"&&!triple){add(window.monaco.MarkerSeverity.Warning,editorText("stringLine"),quoteStart.line,quoteStart.column);quote=null;quoteStart=null;escaped=false;advance();continue;}
      advance();continue;
    }
    if(ch==="\n"){advance();continue;}
    if(blockComments&&ch==="/"&&next==="*"){blockComment=true;advance();advance();continue;}
    if(slashComments&&ch==="/"&&next==="/"){lineComment=true;advance();advance();continue;}
    if(hashComments&&ch==="#"){lineComment=true;advance();continue;}
    if(semicolonComments&&ch===";"){lineComment=true;advance();continue;}
    if(ch==="\""||ch==="'"){quote=ch;quoteStart={line,column};if(language==="python"&&source.startsWith(ch.repeat(3),index)){triple=true;advance();advance();advance();}else advance();continue;}
    if(pairs[ch]){stack.push({token:ch,line,column});advance();continue;}
    if(reverse[ch]){
      const top=stack[stack.length-1];
      if(!top||top.token!==reverse[ch])add(window.monaco.MarkerSeverity.Error,top?editorText("unexpectedExpected",{token:ch,expected:pairs[top.token]}):editorText("unexpectedClose",{token:ch}),line,column);
      else stack.pop();
      advance();continue;
    }
    advance();
  }
  if(quote&&quoteStart)add(window.monaco.MarkerSeverity.Warning,editorText("stringOpen"),quoteStart.line,quoteStart.column);
  if(blockComment)add(window.monaco.MarkerSeverity.Warning,editorText("commentOpen"),line,column);
  stack.slice(-8).reverse().forEach(item=>markers.push({severity:window.monaco.MarkerSeverity.Warning,message:editorText("openingMissing",{token:item.token,expected:pairs[item.token]}),source:"Kerno Diagnostics",startLineNumber:item.line,startColumn:item.column,endLineNumber:item.line,endColumn:item.column+1}));
  const limited=markers.slice(0,24);window.monaco.editor.setModelMarkers(model,"kerno-quick-check",limited);updateQuickDiagnosticSummary(model,limited);
}
function defineThemes(m){m.editor.defineTheme("kerno-dark",{base:"vs-dark",inherit:true,rules:[{token:"comment",foreground:"778B9B",fontStyle:"italic"},{token:"keyword",foreground:"C5A4DF"},{token:"string",foreground:"A8D3B3"},{token:"number",foreground:"DDB77B"},{token:"type",foreground:"8CB9ED"},{token:"variable",foreground:"8DC8B2"}],colors:{"editor.background":"#0E141B","editor.foreground":"#E1E9F0","editorLineNumber.foreground":"#526476","editorLineNumber.activeForeground":"#C7D2DC","editor.lineHighlightBackground":"#17212A","editor.selectionBackground":"#3A586F88","editorCursor.foreground":"#A4D4BE","editorIndentGuide.background1":"#263440","editorIndentGuide.activeBackground1":"#557C6B","editorWidget.background":"#1C2833"}});m.editor.defineTheme("kerno-light",{base:"vs",inherit:true,rules:[{token:"comment",foreground:"788A96",fontStyle:"italic"},{token:"keyword",foreground:"8C50A8"},{token:"string",foreground:"357A51"},{token:"number",foreground:"9B641B"},{token:"type",foreground:"2767A5"}],colors:{"editor.background":"#FFFFFF","editor.foreground":"#263540","editorLineNumber.foreground":"#9BA8B2","editorLineNumber.activeForeground":"#526372","editor.lineHighlightBackground":"#F1F6F5","editorCursor.foreground":"#26795E"}});m.editor.defineTheme("kerno-mono",{base:"vs-dark",inherit:true,rules:[{token:"comment",foreground:"A0A0A0",fontStyle:"italic"},{token:"keyword",foreground:"FFFFFF",fontStyle:"bold"},{token:"string",foreground:"D8D8D8"},{token:"number",foreground:"BDBDBD"},{token:"type",foreground:"F0F0F0"},{token:"variable",foreground:"E0E0E0"}],colors:{"editor.background":"#050505","editor.foreground":"#F5F5F5","editorLineNumber.foreground":"#777777","editorLineNumber.activeForeground":"#FFFFFF","editor.lineHighlightBackground":"#171717","editor.selectionBackground":"#55555588","editorCursor.foreground":"#FFFFFF","editorIndentGuide.background1":"#333333","editorIndentGuide.activeBackground1":"#AAAAAA","editorWidget.background":"#111111"}});}
function monacoOptions(model){return {
  model,theme:state.settings.theme==="light"?"kerno-light":state.settings.theme==="mono"?"kerno-mono":"kerno-dark",automaticLayout:true,
  quickSuggestions:state.settings.codeAssist?{other:true,comments:false,strings:false}:false,
  suggestOnTriggerCharacters:!!state.settings.codeAssist,acceptSuggestionOnEnter:"on",snippetSuggestions:"inline",
  parameterHints:{enabled:!!state.settings.codeAssist},hover:{enabled:true},matchBrackets:"always",autoIndent:"full",formatOnPaste:true,formatOnType:true,autoClosingBrackets:"always",autoClosingQuotes:"always",autoSurround:"languageDefined",wordBasedSuggestions:"currentDocument",suggestSelection:"first",tabCompletion:"on",stickyScroll:{enabled:true},unicodeHighlight:{invisibleCharacters:true,ambiguousCharacters:false},
  fontFamily:(state.settings.editorFontFamily||"DM Mono")+", Consolas, monospace",
  fontSize:Number(state.settings.editorFontSize),lineHeight:Math.max(20,Math.round(Number(state.settings.editorFontSize)*1.65)),
  minimap:{enabled:!!state.settings.minimap},padding:{top:17,bottom:20},scrollBeyondLastLine:false,
  renderLineHighlight:"line",renderWhitespace:state.settings.renderWhitespace||"selection",
  cursorBlinking:"smooth",cursorStyle:state.settings.cursorStyle||"line",
  smoothScrolling:!!state.settings.smoothScrolling,tabSize:Number(state.settings.tabSize),
  wordWrap:state.settings.wordWrap,lineNumbers:state.settings.lineNumbers?"on":"off",
  glyphMargin:false,folding:true,bracketPairColorization:{enabled:!!state.settings.bracketPairColorization},
  guides:{indentation:true}
};}
async function loadMonacoEngine(){
  const cdn="https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/";
  await loadExternalScript(cdn+"vs/loader.js","monaco-loader",()=>typeof window.require==="function");
  window.MonacoEnvironment={getWorkerUrl:()=> "data:text/javascript;charset=utf-8,"+encodeURIComponent("self.MonacoEnvironment={baseUrl:'"+cdn+"'};importScripts('"+cdn+"vs/base/worker/workerMain.js');")};
  window.require.config({paths:{vs:cdn+"vs"}});
  return new Promise((resolve,reject)=>{
    const timer=window.setTimeout(()=>reject(new Error("Monaco editor modules timed out.")),30000);
    try{window.require(["vs/editor/editor.main"],()=>{window.clearTimeout(timer);if(window.monaco&&window.monaco.editor)resolve(window.monaco);else reject(new Error("Monaco editor API was not initialized."));},error=>{window.clearTimeout(timer);reject(error||new Error("Monaco editor modules could not be loaded."));});}
    catch(error){window.clearTimeout(timer);reject(error);}
  });
}
async function initMonaco(){
  if(!state.project||!state.activeFile)return;
  $("#editorLoading").classList.remove("hidden");$("#editorEngineFallback").classList.add("hidden");$("#editorStatus").textContent=editorText("loadingStatus");
  try{
    if(!monacoLoad)monacoLoad=loadMonacoEngine().catch(error=>{monacoLoad=null;throw error;});
    const m=await monacoLoad;
    if(!state.project||!state.activeFile)return;
    defineLanguages(m);defineThemes(m);registerEditorEnhancements(m);
    if(m.languages.json&&m.languages.json.jsonDefaults)m.languages.json.jsonDefaults.setDiagnosticsOptions({validate:true,allowComments:false,enableSchemaRequest:false,schemas:[]});
    const activeModel=ensureModel(state.activeFile);
    if(!state.editor){
      state.editor=m.editor.create($("#monacoPane"),monacoOptions(activeModel));
      state.editor.onDidChangeCursorPosition(e=>$("#cursorPosition").textContent="Ln "+e.position.lineNumber+", Col "+e.position.column);
      state.editor.onDidChangeModel(()=>{const model=state.editor&&state.editor.getModel();if(model)scheduleQuickDiagnostics(model);});
    }else if(activeModel&&state.editor.getModel()!==activeModel)state.editor.setModel(activeModel);
    $("#plainEditor").style.display="none";$("#editorEngineFallback").classList.add("hidden");
    if(!$("#splitPane").classList.contains("hidden"))openSplit();
    applyEditorSettings();$("#editorStatus").textContent=editorText("ready");
  }catch(error){
    $("#plainEditor").style.display=state.activeFile?"block":"none";
    if(state.activeFile)$("#plainEditor").value=state.project.files[state.activeFile];
    $("#editorEngineFallback").classList.toggle("hidden",!state.activeFile);$("#editorFallbackMessage").textContent=editorText("fallbackBody");
    $("#editorStatus").textContent=editorText("basicReady");
  }finally{$("#editorLoading").classList.add("hidden");}
}
function applyEditorSettings(){
  const options={
    fontFamily:(state.settings.editorFontFamily||"DM Mono")+", Consolas, monospace",
    fontSize:Number(state.settings.editorFontSize),
    lineHeight:Math.max(20,Math.round(Number(state.settings.editorFontSize)*1.65)),
    tabSize:Number(state.settings.tabSize),wordWrap:state.settings.wordWrap,
    lineNumbers:state.settings.lineNumbers?"on":"off",
    minimap:{enabled:!!state.settings.minimap},
    cursorStyle:state.settings.cursorStyle||"line",
    smoothScrolling:!!state.settings.smoothScrolling,
    renderWhitespace:state.settings.renderWhitespace||"selection",
    bracketPairColorization:{enabled:!!state.settings.bracketPairColorization},
    quickSuggestions:state.settings.codeAssist?{other:true,comments:false,strings:false}:false,
    suggestOnTriggerCharacters:!!state.settings.codeAssist,acceptSuggestionOnEnter:"on",snippetSuggestions:"inline",
    parameterHints:{enabled:!!state.settings.codeAssist},hover:{enabled:true},matchBrackets:"always",autoIndent:"full",formatOnPaste:true,formatOnType:true,autoClosingBrackets:"always",autoClosingQuotes:"always",autoSurround:"languageDefined",wordBasedSuggestions:"currentDocument",suggestSelection:"first",tabCompletion:"on",stickyScroll:{enabled:true},unicodeHighlight:{invisibleCharacters:true,ambiguousCharacters:false}
  };
  [state.editor,state.splitEditor].forEach(e=>{if(e)e.updateOptions(options);});
  if(window.monaco)window.monaco.editor.setTheme(state.settings.theme==="light"?"kerno-light":state.settings.theme==="mono"?"kerno-mono":"kerno-dark");
}
function openSplit(){if(!window.monaco||!state.editor)return;$("#splitPane").classList.remove("hidden");const paths=Object.keys(state.project.files);state.splitFile=state.splitFile&&state.project.files[state.splitFile]!==undefined?state.splitFile:(paths.find(x=>x!==state.activeFile)||state.activeFile);const sel=$("#splitFileSelect");sel.innerHTML="";paths.forEach(path=>{const o=document.createElement("option");o.value=path;o.textContent=path;o.selected=path===state.splitFile;sel.append(o);});if(!state.splitEditor)state.splitEditor=window.monaco.editor.create($("#splitMonacoPane"),monacoOptions(ensureModel(state.splitFile)));else state.splitEditor.setModel(ensureModel(state.splitFile));}
function toggleSplit(){if($("#splitPane").classList.contains("hidden"))openSplit();else $("#splitPane").classList.add("hidden");}
async function openProject(){show("app");$("#activeProjectName").textContent=state.project.name;$("#activeTargetChip").textContent=state.project.config.architecture+" · "+state.project.config.bootloader.toUpperCase();$("#plainEditor").style.display="none";state.activeFile=null;disposeEditors();state.tabs=[];state.activeFile=Object.keys(state.project.files).find(x=>/kernel\.(c|cpp)$/.test(x))||Object.keys(state.project.files)[0]||null;state.tabs=state.activeFile?[state.activeFile]:[];state.splitFile=Object.keys(state.project.files).find(x=>x!==state.activeFile)||state.activeFile;renderTree();renderTabs();renderEditor();renderMachine();renderBuild();renderMemory();initMonaco();await saveProject(true);}
async function loadProject(id){try{state.project=await get("projects",id);if(!state.project)throw Error("Project not found in browser storage.");const hidden=await get("meta","hiddenRecent");const ids=(hidden&&hidden.value||[]).filter(x=>x!==id);await put("meta",{key:"hiddenRecent",value:ids});await openProject();}catch(e){notify("Could not load project",e.message);}}
async function createSourceFile(){
  if(!state.project)return;
  const entered=await promptInApp("Enter a relative path for the new source file.","src/new_module.cpp","Create source file");
  if(!entered)return;
  const path=normalizePath(entered);
  if(!path||! /^[A-Za-z0-9_.\/-]+$/.test(path)||path.endsWith("/")||state.project.files[path]!==undefined){
    notify("Invalid source path","Use a new relative path such as src/interrupts.cpp.","error");return;
  }
  const ext=path.split(".").pop().toLowerCase();
  state.project.files[path]=["asm","s","inc"].includes(ext)?"; New NASM source\nBITS 32\nSECTION .text\n":["c","cpp","h","hpp"].includes(ext)?"#include <stdint.h>\n\n// New kernel module\n":"";
  state.tabs.push(path);openFile(path);await saveProject(true);notify("Source file created",path);
}
function binaryPath(p){return /\.(iso|elf|bin|o|a|so|dll|exe|png|jpe?g|gif|webp|ico|pdf|mp3|mp4|woff2?|ttf)$/i.test(p);}
async function importZip(file){const Zip=await loadJSZip();const zip=await Zip.loadAsync(file);let n=0,skip=0,total=fileSize(state.project);const entries=[];zip.forEach((p,e)=>{if(!e.dir)entries.push([p,e]);});for(const [raw,e] of entries){const p=normalizePath(raw);if(!p||binaryPath(p)||p==="KernoProject.json"){skip++;continue;}const content=await e.async("string"),size=new Blob([content]).size;if(size>FILE_LIMIT||total+size>PROJECT_LIMIT){skip++;continue;}total+=size;state.project.files[p]=content;n++;}const m=zip.file("KernoProject.json");if(m){try{const data=JSON.parse(await m.async("string"));if(data.config)state.project.config=Object.assign(state.project.config,data.config);if(data.name)state.project.name=data.name;}catch(_){}}return {n,skip};}
async function importMany(list,strip){const files=Array.from(list||[]);let n=0,skip=0,total=fileSize(state.project);const root=files.length&&files.every(f=>f.webkitRelativePath)&&files.map(f=>f.webkitRelativePath.split("/")[0]).every(x=>x===files[0].webkitRelativePath.split("/")[0])?files[0].webkitRelativePath.split("/")[0]:"";for(const f of files){try{if(/\.(zip|kerno)$/i.test(f.name)){const r=await importZip(f);n+=r.n;skip+=r.skip;continue;}let p=f.webkitRelativePath||f.name;if(strip&&root)p=p.split("/").slice(1).join("/");p=normalizePath(p);if(!p||binaryPath(p)||f.size>FILE_LIMIT||total+f.size>PROJECT_LIMIT){skip++;continue;}state.project.files[p]=await f.text();total+=f.size;n++;}catch(_){skip++;}}if(n){const next=Object.keys(state.project.files).find(x=>!state.tabs.includes(x));if(next)openFile(next);renderTree();renderTabs();await saveProject(true);}notify(n+" file(s) imported",skip?skip+" item(s) skipped due to type/path/size limits.":"Project updated.");}
function exportFile(){if(!state.project||!state.activeFile)return;syncEditor();download(new Blob([state.project.files[state.activeFile]],{type:"text/plain;charset=utf-8"}),state.activeFile.split("/").pop());notify("Source file exported",state.activeFile);}
async function exportProject(){if(!state.project)return;syncEditor();const manifest={format:"kerno-project",version:1,id:state.project.id,name:state.project.name,config:state.project.config,files:state.project.files,createdAt:state.project.createdAt,exportedAt:new Date().toISOString()};let Zip;try{Zip=await loadJSZip();}catch(_){download(new Blob([JSON.stringify(manifest,null,2)],{type:"application/json"}),safeName(state.project.name)+".kerno-project.json");notify("ZIP library unavailable","A JSON project manifest was exported instead.");return;}const z=new Zip();Object.entries(state.project.files).forEach(([p,v])=>z.file(p,v));z.file("KernoProject.json",JSON.stringify(manifest,null,2));download(await z.generateAsync({type:"blob",compression:"DEFLATE"}),safeName(state.project.name)+".kerno.zip");notify("Project archive exported",Object.keys(state.project.files).length+" files included.");}
function cleanProjectFiles(files){const out={};let size=0;Object.entries(files).forEach(([raw,text])=>{const p=normalizePath(raw);if(!p||binaryPath(p)||typeof text!=="string")return;const n=new Blob([text]).size;if(n>FILE_LIMIT||size+n>PROJECT_LIMIT)return;size+=n;out[p]=text;});return out;}
async function renderSettings(category){
  state.category=category;
  $$(".settings-nav-item").forEach(button=>button.classList.toggle("active",button.dataset.category===category));
  const titleKeys={architecture:"osArchitecture",boot:"bootSettings",diagnostics:"diagnostics",accessibility:"accessibility",shortcuts:"shortcuts"};
  $("#settingsTitle").textContent=tr(titleKeys[category]||category);
  $("#settingsEyebrow").textContent=(category==="osArchitecture"?(activeLocale()==="id"?"OS & ARSITEKTUR":"OS & ARCHITECTURE"):category).replace(/-/g," ").toUpperCase();
  const descriptions={
    general:"Workspace lifecycle, project defaults and save behavior.",
    appearance:"Typography, theme, accent, density and interface scaling.",
    language:"Choose the language used by Kerno's interface.",
    editor:"Monaco behavior, code presentation and editing ergonomics.",
    architecture:"Set the default target for new OS projects and the active workspace target.",
    memory:"Plan guest RAM, kernel reservations, page granularity and linker placement.",
    emulator:"Configure QEMU machine, display, processor, network and runtime behavior.",
    toolchain:"Select native compiler, assembler, linker and image packaging executables.",
    storage:"Inspect browser-local storage and manage project backups.",
    advanced:"Pair the local execution service and review its security boundary.",
    boot:"Configure firmware, GRUB menu behavior and kernel command-line defaults.",
    diagnostics:"Control compiler diagnostics, kernel logging and serial output.",
    accessibility:"Make the interface more readable and reduce visual motion.",
    shortcuts:"Keyboard commands available throughout Kernel Studio."
  };
  const descriptionsId={general:"Atur siklus workspace, default proyek, dan perilaku penyimpanan.",appearance:"Atur tipografi, tema, warna aksen, kepadatan, dan skala antarmuka.",language:"Pilih bahasa yang digunakan pada antarmuka Kerno.",editor:"Atur perilaku Monaco, tampilan kode, dan kenyamanan penyuntingan.",architecture:"Tentukan target default proyek OS baru dan target workspace aktif.",memory:"Rencanakan RAM guest, reservasi kernel, ukuran halaman, dan penempatan linker.",emulator:"Atur mesin QEMU, tampilan, prosesor, jaringan, dan perilaku runtime.",toolchain:"Pilih compiler, assembler, linker, dan executable pengemasan image native.",storage:"Periksa penyimpanan lokal browser dan kelola cadangan proyek.",advanced:"Pasangkan layanan eksekusi lokal dan tinjau batas keamanannya.",boot:"Atur firmware, perilaku menu GRUB, dan argumen command-line kernel.",diagnostics:"Atur diagnostik compiler, log kernel, dan keluaran serial.",accessibility:"Tingkatkan keterbacaan antarmuka dan kurangi gerakan visual.",shortcuts:"Pintasan keyboard yang tersedia di Kernel Studio."};
  $("#settingsDescription").textContent=activeLocale()==="id"?(descriptionsId[category]||"Konfigurasikan lingkungan pengembangan Kerno."):descriptions[category]||"Configure the Kerno development environment.";
  const host=$("#settingsFields");
  const s=state.settings;
  const esc=value=>String(value??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
  const option=(key,value,label)=>'<option value="'+esc(value)+'" '+(String(s[key])===String(value)?"selected":"")+'>'+esc(label)+'</option>';
  const select=(key,items)=>'<select data-setting="'+key+'">'+items.map(item=>option(key,item[0],item[1])).join("")+'</select>';
  const input=(key,type,min,max,step,placeholder)=>'<input data-setting="'+key+'" type="'+type+'" value="'+esc(s[key])+'" '+(min!==undefined?'min="'+min+'"':"")+' '+(max!==undefined?'max="'+max+'"':"")+' '+(step!==undefined?'step="'+step+'"':"")+' '+(placeholder?'placeholder="'+esc(placeholder)+'"':"")+'/>';
  const check=key=>'<input data-setting="'+key+'" type="checkbox" '+(s[key]?"checked":"")+'/>';
  const row=(label,description,control)=>'<div class="setting-row"><div class="setting-copy"><strong>'+label+'</strong><small>'+description+'</small></div><div class="setting-control">'+control+'</div></div>';
  const group=(title,content,subtitle="")=>'<section class="settings-group"><div class="settings-group-heading"><h3>'+title+'</h3>'+(subtitle?'<p>'+subtitle+'</p>':"")+'</div>'+content+'</section>';
  const note=(text)=>'<p class="setting-note">'+text+'</p>';
  const action=(id,label)=>'<button class="tool-button" id="'+id+'">'+label+'</button>';
  const activeOrDefault=(active,defaultKey)=>state.project?active:defaultKey;
  const archItems=[["x86_64","x86_64 · 64-bit PC"],["i686","i686 · 32-bit x86"],["aarch64","AArch64 · ARM 64-bit"],["riscv64","RISC-V 64-bit"]];
  const firmwareItems=[["bios","BIOS / legacy"],["uefi","UEFI"]];
  const bootItems=[["grub","GRUB / Multiboot2"],["uefi-app","UEFI application"],["custom","Custom boot stage"]];
  const selectedArchitecture=state.project?(state.settings.projectArchitecture||state.project.config.architecture):state.settings.defaultArchitecture;
  const qemuMachines=["aarch64","riscv64"].includes(selectedArchitecture)
    ?[["virt","virt · generic ARM/RISC-V"]]
    :[["q35","q35 · modern PC"],["pc","pc · legacy PC"]];
  const displayItems=[["std","Standard VGA"],["virtio","Virtio GPU"],["none","Headless / serial only"]];
  const accelerationItems=[["auto","Automatic"],["kvm","KVM · Linux"],["whpx","WHPX · Windows"],["tcg","TCG · software"]];
  const languageItems=[["auto",activeLocale()==="id"?"Deteksi otomatis":"Detect automatically"],["id","Bahasa Indonesia"],["en","English"]];
  let html="";

  if(category==="general"){
    html=group("Workspace behavior",
      row("Automatic save","Save source changes after the selected idle delay.",check("autosave"))+
      row("Save delay","Debounce interval before writing changes to IndexedDB.",input("autoSaveDelayMs","number",250,5000,50))+
      row("Confirm destructive actions","Ask before deleting projects or clearing local data.",check("confirmDestructive"))+
      row("Startup screen","Choose what opens after Kerno starts.",select("startScreen",[["welcome","Project Hub"],["lastProject","Resume most recent project"]]))+
      row("Default project template","Used when opening the New Project wizard.",select("defaultTemplate",[["kernel-text","Bare-metal text kernel"],["kernel-framebuffer","Framebuffer kernel"],["kernel-minimal","Minimal kernel foundation"]]))
    ,"These defaults apply to new workspaces. Existing project files are never silently replaced.");
    html+=group("Project limits",
      row("Maximum source size","The local execution bridge accepts up to 20 MiB of text source per project.",'<strong class="setting-value">20 MiB</strong>')+
      row("Per-file limit","Large binary artifacts are kept out of the source editor.",'<strong class="setting-value">2 MiB</strong>')+
      row("Storage engine","Projects and settings remain in this browser profile.",'<strong class="setting-value">IndexedDB</strong>')
    );
  }

  if(category==="appearance"){
    html=group("Interface appearance",
      row("Color theme","Applied across the Project Hub, settings, workspace and source editor.",select("theme",[["dark","Dark"],["light","Light"],["mono","Black & white · monochrome"]]))+
      row("Accent color","Used for selection, focus and active controls.",select("accent",[["sage","Sage green"],["cyan","Cyan"],["blue","Blue"],["amber","Amber"]]))+
      row("Interface density","Controls vertical spacing in panels and settings.",select("density",[["compact","Compact"],["balanced","Balanced"],["comfortable","Comfortable"]]))+
      row("Interface scale","Increase text and controls together.",select("uiScale",[["90","90%"],["100","100%"],["110","110%"],["120","120%"]]))+
      row("Animation profile","Choose how much visual motion Kerno uses.",select("motionLevel",[["enhanced","Enhanced · polished visuals"],["standard","Standard · balanced"],["minimal","Minimal · subtle only"],["off","Off · no animation"]]))+
      row("Force reduced motion","Accessibility override for motion-sensitive users.",check("reduceMotion"))
    );
  }

  if(category==="language"){
    html=group("Global language",
      row("Interface language","Pilih Bahasa Indonesia atau English untuk antarmuka Project Hub dan Kerno Academy.",select("locale",languageItems))+
      row("Source languages","Syntax highlighting and editor support.",'<strong class="setting-value">C · C++ · Assembly · Python</strong>')+
      row("Native kernel build","Python is editor-supported for scripts and tools, but is not compiled into the current freestanding kernel target.",'<strong class="setting-value">C / C++ / Assembly</strong>')
    , "Project Hub dan Kerno Academy tersedia dalam Bahasa Indonesia dan English. Source code, identifier teknis, serta keluaran compiler dipertahankan dalam bahasa aslinya.");
  }

  if(category==="editor"){
    html=group("Typography and layout",
      row("Editor font family","Choose an installed monospaced font.",select("editorFontFamily",[["DM Mono","DM Mono"],["Cascadia Code","Cascadia Code"],["Consolas","Consolas"],["Courier New","Courier New"]]))+
      row("Editor font size","Changes the source editor and split editor.",input("editorFontSize","number",10,24,1))+
      row("Tab width","Spaces inserted by the Tab key.",select("tabSize",[[2,"2 spaces"],[4,"4 spaces"],[8,"8 spaces"]]))+
      row("Word wrap","Wrap long source lines without changing file content.",select("wordWrap",[["off","Off"],["on","On"]]))+
      row("Line numbers","Show line numbers in the source editor.",check("lineNumbers"))+
      row("Minimap","Show a compact overview of the open source file.",check("minimap"))
    );
    html+=group("Editing behavior",
      row("Cursor style","Choose the insertion cursor shape.",select("cursorStyle",[["line","Line"],["block","Block"],["underline","Underline"]]))+
      row("Smooth scrolling","Interpolate scrolling in the source editor.",check("smoothScrolling"))+
      row("Bracket pair colors","Colorize matching bracket pairs.",check("bracketPairColorization"))+
      row("Whitespace marks","Control when spaces and tabs are visible.",select("renderWhitespace",[["none","Hidden"],["selection","On selection"],["boundary","At boundaries"],["all","Always"]]))
    );
    html+=group("Code intelligence and feedback",
      row("Live structural diagnostics","Highlight unmatched brackets and unfinished strings while typing.",check("quickDiagnostics"))+
      row("Language snippets and completion","Contextual suggestions for C, C++, Python and Assembly.",check("codeAssist")),
      "Lightweight editor assistance is local. Native compiler diagnostics remain the source of truth for build errors."
    );
  }

  if(category==="architecture"){
    html=group(state.project?"Current project target":"Default OS target",
      row("CPU architecture","Architecture selected for this project.",select(activeOrDefault("projectArchitecture","defaultArchitecture"),archItems))+
      row("Firmware","Boot firmware for the target machine.",select(activeOrDefault("projectFirmware","defaultFirmware"),firmwareItems))+
      row("Bootloader","Boot protocol and handoff layer.",select(activeOrDefault("projectBootloader","defaultBootloader"),bootItems))+
      row("Kernel language","Primary freestanding kernel implementation language.",select(activeOrDefault("projectKernelLanguage","defaultKernelLanguage"),[["cpp","C++"],["c","C"]]))+
      row("Optimization profile","Native compiler optimization level.",select(activeOrDefault("projectOptimization","optimization"),[["debug","Debug · -O0"],["size","Size · -Os"],["speed","Speed · -O2"]]))
    , state.project?"Applies only to the open project. New-project defaults remain unchanged.":"Used as the initial target when creating a new workspace.");
    if(state.project){
      html+=group("New project defaults",
        row("Default architecture","Used the next time you create a project.",select("defaultArchitecture",archItems))+
        row("Default firmware","Initial firmware selection for new projects.",select("defaultFirmware",firmwareItems))+
        row("Default bootloader","Initial bootloader selection for new projects.",select("defaultBootloader",bootItems))
      );
    }
    html+=note("Changing a project's architecture, firmware or bootloader updates target metadata. The boot entry, compiler ABI and linker layout must also match; Kerno does not silently rewrite custom kernel code. Native ISO generation is currently gated to x86_64 + BIOS + GRUB / Multiboot2. Other architecture choices remain editable scaffolds.");
  }

  if(category==="memory"){
    const ramKey=activeOrDefault("projectGuestMemoryMiB","guestMemoryMiB");
    const heapKey=activeOrDefault("projectHeapReserveMiB","heapReserveMiB");
    const stackKey=activeOrDefault("projectStackReserveKiB","stackReserveKiB");
    const pageKey=activeOrDefault("projectPageSize","pageSize");
    const baseKey=activeOrDefault("projectKernelBase","kernelBase");
    html=group(state.project?"Current project memory plan":"Default memory plan",
      row("Guest RAM (MiB)","Memory assigned to the QEMU guest, not physical host memory.",input(ramKey,"number",64,32768,64))+
      row("Kernel heap budget (MiB)","Planning budget for future dynamic allocation.",input(heapKey,"number",1,8192,1))+
      row("Initial stack budget (KiB)","Budget for early boot stacks.",input(stackKey,"number",64,1048576,64))+
      row("Page size target","Target granularity for paging configuration.",select(pageKey,[["4KiB","4 KiB"],["2MiB","2 MiB"],["1GiB","1 GiB"]]))+
      row("Kernel link base","Hexadecimal physical/virtual link base.",input(baseKey,"text",undefined,undefined,undefined,"0x00100000"))
    );
    html+=group("Reservation estimate",
      '<div class="memory-meter"><span id="memoryMeterFill"></span></div><div class="memory-readout"><span id="memoryReservedLabel"></span><span id="memoryAvailableLabel"></span></div>'+
      note("This is a configuration estimate only. It does not allocate host RAM. The generated physical-frame allocator currently manages a capped identity-mapped region; it is separate from the guest RAM slider.")+
      '<div class="inline-actions">'+action("estimateHostMemoryButton","Estimate host capacity")+'<span class="setting-note" id="hostMemoryEstimate">Not checked</span></div>'
    );
  }

  if(category==="emulator"){
    const key=(active,def)=>state.project?active:def;
    html=group(state.project?"Current project QEMU profile":"Default QEMU profile",
      row("QEMU executable","Native QEMU binary resolved by the local service.",input(key("projectQemuBinary","qemuBinary"),"text"))+
      row("Machine model","Virtual motherboard or platform.",select(key("projectQemuMachine","qemuMachine"),qemuMachines))+
      row("CPU model","Virtual CPU feature model.",select(key("projectQemuCpuModel","qemuCpuModel"),[["max","max · expose supported features"],["qemu64","qemu64 · compatibility"],["Nehalem","Nehalem · legacy x86-64"]]))+
      row("Display adapter","Guest display device.",select(key("projectQemuDisplay","qemuDisplay"),displayItems))+
      row("Virtual CPUs","Number of guest processor cores.",input(key("projectQemuVcpus","qemuVcpus"),"number",1,32,1))+
      row("VNC port","Loopback VNC display port.",input(key("projectQemuVncPort","qemuVncPort"),"number",5900,5999,1))+
      row("Acceleration","Host acceleration backend.",select(key("projectQemuAcceleration","qemuAcceleration"),accelerationItems))+
      row("Network adapter","Network exposure for the guest.",select(key("projectQemuNetwork","qemuNetwork"),[["none","Disabled"],["user","User-mode NAT"]]))
    , "QEMU starts only from the local Kerno service. The browser does not execute emulator binaries.");
    if(state.project)html+=note("Default QEMU preferences for future projects remain in the OS & Architecture and project defaults settings.");
  }

  if(category==="toolchain"){
    html=group("Native toolchain executables",
      row("NASM assembler","Assembler used for x86 assembly entry files.",input("assembler","text"))+
      row("C++ cross compiler","Compiler target must report x86_64-elf.",input("crossCompiler","text"))+
      row("C cross compiler","Separate C compiler for .c translation units.",input("cCompiler","text"))+
      row("Linker","Target ELF linker.",input("linker","text"))+
      row("GRUB ISO builder","Usually grub-mkrescue.",input("isoBuilder","text"))+
      row("objcopy","Optional ELF conversion and inspection tool.",input("objcopy","text"))+
      row("readelf","ELF metadata inspection utility.",input("readelf","text"))
    );
    html+=group("Tool availability",'<div class="inline-actions">'+action("checkToolchainButton","Scan local toolchain")+'<span class="setting-note" id="toolchainResult">Not checked</span></div>');
    html+=group("Host PC & Command Prompt",
      '<div class="inline-actions">'+action("scanHostPcButton","Scan this PC")+
      action("copyCmdChecksButton","Copy CMD checks")+
      '<span class="setting-note" id="hostDiagnosticsStatus">Not scanned</span></div>'+
      '<div id="hostDiagnosticsResult" class="host-diagnostics-panel"><p>Connect Kerno Local Service to inspect this computer safely.</p></div>'+
      '<pre class="host-command-preview">where python\npython --version\nwhere nasm\nnasm --version\nwhere x86_64-elf-gcc\nwhere x86_64-elf-g++\nwhere x86_64-elf-ld\nwhere grub-mkrescue\nwhere xorriso\nwhere qemu-system-x86_64</pre>'
    ,"Read-only diagnostics. Kerno checks system metadata and PATH-resolved tools; it does not run arbitrary Command Prompt commands or install software.");
    html+=note("The local service resolves executable names through PATH. Arbitrary shell command strings are not accepted.");
  }

  if(category==="boot"){
    const timeoutKey=state.project?"projectGrubTimeout":"grubTimeout";
    const defaultKey=state.project?"projectGrubDefault":"grubDefault";
    const cmdKey=state.project?"projectKernelCommandLine":"kernelCommandLine";
    html=group(state.project?"Current project boot profile":"Default boot profile",
      row("GRUB menu timeout","Seconds before the default menu entry starts.",input(timeoutKey,"number",0,30,1))+
      row("Default GRUB entry","Zero-based menu entry index.",input(defaultKey,"number",0,20,1))+
      row("Kernel command line","Plain arguments appended to the Multiboot2 kernel entry.",input(cmdKey,"text",undefined,undefined,undefined,"loglevel=info"))
    );
    html+=group("Firmware and boot support",
      row("Firmware default","New projects use this firmware selection.",select("defaultFirmware",firmwareItems))+
      row("Bootloader default","New projects use this bootloader selection.",select("defaultBootloader",bootItems))
    );
    html+=note("Boot settings update the generated GRUB menu when the current project uses GRUB. Custom boot stages and UEFI application handoff need their own boot configuration.");
  }

  if(category==="diagnostics"){
    html=group("Kernel diagnostics",
      row("Kernel log level","Default verbosity for the generated kernel configuration.",select("kernelLogLevel",[["quiet","Quiet"],["error","Error"],["warn","Warning"],["info","Information"],["debug","Debug"]]))+
      row("Serial backend","Configure whether the QEMU serial output is captured.",select("serialBackend",[["file","Capture to serial.log"],["null","Disable serial capture"]]))+
      row("Retain build logs","Keep build and emulator logs in the local service data folder.",check("retainBuildLogs"))
    );
    html+=group("Compiler diagnostics",
      row("Debug symbols","Include debug information in native object files.",check("debugSymbols"))+
      row("Warnings as errors","Treat compiler warnings as build errors.",check("warningsAsErrors"))
    );
    html+=note("Compiler diagnostics are applied by the local native builder. Kernel runtime log verbosity is a project configuration value; it does not automatically implement a full logging subsystem.");
  }

  if(category==="storage"){
    html=group("Browser-local storage",
      '<div class="setting-row"><div class="setting-copy"><strong>Storage engine</strong><small>Project source is stored in this browser profile.</small></div><div class="setting-control"><strong class="setting-value">IndexedDB</strong></div></div>'+
      '<div class="setting-row"><div class="setting-copy"><strong>Saved projects</strong><small>Local Kerno workspace count.</small></div><div class="setting-control"><strong class="setting-value" id="storedProjectCount">—</strong></div></div>'+
      '<div class="setting-row"><div class="setting-copy"><strong>Storage estimate</strong><small>Browser-provided quota and usage.</small></div><div class="setting-control"><strong class="setting-value" id="browserStorageEstimate">Checking…</strong></div></div>'
    );
    html+=group("Backup and maintenance",
      '<div class="inline-actions">'+action("exportAllProjectsButton","Export all projects")+'<button class="tool-button danger-button" id="clearProjectsButton">Delete all local projects</button></div>'+
      note("Export a backup before deleting browser-local project data. This action does not delete files exported to your computer.")
    );
  }

  if(category==="advanced"){
    html=group("Local execution bridge",
      row("Service endpoint","Loopback URL for Kerno Local Service API.",input("localServiceUrl","url"))+
      row("Pairing token","Token printed when the local service starts. Stored in this browser's settings.",input("localServiceToken","password"))
    );
    html+=group("Connection status",
      '<div class="inline-actions">'+action("testLocalServiceButton","Test local service")+'<span class="setting-note" id="localServiceResult">Not connected</span></div>'
    );
    html+=group("Execution and security boundary",
      note("Kerno sends a structured project manifest to a loopback-only service. The service validates relative paths, applies per-file and project limits, avoids shell execution, serializes builds with a build lock, and controls QEMU process lifetime.")+
      note("The pairing token is a local capability credential. Do not paste it into source files, commit it to Git, or share it in screenshots.")
    );
  }

  if(category==="accessibility"){
    html=group("Readable interface",
      row("Interface scale","Use a larger global scale for labels, navigation and controls.",select("uiScale",[["90","90%"],["100","100%"],["110","110%"],["120","120%"]]))+
      row("Force reduced motion","Override the selected animation profile for accessibility.",check("reduceMotion"))+
      row("High contrast focus","Increase the visibility of keyboard focus indicators.",check("highContrastFocus"))
    );
    html+=note("Use the browser zoom alongside these controls when a larger viewport scale is needed.");
  }

  if(category==="shortcuts"){
    const shortcuts=[
      ["Save project","Ctrl / Cmd + S"],["Close active editor file","Ctrl / Cmd + W"],
      ["Create source file","Ctrl / Cmd + N"],["Quick open source file","Ctrl / Cmd + P"],
      ["Next / previous editor tab","Ctrl / Cmd + Tab / Shift + Tab"],
      ["Open project or import files","Ctrl / Cmd + O"],
      ["Export current source","Ctrl / Cmd + Shift + E"],["Export project archive","Ctrl / Cmd + Shift + S"],
      ["Build project","Ctrl / Cmd + B"],["Open Settings","Ctrl / Cmd + ,"],
      ["Switch source / machine / build","Ctrl / Cmd + 1 / 2 / 3"]
    ];
    html=group("Keyboard shortcuts",shortcuts.map(item=>'<div class="shortcut-row"><span>'+item[0]+'</span><kbd>'+item[1]+'</kbd></div>').join(""));
    html+=note("Shortcut actions are handled by the Kerno workspace while the browser page is focused.");
  }

  if(activeLocale()==="id"){
    const dictionary={
      "Workspace behavior":"Perilaku workspace","Automatic save":"Simpan otomatis","Save delay":"Jeda penyimpanan",
      "Confirm destructive actions":"Konfirmasi tindakan destruktif","Startup screen":"Tampilan awal",
      "Default project template":"Template proyek default","Project limits":"Batas proyek",
      "Maximum source size":"Ukuran maksimum source","Per-file limit":"Batas per file",
      "Storage engine":"Mesin penyimpanan","Interface appearance":"Tampilan antarmuka",
      "Color theme":"Tema warna","Accent color":"Warna aksen","Interface density":"Kepadatan antarmuka",
      "Interface scale":"Skala antarmuka","Reduce motion":"Kurangi animasi","Animation profile":"Profil animasi","Choose how much visual motion Kerno uses.":"Pilih intensitas gerakan visual Kerno.","Force reduced motion":"Paksa minim gerakan","Accessibility override for motion-sensitive users.":"Pengaturan aksesibilitas untuk mengurangi gerakan.","Enhanced · polished visuals":"Ditingkatkan · visual halus","Standard · balanced":"Standar · seimbang","Minimal · subtle only":"Minimal · sangat ringan","Off · no animation":"Mati · tanpa animasi",
      "Global language":"Bahasa global","Editor preferences":"Preferensi editor",
      "Typography and layout":"Tipografi dan tata letak","Editing behavior":"Perilaku penyuntingan",
      "Editor font family":"Keluarga font editor","Editor font size":"Ukuran font editor",
      "Tab width":"Lebar tab","Word wrap":"Pembungkusan baris","Line numbers":"Nomor baris",
      "Minimap":"Minimap","Cursor style":"Gaya kursor","Smooth scrolling":"Pengguliran halus",
      "Bracket pair colors":"Warna pasangan kurung","Whitespace marks":"Penanda whitespace","Code intelligence and feedback":"Bantuan kode dan umpan balik","Live structural diagnostics":"Diagnostik struktur langsung","Highlight unmatched brackets and unfinished strings while typing.":"Tandai kurung yang tidak cocok dan string yang belum selesai saat mengetik.","Language snippets and completion":"Snippet dan pelengkapan kode","Contextual suggestions for C, C++, Python and Assembly.":"Saran kontekstual untuk C, C++, Python, dan Assembly.","Lightweight editor assistance is local. Native compiler diagnostics remain the source of truth for build errors.":"Bantuan editor berjalan lokal. Diagnostik compiler native tetap menjadi acuan untuk kesalahan build.","Source languages":"Bahasa source","Syntax highlighting and editor support.":"Dukungan editor dan pewarnaan sintaks.","Native kernel build":"Build kernel native","Python is editor-supported for scripts and tools, but is not compiled into the current freestanding kernel target.":"Python didukung editor untuk skrip dan tool, tetapi tidak dikompilasi menjadi kernel freestanding pada target saat ini.",
      "Current project target":"Target proyek aktif","Default OS target":"Target OS default",
      "CPU architecture":"Arsitektur CPU","Architecture selected for this project.":"Arsitektur CPU proyek ini.",
      "Firmware":"Firmware","Bootloader":"Bootloader","Kernel language":"Bahasa kernel",
      "Optimization profile":"Profil optimisasi","New project defaults":"Default proyek baru",
      "Default architecture":"Arsitektur default","Default firmware":"Firmware default",
      "Default bootloader":"Bootloader default","Guest RAM (MiB)":"RAM guest (MiB)",
      "Kernel heap budget (MiB)":"Anggaran heap kernel (MiB)",
      "Initial stack budget (KiB)":"Anggaran stack awal (KiB)",
      "Page size target":"Target ukuran halaman","Kernel link base":"Alamat dasar linker kernel",
      "Reservation estimate":"Estimasi reservasi","QEMU profile":"Profil QEMU",
      "Machine model":"Model mesin","CPU model":"Model CPU","Display adapter":"Adaptor tampilan",
      "Virtual CPUs":"CPU virtual","VNC port":"Port VNC","Acceleration":"Akselerasi",
      "Network adapter":"Adaptor jaringan","Native toolchain executables":"Executable toolchain native",
      "NASM assembler":"Assembler NASM","C++ cross compiler":"Cross compiler C++",
      "C cross compiler":"Cross compiler C","Linker":"Linker","GRUB ISO builder":"Pembuat ISO GRUB",
      "Tool availability":"Ketersediaan tool","Scan local toolchain":"Pindai toolchain lokal",
      "Boot profile":"Profil boot","GRUB menu timeout":"Waktu tunggu menu GRUB",
      "Default GRUB entry":"Entri GRUB default","Kernel command line":"Baris perintah kernel",
      "Kernel diagnostics":"Diagnostik kernel","Compiler diagnostics":"Diagnostik compiler",
      "Kernel log level":"Level log kernel","Serial backend":"Backend serial",
      "Retain build logs":"Simpan log build","Debug symbols":"Simbol debug",
      "Warnings as errors":"Peringatan sebagai error","Browser-local storage":"Penyimpanan lokal browser",
      "Backup and maintenance":"Cadangan dan pemeliharaan","Export all projects":"Ekspor semua proyek",
      "Delete all local projects":"Hapus semua proyek lokal","Local execution bridge":"Jembatan eksekusi lokal",
      "Service endpoint":"Endpoint layanan","Pairing token":"Token pairing",
      "Test local service":"Uji layanan lokal","Readable interface":"Antarmuka yang mudah dibaca",
      "High contrast focus":"Fokus kontras tinggi","Keyboard shortcuts":"Pintasan keyboard","Force reduced motion":"Paksa minim gerakan","Override the selected animation profile for accessibility.":"Abaikan profil animasi terpilih untuk aksesibilitas.",
      "Keyboard Shortcuts":"Pintasan Keyboard","Open source project or import files":"Buka proyek atau impor file",
      "Apply settings":"Terapkan pengaturan","Dark":"Gelap","Light":"Terang",
      "Automatic":"Otomatis","Disabled":"Dinonaktifkan","Headless / serial only":"Headless / serial saja",
      "Check host capacity":"Periksa kapasitas host","Estimate host capacity":"Estimasi kapasitas host",
      "Source code and compiler output are not translated.":"Kode sumber dan output compiler tidak diterjemahkan."
    };
    Object.assign(dictionary,{
      "The local execution bridge accepts up to 20 MiB of text source per project.":"Jembatan eksekusi lokal menerima source teks hingga 20 MiB per proyek.",
      "Large binary artifacts are kept out of the source editor.":"Artefak biner berukuran besar tidak dimasukkan ke editor source.",
      "Projects and settings remain in this browser profile.":"Proyek dan pengaturan disimpan di profil browser ini.",
      "Applied across the Project Hub, settings, workspace and source editor.":"Diterapkan pada Project Hub, pengaturan, workspace, dan editor source.",
      "Used for selection, focus and active controls.":"Digunakan untuk seleksi, fokus, dan kontrol aktif.",
      "Controls vertical spacing in panels and settings.":"Mengatur jarak vertikal pada panel dan pengaturan.",
      "Increase text and controls together.":"Perbesar teks dan kontrol secara bersamaan.",
      "Pilih Bahasa Indonesia atau English untuk antarmuka Project Hub dan Kerno Academy.":"Pilih Bahasa Indonesia atau English untuk antarmuka Project Hub dan Kerno Academy.",
      "Syntax highlighting and editor support.":"Pewarnaan sintaks dan dukungan editor.",
      "Python is editor-supported for scripts and tools, but is not compiled into the current freestanding kernel target.":"Python didukung editor untuk skrip dan tool, tetapi tidak dikompilasi ke target kernel freestanding saat ini.",
      "Project Hub dan Kerno Academy tersedia dalam Bahasa Indonesia dan English. Source code, identifier teknis, serta keluaran compiler dipertahankan dalam bahasa aslinya.":"Project Hub dan Kerno Academy tersedia dalam Bahasa Indonesia dan English. Source code, identifier teknis, dan keluaran compiler tetap menggunakan bahasa aslinya.",
      "Choose an installed monospaced font.":"Pilih font monospace yang terpasang.",
      "Changes the source editor and split editor.":"Mengubah tampilan editor source dan editor terpisah.",
      "Spaces inserted by the Tab key.":"Jumlah spasi yang dimasukkan oleh tombol Tab.",
      "Wrap long source lines without changing file content.":"Bungkus baris source yang panjang tanpa mengubah isi file.",
      "Show line numbers in the source editor.":"Tampilkan nomor baris pada editor source.",
      "Show a compact overview of the open source file.":"Tampilkan ringkasan visual file source yang terbuka.",
      "Choose the insertion cursor shape.":"Pilih bentuk kursor pengetikan.",
      "Interpolate scrolling in the source editor.":"Haluskan pengguliran pada editor source.",
      "Colorize matching bracket pairs.":"Beri warna pada pasangan kurung yang cocok.",
      "Control when spaces and tabs are visible.":"Atur kapan spasi dan tab ditampilkan.",
      "Highlight unmatched brackets and unfinished strings while typing.":"Tandai pasangan kurung yang tidak cocok dan string yang belum ditutup saat mengetik.",
      "Contextual suggestions for C, C++, Python and Assembly.":"Saran kontekstual untuk C, C++, Python, dan Assembly.",
      "Lightweight editor assistance is local. Native compiler diagnostics remain the source of truth for build errors.":"Bantuan editor ringan berjalan secara lokal. Diagnostik compiler native tetap menjadi acuan utama untuk kesalahan build.",
      "Architecture selected for this project.":"Arsitektur yang dipilih untuk proyek ini.",
      "Boot firmware for the target machine.":"Firmware boot untuk mesin target.",
      "Boot protocol and handoff layer.":"Protokol boot dan lapisan handoff.",
      "Primary freestanding kernel implementation language.":"Bahasa utama untuk implementasi kernel freestanding.",
      "Native compiler optimization level.":"Tingkat optimisasi compiler native.",
      "Applies only to the open project. New-project defaults remain unchanged.":"Hanya berlaku untuk proyek yang sedang dibuka. Default proyek baru tidak berubah.",
      "Used as the initial target when creating a new workspace.":"Digunakan sebagai target awal saat membuat workspace baru.",
      "Used the next time you create a project.":"Digunakan saat membuat proyek berikutnya.",
      "Initial firmware selection for new projects.":"Pilihan firmware awal untuk proyek baru.",
      "Initial bootloader selection for new projects.":"Pilihan bootloader awal untuk proyek baru.",
      "Changing a project's architecture, firmware or bootloader updates target metadata. The boot entry, compiler ABI and linker layout must also match; Kerno does not silently rewrite custom kernel code. Native ISO generation is currently gated to x86_64 + BIOS + GRUB / Multiboot2. Other architecture choices remain editable scaffolds.":"Mengubah arsitektur, firmware, atau bootloader proyek akan memperbarui metadata target. Entry boot, ABI compiler, dan tata letak linker juga harus sesuai; Kerno tidak mengubah source kernel kustom secara diam-diam. Pembuatan ISO native saat ini hanya didukung untuk x86_64 + BIOS + GRUB / Multiboot2. Pilihan arsitektur lain masih berupa scaffold yang dapat diedit.",
      "Memory assigned to the QEMU guest, not physical host memory.":"Memori yang diberikan kepada guest QEMU, bukan RAM fisik host.",
      "Planning budget for future dynamic allocation.":"Anggaran perencanaan untuk alokasi dinamis di masa mendatang.",
      "Budget for early boot stacks.":"Anggaran untuk stack pada tahap awal boot.",
      "Target granularity for paging configuration.":"Granularitas target untuk konfigurasi paging.",
      "Hexadecimal physical/virtual link base.":"Alamat dasar linker fisik/virtual dalam heksadesimal.",
      "This is a configuration estimate only. It does not allocate host RAM. The generated physical-frame allocator currently manages a capped identity-mapped region; it is separate from the guest RAM slider.":"Ini hanya estimasi konfigurasi dan tidak mengalokasikan RAM host. Physical-frame allocator yang dihasilkan saat ini mengelola wilayah identity-mapped yang dibatasi; mekanisme tersebut terpisah dari pengaturan RAM guest.",
      "Virtual motherboard or platform.":"Motherboard atau platform virtual.",
      "Virtual CPU feature model.":"Model fitur CPU virtual.",
      "Guest display device.":"Perangkat tampilan guest.",
      "Number of guest processor cores.":"Jumlah core prosesor guest.",
      "Loopback VNC display port.":"Port tampilan VNC loopback.",
      "Host acceleration backend.":"Backend akselerasi host.",
      "Network exposure for the guest.":"Akses jaringan untuk guest.",
      "QEMU starts only from the local Kerno service. The browser does not execute emulator binaries.":"QEMU hanya dijalankan melalui layanan lokal Kerno. Browser tidak menjalankan binary emulator.",
      "Default QEMU preferences for future projects remain in the OS & Architecture and project defaults settings.":"Preferensi default QEMU untuk proyek berikutnya tetap berada di pengaturan OS & Arsitektur dan default proyek.",
      "Assembler used for x86 assembly entry files.":"Assembler yang digunakan untuk file entry Assembly x86.",
      "Compiler target must report x86_64-elf.":"Target compiler harus melaporkan x86_64-elf.",
      "Separate C compiler for .c translation units.":"Compiler C terpisah untuk berkas translasi .c.",
      "Target ELF linker.":"Linker ELF target.",
      "Usually grub-mkrescue.":"Biasanya menggunakan grub-mkrescue.",
      "Optional ELF conversion and inspection tool.":"Tool opsional untuk konversi dan inspeksi ELF.",
      "ELF metadata inspection utility.":"Utilitas untuk memeriksa metadata ELF.",
      "Connect Kerno Local Service to inspect this computer safely.":"Hubungkan Kerno Local Service untuk memeriksa komputer ini secara aman.",
      "Read-only diagnostics. Kerno checks system metadata and PATH-resolved tools; it does not run arbitrary Command Prompt commands or install software.":"Diagnostik hanya-baca. Kerno memeriksa metadata sistem dan tool pada PATH; Kerno tidak menjalankan perintah Command Prompt sembarang atau memasang perangkat lunak.",
      "The local service resolves executable names through PATH. Arbitrary shell command strings are not accepted.":"Layanan lokal mencari executable melalui PATH. Perintah shell bebas tidak diterima.",
      "Seconds before the default menu entry starts.":"Waktu dalam detik sebelum entri menu default dijalankan.",
      "Zero-based menu entry index.":"Indeks entri menu yang dimulai dari nol.",
      "Plain arguments appended to the Multiboot2 kernel entry.":"Argumen teks biasa yang ditambahkan ke entri kernel Multiboot2.",
      "New projects use this firmware selection.":"Proyek baru menggunakan pilihan firmware ini.",
      "New projects use this bootloader selection.":"Proyek baru menggunakan pilihan bootloader ini.",
      "Boot settings update the generated GRUB menu when the current project uses GRUB. Custom boot stages and UEFI application handoff need their own boot configuration.":"Pengaturan boot memperbarui menu GRUB yang dihasilkan ketika proyek aktif menggunakan GRUB. Tahap boot kustom dan handoff aplikasi UEFI memerlukan konfigurasi boot tersendiri.",
      "Default verbosity for the generated kernel configuration.":"Tingkat detail log default untuk konfigurasi kernel yang dihasilkan.",
      "Configure whether the QEMU serial output is captured.":"Atur apakah keluaran serial QEMU direkam.",
      "Keep build and emulator logs in the local service data folder.":"Simpan log build dan emulator di folder data layanan lokal.",
      "Include debug information in native object files.":"Sertakan informasi debug pada object file native.",
      "Treat compiler warnings as build errors.":"Perlakukan peringatan compiler sebagai kesalahan build.",
      "Compiler diagnostics are applied by the local native builder. Kernel runtime log verbosity is a project configuration value; it does not automatically implement a full logging subsystem.":"Diagnostik compiler diterapkan oleh builder native lokal. Tingkat detail log runtime kernel merupakan nilai konfigurasi proyek dan tidak otomatis membangun subsistem logging lengkap.",
      "Project source is stored in this browser profile.":"Source proyek disimpan di profil browser ini.",
      "Local Kerno workspace count.":"Jumlah workspace Kerno lokal.",
      "Browser-provided quota and usage.":"Kuota dan penggunaan yang dilaporkan browser.",
      "Export a backup before deleting browser-local project data. This action does not delete files exported to your computer.":"Ekspor cadangan sebelum menghapus data proyek lokal browser. Tindakan ini tidak menghapus file yang telah diekspor ke komputer.",
      "Loopback URL for Kerno Local Service API.":"URL loopback untuk API Kerno Local Service.",
      "Token printed when the local service starts. Stored in this browser's settings.":"Token yang ditampilkan saat layanan lokal dijalankan. Token disimpan dalam pengaturan browser ini.",
      "Kerno sends a structured project manifest to a loopback-only service. The service validates relative paths, applies per-file and project limits, avoids shell execution, serializes builds with a build lock, and controls QEMU process lifetime.":"Kerno mengirim manifest proyek terstruktur ke layanan yang hanya terikat pada loopback. Layanan memvalidasi path relatif, menerapkan batas ukuran per file dan proyek, menghindari eksekusi shell, mengurutkan proses build dengan build lock, serta mengelola siklus hidup proses QEMU.",
      "The pairing token is a local capability credential. Do not paste it into source files, commit it to Git, or share it in screenshots.":"Token pairing merupakan kredensial akses lokal. Jangan masukkan token ke source code, commit ke Git, atau bagikan melalui tangkapan layar.",
      "Use a larger global scale for labels, navigation and controls.":"Gunakan skala global lebih besar untuk label, navigasi, dan kontrol.",
      "Override the selected animation profile for accessibility.":"Abaikan profil animasi terpilih demi aksesibilitas.",
      "Increase the visibility of keyboard focus indicators.":"Tingkatkan visibilitas indikator fokus keyboard.",
      "Use the browser zoom alongside these controls when a larger viewport scale is needed.":"Gunakan zoom browser bersama pengaturan ini ketika memerlukan skala tampilan yang lebih besar.",
      "Shortcut actions are handled by the Kerno workspace while the browser page is focused.":"Aksi pintasan ditangani workspace Kerno selama halaman browser aktif.",
      "Bare-metal text kernel":"Kernel teks bare-metal",
      "Framebuffer kernel":"Kernel framebuffer",
      "Minimal kernel foundation":"Fondasi kernel minimal",
      "Resume most recent project":"Lanjutkan proyek terakhir",
      "Black & white · monochrome":"Hitam putih · monokrom",
      "Sage green":"Hijau sage",
      "Comfortable":"Lega",
      "Cascadia Code":"Cascadia Code",
      "Courier New":"Courier New",
      "Dark":"Gelap",
      "Light":"Terang",
      "Hidden":"Tersembunyi",
      "On selection":"Saat dipilih",
      "At boundaries":"Pada batas",
      "Always":"Selalu",
      "Off":"Mati",
      "On":"Aktif",
      "Line":"Garis",
      "Block":"Blok",
      "Underline":"Garis bawah",
      "2 spaces":"2 spasi",
      "4 spaces":"4 spasi",
      "8 spaces":"8 spasi",
      "Sage green":"Hijau sage",
      "Cyan":"Sian",
      "Blue":"Biru",
      "Amber":"Jingga",
      "Compact":"Ringkas",
      "Balanced":"Seimbang",
      "Enhanced · polished visuals":"Ditingkatkan · visual halus",
      "Standard · balanced":"Standar · seimbang",
      "Minimal · subtle only":"Minimal · sangat ringan",
      "Off · no animation":"Mati · tanpa animasi",
      "Bare-metal text kernel":"Kernel teks bare-metal",
      "Framebuffer kernel":"Kernel framebuffer",
      "Minimal kernel foundation":"Fondasi kernel minimal",
      "Scan this PC":"Pindai PC ini",
      "Copy CMD checks":"Salin pemeriksaan CMD",
      "Not scanned":"Belum dipindai",
      "Not checked":"Belum diperiksa",
      "Not connected":"Belum terhubung",
      "Checking…":"Sedang memeriksa…",
      "Capture to serial.log":"Rekam ke serial.log",
      "Disable serial capture":"Nonaktifkan perekaman serial",
      "User-mode NAT":"NAT mode pengguna",
      "Standard VGA":"VGA standar",
      "Virtio GPU":"GPU Virtio",
      "Automatic":"Otomatis",
      "Disabled":"Dinonaktifkan",
      "Quiet":"Senyap",
      "Error":"Kesalahan",
      "Warning":"Peringatan",
      "Information":"Informasi",
      "Debug":"Debug",
      "Debug · -O0":"Debug · -O0",
      "Size · -Os":"Ukuran · -Os",
      "Speed · -O2":"Kecepatan · -O2",
      "Current project target":"Target proyek aktif",
      "Default OS target":"Target OS default",
      "Current project memory plan":"Rencana memori proyek aktif",
      "Default memory plan":"Rencana memori default",
      "Current project QEMU profile":"Profil QEMU proyek aktif",
      "Default QEMU profile":"Profil QEMU default",
      "Current project boot profile":"Profil boot proyek aktif",
      "Default boot profile":"Profil boot default",
      "New project defaults":"Default proyek baru",
      "Interface language":"Bahasa antarmuka",
      "Source languages":"Bahasa source",
      "Native kernel build":"Build kernel native",
      "Host PC & Command Prompt":"PC host & Command Prompt",
      "Local execution bridge":"Jembatan eksekusi lokal",
      "Connection status":"Status koneksi",
      "Execution and security boundary":"Batas eksekusi dan keamanan",
      "Readable interface":"Antarmuka yang mudah dibaca",
      "Keyboard shortcuts":"Pintasan keyboard",
      "Tool availability":"Ketersediaan tool",
      "Native toolchain executables":"Executable toolchain native",
      "Host capacity":"Kapasitas host",
      "Estimate host capacity":"Estimasi kapasitas host",
      "Export all projects":"Ekspor semua proyek",
      "Delete all local projects":"Hapus semua proyek lokal",
      "Apply settings":"Terapkan pengaturan",
      "QEMU & Emulator":"QEMU & Emulator",
      "Storage & Data":"Penyimpanan & Data",
      "OS & Architecture":"OS & Arsitektur"
    });
    for(const [english,indonesian] of Object.entries(dictionary))html=html.split(english).join(indonesian);
  }
  host.innerHTML=html;
  host.onchange=settingChanged;
  host.oninput=settingChanged;
  if(category==="memory")renderMemory();
  if(category==="storage")renderStorageSettings();
  $("#estimateHostMemoryButton")&&$("#estimateHostMemoryButton").addEventListener("click",refreshHostMemoryEstimate);
  $("#testLocalServiceButton")&&$("#testLocalServiceButton").addEventListener("click",testService);
  $("#checkToolchainButton")&&$("#checkToolchainButton").addEventListener("click",checkToolchain);
  $("#scanHostPcButton")&&$("#scanHostPcButton").addEventListener("click",scanHostPc);
  $("#copyCmdChecksButton")&&$("#copyCmdChecksButton").addEventListener("click",copyCommandPromptChecks);
  $("#exportAllProjectsButton")&&$("#exportAllProjectsButton").addEventListener("click",exportAll);
  $("#clearProjectsButton")&&$("#clearProjectsButton").addEventListener("click",clearAllProjects);
}
function settingChanged(e){const el=e.target,k=el.dataset.setting;if(!k)return;state.settings[k]=el.type==="checkbox"?el.checked:el.type==="number"?Number(el.value):el.value;if(k==="locale"){translate();renderSettings(state.category);Object.values(state.models).forEach(model=>scheduleQuickDiagnostics(model));return;}if(k==="theme")applyTheme();if(k==="accent")applyAccent();if(k==="density"||k==="motionLevel"||k==="reduceMotion")applyDensity();
  if(["editorFontSize","editorFontFamily","tabSize","wordWrap","lineNumbers","minimap","cursorStyle","smoothScrolling","bracketPairColorization","renderWhitespace","codeAssist"].includes(k))applyEditorSettings();
  if(k==="quickDiagnostics")Object.values(state.models).forEach(model=>scheduleQuickDiagnostics(model));
  if(["guestMemoryMiB","heapReserveMiB","stackReserveKiB"].includes(k))renderMemory();}
function validateSettings(){
  const s=state.settings;
  const requireInteger=(key,min,max,step=1)=>{
    const value=Number(s[key]);
    if(!Number.isInteger(value)||value<min||value>max||(step>1&&value%step!==0)){
      throw Error(key+" must be an integer between "+min+" and "+max+(step>1?" in steps of "+step:"")+".");
    }
  };
  const requireMemory=(ramKey,heapKey,stackKey,label)=>{
    const ram=Number(s[ramKey]),heap=Number(s[heapKey]),stack=Number(s[stackKey]);
    if(heap+stack/1024+1>=ram)throw Error(label+" heap and stack reservations exceed guest RAM.");
  };
  const requireHex=(key)=>{
    if(!/^0x[0-9a-fA-F]{6,16}$/.test(String(s[key]||""))){
      throw Error(key+" must be hexadecimal, for example 0x00100000.");
    }
  };
  const requireCommandLine=(key)=>{
    const value=String(s[key]||"");
    if(value.length>256||/[^A-Za-z0-9_.,=:+\/ -]/.test(value)){
      throw Error(key+" contains unsupported characters or exceeds 256 characters.");
    }
  };
  const requireEnum=(key,values)=>{
    if(!values.includes(s[key]))throw Error(key+" has an unsupported value.");
  };

  requireInteger("editorFontSize",10,24);
  requireInteger("autoSaveDelayMs",250,5000,50);
  requireInteger("guestMemoryMiB",64,32768,64);
  requireInteger("heapReserveMiB",1,8192);
  requireInteger("stackReserveKiB",64,1048576,64);
  requireInteger("qemuVcpus",1,32);
  requireInteger("qemuVncPort",5900,5999);
  requireInteger("grubTimeout",0,30);
  requireInteger("grubDefault",0,20);
  requireMemory("guestMemoryMiB","heapReserveMiB","stackReserveKiB","Default");
  requireHex("kernelBase");
  requireCommandLine("kernelCommandLine");

  requireEnum("defaultArchitecture",["x86_64","i686","aarch64","riscv64"]);
  requireEnum("defaultFirmware",["bios","uefi"]);
  requireEnum("defaultBootloader",["grub","uefi-app","custom"]);
  requireEnum("defaultKernelLanguage",["cpp","c"]);
  requireEnum("optimization",["debug","size","speed"]);
  requireEnum("qemuMachine",["q35","pc","virt"]);
  requireEnum("qemuCpuModel",["max","qemu64","Nehalem"]);
  requireEnum("qemuDisplay",["std","virtio","none"]);
  requireEnum("qemuAcceleration",["auto","kvm","whpx","tcg"]);
  requireEnum("qemuNetwork",["none","user"]);
  requireEnum("serialBackend",["file","null"]);
  requireEnum("kernelLogLevel",["quiet","error","warn","info","debug"]);
  requireEnum("defaultTemplate",["kernel-text","kernel-framebuffer","kernel-minimal"]);
  requireEnum("theme",["dark","light","mono"]);
  requireEnum("motionLevel",["enhanced","standard","minimal","off"]);
  requireEnum("accent",["sage","cyan","blue","amber"]);
  requireEnum("density",["compact","balanced","comfortable"]);
  requireEnum("wordWrap",["off","on"]);
  requireEnum("cursorStyle",["line","block","underline"]);
  requireEnum("renderWhitespace",["none","selection","boundary","all"]);
  if(![90,100,110,120].includes(Number(s.uiScale)))throw Error("Interface scale must be 90%, 100%, 110% or 120%.");

  if(state.project){
    requireInteger("projectGuestMemoryMiB",64,32768,64);
    requireInteger("projectHeapReserveMiB",1,8192);
    requireInteger("projectStackReserveKiB",64,1048576,64);
    requireInteger("projectQemuVcpus",1,32);
    requireInteger("projectQemuVncPort",5900,5999);
    requireInteger("projectGrubTimeout",0,30);
    requireInteger("projectGrubDefault",0,20);
    requireMemory("projectGuestMemoryMiB","projectHeapReserveMiB","projectStackReserveKiB","Current project");
    requireHex("projectKernelBase");
    requireCommandLine("projectKernelCommandLine");
    requireEnum("projectArchitecture",["x86_64","i686","aarch64","riscv64"]);
    requireEnum("projectFirmware",["bios","uefi"]);
    requireEnum("projectBootloader",["grub","uefi-app","custom"]);
    requireEnum("projectKernelLanguage",["cpp","c"]);
    requireEnum("projectOptimization",["debug","size","speed"]);
    requireEnum("projectQemuMachine",["q35","pc","virt"]);
    requireEnum("projectQemuCpuModel",["max","qemu64","Nehalem"]);
    requireEnum("projectQemuDisplay",["std","virtio","none"]);
    requireEnum("projectQemuAcceleration",["auto","kvm","whpx","tcg"]);
    requireEnum("projectQemuNetwork",["none","user"]);
  }

  KernoLocalService.configure(s.localServiceUrl,s.localServiceToken);
}
async function applySettings(){
  try{validateSettings();}catch(error){notify("Settings need attention",error.message);return;}
  await saveSettings();
  applyTheme();applyAccent();applyDensity();translate();applyEditorSettings();
  if(state.project){
    const config=state.project.config;
    config.architecture=state.settings.projectArchitecture;
    config.firmware=state.settings.projectFirmware;
    config.bootloader=state.settings.projectBootloader;
    config.kernelLanguage=state.settings.projectKernelLanguage;
    config.optimization=state.settings.projectOptimization;
    config.memory=Object.assign({},config.memory||{},{
      guestMiB:Number(state.settings.projectGuestMemoryMiB),
      heapReserveMiB:Number(state.settings.projectHeapReserveMiB),
      stackReserveKiB:Number(state.settings.projectStackReserveKiB),
      pageSize:state.settings.projectPageSize,
      kernelBase:state.settings.projectKernelBase
    });
    config.qemu=Object.assign({},config.qemu||{},{
      binary:state.settings.projectQemuBinary,
      machine:state.settings.projectQemuMachine,
      display:state.settings.projectQemuDisplay,
      vcpus:Number(state.settings.projectQemuVcpus),
      vncPort:Number(state.settings.projectQemuVncPort),
      acceleration:state.settings.projectQemuAcceleration,
      cpuModel:state.settings.projectQemuCpuModel,
      network:state.settings.projectQemuNetwork
    });
    config.boot=Object.assign({},config.boot||{},{
      grubTimeout:Number(state.settings.projectGrubTimeout),
      grubDefault:Number(state.settings.projectGrubDefault),
      kernelCommandLine:String(state.settings.projectKernelCommandLine||"").trim()
    });
    config.diagnostics=Object.assign({},config.diagnostics||{},{
      debugSymbols:!!state.settings.debugSymbols,
      warningsAsErrors:!!state.settings.warningsAsErrors,
      logLevel:state.settings.kernelLogLevel,
      serialBackend:state.settings.serialBackend,
      retainBuildLogs:!!state.settings.retainBuildLogs
    });
    if(state.project.files["linker.ld"]){
      const linkerLines=state.project.files["linker.ld"].split(/\r?\n/);
      let foundLinkBase=false;
      const updatedLinker=linkerLines.map(line=>{
        if(/^\s*\.\s*=\s*0x[0-9a-fA-F]+\s*;/.test(line)){
          foundLinkBase=true;
          return "    . = "+config.memory.kernelBase+";";
        }
        return line;
      });
      if(foundLinkBase)state.project.files["linker.ld"]=updatedLinker.join("\n");
    }
    if(config.bootloader==="grub"&&state.project.files["boot/grub.cfg"]){
      const lines=state.project.files["boot/grub.cfg"].split(/\r?\n/);
      const updated=lines.map(line=>{
        const trimmed=line.trim();
        if(trimmed.startsWith("set timeout="))return "set timeout="+config.boot.grubTimeout;
        if(trimmed.startsWith("set default="))return "set default="+config.boot.grubDefault;
        if(trimmed.startsWith("multiboot2 /boot/kernel.elf"))return "    multiboot2 /boot/kernel.elf"+(config.boot.kernelCommandLine?" "+config.boot.kernelCommandLine:"");
        return line;
      });
      if(!updated.some(line=>line.trim().startsWith("set timeout=")))updated.unshift("set timeout="+config.boot.grubTimeout);
      if(!updated.some(line=>line.trim().startsWith("set default=")))updated.unshift("set default="+config.boot.grubDefault);
      state.project.files["boot/grub.cfg"]=updated.join("\n");
    }
    await saveProject(true);
    updateProjectHeader();renderMachine();renderBuild();renderMemory();renderTree();
  }
  notify("Settings applied","IDE preferences saved. Current-project OS settings remain separate from defaults for new projects.");
  show(state.settingsReturn);
}

function applyTheme(){
  const theme=state.settings.theme||"dark";
  document.body.classList.toggle("light-theme",theme==="light");
  document.body.classList.toggle("monochrome-theme",theme==="mono");
  document.documentElement.style.colorScheme=theme==="light"?"light":"dark";
  const editorTheme=theme==="light"?"kerno-light":theme==="mono"?"kerno-mono":"kerno-dark";
  if(window.monaco)window.monaco.editor.setTheme(editorTheme);
  ["#themeToggleWelcome","#themeToggleApp"].forEach(selector=>{
    const button=$(selector);if(!button)return;
    button.textContent=theme==="mono"?"◑ B/W":theme==="light"?"☼ Light":"◐ Dark";
    button.title="Current theme: "+(theme==="mono"?"Black & white":theme==="light"?"Light":"Dark")+". Click to cycle.";
  });
}
function applyAccent(){const map={sage:"#79b8a3",cyan:"#63c9ca",blue:"#80aee8",amber:"#d7b16e"};document.documentElement.style.setProperty("--accent",map[state.settings.accent]||map.sage);}
function applyDensity(){
  document.documentElement.dataset.density=state.settings.density;
  document.documentElement.style.setProperty("--ui-scale",String(Number(state.settings.uiScale||100)/100));
  document.documentElement.dataset.motionLevel=state.settings.motionLevel||"standard";
  document.body.classList.toggle("reduce-motion",!!state.settings.reduceMotion);
  document.body.classList.toggle("high-contrast-focus",!!state.settings.highContrastFocus);
}
async function refreshHostMemoryEstimate(){
  const host=$("#hostMemoryEstimate");
  if(!host)return;
  host.textContent="Checking local host memory…";
  try{
    KernoLocalService.configure(state.settings.localServiceUrl,state.settings.localServiceToken);
    let project;
    if(state.project){
      project=payload();
      if(state.screen==="settings"){
        project.config.memory=Object.assign({},project.config.memory||{},{
          guestMiB:Number(state.settings.projectGuestMemoryMiB),
          heapReserveMiB:Number(state.settings.projectHeapReserveMiB),
          stackReserveKiB:Number(state.settings.projectStackReserveKiB)
        });
      }
    }else{
      project={id:"memory-plan",name:"Memory plan",config:configFor("Memory plan"),files:{}};
    }
    const result=await KernoLocalService.resourceEstimate(project,state.settings);
    const hostMemory=result.host||{};
    const total=hostMemory.totalMiB==null?"unknown":formatBytes(hostMemory.totalMiB*1024*1024);
    const available=hostMemory.availableMiB==null?"unknown":formatBytes(hostMemory.availableMiB*1024*1024);
    const verdict=result.recommended==null?"capacity unavailable":result.recommended?"capacity estimate looks sufficient":"low available host memory";
    host.textContent="Host available: "+available+" / "+total+" · "+verdict;
  }catch(error){host.textContent="Unavailable · "+error.message;}
}
async function exportAll(){const projects=await all("projects");if(!projects.length){notify("No projects to export");return;}if(!window.JSZip){notify("ZIP library unavailable");return;}const z=new JSZip();projects.forEach(p=>{const d=z.folder(safeName(p.name)+"-"+p.id.slice(0,6));Object.entries(p.files).forEach(([path,text])=>d.file(path,text));d.file("KernoProject.json",JSON.stringify({format:"kerno-project",name:p.name,config:p.config,files:p.files},null,2));});download(await z.generateAsync({type:"blob"}),"kerno-workspaces-backup.zip");}
async function clearAllProjects(){if(state.settings.confirmDestructive&&!await confirmInApp("This permanently deletes every locally stored Kerno project in this browser profile.","Delete all local projects?"))return;await clear("projects");state.project=null;state.recent=[];renderRecent();show("welcome");notify("Local project storage cleared");}
function renderMachine(){
  if(!state.project)return;
  const config=state.project.config;
  const qemu=config.qemu||{};
  const diagnostics=config.diagnostics||{};
  $("#machineArchitecture").textContent=config.architecture||"unknown";
  $("#machineType").textContent=qemu.machine||"q35";
  $("#machineMemory").textContent=((config.memory||{}).guestMiB||512)+" MiB";
  $("#machineCpus").textContent=qemu.vcpus||2;
  $("#machineDisplaySpec").textContent=qemu.display==="std"?"Standard VGA":qemu.display==="virtio"?"Virtio GPU":"Headless";
  $("#machineCpuModel").textContent=qemu.cpuModel||"max";
  $("#machineAcceleration").textContent=({auto:"Automatic",kvm:"KVM",whpx:"WHPX",tcg:"Software TCG"})[qemu.acceleration||"auto"];
  $("#machineNetwork").textContent=qemu.network==="user"?"User-mode NAT":"Disabled";
  $("#machineSerialBackend").textContent=diagnostics.serialBackend==="null"?"Disabled":"File capture";
}
function renderBuild(){if(!state.project)return;$("#buildTarget").textContent=state.project.config.architecture;$("#buildBootloader").textContent=state.project.config.bootloader;$("#buildLanguage").textContent=state.project.config.kernelLanguage.toUpperCase();}
function updateProjectHeader(){if(!state.project)return;$("#activeProjectName").textContent=state.project.name;$("#activeTargetChip").textContent=state.project.config.architecture+" · "+state.project.config.bootloader.toUpperCase();}

const ISO_UI_COPY={
 id:{
  title:"Impor, bongkar, dan jalankan ISO",description:"Gunakan Local Service untuk memeriksa citra ISO, melihat isi berkasnya, lalu menjalankannya melalui QEMU.",
  import:"Pilih file ISO",extract:"Bongkar isi ISO",boot:"Boot ISO di QEMU",idle:"Belum ada ISO yang diimpor. Hubungkan Local Service untuk memulai.",
  imported:"ISO berhasil diimpor dan diverifikasi.",working:"Sedang memproses ISO. Biarkan halaman dan Local Service tetap terbuka.",
  noBios:"ISO ini tidak memiliki entri boot BIOS yang tervalidasi. Berkas tetap dapat diperiksa dan diekstrak, tetapi belum dapat dijalankan lewat profil BIOS Kerno v0.1.",
  bios:"Terdeteksi entri boot BIOS. ISO dapat dicoba melalui QEMU dengan firmware BIOS.",
  efi:"ISO mendukung EFI/UEFI, tetapi boot UEFI belum menjadi target Kerno v0.1.",
  extractDone:"Ekstraksi selesai. Hasilnya dikemas dalam arsip ZIP.",
  toolTitle:"Versi toolchain & jalur pembaruan",toolLead:"Bandingkan jalur pengembangan, perbaikan, dan rilis stabil. Versi terpasang dibaca langsung dari komputer host.",
  roadmapTitle:"Tahapan pengembangan ISO Workbench",roadmapNote:"Status yang sedang dikerjakan dipisahkan dari fitur yang masih direncanakan.",
  phase01Title:"ISO Editor + BIOS",phase01Description:"Impor, inspeksi, edit file, rebuild ISO, verifikasi boot, dan uji QEMU",
  phase02Title:"Dukungan UEFI",phase02Description:"Boot UEFI dengan firmware OVMF dan pemeriksaan jalur EFI",
  phase03Title:"Pustaka ISO lokal",phase03Description:"Riwayat citra, metadata, dan pengelolaan ISO yang lebih persisten",
  phase04Title:"ISO lanjutan",phase04Description:"Penyuntingan atau remaster ISO dan pengujian profil boot yang lebih luas",
  development:"Development / preview",maintenance:"Fix / maintenance",stable:"Latest stable",installed:"Terpasang di host",
  notScanned:"Belum dipindai",missing:"Tidak ditemukan / belum terpasang",notAvailable:"Tidak ada rilis maintenance terpisah",
  editorHeading:"Edit isi ISO",editorDescription:"Ubah teks, tambah atau ganti file, lalu bangun ulang ISO.",editorAdd:"Tambah file",editorReplace:"Ganti file terpilih",editorDelete:"Hapus file terpilih",editorRefresh:"Muat ulang daftar",editorSearch:"Cari file",editorSave:"Simpan perubahan file",editorRepack:"Build ulang ISO",editorDownload:"Unduh ISO hasil edit",editorSelect:"Pilih file untuk mulai mengedit",editorMeta:"File teks UTF-8 dapat diedit langsung. File biner dapat diganti dengan file baru.",editorWarning:"File boot yang dipakai langsung oleh El Torito dilindungi agar konfigurasi boot tidak rusak.",
  releaseNote:"Data rilis upstream diperiksa pada 26 November 2026. Ini bukan perintah instalasi atau pembaruan otomatis. Cocokkan versi dengan platform dan arsitektur host."
 },
 en:{
  title:"Import, inspect and boot an ISO",description:"Use the Local Service to inspect an ISO image, browse its files, and launch it through QEMU.",
  import:"Choose ISO file",extract:"Extract ISO contents",boot:"Boot ISO in QEMU",idle:"No ISO imported yet. Connect the Local Service to begin.",
  imported:"ISO imported and verified.",working:"Processing ISO. Keep this page and the Local Service open.",
  noBios:"This ISO has no validated BIOS boot entry. You can still inspect and extract it, but Kerno v0.1 cannot boot it using the BIOS profile.",
  bios:"A BIOS boot entry was detected. The ISO can be attempted in QEMU using BIOS firmware.",
  efi:"This ISO supports EFI/UEFI, but UEFI boot is not yet a Kerno v0.1 target.",
  extractDone:"Extraction completed. The files are packaged as a ZIP archive.",
  toolTitle:"Toolchain versions & update channels",toolLead:"Compare development, maintenance and stable release tracks. Installed versions are read from the host computer.",
  roadmapTitle:"ISO Workbench development stages",roadmapNote:"The active development stage is shown separately from features that are still planned.",
  phase01Title:"ISO Editor + BIOS",phase01Description:"Import, inspect, edit files, rebuild the ISO, verify boot metadata and test through QEMU",
  phase02Title:"UEFI support",phase02Description:"UEFI boot through OVMF firmware and EFI boot-path validation",
  phase03Title:"Local ISO library",phase03Description:"Image history, metadata and more persistent ISO management",
  phase04Title:"Advanced ISO tools",phase04Description:"ISO editing or remastering and broader boot-profile testing",
  development:"Development / preview",maintenance:"Fix / maintenance",stable:"Latest stable",installed:"Installed on host",
  notScanned:"Not scanned",missing:"Not detected / not installed",notAvailable:"No separate maintenance release",
  editorHeading:"Edit ISO contents",editorDescription:"Edit text, add or replace files, then rebuild the ISO.",editorAdd:"Add file",editorReplace:"Replace selected file",editorDelete:"Delete selected file",editorRefresh:"Refresh file list",editorSearch:"Search files",editorSave:"Save file changes",editorRepack:"Rebuild ISO",editorDownload:"Download edited ISO",editorSelect:"Select a file to start editing",editorMeta:"UTF-8 text files can be edited directly. Binary files can be replaced with another file.",editorWarning:"Files used directly as El Torito boot images are protected to avoid breaking the boot configuration.",
  releaseNote:"Upstream release data checked on 26 November 2026. This panel does not install or update tools. Match each version to your host platform and architecture."
 }
};
function isoText(key){
 const copy=ISO_UI_COPY[activeLocale()]||ISO_UI_COPY.en;
 return copy[key]||ISO_UI_COPY.en[key]||key;
}
function translateIsoWorkbench(){
 const values={isoWorkbenchTitle:"title",isoWorkbenchDescription:"description",isoImportButton:"import",isoExtractButton:"extract",isoBootButton:"boot",toolVersionHeading:"toolTitle",isoRoadmapTitle:"roadmapTitle",isoRoadmapNote:"roadmapNote",isoStageV01Title:"phase01Title",isoStageV01Description:"phase01Description",isoStageV02Title:"phase02Title",isoStageV02Description:"phase02Description",isoStageV03Title:"phase03Title",isoStageV03Description:"phase03Description"};
 Object.entries(values).forEach(([id,key])=>{const node=$("#"+id);if(node)node.textContent=isoText(key);});
 const editorValues={isoOpenEditorButton:"open",isoEditorHeading:"editorHeading",isoEditorDescription:"editorDescription",isoEditorAddButton:"editorAdd",isoEditorReplaceButton:"editorReplace",isoEditorDeleteButton:"editorDelete",isoEditorRefreshButton:"editorRefresh",isoEditorSaveButton:"editorSave",isoEditorRepackButton:"editorRepack",isoEditorDownloadButton:"editorDownload",isoEditorWarning:"editorWarning"};
 Object.entries(editorValues).forEach(([id,key])=>{const node=$("#"+id);if(node)node.textContent=isoEditorText(key);});
 const search=$("#isoEditorSearch");if(search)search.placeholder=isoEditorText("search");
 const selected=$("#isoEditorSelectedPath");if(selected&&!state.isoEditorSelectedPath)selected.textContent=isoEditorText("editorSelect");
 const meta=$("#isoEditorSelectedMeta");if(meta&&!state.isoEditorSelectedPath)meta.textContent=isoEditorText("editorMeta");
 const lead=$("#toolVersionHeading")?.parentElement?.querySelector("p");
 if(lead)lead.textContent=isoText("toolLead");
 if(!state.importedIso)setIsoImportStatus(isoText("idle"),"");
 const note=$("#toolVersionStatus");if(note)note.textContent=isoText("releaseNote");
}
const TOOL_RELEASE_TRACKS=[
 {name:"QEMU",role:"System emulator",key:"qemu",development:"11.2.0-rc1",maintenance:"11.0.5",stable:"11.1.3",installedKeys:["qemu"]},
 {name:"NASM",role:"Assembler",key:"assembler",development:"3.02-20260819",maintenance:"—",stable:"3.02",installedKeys:["assembler"]},
 {name:"GNU GRUB",role:"Bootloader / ISO builder",key:"isoBuilder",development:"Upstream Git",maintenance:"—",stable:"2.14",installedKeys:["isoBuilder"]},
 {name:"GCC cross-compiler",role:"C and C++ compiler",key:"crossCompiler",development:"trunk (rolling)",maintenance:"15.3 / 14.4 / 13.5",stable:"16.2",installedKeys:["crossCompiler","cCompiler"]},
 {name:"GNU xorriso",role:"ISO inspection and extraction",key:"xorriso",development:"1.5.9 snapshot",maintenance:"—",stable:"1.5.8.pl02",installedKeys:["xorriso"]},
 {name:"Python",role:"Kerno Local Service runtime",key:"python",development:"3.16.0a2",maintenance:"3.14.10 / 3.13.18 / 3.12.16 / 3.11.18",stable:"3.15.2",installedKeys:[]}
];
function renderToolVersionChannels(hostTools,extra){
 const host=hostTools||{},extras=extra||{},target=$("#toolVersionCards");
 if(!target)return;
 target.textContent="";
 TOOL_RELEASE_TRACKS.forEach(item=>{
  const card=document.createElement("article");card.className="tool-version-item";
  const heading=document.createElement("h3");heading.textContent=item.name;card.append(heading);
  const role=document.createElement("small");role.textContent=item.role;card.append(role);
  [
   [isoText("development"),item.development,"development"],
   [isoText("maintenance"),item.maintenance==="—"?isoText("notAvailable"):item.maintenance,"maintenance"],
   [isoText("stable"),item.stable,"stable"]
  ].forEach(([label,value,kind])=>{
   const row=document.createElement("div");row.className="tool-version-row";
   const caption=document.createElement("span");caption.textContent=label;
   const version=document.createElement("strong");version.textContent=value;version.className="tool-version-badge "+kind;
   row.append(caption,version);card.append(row);
  });
  let installed=[],scanPerformed=false;
  if(item.key==="python"){
   if(extras.pythonVersion){installed.push("Python "+extras.pythonVersion);scanPerformed=true;}
  }else{
   scanPerformed=item.installedKeys.some(key=>Object.prototype.hasOwnProperty.call(host,key));
   installed=item.installedKeys.map(key=>{
    const entry=host[key];if(!entry)return null;
    const label=key==="crossCompiler"?"x86_64-elf-g++":key==="cCompiler"?"x86_64-elf-gcc":key;
    return entry.available?label+" · "+(entry.version||"available"):label+" · "+isoText("missing");
   }).filter(Boolean);
  }
  const row=document.createElement("div");row.className="tool-version-row";
  const caption=document.createElement("span");caption.textContent=isoText("installed");
  const value=document.createElement("strong");value.textContent=installed.length?installed.join(" · "):(scanPerformed?isoText("missing"):isoText("notScanned"));
  row.append(caption,value);card.append(row);target.append(card);
 });
 const note=$("#toolVersionStatus");if(note)note.textContent=isoText("releaseNote");
}
function setIsoImportStatus(message,stateName){
 const status=$("#isoImportStatus");if(!status)return;
 status.textContent=message;status.dataset.state=stateName||"";
}
function renderImportedIso(record){
 const info=record.inspection||{};
 $("#isoImportDetails").classList.remove("hidden");
 $("#isoImportedName").textContent=record.name||"uploaded.iso";
 $("#isoImportedSize").textContent=formatBytes(Number(record.sizeBytes||0));
 $("#isoImportedVolume").textContent=info.volumeId||"(unknown)";
 $("#isoImportedSha").textContent=record.sha256||"Not available";
 const boot=$("#isoBootCompatibility"),flags=[];
 if(info.iso9660Valid)flags.push("ISO9660 valid");
 if(info.hasElTorito)flags.push("El Torito catalog found");
 if(info.bootableBIOS)flags.push("BIOS bootable");
 if(info.bootableEFI)flags.push("EFI bootable");
 boot.textContent=(flags.join(" · ")||"ISO structure inspected; no boot platform identified.")+" "+
  (info.bootableBIOS?isoText("bios"):info.bootableEFI?isoText("efi"):isoText("noBios"));
 boot.dataset.bootable=info.bootableBIOS?"true":"false";
 $("#isoExtractButton").disabled=false;
 $("#isoOpenEditorButton").disabled=false;
 $("#isoBootButton").disabled=!info.bootableBIOS;
 $("#isoEditorDownloadButton").disabled=!record.edited;
 $("#isoExtractionResult").classList.add("hidden");
}
async function importIsoFile(file){
 if(!file)return;
 if(!/\.iso$/i.test(file.name||"")){notify("ISO import failed","Select a file with the .iso extension.","error");return;}
 if(file.size>4*1024*1024*1024){notify("ISO import failed","The default ISO limit is 4 GiB.","error");return;}
 if(state.importedIso&&(state.isoEditorDirty||state.isoEditorTextDirty)){
  const discard=await confirmInApp(isoEditorText("discardWorkspace"),"Unsaved ISO workspace");
  if(!discard)return;
 }
 const button=$("#isoImportButton");button.disabled=true;$("#isoExtractButton").disabled=true;$("#isoOpenEditorButton").disabled=true;$("#isoBootButton").disabled=true;
 setIsoImportStatus(isoText("working")+" "+file.name,"working");
 try{
  if(!state.localConnected&&!await testService())throw new Error("Connect Kerno Local Service first.");
  KernoLocalService.configure(state.settings.localServiceUrl,state.settings.localServiceToken);
  const imported=await KernoLocalService.importIso(file);
  resetIsoEditorForNewImport();
  state.importedIso=imported;state.isoArchive=null;
  renderImportedIso(imported);setIsoImportStatus(isoText("imported"),"success");
  notify("ISO imported",imported.name||file.name);
 }catch(error){setIsoImportStatus(error.message,"error");notify("ISO import failed",error.message,"error");}
 finally{button.disabled=false;$("#isoOpenEditorButton").disabled=!state.importedIso;}
}
async function extractImportedIso(){
 if(!state.importedIso){notify("No ISO selected","Import an ISO before extraction.","error");return;}
 const button=$("#isoExtractButton");button.disabled=true;setIsoImportStatus(isoText("working"),"working");
 try{
  KernoLocalService.configure(state.settings.localServiceUrl,state.settings.localServiceToken);
  const result=await KernoLocalService.extractIso(state.importedIso.id);
  if(result.status!=="extracted"||!result.archive)throw new Error("Local Service did not confirm ISO extraction.");
  const archive=result.archive;state.isoArchive=archive;
  const rows=(archive.files||[]).map(entry=>entry.path+"  ·  "+formatBytes(Number(entry.sizeBytes||0)));
  if(archive.previewTruncated)rows.push("… preview limited to the first "+(archive.files||[]).length+" files.");
  if(archive.skippedLinks)rows.push("Skipped symbolic links / unsafe entries: "+archive.skippedLinks);
  $("#isoFilePreview").textContent=rows.join("\n")||"(The ISO contains no regular files.)";
  $("#isoExtractedTitle").textContent="ISO file tree";
  $("#isoExtractedSummary").textContent=Number(archive.fileCount||0)+" files · "+formatBytes(Number(archive.totalExtractedBytes||0))+" extracted";
  $("#isoExtractionResult").classList.remove("hidden");$("#isoDownloadArchiveButton").disabled=false;
  setIsoImportStatus(isoText("extractDone"),"success");
  notify("ISO extraction completed",archive.fileCount+" files packaged into ZIP.");
 }catch(error){setIsoImportStatus(error.message,"error");notify("ISO extraction failed",error.message,"error");}
 finally{button.disabled=false;}
}
async function downloadExtractedIso(){
 if(!state.isoArchive){notify("No extracted archive available");return;}
 const button=$("#isoDownloadArchiveButton");button.disabled=true;
 try{
  KernoLocalService.configure(state.settings.localServiceUrl,state.settings.localServiceToken);
  const blob=await KernoLocalService.downloadIsoArchive(state.isoArchive.id);
  download(blob,"kerno-iso-extracted.zip");notify("Extraction archive downloaded",state.isoArchive.name||"ZIP archive");
 }catch(error){notify("Archive download failed",error.message,"error");}
 finally{button.disabled=false;}
}
async function startImportedIsoQemu(){
 if(!state.importedIso){notify("No ISO selected","Import an ISO first.","error");return;}
 if(!state.importedIso.inspection?.bootableBIOS){notify("ISO cannot boot in BIOS profile",isoText("noBios"),"error");return;}
 const button=$("#isoBootButton");button.disabled=true;setIsoImportStatus(isoText("working"),"working");
 try{
  if(!state.localConnected&&!await testService())throw new Error("Connect Kerno Local Service first.");
  KernoLocalService.configure(state.settings.localServiceUrl,state.settings.localServiceToken);
  const result=await KernoLocalService.startIsoEmulator(state.importedIso.id,state.settings);
  if(result.status!=="running"||!result.displayUrl)throw new Error("Local Service did not confirm a running QEMU session and display endpoint.");
  state.qemuBootMode="external-iso";state.kernelEntryConfirmed=false;
  state.qemuStartedAt=Date.now();state.qemuBootTimeoutShown=false;
  state.lastSerialOutput=String(result.serialOutput||"");
  setServiceStatus(true,"QEMU running · external ISO");showDisplay(result.displayUrl);
  $("#serialOutput").textContent=state.lastSerialOutput||"External ISO started. Waiting for serial output…";
  $("#stopQemuButton").disabled=false;$("#startQemuButton").disabled=true;
  if(Array.isArray(result.healthChecks))renderBuildHealth(result.healthChecks,false);
  startQemuPolling();
  setIsoImportStatus("QEMU process is running. Check the guest display and logs to confirm its boot outcome.","success");
  notify("External ISO launched in QEMU",state.importedIso.name||"Imported ISO");
 }catch(error){setIsoImportStatus(error.message,"error");notify("External ISO could not boot",error.message,"error");button.disabled=false;}
}


const ISO_EDITOR_COPY={
 id:{
  open:"Buka Editor ISO",openStatus:"Menyiapkan ruang kerja ISO…",opened:"Editor ISO siap. Pilih file di daftar untuk mulai.",empty:"Tidak ada file yang cocok.",files:"file",search:"Cari file",
  addPath:"Masukkan path relatif untuk file baru. Contoh: docs/catatan.txt",addTitle:"Tambah file ke ISO",replace:"File berhasil diganti.",saved:"Perubahan file berhasil disimpan.",deleted:"File berhasil dihapus dari ruang kerja.",dirty:"Ada perubahan yang belum dibangun ulang",clean:"Belum ada perubahan yang perlu dibangun ulang",binary:"File ini bukan teks UTF-8. Gunakan Ganti file terpilih untuk memasukkan file lain.",protected:"File boot El Torito dilindungi agar konfigurasi boot tidak rusak.",
  repacking:"Membangun ulang ISO dan memeriksa struktur boot…",repacked:"ISO hasil edit berhasil dibangun dan divalidasi.",download:"ISO hasil edit berhasil diunduh.",discard:"Ada perubahan teks yang belum disimpan. Buang perubahan tersebut?",
  confirmDelete:"Hapus file ini dari ruang kerja ISO? Perubahan baru berlaku setelah ISO dibangun ulang.",discardWorkspace:"Workspace ISO ini memiliki perubahan yang belum dibangun ulang. Lanjutkan impor dan buang perubahan tersebut?",
  openFirst:"Buka Editor ISO terlebih dahulu.",selectFirst:"Pilih file dari daftar terlebih dahulu.",noChanges:"Belum ada perubahan untuk dibangun ulang.",
  loaded:"Daftar file diperbarui.",upload:"Pilih file yang akan ditambahkan atau mengganti file yang dipilih."
 },
 en:{
  open:"Open ISO Editor",openStatus:"Preparing the ISO workspace…",opened:"ISO Editor is ready. Select a file from the list to begin.",empty:"No matching files.",files:"files",search:"Search files",
  addPath:"Enter a relative path for the new file. Example: docs/notes.txt",addTitle:"Add file to ISO",replace:"File replaced successfully.",saved:"File changes saved successfully.",deleted:"File removed from the ISO workspace.",dirty:"There are changes waiting to be rebuilt",clean:"There are no changes waiting to be rebuilt",binary:"This file is not UTF-8 text. Use Replace selected file to upload another file.",protected:"This El Torito boot image is protected to avoid breaking the boot configuration.",
  repacking:"Rebuilding the ISO and checking its boot structure…",repacked:"The edited ISO was rebuilt and validated.",download:"Edited ISO downloaded.",discard:"There are unsaved text changes. Discard them?",
  confirmDelete:"Remove this file from the ISO workspace? The change takes effect after rebuilding the ISO.",discardWorkspace:"This ISO workspace has changes that have not been rebuilt. Import another ISO and discard those changes?",
  openFirst:"Open the ISO Editor first.",selectFirst:"Select a file from the list first.",noChanges:"There are no changes to rebuild.",
  loaded:"File list refreshed.",upload:"Choose a file to add or replace the selected file."
 }
};
function isoEditorText(key){
 const copy=ISO_EDITOR_COPY[activeLocale()]||ISO_EDITOR_COPY.en;
 return copy[key]||ISO_EDITOR_COPY.en[key]||key;
}
function setIsoEditorStatus(message){
 const node=$("#isoEditorFileStatus");if(node)node.textContent=message;
}
function updateIsoEditorDirty(){
 const label=$("#isoEditorDirtyState"),repack=$("#isoEditorRepackButton");
 if(label){
  label.textContent=state.isoEditorDirty?isoEditorText("dirty"):isoEditorText("clean");
  label.dataset.dirty=state.isoEditorDirty?"true":"false";
 }
 if(repack)repack.disabled=!state.isoEditorDirty;
}
function isIsoEditorBootLocked(path){
 const target=String(path||"").toLowerCase();
 const protectedPaths=state.importedIso?.inspection?.bootImagePaths||[];
 return protectedPaths.some(value=>{
  const boot=String(value||"").toLowerCase();
  return target===boot||boot.startsWith(target+"/");
 });
}
function renderIsoEditorFileList(){
 const host=$("#isoEditorFileList");if(!host)return;
 const query=String($("#isoEditorSearch")?.value||"").trim().toLowerCase();
 host.textContent="";
 const entries=(state.isoEditorFiles||[]).filter(entry=>!query||entry.path.toLowerCase().includes(query));
 $("#isoEditorFileCount").textContent=(state.isoEditorWorkspace?.fileCount||0)+" "+isoEditorText("files")+
  (state.isoEditorWorkspace?.previewTruncated?" · showing first 2,000":"");
 if(!entries.length){
  const empty=document.createElement("p");empty.className="iso-editor-empty";empty.textContent=isoEditorText("empty");host.append(empty);return;
 }
 entries.forEach(entry=>{
  const button=document.createElement("button");button.type="button";button.className="iso-editor-file";
  button.classList.toggle("active",entry.path===state.isoEditorSelectedPath);
  const protectedBoot=isIsoEditorBootLocked(entry.path);
  button.disabled=entry.kind!=="file";
  button.setAttribute("role","option");button.setAttribute("aria-selected",entry.path===state.isoEditorSelectedPath?"true":"false");
  const name=document.createElement("span");name.textContent=entry.path;
  const meta=document.createElement("small");meta.textContent=entry.kind==="symlink"?"Symbolic link":protectedBoot?"Boot locked":formatBytes(Number(entry.sizeBytes||0));
  button.append(name,meta);
  button.onclick=()=>selectIsoEditorFile(entry.path);
  host.append(button);
 });
}
function resetIsoEditorForNewImport(){
 state.isoEditorWorkspace=null;state.isoEditorFiles=[];state.isoEditorSelectedPath="";
 state.isoEditorDirty=false;state.isoEditorTextDirty=false;state.isoEditorOpen=false;state.isoEditorSelectedProtected=false;
 $("#isoEditorPanel")?.classList.add("hidden");
 $("#isoEditorText").value="";$("#isoEditorText").disabled=true;
 $("#isoEditorSelectedPath").textContent="Pilih file untuk mulai mengedit";
 $("#isoEditorSelectedMeta").textContent="File teks UTF-8 dapat diedit langsung. File biner dapat diganti dengan file baru.";
 $("#isoEditorSaveButton").disabled=true;$("#isoEditorReplaceButton").disabled=true;$("#isoEditorDeleteButton").disabled=true;
 updateIsoEditorDirty();
}
async function openIsoEditorWorkspace(){
 if(!state.importedIso){notify("No ISO selected",isoEditorText("openFirst"),"error");return;}
 const button=$("#isoOpenEditorButton");button.disabled=true;setIsoEditorStatus(isoEditorText("openStatus"));
 try{
  if(!state.localConnected&&!await testService())throw new Error("Connect Kerno Local Service first.");
  KernoLocalService.configure(state.settings.localServiceUrl,state.settings.localServiceToken);
  const result=await KernoLocalService.openIsoWorkspace(state.importedIso.id);
  if(result.status!=="opened"||!result.workspaceId)throw new Error("Local Service did not confirm an editable ISO workspace.");
  state.isoEditorWorkspace=result;state.isoEditorFiles=result.files||[];
  state.isoEditorSelectedPath="";state.isoEditorTextDirty=false;state.isoEditorSelectedProtected=false;
  state.isoEditorOpen=true;state.isoEditorDirty=!!result.dirty;
  $("#isoEditorPanel").classList.remove("hidden");
  $("#isoEditorText").value="";$("#isoEditorText").disabled=true;
  $("#isoEditorSelectedPath").textContent="Pilih file untuk mulai mengedit";
  $("#isoEditorSaveButton").disabled=true;$("#isoEditorReplaceButton").disabled=true;$("#isoEditorDeleteButton").disabled=true;
  renderIsoEditorFileList();updateIsoEditorDirty();
  setIsoEditorStatus(isoEditorText("opened"));
  notify("ISO Editor ready",result.fileCount+" files indexed.");
 }catch(error){setIsoEditorStatus(error.message);notify("Could not open ISO Editor",error.message,"error");}
 finally{button.disabled=false;}
}
async function refreshIsoEditorFiles(){
 if(!state.importedIso||!state.isoEditorOpen)throw new Error(isoEditorText("openFirst"));
 KernoLocalService.configure(state.settings.localServiceUrl,state.settings.localServiceToken);
 const result=await KernoLocalService.listIsoWorkspaceFiles(state.importedIso.id);
 state.isoEditorFiles=result.files||[];
 state.isoEditorWorkspace=Object.assign({},state.isoEditorWorkspace,result);
 renderIsoEditorFileList();updateIsoEditorDirty();
 setIsoEditorStatus(isoEditorText("loaded"));
}
async function selectIsoEditorFile(path){
 if(state.isoEditorTextDirty){
  const discard=await confirmInApp(isoEditorText("discard"),"Unsaved editor changes");
  if(!discard)return;
 }
 const entry=(state.isoEditorFiles||[]).find(item=>item.path===path);
 if(!entry||entry.kind!=="file")return;
 state.isoEditorSelectedPath=path;state.isoEditorSelectedProtected=isIsoEditorBootLocked(path);
 renderIsoEditorFileList();
 $("#isoEditorSelectedPath").textContent=path;
 $("#isoEditorSelectedMeta").textContent=formatBytes(Number(entry.sizeBytes||0));
 $("#isoEditorText").value="";$("#isoEditorText").disabled=true;
 $("#isoEditorSaveButton").disabled=true;
 $("#isoEditorReplaceButton").disabled=state.isoEditorSelectedProtected;
 $("#isoEditorDeleteButton").disabled=state.isoEditorSelectedProtected;
 state.isoEditorTextDirty=false;
 try{
  KernoLocalService.configure(state.settings.localServiceUrl,state.settings.localServiceToken);
  const file=await KernoLocalService.readIsoWorkspaceFile(state.importedIso.id,path);
  $("#isoEditorText").value=file.content;
  $("#isoEditorText").disabled=state.isoEditorSelectedProtected;
  $("#isoEditorSaveButton").disabled=state.isoEditorSelectedProtected;
  $("#isoEditorSelectedMeta").textContent=formatBytes(Number(file.sizeBytes||0))+" · UTF-8 text";
  setIsoEditorStatus("File opened. Changes in the editor are not saved until you press Save.");
 }catch(error){
  $("#isoEditorSelectedMeta").textContent=error.message;
  setIsoEditorStatus(isoEditorText("binary"));
 }
}
function markIsoEditorDirty(){
 if(state.isoEditorSelectedProtected){setIsoEditorStatus(isoEditorText("protected"));return;}
 state.isoEditorTextDirty=true;
 $("#isoEditorSaveButton").disabled=false;
 setIsoEditorStatus("There are unsaved changes in the text editor.");
}
async function saveIsoEditorText(){
 if(!state.isoEditorSelectedPath){notify("No file selected",isoEditorText("selectFirst"),"error");return;}
 if(state.isoEditorSelectedProtected){setIsoEditorStatus(isoEditorText("protected"));return;}
 const button=$("#isoEditorSaveButton");button.disabled=true;
 try{
  KernoLocalService.configure(state.settings.localServiceUrl,state.settings.localServiceToken);
  const result=await KernoLocalService.writeIsoWorkspaceFile(state.importedIso.id,state.isoEditorSelectedPath,$("#isoEditorText").value);
  state.isoEditorTextDirty=false;state.isoEditorDirty=true;
  await refreshIsoEditorFiles();
  setIsoEditorStatus(isoEditorText("saved")+" · "+formatBytes(Number(result.file?.sizeBytes||0)));
 }catch(error){setIsoEditorStatus(error.message);notify("Could not save ISO file",error.message,"error");}
 finally{button.disabled=false;}
}
async function addOrReplaceIsoEditorFile(file,replaceSelected){
 if(!file)return;
 let path=replaceSelected?state.isoEditorSelectedPath:"";
 if(!replaceSelected){
  path=await promptInApp(isoEditorText("addPath"),file.name,isoEditorText("addTitle"));
  if(!path)return;
 }
 path=String(path||"").trim();
 if(!path)return;
 if(replaceSelected&&state.isoEditorSelectedProtected){setIsoEditorStatus(isoEditorText("protected"));return;}
 if(!replaceSelected&&(state.isoEditorFiles||[]).some(entry=>entry.path===path)){
  if(!await confirmInApp("A file with this path already exists. Replace it?", "Replace existing ISO file?"))return;
 }
 if(state.isoEditorTextDirty){
  const discard=await confirmInApp(isoEditorText("discard"),"Unsaved editor changes");
  if(!discard)return;
 }
 try{
  KernoLocalService.configure(state.settings.localServiceUrl,state.settings.localServiceToken);
  await KernoLocalService.writeIsoWorkspaceFile(state.importedIso.id,path,file);
  state.isoEditorSelectedPath=path;state.isoEditorTextDirty=false;state.isoEditorDirty=true;
  await refreshIsoEditorFiles();
  await selectIsoEditorFile(path);
  setIsoEditorStatus(isoEditorText("replace")+" · "+path);
  notify("ISO file updated",path);
 }catch(error){setIsoEditorStatus(error.message);notify("Could not update ISO file",error.message,"error");}
}
async function deleteIsoEditorSelectedFile(){
 const path=state.isoEditorSelectedPath;
 if(!path){notify("No file selected",isoEditorText("selectFirst"),"error");return;}
 if(state.isoEditorTextDirty){
  const discard=await confirmInApp(isoEditorText("discard"),"Unsaved editor changes");
  if(!discard)return;
 }
 if(!await confirmInApp(isoEditorText("confirmDelete"),"Remove ISO file?"))return;
 try{
  KernoLocalService.configure(state.settings.localServiceUrl,state.settings.localServiceToken);
  await KernoLocalService.deleteIsoWorkspaceFile(state.importedIso.id,path);
  state.isoEditorSelectedPath="";state.isoEditorTextDirty=false;state.isoEditorDirty=true;
  $("#isoEditorText").value="";$("#isoEditorText").disabled=true;
  $("#isoEditorSelectedPath").textContent="Pilih file untuk mulai mengedit";
  $("#isoEditorSelectedMeta").textContent="Select another file from the list.";
  $("#isoEditorSaveButton").disabled=true;$("#isoEditorReplaceButton").disabled=true;$("#isoEditorDeleteButton").disabled=true;
  await refreshIsoEditorFiles();setIsoEditorStatus(isoEditorText("deleted"));
 }catch(error){setIsoEditorStatus(error.message);notify("Could not remove ISO file",error.message,"error");}
}
async function repackEditedIso(){
 if(!state.isoEditorDirty){notify("No unsaved ISO changes",isoEditorText("noChanges"));return;}
 const button=$("#isoEditorRepackButton");button.disabled=true;
 $("#isoEditorDownloadButton").disabled=true;
 setIsoEditorStatus(isoEditorText("repacking"));setIsoImportStatus(isoEditorText("repacking"),"working");
 try{
  if(state.isoEditorTextDirty){
   await saveIsoEditorText();
   if(state.isoEditorTextDirty)throw new Error("Save the selected text file successfully before rebuilding the ISO.");
  }
  KernoLocalService.configure(state.settings.localServiceUrl,state.settings.localServiceToken);
  const result=await KernoLocalService.repackIsoWorkspace(state.importedIso.id);
  if(result.status!=="repacked"||!result.iso?.sha256)throw new Error("Local Service did not confirm a verified rebuilt ISO.");
  state.importedIso=result.iso;state.isoEditorDirty=false;state.isoEditorTextDirty=false;
  renderImportedIso(state.importedIso);updateIsoEditorDirty();
  $("#isoEditorDownloadButton").disabled=false;
  await refreshIsoEditorFiles();
  setIsoEditorStatus(isoEditorText("repacked"));
  setIsoImportStatus(isoEditorText("repacked"),"success");
  notify("Edited ISO rebuilt",state.importedIso.name+" · SHA-256 "+state.importedIso.sha256.slice(0,16)+"…");
 }catch(error){
  setIsoEditorStatus(error.message);setIsoImportStatus(error.message,"error");
  notify("Could not rebuild ISO",error.message,"error");
 }finally{button.disabled=!state.isoEditorDirty;}
}
async function downloadEditedIsoFile(){
 if(!state.importedIso?.edited){notify("No rebuilt ISO is available");return;}
 const button=$("#isoEditorDownloadButton");button.disabled=true;
 try{
  KernoLocalService.configure(state.settings.localServiceUrl,state.settings.localServiceToken);
  const blob=await KernoLocalService.downloadEditedIso(state.importedIso.id);
  download(blob,state.importedIso.name||"kerno-edited.iso");
  setIsoEditorStatus(isoEditorText("download"));
 }catch(error){setIsoEditorStatus(error.message);notify("ISO download failed",error.message,"error");}
 finally{button.disabled=false;}
}

function switchWorkspace(name){["source","machine","build"].forEach(x=>$("#"+x+"Workspace").classList.toggle("hidden",x!==name));$(".workspace-nav-item").forEach(b=>b.classList.toggle("active",b.dataset.workspace===name));if(name==="machine"&&!state.localConnected)renderMachineEmpty(tr("connectQemuPrompt"));if(name==="build"){renderBuild();if(!$("#toolVersionCards").children.length)renderToolVersionChannels();}if(name==="source"){state.editor&&state.editor.layout();state.splitEditor&&state.splitEditor.layout();}}
function renderMachineEmpty(msg){const v=$("#machineViewport");v.innerHTML='<div class="viewport-empty"><div class="monitor-glyph">▣</div><strong></strong><p></p><span class="viewport-hint">QEMU / VNC OUTPUT</span></div>';$("strong",v).textContent=tr("noMachineSession");$("p",v).textContent=msg||tr("connectQemuPrompt");}
function setServiceStatus(on,msg){state.localConnected=on;$("#qemuStatusText").textContent=msg;$(".machine-status").classList.toggle("connected",on);$("#qemuStatusDot").style.background=on?"#77c99c":"#c58f62";$("#machineControlNote").textContent=on?"Local service reachable. QEMU process control is delegated to the local runtime.":"QEMU is unavailable until Kerno Local Service is installed and connected.";}
async function testService(){try{KernoLocalService.configure(state.settings.localServiceUrl,state.settings.localServiceToken);const h=await KernoLocalService.health();setServiceStatus(true,"Local service connected");if($("#localServiceResult"))$("#localServiceResult").textContent="Connected · API "+(h.apiVersion||"unknown");notify("Local service connected");return true;}catch(e){setServiceStatus(false,"QEMU not connected");if($("#localServiceResult"))$("#localServiceResult").textContent="Unavailable · "+e.message;notify("Local service unavailable",e.message);return false;}}
function stopQemuPolling(){
  if(state.qemuPollTimer){clearInterval(state.qemuPollTimer);state.qemuPollTimer=null;}
}
async function pollQemuStatus(){
  if(!state.localConnected)return;
  try{
    const result=await KernoLocalService.emulatorStatus();
    if(result.status==="running"){
      const externalIso=result.bootMode==="external-iso"||state.qemuBootMode==="external-iso";
      state.qemuBootMode=externalIso?"external-iso":"project";
      setServiceStatus(true,externalIso?"QEMU running · external ISO":(state.kernelEntryConfirmed?"QEMU running · kernel entry confirmed":"QEMU running · checking kernel entry"));
      if(result.displayUrl&&state.currentDisplayUrl!==result.displayUrl)showDisplay(result.displayUrl);
      const serial=String(result.serialOutput||"");
      if(serial!==state.lastSerialOutput){
        state.lastSerialOutput=serial;
        $("#serialOutput").textContent=serial||"Waiting for serial output…";
        const consolePanel=$("#serialOutput");if(consolePanel)consolePanel.scrollTop=consolePanel.scrollHeight;
        if(!externalIso)verifyBootMarker(serial);
      }
      if(!externalIso&&!state.kernelEntryConfirmed){
        const serialEnabled=((state.project&&state.project.config&&state.project.config.diagnostics)||{}).serialBackend!=="null";
        if(serialEnabled&&state.qemuStartedAt&&Date.now()-state.qemuStartedAt>30000&&!state.qemuBootTimeoutShown){
          state.qemuBootTimeoutShown=true;
          $("#buildStateLabel").textContent="KERNEL ENTRY NOT CONFIRMED";
          notify("Kernel entry not confirmed","QEMU is running but the expected serial marker has not appeared. Inspect GRUB and COM1 output.","error");
        }
      }
      $("#stopQemuButton").disabled=false;
      $("#startQemuButton").disabled=true;
    }else{
      const endedMode=state.qemuBootMode||"project";
      stopQemuPolling();
      if(window.KernoNoVNC)window.KernoNoVNC.disconnect();
      state.currentDisplayUrl="";
      state.lastSerialOutput="";
      state.qemuStartedAt=0;
      state.qemuBootTimeoutShown=false;
      state.qemuBootMode="";
      if(endedMode==="external-iso")$("#buildStateLabel").textContent="EXTERNAL ISO STOPPED";
      else if(!state.kernelEntryConfirmed)$("#buildStateLabel").textContent="QEMU STOPPED · KERNEL ENTRY NOT CONFIRMED";
      $("#serialOutput").textContent="QEMU is stopped. No serial output is available.";
      renderMachineEmpty("Local service connected; no QEMU guest is running.");
      setServiceStatus(true,"Service connected · machine stopped");
      $("#startQemuButton").disabled=false;
      $("#stopQemuButton").disabled=true;
    }
  }catch(error){
    stopQemuPolling();
    setServiceStatus(false,"Local service disconnected");
    $("#machineControlNote").textContent=error.message;
    $("#startQemuButton").disabled=true;
    $("#stopQemuButton").disabled=true;
  }
}
function startQemuPolling(){
  if(state.qemuPollTimer)return;
  pollQemuStatus();
  state.qemuPollTimer=window.setInterval(pollQemuStatus,1500);
}

async function connectService(){
  if(!await testService())return;
  await pollQemuStatus();
  if(state.localConnected){
    try{
      const status=await KernoLocalService.emulatorStatus();
      if(status.status==="running")startQemuPolling();
      else renderMachineEmpty("Local service connected; no QEMU guest is running.");
    }catch(error){notify("Could not read emulator status",error.message);}
  }
}
function showDisplay(value){
  let url;
  try{url=new URL(value);}catch(_){notify("Invalid emulator display URL");return;}
  const host=url.hostname.replace(/^\[|\]$/g,"");
  if(!["localhost","127.0.0.1","::1"].includes(host)||!["ws:","wss:","http:","https:"].includes(url.protocol)){
    notify("Display URL rejected","The QEMU display must use a loopback address.");return;
  }
  if(state.currentDisplayUrl===url.href)return;
  if(window.KernoNoVNC)window.KernoNoVNC.disconnect();
  state.currentDisplayUrl=url.href;
  const viewport=$("#machineViewport");
  viewport.innerHTML="";
  if(url.protocol==="ws:"||url.protocol==="wss:"){
    if(!window.KernoNoVNC){
      const error=document.createElement("p");
      error.className="viewport-error";
      error.textContent="noVNC client is not loaded. Check the CDN connection and reload Kerno.";
      viewport.append(error);return;
    }
    try{window.KernoNoVNC.connect(viewport,url.href,status=>{$("#qemuStatusText").textContent=status;});}
    catch(error){notify("Could not attach QEMU display",error.message);}
    return;
  }
  const frame=document.createElement("iframe");
  frame.src=url.href;frame.title="QEMU guest display";
  frame.setAttribute("sandbox","allow-scripts allow-same-origin");
  viewport.append(frame);
}
async function startQemu(){
  if(!state.project)return;
  if(!state.localConnected&&!await testService())return;
  $("#startQemuButton").disabled=true;
  try{
    const result=await KernoLocalService.startEmulator(payload(),state.settings);
    state.qemuBootMode="project";
    if(result.status!=="running"&&!result.displayUrl)throw Error(result.message||"The service did not confirm a running QEMU guest.");
    state.kernelEntryConfirmed=false;
    state.qemuStartedAt=Date.now();
    state.qemuBootTimeoutShown=false;
    setServiceStatus(true,"QEMU process running · awaiting kernel entry");
    if(result.displayUrl)showDisplay(result.displayUrl);
    state.lastSerialOutput=String(result.serialOutput||"");
    verifyBootMarker(state.lastSerialOutput);
    $("#serialOutput").textContent=state.lastSerialOutput||"Waiting for serial output…";
    $("#stopQemuButton").disabled=false;
    if(Array.isArray(result.healthChecks))renderBuildHealth(result.healthChecks,false);
    startQemuPolling();
    notify("QEMU session started","Process confirmed. Kerno will verify kernel entry using the serial marker.");
  }catch(error){
    $("#startQemuButton").disabled=false;
    notify("QEMU could not start",error.message);
  }
}
async function stopQemu(){
  if(!state.localConnected){notify("Local service is not connected");return;}
  $("#stopQemuButton").disabled=true;
  try{
    const result=await KernoLocalService.stopEmulator();
    if(result.status&&result.status!=="stopped")throw Error(result.message||"The service did not confirm process termination.");
    stopQemuPolling();
    if(window.KernoNoVNC)window.KernoNoVNC.disconnect();
    state.currentDisplayUrl="";
    state.lastSerialOutput="";
    state.kernelEntryConfirmed=false;
    state.qemuStartedAt=0;
    state.qemuBootTimeoutShown=false;
    state.qemuBootMode="";
    $("#serialOutput").textContent="QEMU stopped. Serial output is closed.";
    renderMachineEmpty("QEMU was stopped by Kerno Local Service.");
    setServiceStatus(true,"Service connected · machine stopped");
    $("#startQemuButton").disabled=false;
    notify("QEMU stopped");
  }catch(error){
    $("#stopQemuButton").disabled=false;
    notify("Could not stop QEMU",error.message);
  }
}
function payload(){syncEditor();return {id:state.project.id,name:state.project.name,config:state.project.config,files:state.project.files};}
function renderBuildHealth(checks,building=false){
  const host=$("#buildHealthChecks");
  if(!host)return;
  host.innerHTML="";
  if(building){
    const note=document.createElement("p");note.className="build-health-note";
    note.textContent="Build submitted to Kerno Local Service. Waiting for the native pipeline to return its phase-by-phase checks; no simulated progress is shown.";
    host.append(note);
    return;
  }
  const entries=Array.isArray(checks)?checks:[];
  if(!entries.length){
    const empty=document.createElement("p");empty.className="build-health-note";
    empty.textContent="The Local Agent did not return build health checks. This result cannot be treated as an ISO validation report.";
    host.append(empty);return;
  }
  const heading=document.createElement("div");heading.className="build-health-heading";
  const title=document.createElement("strong");title.textContent="BUILD HEALTH REPORT";
  const count=document.createElement("span");
  const failed=entries.filter(item=>item.status==="failed").length;
  const passed=entries.filter(item=>item.status==="passed").length;
  const warnings=entries.filter(item=>item.status==="warning").length;
  count.textContent=passed+" passed · "+warnings+" warning · "+failed+" failed";
  heading.append(title,count);host.append(heading);
  entries.forEach(item=>{
    const row=document.createElement("div");row.className="build-health-row "+(item.status||"pending");
    const mark=document.createElement("span");mark.className="build-health-mark";
    mark.textContent=item.status==="passed"?"✓":item.status==="failed"?"!":item.status==="warning"?"△":"·";
    const copy=document.createElement("div");copy.className="build-health-copy";
    const name=document.createElement("strong");name.textContent=item.stage||"Unnamed check";
    const detail=document.createElement("small");detail.textContent=item.detail||item.status||"No detail";
    copy.append(name,detail);row.append(mark,copy);host.append(row);
  });
}
function buildHealthIsComplete(checks){
  if(!Array.isArray(checks)||checks.some(item=>item.status==="failed"))return false;
  const passed=new Set(checks.filter(item=>item.status==="passed").map(item=>item.stage));
  return [
    "Project manifest and target","Native toolchain health","Assembly",
    "Freestanding C/C++ compilation","ELF64 x86_64 linking and entry validation",
    "Multiboot2 header validation","ISO9660 filesystem","El Torito BIOS boot catalog",
    "ISO boot-file layout","Artifact integrity"
  ].every(stage=>passed.has(stage));
}
function verifyBootMarker(serial){
  if(!state.kernelEntryConfirmed&&/KERNO:\s*kernel entry reached\./i.test(String(serial||""))){
    state.kernelEntryConfirmed=true;
    $("#buildStateLabel").textContent="KERNEL ENTRY CONFIRMED";
    notify("Kernel entry confirmed","The guest emitted the expected COM1 startup marker.");
  }
}
function renderArtifactDownload(artifact){
  const host=$("#artifactDownloads");
  if(!host)return;
  host.innerHTML="";
  if(!artifact||!artifact.id)return;
  const button=document.createElement("button");
  button.type="button";
  button.className="artifact-download-link";
  button.textContent="Download verified ISO · "+(artifact.name||"kernel.iso");
  button.addEventListener("click",async()=>{
    button.disabled=true;
    button.textContent="Preparing ISO download…";
    try{
      KernoLocalService.configure(state.settings.localServiceUrl,state.settings.localServiceToken);
      const blob=await KernoLocalService.downloadArtifact(artifact.id);
      if(artifact.sha256&&window.crypto&&crypto.subtle){
        const digest=await crypto.subtle.digest("SHA-256",await blob.arrayBuffer());
        const actual=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,"0")).join("");
        if(actual.toLowerCase()!==String(artifact.sha256).toLowerCase())throw Error("Downloaded ISO checksum does not match the verified build artifact.");
      }
      download(blob,artifact.name||"kerno-kernel.iso");
      button.textContent="ISO downloaded · "+(artifact.name||"kernel.iso");
      notify("ISO artifact downloaded",artifact.name||"Kernel image");
    }catch(error){
      button.textContent="Retry ISO download";
      notify("ISO download failed",error.message);
    }finally{button.disabled=false;}
  });
  host.append(button);
}

async function nativeBuild(bootAfter){
  if(!state.project)return;
  if(!state.localConnected&&!await testService())return;
  $("#runBuildButton").disabled=true;
  $("#buildProjectButton").disabled=true;
  $("#buildStateLabel").textContent="BUILDING · HEALTH CHECKS";
  $("#buildHealthChecks").classList.add("is-building");
  renderBuildHealth([],true);
  $("#buildLog").textContent="Submitting native build request to Kerno Local Service…\\n";
  try{
    const result=await KernoLocalService.build(payload(),state.settings);
    const status=String(result.status||"").toLowerCase();
    renderBuildHealth(result.healthChecks||[],false);
    if(!["success","failed","cancelled"].includes(status))throw Error("Build service returned an unknown terminal status.");
    $("#buildStateLabel").textContent=status.toUpperCase();
    $("#buildLog").textContent=(result.log||result.message||"Build "+status)+"\\n";
    if(status!=="success"){
      notify("Native build "+status,result.message||"Review the build health report.","error");
      return;
    }
    if(!result.artifact){
      $("#buildStateLabel").textContent="ARTIFACT MISSING";
      throw Error("The service reported success but did not return a verified artifact.");
    }
    if(!buildHealthIsComplete(result.healthChecks)){
      $("#buildStateLabel").textContent="HEALTH CHECK INCOMPLETE";
      throw Error("The Local Agent reported success without every required kernel and ISO health check passing.");
    }
    if(!/^[a-f0-9]{64}$/i.test(String(result.artifact.sha256||""))){
      $("#buildStateLabel").textContent="CHECKSUM MISSING";
      throw Error("The Local Agent did not return a valid SHA-256 checksum for the ISO.");
    }
    notify("Native build completed",result.artifact.name||"Artifact returned by Kerno Local Service.");
    $("#buildLog").textContent+="Verified artifact: "+(result.artifact.name||"unnamed")+" ("+Number(result.artifact.sizeBytes||0)+" bytes)\\n";
    renderArtifactDownload(result.artifact);
    if(bootAfter){
      $("#buildLog").textContent+="Starting the configured QEMU machine…\\n";
      const boot=await KernoLocalService.startEmulator(Object.assign(payload(),{buildArtifact:result.artifact}),state.settings);
      if(boot.status!=="running"&&!boot.displayUrl)throw Error(boot.message||"Build succeeded, but QEMU did not confirm a running guest.");
      state.qemuBootMode="project";
      state.qemuStartedAt=Date.now();
      state.qemuBootTimeoutShown=false;
      setServiceStatus(true,"QEMU process running · awaiting kernel entry");
      if(boot.displayUrl)showDisplay(boot.displayUrl);
      state.lastSerialOutput=String(boot.serialOutput||"");
      state.kernelEntryConfirmed=false;
      verifyBootMarker(state.lastSerialOutput);
      $("#serialOutput").textContent=state.lastSerialOutput||"Waiting for serial output…";
      $("#startQemuButton").disabled=true;
      $("#stopQemuButton").disabled=false;
      if(Array.isArray(boot.healthChecks))renderBuildHealth((result.healthChecks||[]).concat(boot.healthChecks),false);
      startQemuPolling();
      $("#buildLog").textContent+="QEMU process is running. Waiting for the kernel COM1 entry marker.\\n";
      if(!state.kernelEntryConfirmed)$("#buildStateLabel").textContent="QEMU RUNNING · AWAITING KERNEL ENTRY";
      switchWorkspace("machine");
      notify("QEMU session started","Process confirmed. Kernel entry will be verified from serial output.");
    }
  }catch(error){
    $("#buildStateLabel").textContent="OPERATION ERROR";
    $("#buildLog").textContent+="\\n"+error.message;
    notify("Build / Boot operation failed",error.message);
  }finally{
    $("#runBuildButton").disabled=false;
    $("#buildProjectButton").disabled=false;
  }
}
async function checkToolchain(){
  const host=$("#toolchainResult");if(!host)return;
  host.textContent="Scanning tools on the connected host…";
  try{
    KernoLocalService.configure(state.settings.localServiceUrl,state.settings.localServiceToken);
    const result=await KernoLocalService.toolchain(state.settings);
    renderToolVersionChannels(result.tools||{});
    const tools=Object.entries(result.tools||{});
    const available=tools.filter(([,value])=>value&&value.available);
    const missing=tools.filter(([,value])=>!value||!value.available);
    host.textContent=available.length+" available · "+missing.length+" missing";
    const details=document.createElement("div");details.className="toolchain-results";
    tools.forEach(([name,value])=>{
      const line=document.createElement("div");line.className="toolchain-result-row";
      const label=document.createElement("strong");label.textContent=name;
      const status=document.createElement("span");
      status.textContent=value&&value.available?"Available · "+(value.version||value.path||"detected"):"Missing · "+((value&&value.command)||"not configured");
      status.className=value&&value.available?"tool-found":"tool-missing";
      line.append(label,status);details.append(line);
    });
    host.append(details);
  }catch(error){host.textContent="Unavailable · "+error.message;}
}

async function scanHostPc(){
  const host=$("#hostDiagnosticsResult"),status=$("#hostDiagnosticsStatus");
  if(!host||!status)return;
  host.textContent="Scanning host hardware, runtime and PATH…";status.textContent="Scanning…";
  try{
    KernoLocalService.configure(state.settings.localServiceUrl,state.settings.localServiceToken);
    const data=await KernoLocalService.hostDiagnostics(state.settings),memory=data.memory||{};
    renderToolVersionChannels(data.toolchain||{},{pythonVersion:data.pythonVersion||""});
    const items=[
      ["Operating system",data.platform||data.system||"Unknown"],
      ["CPU architecture",data.machine||"Unknown"],
      ["Processor",String(data.processor||"Not reported")+" · "+String(data.logicalCpus||"—")+" logical CPUs"],
      ["Physical memory",memory.totalMiB==null?"Not reported":formatBytes(memory.totalMiB*1048576)+" total · "+formatBytes((memory.availableMiB||0)*1048576)+" available"],
      ["Python runtime",data.pythonVersion||"Unknown"],
      ["Command environment",data.commandPrompt||"Unknown"]
    ];
    host.innerHTML="";
    const grid=document.createElement("div");grid.className="host-summary-grid";
    items.forEach(([label,value])=>{const card=document.createElement("div");card.className="host-summary-card";const small=document.createElement("small");small.textContent=label;const strong=document.createElement("strong");strong.textContent=value;card.append(small,strong);grid.append(card);});
    host.append(grid);
    const heading=document.createElement("h4");heading.className="host-tools-heading";heading.textContent="Detected native tools";host.append(heading);
    const tools=document.createElement("div");tools.className="host-tool-chips";
    Object.entries(data.toolchain||{}).forEach(([name,tool])=>{const chip=document.createElement("span");chip.className="host-tool-chip "+(tool&&tool.available?"available":"missing");chip.textContent=name+(tool&&tool.available?" · ready":" · missing");chip.title=tool&&tool.path?tool.path:(tool&&tool.command)||name;tools.append(chip);});
    host.append(tools);status.textContent="Host scan completed";
    notify("PC diagnostics completed",String(data.system||"Host")+" · "+String(data.logicalCpus||"")+" logical CPUs");
  }catch(error){host.textContent="Host scan unavailable · "+error.message;status.textContent="Service unavailable";notify("PC diagnostics unavailable",error.message,"error");}
}
async function copyCommandPromptChecks(){
  const commands=["@echo off","echo Kerno host and toolchain diagnostics","echo ===================================","where python 2>nul && python --version","where nasm 2>nul && nasm --version","where x86_64-elf-gcc 2>nul && x86_64-elf-gcc --version","where x86_64-elf-g++ 2>nul && x86_64-elf-g++ --version","where x86_64-elf-ld 2>nul","where grub-mkrescue 2>nul && grub-mkrescue --version","where xorriso 2>nul && xorriso --version","where qemu-system-x86_64 2>nul && qemu-system-x86_64 --version","echo.","echo Install missing tools from their official sources and ensure their bin folders are on PATH.","pause"].join("\r\n");
  try{
    if(navigator.clipboard&&window.isSecureContext)await navigator.clipboard.writeText(commands);
    else{const temp=document.createElement("textarea");temp.value=commands;temp.style.position="fixed";temp.style.opacity="0";document.body.append(temp);temp.select();const copied=document.execCommand("copy");temp.remove();if(!copied)throw Error("Clipboard access unavailable.");}
    notify("CMD diagnostics copied","Paste into Command Prompt. The checks are read-only.");
  }catch(error){notify("Could not copy CMD checks",error.message,"error");}
}
async function quickOpenFile(){
  if(!state.project)return;
  const hint=await promptInApp("Type part or all of a relative source path. Example: src/kernel.cpp",state.activeFile||"","Quick open file");
  if(!hint)return;
  const query=hint.toLowerCase(),paths=Object.keys(state.project.files).sort();
  const exact=paths.find(path=>path.toLowerCase()===query);
  const matches=paths.filter(path=>path.toLowerCase().includes(query));
  if(exact){openFile(exact);return;}
  if(matches.length===1){openFile(matches[0]);return;}
  if(matches.length>1){
    const selected=await promptInApp("Matching files:\n"+matches.slice(0,12).join("\n")+"\n\nEnter the exact relative path to open.",matches[0],"Choose source file");
    if(selected&&state.project.files[selected]!==undefined)openFile(selected);else notify("File not found","Use an exact path from the Project Explorer.","error");
    return;
  }
  notify("No matching source file",hint,"error");
}
function cycleEditorTab(direction){
  if(!state.tabs.length)return;
  const index=Math.max(0,state.tabs.indexOf(state.activeFile));
  openFile(state.tabs[(index+direction+state.tabs.length)%state.tabs.length]);
}
async function loadArchive(file){const p={id:makeId(),name:file.name.replace(/\.(zip|kerno|json)$/i,""),config:configFor("Imported OS"),files:{},createdAt:Date.now(),updatedAt:Date.now()};state.project=p;if(file.name.toLowerCase().endsWith(".json")){const m=JSON.parse(await file.text());if(m.format!=="kerno-project"||!m.files)throw Error("Not a Kerno project manifest.");p.name=m.name||p.name;p.config=Object.assign(p.config,m.config||{});p.files=m.files;}else{const r=await importZip(file);if(!r.n)throw Error("No supported text source files found.");}p.files=cleanFiles(p.files);if(!Object.keys(p.files).length)throw Error("Project archive contains no supported source files.");await saveProject(true);await openProject();notify("Project loaded",p.name);}
function cleanFiles(files){const out={};let total=0;Object.entries(files).forEach(([raw,text])=>{const path=normalizePath(raw);if(!path||binaryPath(path)||typeof text!=="string")return;const size=new Blob([text]).size;if(size>FILE_LIMIT||total+size>PROJECT_LIMIT)return;total+=size;out[path]=text;});return out;}
function openSettings(from){
  state.settingsReturn=from||state.screen;
  if(from==="app"&&state.project){
    const c=state.project.config||{},memory=c.memory||{},qemu=c.qemu||{},boot=c.boot||{};
    state.settings.projectArchitecture=c.architecture||state.settings.defaultArchitecture;
    state.settings.projectFirmware=c.firmware||state.settings.defaultFirmware;
    state.settings.projectBootloader=c.bootloader||state.settings.defaultBootloader;
    state.settings.projectKernelLanguage=c.kernelLanguage||state.settings.defaultKernelLanguage;
    state.settings.projectOptimization=c.optimization||state.settings.optimization;
    state.settings.projectGuestMemoryMiB=Number(memory.guestMiB||state.settings.guestMemoryMiB);
    state.settings.projectHeapReserveMiB=Number(memory.heapReserveMiB||state.settings.heapReserveMiB);
    state.settings.projectStackReserveKiB=Number(memory.stackReserveKiB||state.settings.stackReserveKiB);
    state.settings.projectPageSize=memory.pageSize||state.settings.pageSize;
    state.settings.projectKernelBase=memory.kernelBase||state.settings.kernelBase;
    state.settings.projectQemuBinary=qemu.binary||state.settings.qemuBinary;
    state.settings.projectQemuMachine=qemu.machine||state.settings.qemuMachine;
    state.settings.projectQemuDisplay=qemu.display||state.settings.qemuDisplay;
    state.settings.projectQemuVcpus=Number(qemu.vcpus||state.settings.qemuVcpus);
    state.settings.projectQemuVncPort=Number(qemu.vncPort||state.settings.qemuVncPort);
    state.settings.projectQemuAcceleration=qemu.acceleration||state.settings.qemuAcceleration;
    state.settings.projectQemuCpuModel=qemu.cpuModel||state.settings.qemuCpuModel;
    state.settings.projectQemuNetwork=qemu.network||state.settings.qemuNetwork;
    state.settings.projectGrubTimeout=Number(boot.grubTimeout??state.settings.grubTimeout);
    state.settings.projectGrubDefault=Number(boot.grubDefault??state.settings.grubDefault);
    state.settings.projectKernelCommandLine=boot.kernelCommandLine||"";
  }
  show("settings");
  renderSettings(state.category);
}
function applyStartup(){applyTheme();applyAccent();applyDensity();translate();if(state.settings.startScreen==="lastProject"){all("projects").then(list=>{list.sort((a,b)=>b.updatedAt-a.updatedAt);if(list[0]){state.project=list[0];openProject();}else show("welcome");}).catch(()=>show("welcome"));}else show("welcome");}
function bindEvents(){
 $("#retryEditorButton").onclick=()=>{initMonaco();};
$("#welcomeNewProject").onclick=()=>{state.newProjectReturn="welcome";syncWizardDefaults();show("newProject");};$("#landingFeaturesButton").onclick=()=>scrollLandingTo("platformSection");
$("#landingWorkflowButton").onclick=()=>scrollLandingTo("workflowSection");
$("#landingTutorialButton").onclick=openTutorial;
$("#heroStartButton").onclick=()=>{state.newProjectReturn="welcome";syncWizardDefaults();show("newProject");};
$("#heroTutorialButton").onclick=openTutorial;
$("#workflowTutorialButton").onclick=openTutorial;
$("#kernelMapGrid").addEventListener("click",event=>{
  const button=event.target.closest("[data-kernel-stage]");
  if(!button)return;
  openTutorialStage(button.dataset.kernelStage);
});
$("#isoTutorialButton").onclick=()=>openTutorialStage(7);$("#footerTutorialButton").onclick=openTutorial;
$("#backFromTutorial").onclick=()=>show("welcome");
$("#tutorialFinishButton").onclick=()=>{state.newProjectReturn="tutorial";syncWizardDefaults();show("newProject");};
$("#tutorialBackTopButton").onclick=()=>$("#tutorialScreen").scrollTo({top:0,behavior:state.settings.reduceMotion?"auto":"smooth"});
$("#resetTutorialButton").onclick=async()=>{if(!state.tutorialCompleted.length){notify("No tutorial progress to reset");return;}if(!await confirmInApp("This clears the completion markers for all nine tutorial stages. The tutorial text remains available.","Reset tutorial progress?"))return;state.tutorialCompleted=[];await saveTutorialProgress();notify("Tutorial progress reset");};
$("#tutorialChapters").addEventListener("click",async event=>{
  const complete=event.target.closest("[data-complete-step]");
  if(complete){await toggleTutorialStep(Number(complete.dataset.completeStep));return;}
  const action=event.target.closest("[data-tutorial-action]");
  if(action){await handleTutorialAction(action.dataset.tutorialAction);return;}
});
$("#tutorialContents").addEventListener("click",event=>{
  const link=event.target.closest("a[href^='#tutorial-stage-']");
  if(!link)return;
  event.preventDefault();
  const target=$(link.getAttribute("href"));
  if(target)target.scrollIntoView({behavior:state.settings.reduceMotion?"auto":"smooth",block:"start"});
});
$("#themeToggleWelcome").onclick=cycleTheme;$("#themeToggleApp").onclick=cycleTheme;$("#welcomeLoadProject").onclick=()=>$("#loadProjectInput").click();$("#welcomeLoadFolder").onclick=()=>$("#projectFolderInput").click();$("#welcomeConfigure").onclick=()=>openSettings("welcome");$("#welcomeSettingsButton").onclick=()=>openSettings("welcome");
$("#backFromNewProject").onclick=()=>show(state.newProjectReturn||"welcome");$("#cancelNewProject").onclick=()=>show(state.newProjectReturn||"welcome");$("#createProjectButton").onclick=createProject;
$("#backFromSettings").onclick=()=>show(state.settingsReturn);$("#saveSettingsButton").onclick=applySettings;
$("#clearRecentButton").onclick=async()=>{if(state.settings.confirmDestructive&&!await confirmInApp("Saved projects will remain available in browser storage.","Clear recent project list?"))return;await put("meta",{key:"hiddenRecent",value:state.recent.map(p=>p.id)});await refreshRecent();};
$("#loadProjectInput").onchange=async e=>{const f=e.target.files[0];e.target.value="";if(!f)return;try{await loadArchive(f);}catch(err){state.project=null;show("welcome");notify("Project load failed",err.message);}};
$("#projectFolderInput").onchange=async e=>{const files=Array.from(e.target.files||[]);e.target.value="";if(!files.length)return;disposeEditors();state.activeFile=null;state.tabs=[];$("#plainEditor").style.display="none";const name=files[0].webkitRelativePath.split("/")[0]||"Imported OS";state.project={id:makeId(),name,config:configFor(name),files:{},createdAt:Date.now(),updatedAt:Date.now()};await importMany(files,true);if(Object.keys(state.project.files).length){await saveProject(true);await openProject();}else{state.project=null;notify("No supported source files found");}};
$("#importProjectFilesButton").onclick=()=>$("#sourceImportInput").click();$("#sourceImportInput").onchange=e=>{importMany(e.target.files,false);e.target.value="";};$("#sourceFolderInput").onchange=e=>{importMany(e.target.files,true);e.target.value="";};
$("#addSourceFileButton").onclick=createSourceFile;$("#importSourceFolderButton").onclick=()=>$("#sourceFolderInput").click();$("#emptyNewFileButton").onclick=createSourceFile;
$("#saveProjectButton").onclick=()=>saveProject(false);$("#saveFileButton").onclick=()=>saveProject(false);$("#exportFileButton").onclick=exportFile;$("#exportProjectButton").onclick=exportProject;
$("#appSettingsButton").onclick=()=>openSettings("app");$("#backToWelcomeButton").onclick=async()=>{await saveProject(true);disposeEditors();state.project=null;state.activeFile=null;state.tabs=[];show("welcome");};
$("#splitEditorButton").onclick=toggleSplit;$("#closeSplitButton").onclick=()=>$("#splitPane").classList.add("hidden");$("#splitFileSelect").onchange=e=>{state.splitFile=e.target.value;if(state.splitEditor)state.splitEditor.setModel(ensureModel(state.splitFile));};
$("#plainEditor").oninput=()=>{if(state.activeFile){state.project.files[state.activeFile]=$("#plainEditor").value;if(state.settings.autosave){clearTimeout(state.saveTimer);state.saveTimer=setTimeout(()=>saveProject(true),Math.max(250,Math.min(5000,Number(state.settings.autoSaveDelayMs)||800)));}}};
$("#plainEditor").onkeyup=plainCursor;$("#plainEditor").onclick=plainCursor;
$$(".workspace-nav-item").forEach(b=>b.onclick=()=>switchWorkspace(b.dataset.workspace));
$("#connectLocalServiceButton").onclick=connectService;$("#startQemuButton").onclick=startQemu;$("#stopQemuButton").onclick=stopQemu;$("#clearSerialButton").onclick=()=>$("#serialOutput").textContent="";
$("#isoImportButton").onclick=()=>$("#isoImportInput").click();
$("#isoImportInput").onchange=async event=>{const file=event.target.files&&event.target.files[0];event.target.value="";if(file)await importIsoFile(file);};
$("#isoExtractButton").onclick=extractImportedIso;
$("#isoBootButton").onclick=startImportedIsoQemu;
$("#isoDownloadArchiveButton").onclick=downloadExtractedIso;
 $("#isoOpenEditorButton").onclick=openIsoEditorWorkspace;
 $("#isoEditorSearch").oninput=renderIsoEditorFileList;
 $("#isoEditorText").oninput=markIsoEditorDirty;
 $("#isoEditorSaveButton").onclick=saveIsoEditorText;
 $("#isoEditorAddButton").onclick=()=>$("#isoEditorAddInput").click();
 $("#isoEditorAddInput").onchange=async event=>{const file=event.target.files&&event.target.files[0];event.target.value="";if(file)await addOrReplaceIsoEditorFile(file,false);};
 $("#isoEditorReplaceButton").onclick=()=>$("#isoEditorReplaceInput").click();
 $("#isoEditorReplaceInput").onchange=async event=>{const file=event.target.files&&event.target.files[0];event.target.value="";if(file)await addOrReplaceIsoEditorFile(file,true);};
 $("#isoEditorDeleteButton").onclick=deleteIsoEditorSelectedFile;
 $("#isoEditorRefreshButton").onclick=async()=>{try{await refreshIsoEditorFiles();}catch(error){setIsoEditorStatus(error.message);notify("Could not refresh ISO files",error.message,"error");}};
 $("#isoEditorRepackButton").onclick=repackEditedIso;
 $("#isoEditorDownloadButton").onclick=downloadEditedIsoFile;
$("#buildProjectButton").onclick=()=>{switchWorkspace("build");nativeBuild(true);};$("#runBuildButton").onclick=()=>nativeBuild(false);$("#openSettingsFromBuild").onclick=()=>{state.category="toolchain";openSettings("app");};
$$(".settings-nav-item").forEach(b=>b.onclick=()=>renderSettings(b.dataset.category));
$("#architectureSelect").onchange=()=>{const arch=$("#architectureSelect").value;if(arch==="aarch64"||arch==="riscv64"){$("#firmwareSelect").value="uefi";$("#bootloaderSelect").value="uefi-app";}$("#scaffoldPreview").textContent=arch+" target\n├── boot/\n│   └── entry.asm\n├── include/kernel/\n├── src/\n│   ├── kernel.cpp\n│   ├── console.cpp\n│   └── memory.cpp\n├── linker.ld\n└── kerno.project.json";};
document.addEventListener("keydown",e=>{
    const mod=e.ctrlKey||e.metaKey;
    if(!mod||e.altKey)return;
    const key=e.key.toLowerCase();
    const inMonaco=!!(e.target&&e.target.closest&&e.target.closest(".monaco-editor"));
    const inPlainEditor=e.target&&e.target.id==="plainEditor";
    const inEditor=inMonaco||inPlainEditor;
    const inForm=e.target&&e.target.closest&&e.target.closest("input,select,textarea,[contenteditable='true']");
    if(inForm&&!inEditor&&key!=="s")return;
    if(!$("#kernoModal").classList.contains("hidden")&&key!=="s")return;
    if(key==="s"&&e.shiftKey){
      e.preventDefault();if(state.project)exportProject();return;
    }
    if(key==="s"){
      e.preventDefault();if(state.project){syncEditor();saveProject(false);}else saveSettings();return;
    }
    if(state.screen==="app"&&key==="w"){
      e.preventDefault();e.stopPropagation();
      if(state.activeFile)closeTab(state.activeFile);else notify("No open file","There is no active editor tab to close.");
      return;
    }
    if(state.screen==="app"&&key==="n"){e.preventDefault();createSourceFile();return;}
    if(state.screen==="app"&&key==="p"){e.preventDefault();quickOpenFile();return;}
    if(state.screen==="app"&&key==="tab"){e.preventDefault();cycleEditorTab(e.shiftKey?-1:1);return;}
    if(key==="o"){
      e.preventDefault();if(state.screen==="welcome")$("#loadProjectInput").click();else if(state.project)$("#sourceImportInput").click();return;
    }
    if(e.shiftKey&&key==="e"){e.preventDefault();if(state.project)exportFile();return;}
    if(key==="b"&&state.project){e.preventDefault();switchWorkspace("build");nativeBuild(false);return;}
    if(key===","){e.preventDefault();openSettings(state.screen==="app"?"app":state.screen);return;}
    if(state.screen==="app"&&["1","2","3"].includes(e.key)){e.preventDefault();switchWorkspace(({1:"source",2:"machine",3:"build"})[e.key]);}
  });
}
function plainCursor(){const el=$("#plainEditor"),lines=el.value.slice(0,el.selectionStart).split("\n");$("#cursorPosition").textContent="Ln "+lines.length+", Col "+(lines[lines.length-1].length+1);}
async function exportAllProjects(){const projects=await all("projects");if(!projects.length){notify("No projects to export");return;}if(!window.JSZip){notify("ZIP library unavailable");return;}const z=new JSZip();projects.forEach(p=>{const d=z.folder(safeName(p.name)+"-"+p.id.slice(0,6));Object.entries(p.files).forEach(([path,text])=>d.file(path,text));d.file("KernoProject.json",JSON.stringify({format:"kerno-project",name:p.name,config:p.config,files:p.files},null,2));});download(await z.generateAsync({type:"blob"}),"kerno-workspaces-backup.zip");}
async function clearProjects(){if(state.settings.confirmDestructive&&!await confirmInApp("This permanently deletes every Kerno project stored in this browser.","Delete all projects?"))return;await clear("projects");state.project=null;state.recent=[];renderRecent();show("welcome");notify("Local project storage cleared");}
async function renderStorage(){if($("#storedProjectCount"))$("#storedProjectCount").textContent=(await all("projects")).length;if($("#browserStorageEstimate")){if(navigator.storage&&navigator.storage.estimate){const e=await navigator.storage.estimate();$("#browserStorageEstimate").textContent=formatBytes(e.usage||0)+" / "+formatBytes(e.quota||0);}else $("#browserStorageEstimate").textContent="Unavailable";}}
async function boot(){bindEvents();try{database=await dbOpen();}catch(e){notify("IndexedDB unavailable",e.message);}await loadSettings();await loadTutorialProgress();applyStartup();refreshRecent();setupLandingReveal();}
boot();
})();