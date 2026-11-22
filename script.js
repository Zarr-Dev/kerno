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

const DEFAULTS = {
  locale:"en", theme:"dark", accent:"sage", density:"balanced",
  autosave:true, confirmDestructive:true, startScreen:"welcome",
  editorFontSize:14, editorFontFamily:"DM Mono", tabSize:4, wordWrap:"off", lineNumbers:true, minimap:false,
  cursorStyle:"line", smoothScrolling:true, bracketPairColorization:true, renderWhitespace:"selection",
  autoSaveDelayMs:800, defaultTemplate:"kernel-text", uiScale:100, reduceMotion:false, highContrastFocus:false,
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
  en:{startArrow:"Start a project →",openWorkspace:"Open workspace →",openSettings:"Open settings →",workspaceHistory:"WORKSPACE HISTORY",clearHistory:"Clear history",noAccount:"No account required · Project data stays in this browser until exported",newOsWorkspace:"New operating system workspace",newOsLead:"Choose the machine target and kernel foundation. Kerno creates the initial source tree and project configuration.",scaffoldNote:"These are editable source files. A verified boot image still requires a matching native toolchain and boot protocol.",machineDesc:"Live guest output is streamed from the connected local QEMU service.",buildConfiguration:"Build configuration",buildConfigurationDesc:"Review the target before invoking the connected native build service.",settings:"Settings",back:"Back",welcomeTitle:"Build your operating system.",welcomeSubtitle:"A focused environment for kernel source, machine configuration, memory planning and emulator workflows.",newProject:"New project",newProjectDesc:"Create a structured OS workspace from a kernel template.",loadProject:"Load project",loadProjectDesc:"Open a Kerno archive, project manifest or source directory.",configureIDE:"Configure IDE",configureDesc:"Set language, appearance, editor behavior and local tools.",recentProjects:"Recent projects",noRecent:"No recent projects",noRecentDesc:"Create or load an OS project to begin.",createWorkspace:"Create workspace",projectName:"Project name",starterTemplate:"Starter template",architecture:"Architecture",firmware:"Firmware",kernelLanguage:"Kernel language",bootloader:"Bootloader",guestMemory:"Guest RAM (MiB)",virtualCpus:"Virtual CPUs",applySettings:"Apply settings",general:"General",appearance:"Appearance",language:"Language",editor:"Editor",osArchitecture:"OS & Architecture",memory:"Memory",emulator:"QEMU & Emulator",toolchain:"Toolchain",storage:"Storage & Data",advanced:"Advanced",bootSettings:"Boot & Firmware",diagnostics:"Diagnostics",accessibility:"Accessibility",shortcuts:"Keyboard & Shortcuts",source:"Source",machine:"Machine",build:"Build",importFiles:"Import files",exportProject:"Export project",buildBoot:"Build & Boot",projectFiles:"Project files",cancel:"Cancel",machineDisplay:"Machine display",noMachineSession:"No machine session",connectQemuPrompt:"Connect Kerno Local Service to launch and display a QEMU guest."},
  id:{settings:"Pengaturan",back:"Kembali",welcomeTitle:"Bangun sistem operasi milikmu.",welcomeSubtitle:"Lingkungan terfokus untuk source kernel, konfigurasi mesin, perencanaan memori, dan emulator.",newProject:"Proyek baru",newProjectDesc:"Buat workspace OS terstruktur dari template kernel.",loadProject:"Muat proyek",loadProjectDesc:"Buka arsip Kerno atau direktori source.",configureIDE:"Konfigurasi IDE",configureDesc:"Atur bahasa, tampilan, editor, dan tool lokal.",recentProjects:"Proyek terbaru",noRecent:"Belum ada proyek",noRecentDesc:"Buat atau muat proyek OS untuk memulai.",createWorkspace:"Buat workspace",projectName:"Nama proyek",starterTemplate:"Template awal",architecture:"Arsitektur",firmware:"Firmware",kernelLanguage:"Bahasa kernel",bootloader:"Bootloader",guestMemory:"RAM guest (MiB)",virtualCpus:"CPU virtual",applySettings:"Terapkan pengaturan",general:"Umum",appearance:"Tampilan",language:"Bahasa",editor:"Editor",osArchitecture:"OS & Arsitektur",memory:"Memori",emulator:"QEMU & Emulator",toolchain:"Toolchain",storage:"Penyimpanan & Data",advanced:"Lanjutan",bootSettings:"Boot & Firmware",diagnostics:"Diagnostik",accessibility:"Aksesibilitas",shortcuts:"Keyboard & Pintasan",source:"Source",machine:"Mesin",build:"Build",importFiles:"Impor file",exportProject:"Ekspor proyek",buildBoot:"Build & Boot",projectFiles:"File proyek",cancel:"Batal",machineDisplay:"Tampilan mesin",noMachineSession:"Belum ada sesi mesin",connectQemuPrompt:"Hubungkan Kerno Local Service untuk menjalankan guest QEMU."},
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

const state={settings:Object.assign({},DEFAULTS),project:null,recent:[],screen:"welcome",settingsReturn:"welcome",newProjectReturn:"welcome",category:"general",models:{},editor:null,splitEditor:null,activeFile:null,tabs:[],splitFile:null,localConnected:false,qemuPollTimer:null,currentDisplayUrl:"",lastSerialOutput:"",kernelEntryConfirmed:false,qemuStartedAt:0,qemuBootTimeoutShown:false,tutorialCompleted:[],tutorialObserver:null,landingRevealObserver:null};
function activeLocale(){if(state.settings.locale!=="auto")return state.settings.locale;const detected=String(navigator.language||"en").split("-")[0].toLowerCase();return LANGUAGES[detected]?detected:"en";}
function tr(k){const locale=activeLocale();return (LANGUAGES[locale]&&LANGUAGES[locale][k])||LANGUAGES.en[k]||k;}
function translate(){const locale=activeLocale();$("[data-i18n]").forEach(n=>n.textContent=tr(n.dataset.i18n));document.documentElement.lang=locale;document.documentElement.dir=locale==="ar"?"rtl":"ltr";}
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
  const heading=document.createElement("strong");heading.textContent=String(title||"Kerno");
  copy.append(heading);
  if(detail){const small=document.createElement("small");small.textContent=String(detail);copy.append(small);}
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
  if(ext==="json")return "json";
  if(ext==="md")return "markdown";
  if(["cfg","ini"].includes(ext))return "ini";
  return "plaintext";
}
function langLabel(p){return ({"kerno-asm":"Assembly / NASM","kerno-gas":"Assembly / GNU AS",cpp:"C++",c:"C","kerno-linker":"Linker Script",json:"JSON",markdown:"Markdown",ini:"GRUB Config",plaintext:"Text"})[langOf(p)]||"Text";}
function fileBadge(p){const x=langOf(p);return x==="kerno-asm"?["A","mark-asm"]:x==="cpp"||x==="c"?["C","mark-cpp"]:x==="json"?["{}","mark-json"]:x==="ini"?["≡","mark-config"]:x==="kerno-linker"?["L","mark-linker"]:["·","mark-doc"];}
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
  if(state.settings.reduceMotion||!("IntersectionObserver" in window)){
    $("#welcomeScreen .landing-section,#welcomeScreen .recent-section").forEach(el=>el.classList.add("is-visible"));
    return;
  }
  if(state.landingRevealObserver)state.landingRevealObserver.disconnect();
  const screen=$("#welcomeScreen"),targets=$(".landing-section,.recent-section",screen);
  document.body.classList.add("reveal-ready");
  const observer=new IntersectionObserver(entries=>{
    entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add("is-visible");observer.unobserve(entry.target);}});
  },{root:screen,rootMargin:"0px 0px -7% 0px",threshold:.08});
  targets.forEach(el=>observer.observe(el));
  state.landingRevealObserver=observer;
}
function scrollLandingTo(id){
  const target=$("#"+id);
  if(target)target.scrollIntoView({behavior:state.settings.reduceMotion?"auto":"smooth",block:"start"});
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
function ensureModel(path){if(!window.monaco||!state.project||!(path in state.project.files))return null;if(state.models[path])return state.models[path];const uri=window.monaco.Uri.parse("file:///kerno/"+path.split("/").map(encodeURIComponent).join("/"));const m=window.monaco.editor.getModel(uri)||window.monaco.editor.createModel(state.project.files[path],langOf(path),uri);m.onDidChangeContent(()=>{state.project.files[path]=m.getValue();$("#editorStatus").textContent="Modified · local autosave scheduled";if(state.settings.autosave){clearTimeout(state.saveTimer);state.saveTimer=setTimeout(()=>saveProject(true),Math.max(250,Math.min(5000,Number(state.settings.autoSaveDelayMs)||800)));}});state.models[path]=m;return m;}
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
    if($("#editorStatus")) $("#editorStatus").textContent="Workspace saved in this browser";
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
function renderEditor(){const empty=!state.activeFile||!(state.activeFile in state.project.files);$("#editorEmpty").classList.toggle("hidden",!empty);if(empty){$("#editorBreadcrumb").textContent="No source file selected";$("#plainEditor").style.display="none";return;}$("#editorBreadcrumb").textContent=state.activeFile;$("#languageMode").textContent=langLabel(state.activeFile);if(state.editor&&state.models[state.activeFile]){state.editor.setModel(state.models[state.activeFile]);$("#plainEditor").style.display="none";}else{$("#plainEditor").value=state.project.files[state.activeFile];$("#plainEditor").style.display="block";}}
function openFile(path){if(!(path in state.project.files))return;syncEditor();state.activeFile=path;if(!state.tabs.includes(path))state.tabs.push(path);renderTree();renderTabs();renderEditor();if(state.editor&&state.models[path])state.editor.setModel(state.models[path]);}
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
function disposeEditors(){Object.values(state.models).forEach(m=>{try{m.dispose();}catch(_){}});state.models={};if(state.editor){state.editor.dispose();state.editor=null;}if(state.splitEditor){state.splitEditor.dispose();state.splitEditor=null;}}
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
function defineThemes(m){m.editor.defineTheme("kerno-dark",{base:"vs-dark",inherit:true,rules:[{token:"comment",foreground:"778B9B",fontStyle:"italic"},{token:"keyword",foreground:"C5A4DF"},{token:"string",foreground:"A8D3B3"},{token:"number",foreground:"DDB77B"},{token:"type",foreground:"8CB9ED"},{token:"variable",foreground:"8DC8B2"}],colors:{"editor.background":"#0E141B","editor.foreground":"#E1E9F0","editorLineNumber.foreground":"#526476","editorLineNumber.activeForeground":"#C7D2DC","editor.lineHighlightBackground":"#17212A","editor.selectionBackground":"#3A586F88","editorCursor.foreground":"#A4D4BE","editorIndentGuide.background1":"#263440","editorIndentGuide.activeBackground1":"#557C6B","editorWidget.background":"#1C2833"}});m.editor.defineTheme("kerno-light",{base:"vs",inherit:true,rules:[{token:"comment",foreground:"788A96",fontStyle:"italic"},{token:"keyword",foreground:"8C50A8"},{token:"string",foreground:"357A51"},{token:"number",foreground:"9B641B"},{token:"type",foreground:"2767A5"}],colors:{"editor.background":"#FFFFFF","editor.foreground":"#263540","editorLineNumber.foreground":"#9BA8B2","editorLineNumber.activeForeground":"#526372","editor.lineHighlightBackground":"#F1F6F5","editorCursor.foreground":"#26795E"}});m.editor.defineTheme("kerno-mono",{base:"vs-dark",inherit:true,rules:[{token:"comment",foreground:"A0A0A0",fontStyle:"italic"},{token:"keyword",foreground:"FFFFFF",fontStyle:"bold"},{token:"string",foreground:"D8D8D8"},{token:"number",foreground:"BDBDBD"},{token:"type",foreground:"F0F0F0"},{token:"variable",foreground:"E0E0E0"}],colors:{"editor.background":"#050505","editor.foreground":"#F5F5F5","editorLineNumber.foreground":"#777777","editorLineNumber.activeForeground":"#FFFFFF","editor.lineHighlightBackground":"#171717","editor.selectionBackground":"#55555588","editorCursor.foreground":"#FFFFFF","editorIndentGuide.background1":"#333333","editorIndentGuide.activeBackground1":"#AAAAAA","editorWidget.background":"#111111"}});}
function monacoOptions(model){return {
  model,theme:state.settings.theme==="light"?"kerno-light":state.settings.theme==="mono"?"kerno-mono":"kerno-dark",automaticLayout:true,
  fontFamily:(state.settings.editorFontFamily||"DM Mono")+", Consolas, monospace",
  fontSize:Number(state.settings.editorFontSize),lineHeight:Math.max(20,Math.round(Number(state.settings.editorFontSize)*1.65)),
  minimap:{enabled:!!state.settings.minimap},padding:{top:17,bottom:20},scrollBeyondLastLine:false,
  renderLineHighlight:"line",renderWhitespace:state.settings.renderWhitespace||"selection",
  cursorBlinking:"smooth",cursorStyle:state.settings.cursorStyle||"line",
  smoothScrolling:!!state.settings.smoothScrolling,tabSize:Number(state.settings.tabSize),
  wordWrap:state.settings.wordWrap,lineNumbers:state.settings.lineNumbers?"on":"off",
  glyphMargin:false,folding:true,bracketPairColorization:{enabled:!!state.settings.bracketPairColorization},
  guides:{indentation:true},autoClosingBrackets:"always"
};}
async function initMonaco(){if(!state.project)return;try{if(!monacoLoad)monacoLoad=new Promise((resolve,reject)=>{if(!window.require){reject(Error("Monaco loader unavailable"));return;}window.require.config({paths:{vs:"https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs"}});window.MonacoEnvironment={getWorkerUrl:()=> "data:text/javascript;charset=utf-8,"+encodeURIComponent("self.MonacoEnvironment={baseUrl:'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/'};importScripts('https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs/base/worker/workerMain.js');")};window.require(["vs/editor/editor.main"],()=>resolve(window.monaco),reject);});const m=await monacoLoad;defineLanguages(m);defineThemes(m);Object.keys(state.project.files).forEach(ensureModel);if(!state.editor){state.editor=m.editor.create($("#monacoPane"),monacoOptions(ensureModel(state.activeFile)));state.editor.onDidChangeCursorPosition(e=>$("#cursorPosition").textContent="Ln "+e.position.lineNumber+", Col "+e.position.column);}else if(state.activeFile)state.editor.setModel(ensureModel(state.activeFile));$("#plainEditor").style.display="none";if(!$("#splitPane").classList.contains("hidden"))openSplit();applyEditorSettings();}catch(e){$("#plainEditor").style.display=state.activeFile?"block":"none";if(state.activeFile)$("#plainEditor").value=state.project.files[state.activeFile];$("#editorStatus").textContent="Basic editor active · Monaco unavailable";}}
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
    bracketPairColorization:{enabled:!!state.settings.bracketPairColorization}
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
async function importZip(file){if(!window.JSZip)throw Error("ZIP library unavailable.");const zip=await JSZip.loadAsync(file);let n=0,skip=0,total=fileSize(state.project);const entries=[];zip.forEach((p,e)=>{if(!e.dir)entries.push([p,e]);});for(const [raw,e] of entries){const p=normalizePath(raw);if(!p||binaryPath(p)||p==="KernoProject.json"){skip++;continue;}const content=await e.async("string"),size=new Blob([content]).size;if(size>FILE_LIMIT||total+size>PROJECT_LIMIT){skip++;continue;}total+=size;state.project.files[p]=content;n++;}const m=zip.file("KernoProject.json");if(m){try{const data=JSON.parse(await m.async("string"));if(data.config)state.project.config=Object.assign(state.project.config,data.config);if(data.name)state.project.name=data.name;}catch(_){}}return {n,skip};}
async function importMany(list,strip){const files=Array.from(list||[]);let n=0,skip=0,total=fileSize(state.project);const root=files.length&&files.every(f=>f.webkitRelativePath)&&files.map(f=>f.webkitRelativePath.split("/")[0]).every(x=>x===files[0].webkitRelativePath.split("/")[0])?files[0].webkitRelativePath.split("/")[0]:"";for(const f of files){try{if(/\.(zip|kerno)$/i.test(f.name)){const r=await importZip(f);n+=r.n;skip+=r.skip;continue;}let p=f.webkitRelativePath||f.name;if(strip&&root)p=p.split("/").slice(1).join("/");p=normalizePath(p);if(!p||binaryPath(p)||f.size>FILE_LIMIT||total+f.size>PROJECT_LIMIT){skip++;continue;}state.project.files[p]=await f.text();total+=f.size;n++;}catch(_){skip++;}}if(n){const next=Object.keys(state.project.files).find(x=>!state.tabs.includes(x));if(next)openFile(next);renderTree();renderTabs();await saveProject(true);}notify(n+" file(s) imported",skip?skip+" item(s) skipped due to type/path/size limits.":"Project updated.");}
function exportFile(){if(!state.project||!state.activeFile)return;syncEditor();download(new Blob([state.project.files[state.activeFile]],{type:"text/plain;charset=utf-8"}),state.activeFile.split("/").pop());notify("Source file exported",state.activeFile);}
async function exportProject(){if(!state.project)return;syncEditor();const manifest={format:"kerno-project",version:1,id:state.project.id,name:state.project.name,config:state.project.config,files:state.project.files,createdAt:state.project.createdAt,exportedAt:new Date().toISOString()};if(!window.JSZip){download(new Blob([JSON.stringify(manifest,null,2)],{type:"application/json"}),safeName(state.project.name)+".kerno-project.json");return;}const z=new JSZip();Object.entries(state.project.files).forEach(([p,v])=>z.file(p,v));z.file("KernoProject.json",JSON.stringify(manifest,null,2));download(await z.generateAsync({type:"blob",compression:"DEFLATE"}),safeName(state.project.name)+".kerno.zip");notify("Project archive exported",Object.keys(state.project.files).length+" files included.");}
function cleanProjectFiles(files){const out={};let size=0;Object.entries(files).forEach(([raw,text])=>{const p=normalizePath(raw);if(!p||binaryPath(p)||typeof text!=="string")return;const n=new Blob([text]).size;if(n>FILE_LIMIT||size+n>PROJECT_LIMIT)return;size+=n;out[p]=text;});return out;}
async function renderSettings(category){
  state.category=category;
  $$(".settings-nav-item").forEach(button=>button.classList.toggle("active",button.dataset.category===category));
  const titleKeys={architecture:"osArchitecture",boot:"bootSettings",diagnostics:"diagnostics",accessibility:"accessibility",shortcuts:"shortcuts"};
  $("#settingsTitle").textContent=tr(titleKeys[category]||category);
  $("#settingsEyebrow").textContent=(category==="osArchitecture"?"OS & ARCHITECTURE":category).replace(/-/g," ").toUpperCase();
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
  $("#settingsDescription").textContent=descriptions[category]||"Configure the Kerno development environment.";
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
  const languageItems=[["auto","System default"],["en","English"],["id","Bahasa Indonesia"],["ms","Bahasa Melayu"],["zh","简体中文"],["ja","日本語"],["ko","한국어"],["de","Deutsch"],["fr","Français"],["es","Español"],["pt","Português"],["ru","Русский"],["tr","Türkçe"],["ar","العربية"],["hi","हिन्दी"],["it","Italiano"]];
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
      row("Reduce motion","Reduce transitions and animated interface movement.",check("reduceMotion"))
    );
  }

  if(category==="language"){
    html=group("Global language",
      row("Interface language","Changes the main navigation and the supported interface labels.",select("locale",languageItems))+
      row("Code language","Programming syntax and compiler diagnostics are never translated.",'<strong class="setting-value">Source-defined</strong>')
    , "English and Bahasa Indonesia have the broadest interface coverage in this build. Technical identifiers, compiler output and some advanced descriptions remain in English.");
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
      row("Reduce motion","Reduce non-essential transitions.",check("reduceMotion"))+
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

  if(state.settings.locale==="id"){
    const dictionary={
      "Workspace behavior":"Perilaku workspace","Automatic save":"Simpan otomatis","Save delay":"Jeda penyimpanan",
      "Confirm destructive actions":"Konfirmasi tindakan destruktif","Startup screen":"Tampilan awal",
      "Default project template":"Template proyek default","Project limits":"Batas proyek",
      "Maximum source size":"Ukuran maksimum source","Per-file limit":"Batas per file",
      "Storage engine":"Mesin penyimpanan","Interface appearance":"Tampilan antarmuka",
      "Color theme":"Tema warna","Accent color":"Warna aksen","Interface density":"Kepadatan antarmuka",
      "Interface scale":"Skala antarmuka","Reduce motion":"Kurangi animasi",
      "Global language":"Bahasa global","Editor preferences":"Preferensi editor",
      "Typography and layout":"Tipografi dan tata letak","Editing behavior":"Perilaku penyuntingan",
      "Editor font family":"Keluarga font editor","Editor font size":"Ukuran font editor",
      "Tab width":"Lebar tab","Word wrap":"Pembungkusan baris","Line numbers":"Nomor baris",
      "Minimap":"Minimap","Cursor style":"Gaya kursor","Smooth scrolling":"Pengguliran halus",
      "Bracket pair colors":"Warna pasangan kurung","Whitespace marks":"Penanda whitespace",
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
      "High contrast focus":"Fokus kontras tinggi","Keyboard shortcuts":"Pintasan keyboard",
      "Keyboard Shortcuts":"Pintasan Keyboard","Open source project or import files":"Buka proyek atau impor file",
      "Apply settings":"Terapkan pengaturan","Dark":"Gelap","Light":"Terang",
      "Automatic":"Otomatis","Disabled":"Dinonaktifkan","Headless / serial only":"Headless / serial saja",
      "Check host capacity":"Periksa kapasitas host","Estimate host capacity":"Estimasi kapasitas host",
      "Source code and compiler output are not translated.":"Kode sumber dan output compiler tidak diterjemahkan."
    };
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
function settingChanged(e){const el=e.target,k=el.dataset.setting;if(!k)return;state.settings[k]=el.type==="checkbox"?el.checked:el.type==="number"?Number(el.value):el.value;if(k==="locale"){translate();renderSettings(state.category);return;}if(k==="theme")applyTheme();if(k==="accent")applyAccent();if(k==="density")applyDensity();if(["editorFontSize","editorFontFamily","tabSize","wordWrap","lineNumbers","minimap","cursorStyle","smoothScrolling","bracketPairColorization","renderWhitespace"].includes(k))applyEditorSettings();if(["guestMemoryMiB","heapReserveMiB","stackReserveKiB"].includes(k))renderMemory();}
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
function switchWorkspace(name){["source","machine","build"].forEach(x=>$("#"+x+"Workspace").classList.toggle("hidden",x!==name));$$(".workspace-nav-item").forEach(b=>b.classList.toggle("active",b.dataset.workspace===name));if(name==="machine"&&!state.localConnected)renderMachineEmpty(tr("connectQemuPrompt"));if(name==="build")renderBuild();if(name==="source"){state.editor&&state.editor.layout();state.splitEditor&&state.splitEditor.layout();}}
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
      setServiceStatus(true,state.kernelEntryConfirmed?"QEMU running · kernel entry confirmed":"QEMU running · checking kernel entry");
      if(result.displayUrl&&state.currentDisplayUrl!==result.displayUrl)showDisplay(result.displayUrl);
      const serial=String(result.serialOutput||"");
      if(serial!==state.lastSerialOutput){
        state.lastSerialOutput=serial;
        $("#serialOutput").textContent=serial||"Waiting for serial output…";
        const consolePanel=$("#serialOutput");if(consolePanel)consolePanel.scrollTop=consolePanel.scrollHeight;
        verifyBootMarker(serial);
      }
      if(!state.kernelEntryConfirmed){
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
      stopQemuPolling();
      if(window.KernoNoVNC)window.KernoNoVNC.disconnect();
      state.currentDisplayUrl="";
      state.lastSerialOutput="";
      state.qemuStartedAt=0;
      state.qemuBootTimeoutShown=false;
      if(!state.kernelEntryConfirmed)$("#buildStateLabel").textContent="QEMU STOPPED · KERNEL ENTRY NOT CONFIRMED";
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
$("#welcomeNewProject").onclick=()=>{state.newProjectReturn="welcome";syncWizardDefaults();show("newProject");};$("#landingFeaturesButton").onclick=()=>scrollLandingTo("platformSection");
$("#landingWorkflowButton").onclick=()=>scrollLandingTo("workflowSection");
$("#landingTutorialButton").onclick=openTutorial;
$("#heroStartButton").onclick=()=>{state.newProjectReturn="welcome";syncWizardDefaults();show("newProject");};
$("#heroTutorialButton").onclick=openTutorial;
$("#workflowTutorialButton").onclick=openTutorial;
$("#isoTutorialButton").onclick=()=>{openTutorial();requestAnimationFrame(()=>$("#tutorial-stage-7").scrollIntoView({behavior:"smooth",block:"start"}));};$("#footerTutorialButton").onclick=openTutorial;
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