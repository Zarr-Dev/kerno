(() => {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const state = {
    activeFile: "kernel.cpp",
    activePanel: "problems",
    theme: "dark",
    selectedTemplate: "text",
    panelMaximized: false,
    editor: null,
    models: {},
    files: {
      "kernel.cpp": {
        language: "cpp",
        path: "src/kernel.cpp",
        value: `#include <stdint.h>

extern "C" void kernel_main() {
    // Kerno starter kernel entry point.
    volatile uint16_t* vga = (uint16_t*)0xB8000;
    const char* message = "Hello from Kerno!";

    for (int i = 0; message[i] != '\\0'; ++i) {
        vga[i] = (uint16_t)message[i] | (uint16_t)0x0F00;
    }

    for (;;) {
        __asm__ volatile ("hlt");
    }
}
`
      },
      "boot.asm": {
        language: "asm",
        path: "src/boot.asm",
        value: `; Kerno x86_64 boot entry (starter example)
bits 32
section .multiboot
    dd 0x1BADB002
    dd 0x00000003
    dd -(0x1BADB002 + 0x00000003)

section .text
global _start
extern kernel_main

_start:
    cli
    call kernel_main
.hang:
    hlt
    jmp .hang
`
      },
      "grub.cfg": {
        language: "ini",
        path: "boot/grub.cfg",
        value: `set timeout=3
set default=0

menuentry "My First OS" {
    multiboot /boot/kernel.elf
    boot
}
`
      },
      "linker.ld": {
        language: "cpp",
        path: "linker.ld",
        value: `ENTRY(_start)

SECTIONS
{
    . = 1M;

    .multiboot : {
        KEEP(*(.multiboot))
    }

    .text : ALIGN(4K) {
        *(.text)
    }

    .rodata : ALIGN(4K) {
        *(.rodata)
    }

    .data : ALIGN(4K) {
        *(.data)
    }

    .bss : ALIGN(4K) {
        *(COMMON)
        *(.bss)
    }
}
`
      },
      "kerno.config.json": {
        language: "json",
        path: "kerno.config.json",
        value: `{
  "name": "My First OS",
  "architecture": "x86_64",
  "bootloader": "GRUB",
  "memory": 256,
  "display": {
    "width": 1024,
    "height": 768
  }
}
`
      }
    }
  };

  const panelContent = {
    problems: '<div class="empty-state"><span class="empty-check">✓</span><div><strong>No problems detected</strong><p>Diagnostics will appear here when language services are connected.</p></div></div>',
    output: '<div class="log-line"><span class="log-time">[ KERNO ]</span><span class="log-info">Frontend workspace initialized.</span></div><div class="log-line"><span class="log-time">[ INFO ]</span><span>Native toolchain is not connected in this preview.</span></div>',
    build: '<div class="empty-state"><span class="empty-check">·</span><div><strong>No build has been run</strong><p>Build output will appear here after a build service is connected.</p></div></div>',
    serial: '<div class="empty-state"><span class="empty-check">·</span><div><strong>Serial monitor disconnected</strong><p>Connect a QEMU serial stream to view kernel output here.</p></div></div>',
    terminal: '<div class="terminal-line"><span class="terminal-prompt">kerno@workspace</span>:<span style="color:#8cb9ff">~/My-First-OS</span>$ <span style="color:#748092">Terminal integration is not connected in this preview.</span></div>'
  };

  function toast(message, detail = "") {
    const node = document.createElement("div");
    node.className = "toast";
    node.textContent = message;
    if (detail) {
      const small = document.createElement("small");
      small.textContent = detail;
      node.append(small);
    }
    $("#toastRegion").append(node);
    window.setTimeout(() => node.remove(), 3300);
  }

  function setPanel(name) {
    state.activePanel = name;
    $$(".panel-tab").forEach(tab => tab.classList.toggle("active", tab.dataset.panel === name));
    $("#panelBody").innerHTML = panelContent[name] || panelContent.output;
  }

  function getLanguageLabel(file) {
    const language = state.files[file]?.language;
    return ({ cpp: "C++", asm: "Assembly", ini: "GRUB Config", json: "JSON" })[language] || "Plain Text";
  }

  function updateFileLabels(file) {
    $("#breadcrumbFile").textContent = file;
    $("#languageChip").textContent = getLanguageLabel(file);
    $("#statusLanguage").textContent = getLanguageLabel(file);
  }

  function setActiveFile(file) {
    if (!state.files[file]) return;
    state.activeFile = file;
    $$(".editor-tab").forEach(tab => tab.classList.toggle("active", tab.dataset.file === file));
    $$(".tree-row[data-file]").forEach(row => row.classList.toggle("selected", row.dataset.file === file));
    updateFileLabels(file);
    if (state.editor && state.models[file]) {
      state.editor.setModel(state.models[file]);
      state.editor.focus();
    } else if (!state.editor) {
      $("#fallbackEditor").value = state.files[file].value;
    }
    $("#editorArea").classList.toggle("monaco-ready", Boolean(state.editor));
  }

  function addTab(file) {
    if ($(`.editor-tab[data-file="${CSS.escape(file)}"]`)) return;
    const type = state.files[file].language === "asm" ? "asm-type" :
      state.files[file].language === "cpp" ? "cpp-type" :
      state.files[file].language === "json" ? "json-type" : "config-type";
    const letter = state.files[file].language === "asm" ? "A" :
      state.files[file].language === "cpp" ? "C" :
      state.files[file].language === "json" ? "{ }" : "≡";
    const tab = document.createElement("button");
    tab.className = "editor-tab";
    tab.dataset.file = file;
    tab.innerHTML = `<span class="file-type ${type}">${letter}</span> ${file} <span class="tab-close">×</span>`;
    tab.addEventListener("click", event => {
      if (event.target.classList.contains("tab-close")) {
        tab.remove();
        const next = $(".editor-tab");
        if (next) setActiveFile(next.dataset.file);
      } else setActiveFile(file);
    });
    $(".tabs-spacer").before(tab);
  }

  function registerAsmLanguage(monaco) {
    monaco.languages.register({ id: "kerno-asm", extensions: [".asm", ".s"], aliases: ["Assembly", "asm"] });
    monaco.languages.setMonarchTokensProvider("kerno-asm", {
      tokenizer: {
        root: [
          [/;.*$/, "comment"],
          [/\b(bits|section|global|extern|align|times|db|dw|dd|dq|resb|resw|resd|equ)\b/i, "keyword"],
          [/\b(mov|add|sub|mul|div|cmp|jmp|je|jne|call|ret|push|pop|cli|sti|hlt|xor|lea|int|and|or)\b/i, "keyword"],
          [/\b(eax|ebx|ecx|edx|rax|rbx|rcx|rdx|rsp|rbp|rsi|rdi|ax|bx|cx|dx|al|ah|bl|bh)\b/i, "variable"],
          [/0x[0-9a-fA-F]+|\b\d+\b/, "number"],
          [/\.[a-zA-Z_][\w.]*/, "type"],
          [/\b[a-zA-Z_][\w]*:/, "type"]
        ]
      }
    });
  }

  function initMonaco() {
    if (!window.require || !window.require.config) {
      $("#fallbackEditor").style.display = "block";
      $("#fallbackEditor").value = state.files[state.activeFile].value;
      toast("Editor fallback enabled", "Monaco could not be loaded. Check your network connection.");
      return;
    }
    window.require.config({ paths: { vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs" } });
    window.MonacoEnvironment = {
      getWorkerUrl: function () {
        return "data:text/javascript;charset=utf-8," + encodeURIComponent(
          "self.MonacoEnvironment={baseUrl:'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/'};importScripts('https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs/base/worker/workerMain.js');"
        );
      }
    };
    window.require(["vs/editor/editor.main"], function () {
      const monaco = window.monaco;
      registerAsmLanguage(monaco);
      Object.entries(state.files).forEach(([file, data]) => {
        state.models[file] = monaco.editor.createModel(data.value, data.language === "asm" ? "kerno-asm" : data.language, monaco.Uri.parse("file:///workspace/" + data.path));
        state.models[file].onDidChangeContent(() => {
          const row = $(`.tree-row[data-file="${CSS.escape(file)}"]`);
          if (row && !$(".dirty-dot", row)) {
            const dot = document.createElement("span");
            dot.className = "dirty-dot";
            row.append(dot);
          }
        });
      });
      state.editor = monaco.editor.create($("#monacoHost"), {
        model: state.models[state.activeFile],
        theme: "kerno-dark",
        automaticLayout: true,
        fontFamily: '"DM Mono", Consolas, monospace',
        fontSize: 12,
        lineHeight: 21,
        minimap: { enabled: false },
        padding: { top: 15, bottom: 18 },
        scrollBeyondLastLine: false,
        renderLineHighlight: "all",
        cursorBlinking: "smooth",
        smoothScrolling: true,
        roundedSelection: false,
        tabSize: 4,
        wordWrap: "off",
        glyphMargin: false,
        folding: true,
        guides: { indentation: true }
      });
      monaco.editor.defineTheme("kerno-dark", {
        base: "vs-dark", inherit: true, rules: [
          { token: "comment", foreground: "778395", fontStyle: "italic" },
          { token: "keyword", foreground: "C792EA" },
          { token: "string", foreground: "C3E88D" },
          { token: "number", foreground: "F78C6C" }
        ],
        colors: {
          "editor.background": "#111318",
          "editor.foreground": "#D7DEE9",
          "editorLineNumber.foreground": "#4E5867",
          "editorLineNumber.activeForeground": "#AAB6C7",
          "editor.lineHighlightBackground": "#1A2029",
          "editor.selectionBackground": "#29415F88",
          "editorCursor.foreground": "#8DB8FF",
          "editorIndentGuide.background1": "#252B35",
          "editorIndentGuide.activeBackground1": "#3D4B5D"
        }
      });
      monaco.editor.setTheme("kerno-dark");
      $("#editorArea").classList.add("monaco-ready");
      $("#fallbackEditor").style.display = "none";
      state.editor.onDidChangeCursorPosition(event => {
        const pos = event.position;
        const status = $(".status-right .status-item:last-child");
        if (status) status.textContent = `Ln ${pos.lineNumber}, Col ${pos.column}`;
      });
    }, function () {
      $("#fallbackEditor").style.display = "block";
      $("#fallbackEditor").value = state.files[state.activeFile].value;
      toast("Monaco unavailable", "Using the basic editor fallback.");
    });
  }

  function openCommandPalette() {
    $("#commandBackdrop").classList.remove("hidden");
    $("#commandInput").value = "";
    renderCommands("");
    $("#commandInput").focus();
  }

  const commands = [
    ["Build & Boot", "build", "Ctrl + B"],
    ["Open Explorer", "explorer", "Ctrl + Shift + E"],
    ["Open OS Configuration", "config", ""],
    ["Open Templates", "templates", ""],
    ["Toggle Bottom Panel", "panel", "Ctrl + J"],
    ["Create New Project", "new-project", ""],
    ["Toggle Theme", "theme", ""]
  ];

  function renderCommands(query) {
    const filtered = commands.filter(item => item[0].toLowerCase().includes(query.toLowerCase()));
    $("#commandList").innerHTML = "";
    filtered.forEach((item, index) => {
      const button = document.createElement("button");
      button.className = "command-item" + (index === 0 ? " active" : "");
      button.innerHTML = `<span>${item[0]}</span><kbd>${item[2] || "↵"}</kbd>`;
      button.addEventListener("click", () => runCommand(item[1]));
      $("#commandList").append(button);
    });
    if (!filtered.length) $("#commandList").innerHTML = '<div class="command-item">No matching commands</div>';
  }

  function runCommand(command) {
    $("#commandBackdrop").classList.add("hidden");
    if (command === "build") runBuildDemo();
    if (command === "explorer") activateView("explorer");
    if (command === "config") activateView("config");
    if (command === "templates") activateView("templates");
    if (command === "panel") togglePanel();
    if (command === "new-project") $("#projectModal").classList.remove("hidden");
    if (command === "theme") toggleTheme();
  }

  function activateView(view) {
    $$(".activity-button[data-view]").forEach(button => button.classList.toggle("active", button.dataset.view === view));
    const titles = { explorer: "EXPLORER", search: "SEARCH", templates: "TEMPLATES", config: "OS CONFIGURATION" };
    $("#sidebarTitle").textContent = titles[view] || "EXPLORER";
    const content = $("#sidebarContent");
    if (view === "explorer") {
      content.innerHTML = `<div class="section-heading"><span>▾</span> MY FIRST OS <button class="subtle-icon" id="newFileButton" title="New file">＋</button></div>${$("#fileTree").outerHTML}<div class="sidebar-hint"><span class="hint-icon">✳</span><div><strong>Workspace ready</strong><p>Your OS project is loaded. Select a file to start editing.</p></div></div>`;
      $("#newFileButton")?.addEventListener("click", createFile);
      $$(".tree-row[data-file]", content).forEach(row => row.addEventListener("click", () => { addTab(row.dataset.file); setActiveFile(row.dataset.file); }));
    } else if (view === "search") {
      content.innerHTML = '<div class="sidebar-search"><input class="text-field" id="fileSearch" placeholder="Search in files..."><div class="sidebar-hint"><span class="hint-icon">⌕</span><div><strong>Search workspace</strong><p>Find symbols and text across your project files.</p></div></div></div>';
      $("#fileSearch").addEventListener("input", event => {
        const query = event.target.value.toLowerCase();
        const matches = Object.entries(state.files).filter(([name, data]) => name.toLowerCase().includes(query) || data.value.toLowerCase().includes(query));
        const old = $(".search-results", content);
        if (old) old.remove();
        const list = document.createElement("div");
        list.className = "search-results";
        matches.forEach(([name]) => {
          const row = document.createElement("button");
          row.className = "tree-row";
          row.textContent = name;
          row.addEventListener("click", () => { addTab(name); setActiveFile(name); });
          list.append(row);
        });
        content.append(list);
      });
    } else if (view === "templates") {
      content.innerHTML = '<div class="section-heading">STARTER TEMPLATES</div><button class="template-sidebar-item" data-template="text"><strong>Blank Text Kernel</strong><small>Minimal boot foundation</small></button><button class="template-sidebar-item" data-template="framebuffer"><strong>Graphical Framebuffer</strong><small>Graphics-ready starter</small></button><div class="sidebar-hint"><span class="hint-icon">✳</span><div><strong>More templates soon</strong><p>Template packs will be expandable.</p></div></div>';
      $$(".template-sidebar-item", content).forEach(button => button.addEventListener("click", () => {
        state.selectedTemplate = button.dataset.template;
        $("#projectModal").classList.remove("hidden");
        $$(".template-option").forEach(option => option.classList.toggle("selected", option.dataset.template === state.selectedTemplate));
      }));
    } else if (view === "config") {
      content.innerHTML = '<div class="section-heading">TARGET CONFIGURATION</div><div class="config-form"><label>Architecture<select class="text-field"><option>x86_64</option><option>i686</option></select></label><label>Bootloader<select class="text-field"><option>GRUB</option><option>Custom</option></select></label><label>Memory (MB)<input class="text-field" type="number" value="256" min="32"></label><label>Display resolution<select class="text-field"><option>1024 × 768</option><option>1280 × 720</option><option>800 × 600</option></select></label><p class="config-note">These controls are UI previews. Values are not yet connected to a build configuration.</p></div>';
    }
  }

  function togglePanel() {
    const panel = $("#bottomPanel");
    const resizer = $("#panelResizer");
    const hidden = panel.classList.toggle("hidden-panel");
    resizer.style.display = hidden ? "none" : "";
  }

  function toggleTheme() {
    state.theme = state.theme === "dark" ? "light" : "dark";
    document.body.classList.toggle("light-theme", state.theme === "light");
    if (window.monaco && state.editor) window.monaco.editor.setTheme(state.theme === "dark" ? "kerno-dark" : "vs");
    toast(`${state.theme === "dark" ? "Dark" : "Light"} theme enabled`);
  }

  function appendLog(time, text, type = "info") {
    const row = document.createElement("div");
    row.className = "log-line";
    const timestamp = document.createElement("span");
    timestamp.className = "log-time";
    timestamp.textContent = time;
    const message = document.createElement("span");
    message.className = type === "ok" ? "log-ok" : type === "warn" ? "log-warn" : "log-info";
    message.textContent = text;
    row.append(timestamp, message);
    $("#panelBody").append(row);
  }

  function runBuildDemo() {
    setPanel("build");
    $("#panelBody").innerHTML = "";
    appendLog("[ 00:00 ]", "Kerno frontend preview — build pipeline is not connected.", "warn");
    appendLog("[ 00:00 ]", "No compiler, linker, GRUB, or ISO operation was started.", "info");
    appendLog("[ 00:00 ]", "Connect a trusted local build service to enable real Build & Boot.", "info");
    toast("Build service not connected", "This preview does not compile code or create an ISO.");
  }

  function createFile() {
    const name = window.prompt("New file name (for example: memory.cpp)");
    if (!name) return;
    if (!/^[\w.-]+$/.test(name) || state.files[name]) {
      toast("File name unavailable", "Use a unique name without spaces or path separators.");
      return;
    }
    const ext = name.split(".").pop().toLowerCase();
    const language = ext === "cpp" || ext === "h" || ext === "c" ? "cpp" : ext === "asm" || ext === "s" ? "asm" : ext === "json" ? "json" : "plaintext";
    state.files[name] = { language, path: name, value: "// New file\n" };
    if (state.editor && window.monaco) {
      state.models[name] = window.monaco.editor.createModel(state.files[name].value, language === "asm" ? "kerno-asm" : language, window.monaco.Uri.parse("file:///workspace/" + name));
    }
    const row = document.createElement("button");
    row.className = "tree-row file-row";
    row.dataset.file = name;
    row.innerHTML = `<span class="file-type cpp-type">·</span><span>${name}</span>`;
    $("#fileTree").append(row);
    row.addEventListener("click", () => { addTab(name); setActiveFile(name); });
    addTab(name);
    setActiveFile(name);
    toast("File added to preview", name);
  }

  function bindResizer(element, onMove, axis) {
    if (!element) return;
    element.addEventListener("pointerdown", event => {
      event.preventDefault();
      element.classList.add("dragging");
      element.setPointerCapture(event.pointerId);
      const move = moveEvent => onMove(axis === "x" ? moveEvent.clientX : moveEvent.clientY);
      const end = () => {
        element.classList.remove("dragging");
        element.removeEventListener("pointermove", move);
        element.removeEventListener("pointerup", end);
      };
      element.addEventListener("pointermove", move);
      element.addEventListener("pointerup", end);
    });
  }

  // Global interaction wiring
  $("#commandTrigger").addEventListener("click", openCommandPalette);
  $("#commandBackdrop").addEventListener("click", event => { if (event.target === $("#commandBackdrop")) $("#commandBackdrop").classList.add("hidden"); });
  $("#commandInput").addEventListener("input", event => renderCommands(event.target.value));
  $("#commandInput").addEventListener("keydown", event => {
    if (event.key === "Escape") $("#commandBackdrop").classList.add("hidden");
    if (event.key === "Enter") $(".command-item.active")?.click() || $(".command-item")?.click();
  });
  $("#themeButton").addEventListener("click", toggleTheme);
  $("#layoutButton").addEventListener("click", togglePanel);
  $("#closePanel").addEventListener("click", togglePanel);
  $("#maximizePanel").addEventListener("click", () => {
    state.panelMaximized = !state.panelMaximized;
    $("#bottomPanel").style.setProperty("--panel-height", state.panelMaximized ? "55vh" : "var(--panel-height)");
    $("#bottomPanel").style.height = state.panelMaximized ? "55vh" : "";
  });
  $("#clearPanel").addEventListener("click", () => { $("#panelBody").innerHTML = ""; });
  $("#splitButton").addEventListener("click", () => toast("Split editor", "Multi-editor layout is planned for a later frontend iteration."));
  $("#editorMore").addEventListener("click", () => toast("Editor actions", "Use the command palette for available workspace actions."));
  $("#sidebarMore").addEventListener("click", () => toast("Workspace actions", "Project file operations will connect to the workspace service."));
  $("#helpButton").addEventListener("click", () => toast("Kerno Preview", "Website-first OS Builder IDE · Frontend foundation"));
  $("#settingsButton").addEventListener("click", () => activateView("config"));
  $("#newFileButton").addEventListener("click", createFile);
  $("#closeModal").addEventListener("click", () => $("#projectModal").classList.add("hidden"));
  $("#projectModal").addEventListener("click", event => { if (event.target === $("#projectModal")) $("#projectModal").classList.add("hidden"); });
  $("#createProjectButton").addEventListener("click", () => {
    const name = $("#projectName").value.trim() || "Untitled OS";
    $(".workspace-name").textContent = name;
    $(".section-heading").childNodes[1].textContent = " " + name.toUpperCase() + " ";
    $("#projectModal").classList.add("hidden");
    toast("Project workspace prepared", `${name} · ${state.selectedTemplate === "text" ? "Blank Text Kernel" : "Graphical Framebuffer"}`);
  });
  $$(".template-option").forEach(option => option.addEventListener("click", () => {
    state.selectedTemplate = option.dataset.template;
    $$(".template-option").forEach(item => item.classList.toggle("selected", item === option));
  }));
  $$(".panel-tab").forEach(tab => tab.addEventListener("click", () => setPanel(tab.dataset.panel)));
  $$(".activity-button[data-view]").forEach(button => button.addEventListener("click", () => activateView(button.dataset.view)));
  $$(".tree-row[data-file]").forEach(row => row.addEventListener("click", () => { addTab(row.dataset.file); setActiveFile(row.dataset.file); }));
  $$(".editor-tab").forEach(tab => tab.addEventListener("click", event => {
    if (event.target.classList.contains("tab-close")) {
      tab.remove();
      const next = $(".editor-tab");
      if (next) setActiveFile(next.dataset.file);
    } else setActiveFile(tab.dataset.file);
  }));
  bindResizer($("#sidebarResizer"), x => {
    const width = Math.max(180, Math.min(420, x - 49));
    document.documentElement.style.setProperty("--sidebar-width", width + "px");
  }, "x");
  bindResizer($("#panelResizer"), y => {
    const height = Math.max(105, Math.min(window.innerHeight * .65, window.innerHeight - y - 23));
    document.documentElement.style.setProperty("--panel-height", height + "px");
    $("#bottomPanel").style.height = height + "px";
  }, "y");

  document.addEventListener("keydown", event => {
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "p") {
      event.preventDefault(); openCommandPalette();
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "j") {
      event.preventDefault(); togglePanel();
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "b") {
      event.preventDefault(); runBuildDemo();
    }
    if (event.key === "Escape") {
      $("#commandBackdrop").classList.add("hidden");
      $("#projectModal").classList.add("hidden");
    }
  });

  initMonaco();
})();
