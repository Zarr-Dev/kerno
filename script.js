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
  editorFontSize:13, tabSize:4, wordWrap:"off", lineNumbers:true, minimap:false,
  defaultArchitecture:"x86_64", defaultFirmware:"bios", defaultBootloader:"grub",
  defaultKernelLanguage:"cpp", optimization:"debug",
  guestMemoryMiB:512, heapReserveMiB:16, stackReserveKiB:512, pageSize:"4KiB", kernelBase:"0x00100000",
  qemuBinary:"qemu-system-x86_64", qemuMachine:"q35", qemuDisplay:"std", qemuVcpus:2,
  qemuVncPort:5901, qemuAcceleration:"auto",
  localServiceUrl:"http://127.0.0.1:8765", localServiceToken:"",
  assembler:"nasm", crossCompiler:"x86_64-elf-g++", linker:"x86_64-elf-ld", isoBuilder:"grub-mkrescue"
};

const LANGUAGES = {
  en:{startArrow:"Start a project →",openWorkspace:"Open workspace →",openSettings:"Open settings →",workspaceHistory:"WORKSPACE HISTORY",clearHistory:"Clear history",noAccount:"No account required · Project data stays in this browser until exported",newOsWorkspace:"New operating system workspace",newOsLead:"Choose the machine target and kernel foundation. Kerno creates the initial source tree and project configuration.",scaffoldNote:"These are editable source files. A verified boot image still requires a matching native toolchain and boot protocol.",machineDesc:"Live guest output is streamed from the connected local QEMU service.",buildConfiguration:"Build configuration",buildConfigurationDesc:"Review the target before invoking the connected native build service.",settings:"Settings",back:"Back",welcomeTitle:"Build your operating system.",welcomeSubtitle:"A focused environment for kernel source, machine configuration, memory planning and emulator workflows.",newProject:"New project",newProjectDesc:"Create a structured OS workspace from a kernel template.",loadProject:"Load project",loadProjectDesc:"Open a Kerno archive, project manifest or source directory.",configureIDE:"Configure IDE",configureDesc:"Set language, appearance, editor behavior and local tools.",recentProjects:"Recent projects",noRecent:"No recent projects",noRecentDesc:"Create or load an OS project to begin.",createWorkspace:"Create workspace",projectName:"Project name",starterTemplate:"Starter template",architecture:"Architecture",firmware:"Firmware",kernelLanguage:"Kernel language",bootloader:"Bootloader",guestMemory:"Guest RAM (MiB)",virtualCpus:"Virtual CPUs",applySettings:"Apply settings",general:"General",appearance:"Appearance",language:"Language",editor:"Editor",osArchitecture:"OS & Architecture",memory:"Memory",emulator:"QEMU & Emulator",toolchain:"Toolchain",storage:"Storage & Data",advanced:"Advanced",source:"Source",machine:"Machine",build:"Build",importFiles:"Import files",exportProject:"Export project",buildBoot:"Build & Boot",projectFiles:"Project files",cancel:"Cancel",machineDisplay:"Machine display",noMachineSession:"No machine session",connectQemuPrompt:"Connect Kerno Local Service to launch and display a QEMU guest."},
  id:{settings:"Pengaturan",back:"Kembali",welcomeTitle:"Bangun sistem operasi milikmu.",welcomeSubtitle:"Lingkungan terfokus untuk source kernel, konfigurasi mesin, perencanaan memori, dan emulator.",newProject:"Proyek baru",newProjectDesc:"Buat workspace OS terstruktur dari template kernel.",loadProject:"Muat proyek",loadProjectDesc:"Buka arsip Kerno atau direktori source.",configureIDE:"Konfigurasi IDE",configureDesc:"Atur bahasa, tampilan, editor, dan tool lokal.",recentProjects:"Proyek terbaru",noRecent:"Belum ada proyek",noRecentDesc:"Buat atau muat proyek OS untuk memulai.",createWorkspace:"Buat workspace",projectName:"Nama proyek",starterTemplate:"Template awal",architecture:"Arsitektur",firmware:"Firmware",kernelLanguage:"Bahasa kernel",bootloader:"Bootloader",guestMemory:"RAM guest (MiB)",virtualCpus:"CPU virtual",applySettings:"Terapkan pengaturan",general:"Umum",appearance:"Tampilan",language:"Bahasa",editor:"Editor",osArchitecture:"OS & Arsitektur",memory:"Memori",emulator:"QEMU & Emulator",toolchain:"Toolchain",storage:"Penyimpanan & Data",advanced:"Lanjutan",source:"Source",machine:"Mesin",build:"Build",importFiles:"Impor file",exportProject:"Ekspor proyek",buildBoot:"Build & Boot",projectFiles:"File proyek",cancel:"Batal",machineDisplay:"Tampilan mesin",noMachineSession:"Belum ada sesi mesin",connectQemuPrompt:"Hubungkan Kerno Local Service untuk menjalankan guest QEMU."},
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

const state={settings:Object.assign({},DEFAULTS),project:null,recent:[],screen:"welcome",settingsReturn:"welcome",category:"general",models:{},editor:null,splitEditor:null,activeFile:null,tabs:[],splitFile:null,localConnected:false};
function tr(k){return (LANGUAGES[state.settings.locale]&&LANGUAGES[state.settings.locale][k])||LANGUAGES.en[k]||k;}
function translate(){ $$("[data-i18n]").forEach(n=>n.textContent=tr(n.dataset.i18n));document.documentElement.lang=state.settings.locale;document.documentElement.dir=state.settings.locale==="ar"?"rtl":"ltr"; }
function notify(a,b){const n=document.createElement("div");n.className="toast";n.textContent=a;if(b){const s=document.createElement("small");s.textContent=b;n.append(s);}$("#toastRegion").append(n);setTimeout(()=>n.remove(),3500);}
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
function langOf(path){const e=path.split(".").pop().toLowerCase();if(["asm","s","inc"].includes(e))return "kerno-asm";if(["c","h"].includes(e))return "c";if(["cpp","cc","cxx","hpp","hh","hxx"].includes(e))return "cpp";if(e==="ld")return "kerno-linker";if(e==="json")return "json";if(e==="md")return "markdown";if(["cfg","ini"].includes(e))return "ini";return "plaintext";}
function langLabel(p){return ({"kerno-asm":"Assembly / NASM",cpp:"C++",c:"C","kerno-linker":"Linker Script",json:"JSON",markdown:"Markdown",ini:"GRUB Config",plaintext:"Text"})[langOf(p)]||"Text";}
function fileBadge(p){const x=langOf(p);return x==="kerno-asm"?["A","mark-asm"]:x==="cpp"||x==="c"?["C","mark-cpp"]:x==="json"?["{}","mark-json"]:x==="ini"?["≡","mark-config"]:x==="kerno-linker"?["L","mark-linker"]:["·","mark-doc"];}
function show(name){state.screen=name;["welcome","newProject","settings","app"].forEach(x=>$("#"+x+"Screen").classList.toggle("hidden",x!==name));if(name==="welcome")refreshRecent();}
function emptyRecent(){const d=document.createElement("div");d.className="recent-empty";d.innerHTML="<span>⌁</span><div><strong></strong><p></p></div>";$("strong",d).textContent=tr("noRecent");$("p",d).textContent=tr("noRecentDesc");return d;}
async function refreshRecent(){try{const hidden=await get("meta","hiddenRecent");const hiddenIds=new Set(hidden&&hidden.value||[]);state.recent=(await all("projects")).filter(p=>!hiddenIds.has(p.id)).sort((a,b)=>b.updatedAt-a.updatedAt).slice(0,12);}catch(_){state.recent=[];}const host=$("#recentProjects");host.innerHTML="";if(!state.recent.length){host.append(emptyRecent());return;}state.recent.forEach(p=>{const b=document.createElement("button");b.className="recent-item";b.innerHTML='<span class="recent-icon">K</span><span class="recent-copy"><strong></strong><small></small></span><span class="recent-open">OPEN →</span>';$("strong",b).textContent=p.name;$("small",b).textContent=(p.config.architecture||"unknown")+" · "+Object.keys(p.files).length+" files · "+new Date(p.updatedAt).toLocaleDateString();b.onclick=()=>loadProject(p.id);host.append(b);});}
function configFor(name){const s=state.settings;return {name:name,architecture:s.defaultArchitecture,firmware:s.defaultFirmware,bootloader:s.defaultBootloader,kernelLanguage:s.defaultKernelLanguage,optimization:s.optimization,memory:{guestMiB:s.guestMemoryMiB,heapReserveMiB:s.heapReserveMiB,stackReserveKiB:s.stackReserveKiB,pageSize:s.pageSize,kernelBase:s.kernelBase},qemu:{binary:s.qemuBinary,machine:s.qemuMachine,display:s.qemuDisplay,vcpus:s.qemuVcpus,vncPort:s.qemuVncPort,acceleration:s.qemuAcceleration}};}
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
"set timeout=3","set default=0","","menuentry '"+c.name+"' {",
"    multiboot2 /boot/kernel.elf","    boot","}",""
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
"#include \"kernel/pmm.h\"","#include \"kernel/interrupts.h\"",
"#ifdef __cplusplus","extern \"C\"","#endif",
"void kernel_main(uint32_t boot_magic, uintptr_t boot_info) {",
"    kerno_serial_initialize();",
"    kerno_console_initialize();",
"    kerno_console_write(\"KERNO kernel entry reached.\\n\");",
"    kerno_serial_write(\"KERNO: kernel entry reached.\\r\\n\");",
"    if (boot_magic != KERNO_MULTIBOOT2_BOOT_MAGIC) {",
"        kerno_serial_write(\"KERNO: invalid Multiboot2 boot magic.\\r\\n\");",
"        for (;;) { __asm__ volatile (\"hlt\"); }",
"    }",
"    if (kerno_pmm_initialize(boot_magic, boot_info)) {",
"        kerno_serial_write(\"KERNO: physical memory map initialized.\\r\\n\");",
"        kerno_console_write(\"Physical memory map initialized.\\n\");",
"    } else {",
"        kerno_serial_write(\"KERNO: memory map unavailable; PMM is offline.\\r\\n\");",
"        kerno_console_write(\"Memory map unavailable; PMM offline.\\n\");",
"    }",
"    kerno_interrupts_initialize();",
"    kerno_serial_write(\"KERNO: IDT installed; external interrupts remain disabled.\\r\\n\");",
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
"static uint32_t free_frame_count=0;",
"static int pmm_ready=0;",
"static void frame_mark(uint64_t frame,int used){uint8_t mask=(uint8_t)(1u<<(frame&7u));uint8_t* cell=&frame_bitmap[frame>>3u];if(used){if(!(*cell&mask)){*cell|=mask;if(free_frame_count) --free_frame_count;}}else{if(*cell&mask){*cell&=(uint8_t)~mask;++free_frame_count;}}}",
"static void reserve_range(uint64_t start,uint64_t end){if(end>KERNO_PMM_LIMIT)end=KERNO_PMM_LIMIT;if(start>=end)return;uint64_t first=start/KERNO_FRAME_SIZE;uint64_t last=(end+KERNO_FRAME_SIZE-1u)/KERNO_FRAME_SIZE;for(uint64_t frame=first;frame<last&&frame<KERNO_FRAME_COUNT;++frame)frame_mark(frame,1);}",
"int kerno_pmm_initialize(uint32_t boot_magic,uintptr_t boot_info){",
"    if(boot_magic!=KERNO_MULTIBOOT2_BOOT_MAGIC||!boot_info)return 0;",
"    kerno_memset(frame_bitmap,0xFF,(size_t)KERNO_BITMAP_BYTES);free_frame_count=0;",
"    const kerno_mb2_info_t* info=(const kerno_mb2_info_t*)boot_info;",
"    if(info->total_size<16u||info->total_size>1024u*1024u)return 0;",
"    const uint8_t* cursor=(const uint8_t*)boot_info+8u;const uint8_t* limit=(const uint8_t*)boot_info+info->total_size;int found=0;",
"    while(cursor+8u<=limit){const kerno_mb2_tag_t* tag=(const kerno_mb2_tag_t*)cursor;if(tag->size<8u||cursor+tag->size>limit)break;if(tag->type==0u)break;",
"      if(tag->type==6u&&tag->size>=16u){const kerno_mb2_mmap_tag_t* map=(const kerno_mb2_mmap_tag_t*)tag;if(map->entry_size<sizeof(kerno_mb2_mmap_entry_t))return 0;const uint8_t* item=cursor+16u;const uint8_t* end=cursor+tag->size;while(item+map->entry_size<=end){const kerno_mb2_mmap_entry_t* entry=(const kerno_mb2_mmap_entry_t*)item;if(entry->type==1u&&entry->length&&entry->address<KERNO_PMM_LIMIT&&entry->address+entry->length>entry->address){uint64_t start=(entry->address+KERNO_FRAME_SIZE-1u)&~(KERNO_FRAME_SIZE-1u);uint64_t finish=entry->address+entry->length;if(finish>KERNO_PMM_LIMIT)finish=KERNO_PMM_LIMIT;uint64_t last=finish/KERNO_FRAME_SIZE;for(uint64_t frame=start/KERNO_FRAME_SIZE;frame<last&&frame<KERNO_FRAME_COUNT;++frame)frame_mark(frame,0);found=1;}item+=map->entry_size;}}",
"      uint64_t next=((uint64_t)(uintptr_t)cursor+tag->size+7u)&~7ULL;if(next<=(uint64_t)(uintptr_t)cursor)break;cursor=(const uint8_t*)(uintptr_t)next;",
"    }",
"    if(!found)return 0;reserve_range(0,0x100000ULL);reserve_range((uintptr_t)&__kernel_start,(uintptr_t)&__kernel_end);pmm_ready=1;return 1;",
"}",
"uintptr_t kerno_pmm_allocate_frame(void){if(!pmm_ready)return 0;for(uint64_t frame=256u;frame<KERNO_FRAME_COUNT;++frame){if(!(frame_bitmap[frame>>3u]&(uint8_t)(1u<<(frame&7u)))){frame_mark(frame,1);return (uintptr_t)(frame*KERNO_FRAME_SIZE);}}return 0;}",
"int kerno_pmm_release_frame(uintptr_t address){if(!pmm_ready||address<0x100000u||(address&(KERNO_FRAME_SIZE-1u))||address>=KERNO_PMM_LIMIT)return 0;uint64_t frame=(uint64_t)address/KERNO_FRAME_SIZE;if(!(frame_bitmap[frame>>3u]&(uint8_t)(1u<<(frame&7u))))return 0;frame_mark(frame,0);return 1;}",
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
function ensureModel(path){if(!window.monaco||!state.project||!(path in state.project.files))return null;if(state.models[path])return state.models[path];const uri=window.monaco.Uri.parse("file:///kerno/"+path.split("/").map(encodeURIComponent).join("/"));const m=window.monaco.editor.getModel(uri)||window.monaco.editor.createModel(state.project.files[path],langOf(path),uri);m.onDidChangeContent(()=>{state.project.files[path]=m.getValue();$("#editorStatus").textContent="Modified · local autosave scheduled";if(state.settings.autosave){clearTimeout(state.saveTimer);state.saveTimer=setTimeout(()=>saveProject(true),900);}});state.models[path]=m;return m;}
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
function closeTab(path){state.tabs=state.tabs.filter(x=>x!==path);if(state.activeFile===path)state.activeFile=state.tabs[0]||Object.keys(state.project.files)[0]||null;renderTabs();renderEditor();}
function disposeEditors(){Object.values(state.models).forEach(m=>{try{m.dispose();}catch(_){}});state.models={};if(state.editor){state.editor.dispose();state.editor=null;}if(state.splitEditor){state.splitEditor.dispose();state.splitEditor=null;}}
function defineLanguages(m){m.languages.register({id:"kerno-asm",extensions:[".asm",".s",".inc"],aliases:["NASM","Assembly"]});m.languages.setMonarchTokensProvider("kerno-asm",{tokenizer:{root:[[/;.*$/,"comment"],[/\b(section|global|extern|align|times|bits|default|db|dw|dd|dq|resb|resw|resd|equ)\b/i,"keyword"],[/\b(mov|add|sub|mul|div|cmp|jmp|je|jne|call|ret|push|pop|cli|sti|hlt|xor|lea|int|and|or|in|out|test|shl|shr)\b/i,"keyword"],[/\b(rax|rbx|rcx|rdx|rsi|rdi|rsp|rbp|eax|ebx|ecx|edx|ax|bx|cx|dx|al|ah)\b/i,"variable"],[/0x[0-9a-f]+|\b\d+\b/i,"number"],[/\.[\w.]+/,"type"],[/\b[\w]+:/,"type"]]}});m.languages.register({id:"kerno-linker",extensions:[".ld"],aliases:["Linker Script"]});m.languages.setMonarchTokensProvider("kerno-linker",{tokenizer:{root:[[/\/\*.*?\*\//,"comment"],[/\/\/.*$/,"comment"],[/\b(ENTRY|SECTIONS|KEEP|ALIGN|PROVIDE|ASSERT|ORIGIN|LENGTH)\b/,"keyword"],[/\.[\w.]+/,"type"],[/0x[0-9a-f]+|\b\d+[kKmM]?\b/i,"number"]]}});}
function defineThemes(m){m.editor.defineTheme("kerno-dark",{base:"vs-dark",inherit:true,rules:[{token:"comment",foreground:"778B9B",fontStyle:"italic"},{token:"keyword",foreground:"C5A4DF"},{token:"string",foreground:"A8D3B3"},{token:"number",foreground:"DDB77B"},{token:"type",foreground:"8CB9ED"},{token:"variable",foreground:"8DC8B2"}],colors:{"editor.background":"#0E141B","editor.foreground":"#E1E9F0","editorLineNumber.foreground":"#526476","editorLineNumber.activeForeground":"#C7D2DC","editor.lineHighlightBackground":"#17212A","editor.selectionBackground":"#3A586F88","editorCursor.foreground":"#A4D4BE","editorIndentGuide.background1":"#263440","editorIndentGuide.activeBackground1":"#557C6B","editorWidget.background":"#1C2833"}});m.editor.defineTheme("kerno-light",{base:"vs",inherit:true,rules:[{token:"comment",foreground:"788A96",fontStyle:"italic"},{token:"keyword",foreground:"8C50A8"},{token:"string",foreground:"357A51"},{token:"number",foreground:"9B641B"},{token:"type",foreground:"2767A5"}],colors:{"editor.background":"#FFFFFF","editor.foreground":"#263540","editorLineNumber.foreground":"#9BA8B2","editorLineNumber.activeForeground":"#526372","editor.lineHighlightBackground":"#F1F6F5","editorCursor.foreground":"#26795E"}});}
function monacoOptions(model){return {model,theme:state.settings.theme==="light"?"kerno-light":"kerno-dark",automaticLayout:true,fontFamily:"'DM Mono',Consolas,monospace",fontSize:Number(state.settings.editorFontSize),lineHeight:22,minimap:{enabled:!!state.settings.minimap},padding:{top:15,bottom:18},scrollBeyondLastLine:false,renderLineHighlight:"line",cursorBlinking:"smooth",smoothScrolling:true,tabSize:Number(state.settings.tabSize),wordWrap:state.settings.wordWrap,lineNumbers:state.settings.lineNumbers?"on":"off",glyphMargin:false,folding:true,bracketPairColorization:{enabled:true},guides:{indentation:true}};}
async function initMonaco(){if(!state.project)return;try{if(!monacoLoad)monacoLoad=new Promise((resolve,reject)=>{if(!window.require){reject(Error("Monaco loader unavailable"));return;}window.require.config({paths:{vs:"https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs"}});window.MonacoEnvironment={getWorkerUrl:()=> "data:text/javascript;charset=utf-8,"+encodeURIComponent("self.MonacoEnvironment={baseUrl:'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/'};importScripts('https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs/base/worker/workerMain.js');")};window.require(["vs/editor/editor.main"],()=>resolve(window.monaco),reject);});const m=await monacoLoad;defineLanguages(m);defineThemes(m);Object.keys(state.project.files).forEach(ensureModel);if(!state.editor){state.editor=m.editor.create($("#monacoPane"),monacoOptions(ensureModel(state.activeFile)));state.editor.onDidChangeCursorPosition(e=>$("#cursorPosition").textContent="Ln "+e.position.lineNumber+", Col "+e.position.column);}else if(state.activeFile)state.editor.setModel(ensureModel(state.activeFile));$("#plainEditor").style.display="none";if(!$("#splitPane").classList.contains("hidden"))openSplit();applyEditorSettings();}catch(e){$("#plainEditor").style.display=state.activeFile?"block":"none";if(state.activeFile)$("#plainEditor").value=state.project.files[state.activeFile];$("#editorStatus").textContent="Basic editor active · Monaco unavailable";}}
function applyEditorSettings(){[state.editor,state.splitEditor].forEach(e=>{if(e)e.updateOptions({fontSize:Number(state.settings.editorFontSize),tabSize:Number(state.settings.tabSize),wordWrap:state.settings.wordWrap,lineNumbers:state.settings.lineNumbers?"on":"off",minimap:{enabled:!!state.settings.minimap}});});if(window.monaco&&state.editor)window.monaco.editor.setTheme(state.settings.theme==="light"?"kerno-light":"kerno-dark");}
function openSplit(){if(!window.monaco||!state.editor)return;$("#splitPane").classList.remove("hidden");const paths=Object.keys(state.project.files);state.splitFile=state.splitFile&&state.project.files[state.splitFile]!==undefined?state.splitFile:(paths.find(x=>x!==state.activeFile)||state.activeFile);const sel=$("#splitFileSelect");sel.innerHTML="";paths.forEach(path=>{const o=document.createElement("option");o.value=path;o.textContent=path;o.selected=path===state.splitFile;sel.append(o);});if(!state.splitEditor)state.splitEditor=window.monaco.editor.create($("#splitMonacoPane"),monacoOptions(ensureModel(state.splitFile)));else state.splitEditor.setModel(ensureModel(state.splitFile));}
function toggleSplit(){if($("#splitPane").classList.contains("hidden"))openSplit();else $("#splitPane").classList.add("hidden");}
async function openProject(){show("app");$("#activeProjectName").textContent=state.project.name;$("#activeTargetChip").textContent=state.project.config.architecture+" · "+state.project.config.bootloader.toUpperCase();$("#plainEditor").style.display="none";state.activeFile=null;disposeEditors();state.tabs=[];state.activeFile=Object.keys(state.project.files).find(x=>/kernel\.(c|cpp)$/.test(x))||Object.keys(state.project.files)[0]||null;state.tabs=state.activeFile?[state.activeFile]:[];state.splitFile=Object.keys(state.project.files).find(x=>x!==state.activeFile)||state.activeFile;renderTree();renderTabs();renderEditor();renderMachine();renderBuild();renderMemory();initMonaco();await saveProject(true);}
async function loadProject(id){try{state.project=await get("projects",id);if(!state.project)throw Error("Project not found in browser storage.");const hidden=await get("meta","hiddenRecent");const ids=(hidden&&hidden.value||[]).filter(x=>x!==id);await put("meta",{key:"hiddenRecent",value:ids});await openProject();}catch(e){notify("Could not load project",e.message);}}
function createSourceFile(){if(!state.project)return;const path=normalizePath(prompt("New source path (example: src/interrupts.cpp)","src/new_module.cpp"));if(!path)return;if(!/^[\w./-]+$/.test(path)||state.project.files[path]!==undefined){notify("Invalid or existing file path");return;}const ext=path.split(".").pop().toLowerCase();state.project.files[path]=["asm","s","inc"].includes(ext)?"; New NASM source\nBITS 32\nSECTION .text\n":["c","cpp","h","hpp"].includes(ext)?"#include <stdint.h>\n\n// New kernel module\n":"";state.tabs.push(path);openFile(path);saveProject(true);notify("Source file created",path);}
function binaryPath(p){return /\.(iso|elf|bin|o|a|so|dll|exe|png|jpe?g|gif|webp|ico|pdf|mp3|mp4|woff2?|ttf)$/i.test(p);}
async function importZip(file){if(!window.JSZip)throw Error("ZIP library unavailable.");const zip=await JSZip.loadAsync(file);let n=0,skip=0,total=fileSize(state.project);const entries=[];zip.forEach((p,e)=>{if(!e.dir)entries.push([p,e]);});for(const [raw,e] of entries){const p=normalizePath(raw);if(!p||binaryPath(p)||p==="KernoProject.json"){skip++;continue;}const content=await e.async("string"),size=new Blob([content]).size;if(size>FILE_LIMIT||total+size>PROJECT_LIMIT){skip++;continue;}total+=size;state.project.files[p]=content;n++;}const m=zip.file("KernoProject.json");if(m){try{const data=JSON.parse(await m.async("string"));if(data.config)state.project.config=Object.assign(state.project.config,data.config);if(data.name)state.project.name=data.name;}catch(_){}}return {n,skip};}
async function importMany(list,strip){const files=Array.from(list||[]);let n=0,skip=0,total=fileSize(state.project);const root=files.length&&files.every(f=>f.webkitRelativePath)&&files.map(f=>f.webkitRelativePath.split("/")[0]).every(x=>x===files[0].webkitRelativePath.split("/")[0])?files[0].webkitRelativePath.split("/")[0]:"";for(const f of files){try{if(/\.(zip|kerno)$/i.test(f.name)){const r=await importZip(f);n+=r.n;skip+=r.skip;continue;}let p=f.webkitRelativePath||f.name;if(strip&&root)p=p.split("/").slice(1).join("/");p=normalizePath(p);if(!p||binaryPath(p)||f.size>FILE_LIMIT||total+f.size>PROJECT_LIMIT){skip++;continue;}state.project.files[p]=await f.text();total+=f.size;n++;}catch(_){skip++;}}if(n){const next=Object.keys(state.project.files).find(x=>!state.tabs.includes(x));if(next)openFile(next);renderTree();renderTabs();await saveProject(true);}notify(n+" file(s) imported",skip?skip+" item(s) skipped due to type/path/size limits.":"Project updated.");}
function exportFile(){if(!state.project||!state.activeFile)return;syncEditor();download(new Blob([state.project.files[state.activeFile]],{type:"text/plain;charset=utf-8"}),state.activeFile.split("/").pop());notify("Source file exported",state.activeFile);}
async function exportProject(){if(!state.project)return;syncEditor();const manifest={format:"kerno-project",version:1,id:state.project.id,name:state.project.name,config:state.project.config,files:state.project.files,createdAt:state.project.createdAt,exportedAt:new Date().toISOString()};if(!window.JSZip){download(new Blob([JSON.stringify(manifest,null,2)],{type:"application/json"}),safeName(state.project.name)+".kerno-project.json");return;}const z=new JSZip();Object.entries(state.project.files).forEach(([p,v])=>z.file(p,v));z.file("KernoProject.json",JSON.stringify(manifest,null,2));download(await z.generateAsync({type:"blob",compression:"DEFLATE"}),safeName(state.project.name)+".kerno.zip");notify("Project archive exported",Object.keys(state.project.files).length+" files included.");}
function cleanProjectFiles(files){const out={};let size=0;Object.entries(files).forEach(([raw,text])=>{const p=normalizePath(raw);if(!p||binaryPath(p)||typeof text!=="string")return;const n=new Blob([text]).size;if(n>FILE_LIMIT||size+n>PROJECT_LIMIT)return;size+=n;out[p]=text;});return out;}
async function renderSettings(category){state.category=category;$$(".settings-nav-item").forEach(b=>b.classList.toggle("active",b.dataset.category===category));$("#settingsTitle").textContent=tr(category==="architecture"?"osArchitecture":category);$("#settingsEyebrow").textContent=category.toUpperCase();$("#settingsDescription").textContent=catDesc[category]||"";const host=$("#settingsFields");const option=(k,v,label)=>'<option value="'+v+'" '+(state.settings[k]===v?"selected":"")+'>'+label+'</option>';const select=(k,arr)=>'<select data-setting="'+k+'">'+arr.map(x=>option(k,x[0],x[1])).join("")+'</select>';const escAttr=v=>String(v??"").replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;");const input=(k,type,min,max,step)=>'<input data-setting="'+k+'" type="'+type+'" value="'+escAttr(state.settings[k])+'" '+(min!==undefined?'min="'+min+'"':"")+' '+(max!==undefined?'max="'+max+'"':"")+' '+(step!==undefined?'step="'+step+'"':"")+'/>';const check=k=>'<input data-setting="'+k+'" type="checkbox" '+(state.settings[k]?"checked":"")+'/>';const row=(label,desc,control)=>'<div class="setting-row"><div class="setting-copy"><strong>'+label+'</strong><small>'+desc+'</small></div>'+control+'</div>';const group=(title,content)=>'<section class="settings-group"><h3>'+title+'</h3>'+content+'</section>';let html="";
if(category==="general")html=group("Workspace behavior",row("Auto-save","Persist source edits to browser storage after a short idle period.",check("autosave"))+row("Confirm destructive actions","Ask before clearing stored project data.",check("confirmDestructive"))+row("Startup screen","Choose how Kerno opens.",select("startScreen",[["welcome","Welcome / project picker"],["lastProject","Resume last project"]])));
if(category==="appearance")html=group("Interface appearance",row("Theme","Apply to the complete IDE and editor.",select("theme",[["dark","Dark"],["light","Light"]]))+row("Accent color","Focus, active states and status highlights.",select("accent",[["sage","Sage green"],["cyan","Cyan"],["blue","Blue"],["amber","Amber"]]))+row("UI density","Spacing for menus, panels and forms.",select("density",[["compact","Compact"],["balanced","Balanced"],["comfortable","Comfortable"]])));
if(category==="language"){const langs=[["en","English"],["id","Bahasa Indonesia"],["ms","Bahasa Melayu"],["zh","简体中文"],["ja","日本語"],["ko","한국어"],["de","Deutsch"],["fr","Français"],["es","Español"],["pt","Português"],["ru","Русский"],["tr","Türkçe"],["ar","العربية"],["hi","हिन्दी"],["it","Italiano"]];html=group("Global language",row("Interface language","Change common Kerno navigation and workspace labels.",select("locale",langs)))+'<p class="setting-note">Source code and native compiler output are not translated.</p>';}
if(category==="editor")html=group("Editor preferences",row("Font size","Monaco editor font size.",input("editorFontSize","number",10,22,1))+row("Tab width","Spaces inserted when pressing Tab.",select("tabSize",[[2,"2 spaces"],[4,"4 spaces"],[8,"8 spaces"]]))+row("Word wrap","Wrap long source lines.",select("wordWrap",[["off","Off"],["on","On"]]))+row("Line numbers","Show line numbering.",check("lineNumbers"))+row("Minimap","Show source overview.",check("minimap")));
if(category==="architecture")html=group("Default OS target",row("Architecture","Target CPU for new projects.",select("defaultArchitecture",[["x86_64","x86_64"],["i686","i686"],["aarch64","AArch64"],["riscv64","RISC-V 64"]]))+row("Firmware","Boot firmware target.",select("defaultFirmware",[["bios","BIOS / legacy"],["uefi","UEFI"]]))+row("Bootloader","Boot handoff layer.",select("defaultBootloader",[["grub","GRUB"],["uefi-app","UEFI application"],["custom","Custom boot stage"]]))+row("Kernel language","Primary kernel language.",select("defaultKernelLanguage",[["cpp","C++"],["c","C"]]))+row("Optimization profile","Requested compiler profile.",select("optimization",[["debug","Debug (-O0)"],["size","Size (-Os)"],["speed","Speed (-O2)"]])));
if(category==="memory")html=group("Guest memory plan",row("Guest RAM (MiB)","RAM assigned to the VM, not physical host memory.",input("guestMemoryMiB","number",64,32768,64))+row("Kernel heap reserve (MiB)","Planning budget for dynamic allocations.",input("heapReserveMiB","number",1,8192,1))+row("Initial stack reserve (KiB)","Planning budget for boot stack.",input("stackReserveKiB","number",64,1048576,64))+row("Page size target","Page-table granularity target.",select("pageSize",[["4KiB","4 KiB"],["2MiB","2 MiB"],["1GiB","1 GiB"]]))+row("Kernel link base","Hexadecimal linker base address.",input("kernelBase","text")) )+'<section class="settings-group"><h3>Reservation summary</h3><div class="memory-meter"><span id="memoryMeterFill"></span></div><div class="memory-readout"><span id="memoryReservedLabel"></span><span id="memoryAvailableLabel"></span></div><p class="setting-note" id="memoryPlanNote">Guest plan only. This does not allocate host RAM or implement a kernel allocator.</p><div class="inline-actions"><button class="tool-button" id="estimateHostMemoryButton">Check host capacity</button><span class="setting-note" id="hostMemoryEstimate">Not checked</span></div></section>';
if(category==="emulator")html=group("QEMU profile",row("QEMU executable","Binary name resolved by local service.",input("qemuBinary","text"))+row("Machine model","Virtual board.",select("qemuMachine",[["q35","q35 · modern x86"],["pc","pc · legacy x86"],["virt","virt · ARM / RISC-V"]]))+row("Display","Virtual graphics backend.",select("qemuDisplay",[["std","Standard VGA"],["virtio","Virtio GPU"],["none","Headless"]]))+row("vCPU count","Virtual processor cores.",input("qemuVcpus","number",1,32,1))+row("VNC port","Local VNC display port.",input("qemuVncPort","number",5900,5999,1))+row("Acceleration","Host acceleration policy.",select("qemuAcceleration",[["auto","Automatic"],["kvm","KVM · Linux"],["whpx","WHPX · Windows"],["tcg","TCG · software"]])) )+'<p class="setting-note">The browser does not execute QEMU. The local service validates and manages the emulator process.</p>';
if(category==="toolchain")html=group("Native tools",row("Assembler","NASM executable.",input("assembler","text"))+row("Cross compiler","Target C/C++ compiler.",input("crossCompiler","text"))+row("Linker","Target linker.",input("linker","text"))+row("ISO packager","GRUB rescue or xorriso integration.",input("isoBuilder","text")))+'<div class="inline-actions"><button class="tool-button" id="checkToolchainButton">Check local toolchain</button><span class="setting-note" id="toolchainResult">Not checked</span></div>';
if(category==="storage")html=group("Browser-local data",'<div class="setting-row"><div class="setting-copy"><strong>Storage engine</strong><small>Project source is stored in this browser profile.</small></div><b>IndexedDB</b></div><div class="setting-row"><div class="setting-copy"><strong>Saved projects</strong><small>Local Kerno workspace count.</small></div><b id="storedProjectCount">—</b></div><div class="setting-row"><div class="setting-copy"><strong>Storage estimate</strong><small>Browser-provided quota estimate.</small></div><b id="browserStorageEstimate">Checking…</b></div>')+'<div class="inline-actions"><button class="tool-button" id="exportAllProjectsButton">Export all projects</button><button class="tool-button danger-button" id="clearProjectsButton">Delete all local projects</button></div><p class="setting-note">Export backups before clearing local project data.</p>';
if(category==="advanced")html=group("Local execution bridge",row("Service endpoint","Loopback URL for Kerno Local Service API.",input("localServiceUrl","url"))+row("Pairing token","Token printed when Kerno Local Service starts. Stored in browser settings.",input("localServiceToken","password")))+'<div class="inline-actions"><button class="tool-button" id="testLocalServiceButton">Test connection</button><span class="setting-note" id="localServiceResult">Not connected</span></div>'+group("Security boundaries",'<p class="setting-note">The browser never runs shell commands directly. The local service must validate paths and options, use an allow-listed toolchain, isolate build directories, cap resource use and terminate child processes on cancellation.</p>');
host.innerHTML=html;host.onchange=settingChanged;host.oninput=settingChanged;if(category==="memory")renderMemory();if(category==="storage")renderStorageSettings();$("#estimateHostMemoryButton")&&$("#estimateHostMemoryButton").addEventListener("click",refreshHostMemoryEstimate);$("#testLocalServiceButton")&&$("#testLocalServiceButton").addEventListener("click",testService);$("#checkToolchainButton")&&$("#checkToolchainButton").addEventListener("click",checkToolchain);$("#exportAllProjectsButton")&&$("#exportAllProjectsButton").addEventListener("click",exportAll);$("#clearProjectsButton")&&$("#clearProjectsButton").addEventListener("click",clearAllProjects);}
function settingChanged(e){const el=e.target,k=el.dataset.setting;if(!k)return;state.settings[k]=el.type==="checkbox"?el.checked:el.type==="number"?Number(el.value):el.value;if(k==="locale")translate();if(k==="theme")applyTheme();if(k==="accent")applyAccent();if(k==="density")applyDensity();if(["editorFontSize","tabSize","wordWrap","lineNumbers","minimap"].includes(k))applyEditorSettings();if(["guestMemoryMiB","heapReserveMiB","stackReserveKiB"].includes(k))renderMemory();}
function validateSettings(){const s=state.settings;for(const [k,min,max] of [["editorFontSize",10,22],["guestMemoryMiB",64,32768],["heapReserveMiB",1,8192],["stackReserveKiB",64,1048576],["qemuVcpus",1,32],["qemuVncPort",5900,5999]])if(!Number.isInteger(Number(s[k]))||s[k]<min||s[k]>max)throw Error(k+" is outside the permitted range.");if(s.heapReserveMiB+s.stackReserveKiB/1024+1>=s.guestMemoryMiB)throw Error("Kernel reservations exceed guest RAM.");if(!/^0x[0-9a-fA-F]{6,16}$/.test(s.kernelBase))throw Error("Kernel base must be hexadecimal, e.g. 0x00100000.");KernoLocalService.configure(s.localServiceUrl);}
async function applySettings(){try{validateSettings();}catch(e){notify("Settings need attention",e.message);return;}await saveSettings();applyTheme();applyAccent();applyDensity();translate();applyEditorSettings();if(state.project){const c=state.project.config;c.architecture=state.settings.defaultArchitecture;c.firmware=state.settings.defaultFirmware;c.bootloader=state.settings.defaultBootloader;c.kernelLanguage=state.settings.defaultKernelLanguage;c.optimization=state.settings.optimization;c.memory=Object.assign(c.memory,{guestMiB:state.settings.guestMemoryMiB,heapReserveMiB:state.settings.heapReserveMiB,stackReserveKiB:state.settings.stackReserveKiB,pageSize:state.settings.pageSize,kernelBase:state.settings.kernelBase});c.qemu=Object.assign(c.qemu,{binary:state.settings.qemuBinary,machine:state.settings.qemuMachine,display:state.settings.qemuDisplay,vcpus:state.settings.qemuVcpus,vncPort:state.settings.qemuVncPort,acceleration:state.settings.qemuAcceleration});await saveProject(true);updateProjectHeader();renderMachine();renderBuild();}notify("Settings applied","IDE preferences and OS target updated.");show(state.settingsReturn);}
function applyTheme(){document.body.classList.toggle("light-theme",state.settings.theme==="light");if(window.monaco&&state.editor)window.monaco.editor.setTheme(state.settings.theme==="light"?"kerno-light":"kerno-dark");}
function applyAccent(){const map={sage:"#79b8a3",cyan:"#63c9ca",blue:"#80aee8",amber:"#d7b16e"};document.documentElement.style.setProperty("--accent",map[state.settings.accent]||map.sage);}
function applyDensity(){document.documentElement.dataset.density=state.settings.density;}
async function refreshHostMemoryEstimate(){
  const host=$("#hostMemoryEstimate");
  if(!host)return;
  host.textContent="Checking local host memory…";
  try{
    KernoLocalService.configure(state.settings.localServiceUrl,state.settings.localServiceToken);
    const project=state.project?payload():{id:"memory-plan",name:"Memory plan",config:configFor("Memory plan"),files:{}};
    const result=await KernoLocalService.resourceEstimate(project,state.settings);
    const h=result.host||{};
    const total=h.totalMiB==null?"unknown":formatBytes(h.totalMiB*1024*1024);
    const available=h.availableMiB==null?"unknown":formatBytes(h.availableMiB*1024*1024);
    const fit=result.recommended==null?"capacity unavailable":result.recommended?"capacity estimate looks sufficient":"low available host memory";
    host.textContent="Host available: "+available+" / "+total+" · "+fit;
  }catch(error){
    host.textContent="Unavailable · "+error.message;
  }
}
function renderMemory(){const s=state.settings,ram=Number(s.guestMemoryMiB)||0,res=Number(s.heapReserveMiB||0)+Number(s.stackReserveKiB||0)/1024+1,free=Math.max(0,ram-res);if($("#memoryMeterFill"))$("#memoryMeterFill").style.width=Math.min(100,res/Math.max(ram,1)*100)+"%";if($("#memoryReservedLabel"))$("#memoryReservedLabel").textContent="Planned reserve: "+res.toFixed(2)+" MiB";if($("#memoryAvailableLabel"))$("#memoryAvailableLabel").textContent="Unreserved guest RAM: "+free.toFixed(2)+" MiB";if($("#memoryPlanNote"))$("#memoryPlanNote").textContent=res>=ram?"Invalid plan: kernel reservations exceed guest RAM.":"Estimate only. It does not allocate physical host RAM or implement an allocator.";}
async function renderStorageSettings(){if($("#storedProjectCount"))$("#storedProjectCount").textContent=(await all("projects")).length;if($("#browserStorageEstimate")){if(navigator.storage&&navigator.storage.estimate){const e=await navigator.storage.estimate();$("#browserStorageEstimate").textContent=formatBytes(e.usage||0)+" / "+formatBytes(e.quota||0);}else $("#browserStorageEstimate").textContent="Unavailable";}}
async function exportAll(){const projects=await all("projects");if(!projects.length){notify("No projects to export");return;}if(!window.JSZip){notify("ZIP library unavailable");return;}const z=new JSZip();projects.forEach(p=>{const d=z.folder(safeName(p.name)+"-"+p.id.slice(0,6));Object.entries(p.files).forEach(([path,text])=>d.file(path,text));d.file("KernoProject.json",JSON.stringify({format:"kerno-project",name:p.name,config:p.config,files:p.files},null,2));});download(await z.generateAsync({type:"blob"}),"kerno-workspaces-backup.zip");}
async function clearAllProjects(){if(state.settings.confirmDestructive&&!confirm("Delete all locally stored projects? This cannot be undone."))return;await clear("projects");state.project=null;state.recent=[];renderRecent();show("welcome");notify("Local project storage cleared");}
function renderMachine(){if(!state.project)return;const c=state.project.config;$("#machineArchitecture").textContent=c.architecture;$("#machineType").textContent=c.qemu.machine;$("#machineMemory").textContent=c.memory.guestMiB+" MiB";$("#machineCpus").textContent=c.qemu.vcpus;$("#machineDisplaySpec").textContent=c.qemu.display==="std"?"Standard VGA":c.qemu.display==="virtio"?"Virtio GPU":"Headless";}
function renderBuild(){if(!state.project)return;$("#buildTarget").textContent=state.project.config.architecture;$("#buildBootloader").textContent=state.project.config.bootloader;$("#buildLanguage").textContent=state.project.config.kernelLanguage.toUpperCase();}
function updateProjectHeader(){if(!state.project)return;$("#activeProjectName").textContent=state.project.name;$("#activeTargetChip").textContent=state.project.config.architecture+" · "+state.project.config.bootloader.toUpperCase();}
function switchWorkspace(name){["source","machine","build"].forEach(x=>$("#"+x+"Workspace").classList.toggle("hidden",x!==name));$$(".workspace-nav-item").forEach(b=>b.classList.toggle("active",b.dataset.workspace===name));if(name==="machine"&&!state.localConnected)renderMachineEmpty(tr("connectQemuPrompt"));if(name==="build")renderBuild();if(name==="source"){state.editor&&state.editor.layout();state.splitEditor&&state.splitEditor.layout();}}
function renderMachineEmpty(msg){const v=$("#machineViewport");v.innerHTML='<div class="viewport-empty"><div class="monitor-glyph">▣</div><strong></strong><p></p><span class="viewport-hint">QEMU / VNC OUTPUT</span></div>';$("strong",v).textContent=tr("noMachineSession");$("p",v).textContent=msg||tr("connectQemuPrompt");}
function setServiceStatus(on,msg){state.localConnected=on;$("#qemuStatusText").textContent=msg;$(".machine-status").classList.toggle("connected",on);$("#qemuStatusDot").style.background=on?"#77c99c":"#c58f62";$("#machineControlNote").textContent=on?"Local service reachable. QEMU process control is delegated to the local runtime.":"QEMU is unavailable until Kerno Local Service is installed and connected.";}
async function testService(){try{KernoLocalService.configure(state.settings.localServiceUrl,state.settings.localServiceToken);const h=await KernoLocalService.health();setServiceStatus(true,"Local service connected");if($("#localServiceResult"))$("#localServiceResult").textContent="Connected · API "+(h.apiVersion||"unknown");notify("Local service connected");return true;}catch(e){setServiceStatus(false,"QEMU not connected");if($("#localServiceResult"))$("#localServiceResult").textContent="Unavailable · "+e.message;notify("Local service unavailable",e.message);return false;}}
async function connectService(){if(!await testService())return;try{const s=await KernoLocalService.emulatorStatus();if(s.status==="running"){setServiceStatus(true,"QEMU running");if(s.displayUrl)showDisplay(s.displayUrl);if(s.serialOutput)$("#serialOutput").textContent=String(s.serialOutput).slice(-12000);}else renderMachineEmpty("Local service connected; no guest is running.");}catch(_){}}
function showDisplay(value){let u;try{u=new URL(value);}catch(_){notify("Invalid emulator display URL");return;}if(!["http:","https:"].includes(u.protocol)||!["localhost","127.0.0.1","::1"].includes(u.hostname.replace(/^\[|\]$/g,""))){notify("Display URL rejected","The QEMU display must be hosted locally.");return;}const v=$("#machineViewport");v.innerHTML="";const f=document.createElement("iframe");f.src=u.href;f.title="QEMU guest display";v.append(f);}
async function startQemu(){if(!state.project)return;if(!state.localConnected&&!await testService())return;$("#startQemuButton").disabled=true;try{const r=await KernoLocalService.startEmulator(payload(),state.settings);if(r.status!=="running"&&!r.displayUrl)throw Error(r.message||"Service did not confirm a running QEMU session.");setServiceStatus(true,"QEMU running");if(r.displayUrl)showDisplay(r.displayUrl);if(r.serialOutput)$("#serialOutput").textContent=String(r.serialOutput).slice(-12000);notify("QEMU session started","Runtime service confirmed the guest session.");}catch(e){notify("QEMU could not start",e.message);}finally{$("#startQemuButton").disabled=false;}}
async function stopQemu(){if(!state.localConnected){notify("Local service is not connected");return;}$("#stopQemuButton").disabled=true;try{const r=await KernoLocalService.stopEmulator();if(r.status&&r.status!=="stopped")throw Error(r.message||"Service did not confirm process termination.");renderMachineEmpty("QEMU stopped by local service.");setServiceStatus(true,"Service connected · machine stopped");notify("QEMU stopped");}catch(e){notify("Could not stop QEMU",e.message);}finally{$("#stopQemuButton").disabled=false;}}
function payload(){syncEditor();return {id:state.project.id,name:state.project.name,config:state.project.config,files:state.project.files};}
function renderArtifactDownload(artifact){
  const host=$("#artifactDownloads");if(!host)return;
  host.innerHTML="";
  if(!artifact||!artifact.downloadUrl||!artifact.id)return;
  const link=document.createElement("a");
  link.className="artifact-download-link";
  link.href=KernoLocalService.getUrl()+artifact.downloadUrl;
  link.textContent="Download verified ISO · "+(artifact.name||"kernel.iso");
  link.target="_blank";link.rel="noopener";
  host.append(link);
}
async function nativeBuild(bootAfter){
  if(!state.project)return;
  if(!state.localConnected&&!await testService())return;
  $("#runBuildButton").disabled=true;
  $("#buildProjectButton").disabled=true;
  $("#buildStateLabel").textContent="SUBMITTED";
  $("#buildLog").textContent="Submitting native build request…\\n";
  try{
    const result=await KernoLocalService.build(payload(),state.settings);
    const status=String(result.status||"").toLowerCase();
    if(!["success","failed","cancelled"].includes(status))throw Error("Build service returned an unknown terminal status.");
    $("#buildStateLabel").textContent=status.toUpperCase();
    $("#buildLog").textContent=(result.log||result.message||"Build "+status)+"\\n";
    if(status!=="success"){
      notify("Native build "+status,result.message||"Review the build output.");
      return;
    }
    if(!result.artifact){
      $("#buildStateLabel").textContent="ARTIFACT MISSING";
      throw Error("The service reported success but did not return a verified artifact.");
    }
    notify("Native build completed",result.artifact.name||"Artifact returned by Kerno Local Service.");
    $("#buildLog").textContent+="Verified artifact: "+(result.artifact.name||"unnamed")+" ("+Number(result.artifact.sizeBytes||0)+" bytes)\\n";
    renderArtifactDownload(result.artifact);
    if(bootAfter){
      $("#buildLog").textContent+="Starting the configured QEMU machine…\\n";
      const boot=await KernoLocalService.startEmulator(Object.assign(payload(),{buildArtifact:result.artifact}),state.settings);
      if(boot.status!=="running"&&!boot.displayUrl)throw Error(boot.message||"Build succeeded, but QEMU did not confirm a running guest.");
      setServiceStatus(true,"QEMU running");
      if(boot.displayUrl)showDisplay(boot.displayUrl);
      if(boot.serialOutput)$("#serialOutput").textContent=String(boot.serialOutput).slice(-12000);
      $("#buildLog").textContent+="QEMU session confirmed by local service.\\n";
      $("#buildStateLabel").textContent="BUILD + BOOT READY";
      switchWorkspace("machine");
      notify("Build & Boot completed","The local service confirmed the QEMU session.");
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
async function checkToolchain(){try{KernoLocalService.configure(state.settings.localServiceUrl);const r=await KernoLocalService.toolchain(state.settings);const names=Object.entries(r.tools||{}).filter(x=>x[1]&&x[1].available).map(x=>x[0]);$("#toolchainResult").textContent=names.length?names.join(", "):"No tools reported";}catch(e){$("#toolchainResult").textContent="Unavailable: "+e.message;}}
async function loadArchive(file){const p={id:makeId(),name:file.name.replace(/\.(zip|kerno|json)$/i,""),config:configFor("Imported OS"),files:{},createdAt:Date.now(),updatedAt:Date.now()};state.project=p;if(file.name.toLowerCase().endsWith(".json")){const m=JSON.parse(await file.text());if(m.format!=="kerno-project"||!m.files)throw Error("Not a Kerno project manifest.");p.name=m.name||p.name;p.config=Object.assign(p.config,m.config||{});p.files=m.files;}else{const r=await importZip(file);if(!r.n)throw Error("No supported text source files found.");}p.files=cleanFiles(p.files);if(!Object.keys(p.files).length)throw Error("Project archive contains no supported source files.");await saveProject(true);await openProject();notify("Project loaded",p.name);}
function cleanFiles(files){const out={};let total=0;Object.entries(files).forEach(([raw,text])=>{const path=normalizePath(raw);if(!path||binaryPath(path)||typeof text!=="string")return;const size=new Blob([text]).size;if(size>FILE_LIMIT||total+size>PROJECT_LIMIT)return;total+=size;out[path]=text;});return out;}
function openSettings(from){state.settingsReturn=from||state.screen;show("settings");renderSettings(state.category);}
function applyStartup(){applyTheme();applyAccent();applyDensity();translate();if(state.settings.startScreen==="lastProject"){all("projects").then(list=>{list.sort((a,b)=>b.updatedAt-a.updatedAt);if(list[0]){state.project=list[0];openProject();}else show("welcome");}).catch(()=>show("welcome"));}else show("welcome");}
function bindEvents(){
$("#welcomeNewProject").onclick=()=>{syncWizardDefaults();show("newProject");};$("#welcomeLoadProject").onclick=()=>$("#loadProjectInput").click();$("#welcomeLoadFolder").onclick=()=>$("#projectFolderInput").click();$("#welcomeConfigure").onclick=()=>openSettings("welcome");$("#welcomeSettingsButton").onclick=()=>openSettings("welcome");
$("#backFromNewProject").onclick=()=>show("welcome");$("#cancelNewProject").onclick=()=>show("welcome");$("#createProjectButton").onclick=createProject;
$("#backFromSettings").onclick=()=>show(state.settingsReturn);$("#saveSettingsButton").onclick=applySettings;
$("#clearRecentButton").onclick=async()=>{if(state.settings.confirmDestructive&&!confirm("Clear the recent project list? Saved projects will remain available in browser storage."))return;await put("meta",{key:"hiddenRecent",value:state.recent.map(p=>p.id)});await refreshRecent();};
$("#loadProjectInput").onchange=async e=>{const f=e.target.files[0];e.target.value="";if(!f)return;try{await loadArchive(f);}catch(err){state.project=null;show("welcome");notify("Project load failed",err.message);}};
$("#projectFolderInput").onchange=async e=>{const files=Array.from(e.target.files||[]);e.target.value="";if(!files.length)return;disposeEditors();state.activeFile=null;state.tabs=[];$("#plainEditor").style.display="none";const name=files[0].webkitRelativePath.split("/")[0]||"Imported OS";state.project={id:makeId(),name,config:configFor(name),files:{},createdAt:Date.now(),updatedAt:Date.now()};await importMany(files,true);if(Object.keys(state.project.files).length){await saveProject(true);await openProject();}else{state.project=null;notify("No supported source files found");}};
$("#importProjectFilesButton").onclick=()=>$("#sourceImportInput").click();$("#sourceImportInput").onchange=e=>{importMany(e.target.files,false);e.target.value="";};$("#sourceFolderInput").onchange=e=>{importMany(e.target.files,true);e.target.value="";};
$("#addSourceFileButton").onclick=createSourceFile;$("#importSourceFolderButton").onclick=()=>$("#sourceFolderInput").click();$("#emptyNewFileButton").onclick=createSourceFile;
$("#saveProjectButton").onclick=()=>saveProject(false);$("#saveFileButton").onclick=()=>saveProject(false);$("#exportFileButton").onclick=exportFile;$("#exportProjectButton").onclick=exportProject;
$("#appSettingsButton").onclick=()=>openSettings("app");$("#backToWelcomeButton").onclick=async()=>{await saveProject(true);disposeEditors();show("welcome");};
$("#splitEditorButton").onclick=toggleSplit;$("#closeSplitButton").onclick=()=>$("#splitPane").classList.add("hidden");$("#splitFileSelect").onchange=e=>{state.splitFile=e.target.value;if(state.splitEditor)state.splitEditor.setModel(ensureModel(state.splitFile));};
$("#plainEditor").oninput=()=>{if(state.activeFile){state.project.files[state.activeFile]=$("#plainEditor").value;if(state.settings.autosave){clearTimeout(state.saveTimer);state.saveTimer=setTimeout(()=>saveProject(true),900);}}};
$("#plainEditor").onkeyup=plainCursor;$("#plainEditor").onclick=plainCursor;
$$(".workspace-nav-item").forEach(b=>b.onclick=()=>switchWorkspace(b.dataset.workspace));
$("#connectLocalServiceButton").onclick=connectService;$("#startQemuButton").onclick=startQemu;$("#stopQemuButton").onclick=stopQemu;$("#clearSerialButton").onclick=()=>$("#serialOutput").textContent="";
$("#buildProjectButton").onclick=()=>{switchWorkspace("build");nativeBuild(true);};$("#runBuildButton").onclick=()=>nativeBuild(false);$("#openSettingsFromBuild").onclick=()=>{state.category="toolchain";openSettings("app");};
$$(".settings-nav-item").forEach(b=>b.onclick=()=>renderSettings(b.dataset.category));
$("#architectureSelect").onchange=()=>{const arch=$("#architectureSelect").value;if(arch==="aarch64"||arch==="riscv64"){$("#firmwareSelect").value="uefi";$("#bootloaderSelect").value="uefi-app";}$("#scaffoldPreview").textContent=arch+" target\n├── boot/\n│   └── entry.asm\n├── include/kernel/\n├── src/\n│   ├── kernel.cpp\n│   ├── console.cpp\n│   └── memory.cpp\n├── linker.ld\n└── kerno.project.json";};
document.addEventListener("keydown",e=>{const mod=e.ctrlKey||e.metaKey;if(mod&&e.key.toLowerCase()==="s"){e.preventDefault();saveProject(false);}if(mod&&e.key.toLowerCase()==="o"){e.preventDefault();if(state.screen==="welcome")$("#loadProjectInput").click();else $("#sourceImportInput").click();}if(mod&&e.shiftKey&&e.key.toLowerCase()==="e"){e.preventDefault();exportFile();}if(mod&&e.shiftKey&&e.key.toLowerCase()==="s"){e.preventDefault();exportProject();}if(mod&&e.key.toLowerCase()==="b"){e.preventDefault();switchWorkspace("build");nativeBuild();}});
}
function plainCursor(){const el=$("#plainEditor"),lines=el.value.slice(0,el.selectionStart).split("\n");$("#cursorPosition").textContent="Ln "+lines.length+", Col "+(lines[lines.length-1].length+1);}
async function exportAllProjects(){const projects=await all("projects");if(!projects.length){notify("No projects to export");return;}if(!window.JSZip){notify("ZIP library unavailable");return;}const z=new JSZip();projects.forEach(p=>{const d=z.folder(safeName(p.name)+"-"+p.id.slice(0,6));Object.entries(p.files).forEach(([path,text])=>d.file(path,text));d.file("KernoProject.json",JSON.stringify({format:"kerno-project",name:p.name,config:p.config,files:p.files},null,2));});download(await z.generateAsync({type:"blob"}),"kerno-workspaces-backup.zip");}
async function clearProjects(){if(state.settings.confirmDestructive&&!confirm("Delete all Kerno projects from this browser?"))return;await clear("projects");state.project=null;state.recent=[];renderRecent();show("welcome");notify("Local project storage cleared");}
async function renderStorage(){if($("#storedProjectCount"))$("#storedProjectCount").textContent=(await all("projects")).length;if($("#browserStorageEstimate")){if(navigator.storage&&navigator.storage.estimate){const e=await navigator.storage.estimate();$("#browserStorageEstimate").textContent=formatBytes(e.usage||0)+" / "+formatBytes(e.quota||0);}else $("#browserStorageEstimate").textContent="Unavailable";}}
async function boot(){bindEvents();try{database=await dbOpen();}catch(e){notify("IndexedDB unavailable",e.message);}await loadSettings();applyStartup();refreshRecent();}
boot();
})();