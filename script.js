(() => {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const STORAGE_KEY = "kerno.kernel-studio.workspace.v1";
  const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

  const starterFiles = () => ({
    "boot/entry.asm": {
      content: `; Kerno x86_64 entry-point example
; This sample assumes the boot stage has already entered long mode.
; A production boot path still needs a matching GRUB protocol and setup.

BITS 64
DEFAULT REL

SECTION .bss
ALIGN 16
stack_bottom:
    RESB 16384
stack_top:

SECTION .text
GLOBAL _start
EXTERN kernel_main

_start:
    cli
    lea rsp, [rel stack_top]
    and rsp, -16
    call kernel_main

.hang:
    hlt
    jmp .hang
`
    },
    "boot/ports.asm": {
      content: `; Minimal x86 port I/O helpers (NASM, 64-bit mode)
; System I/O privilege and hardware availability depend on execution context.

BITS 64
SECTION .text
GLOBAL kerno_outb
GLOBAL kerno_inb

; void kerno_outb(uint16_t port, uint8_t value)
kerno_outb:
    mov dx, di
    mov al, sil
    out dx, al
    ret

; uint8_t kerno_inb(uint16_t port)
kerno_inb:
    mov dx, di
    xor eax, eax
    in al, dx
    ret
`
    },
    "boot/grub.cfg": {
      content: `set timeout=3
set default=0

menuentry "Kerno OS" {
    multiboot2 /boot/kernel.elf
    boot
}
`
    },
    "src/kernel.cpp": {
      content: `#include <stdint.h>
#include "kerno/console.hpp"

extern "C" void kernel_main() {
    console_clear(ConsoleColor::Black);
    console_write("KERNO / KERNEL STUDIO", ConsoleColor::BrightCyan);
    console_write("Your kernel workspace is alive.", ConsoleColor::White);
    console_write("Start by exploring src/, boot/, and include/.", ConsoleColor::LightGray);

    for (;;) {
        __asm__ volatile ("hlt");
    }
}
`
    },
    "src/console.cpp": {
      content: `#include <stdint.h>
#include "kerno/console.hpp"

namespace {
    constexpr uintptr_t VGA_MEMORY = 0xB8000;
    constexpr uint8_t WIDTH = 80;
    constexpr uint8_t HEIGHT = 25;
    uint8_t cursor_row = 0;
    uint8_t cursor_column = 0;

    volatile uint16_t* vga_buffer() {
        return reinterpret_cast<volatile uint16_t*>(VGA_MEMORY);
    }

    uint8_t make_attribute(ConsoleColor color) {
        return static_cast<uint8_t>(color);
    }
}

void console_clear(ConsoleColor color) {
    const uint16_t blank = static_cast<uint16_t>(' ') |
        (static_cast<uint16_t>(make_attribute(color)) << 8);

    for (uint16_t i = 0; i < WIDTH * HEIGHT; ++i) {
        vga_buffer()[i] = blank;
    }

    cursor_row = 0;
    cursor_column = 0;
}

void console_write(const char* text, ConsoleColor color) {
    if (text == nullptr) return;

    while (*text != '\\0') {
        if (*text == '\\n') {
            cursor_column = 0;
            if (++cursor_row >= HEIGHT) cursor_row = 0;
        } else {
            const uint16_t cell = static_cast<uint16_t>(*text) |
                (static_cast<uint16_t>(make_attribute(color)) << 8);
            vga_buffer()[cursor_row * WIDTH + cursor_column] = cell;

            if (++cursor_column >= WIDTH) {
                cursor_column = 0;
                if (++cursor_row >= HEIGHT) cursor_row = 0;
            }
        }
        ++text;
    }
}
`
    },
    "src/memory.cpp": {
      content: `#include <stddef.h>
#include <stdint.h>

// Freestanding memory helpers for a kernel without a hosted C runtime.
extern "C" void* kerno_memset(void* destination, int value, size_t count) {
    auto* output = static_cast<uint8_t*>(destination);
    for (size_t i = 0; i < count; ++i) {
        output[i] = static_cast<uint8_t>(value);
    }
    return destination;
}

extern "C" void* kerno_memcpy(void* destination, const void* source, size_t count) {
    auto* output = static_cast<uint8_t*>(destination);
    const auto* input = static_cast<const uint8_t*>(source);

    for (size_t i = 0; i < count; ++i) {
        output[i] = input[i];
    }
    return destination;
}
`
    },
    "include/kerno/console.hpp": {
      content: `#pragma once
#include <stdint.h>

enum class ConsoleColor : uint8_t {
    Black = 0x00,
    Blue = 0x01,
    Green = 0x02,
    Cyan = 0x03,
    Red = 0x04,
    Magenta = 0x05,
    Brown = 0x06,
    LightGray = 0x07,
    DarkGray = 0x08,
    BrightBlue = 0x09,
    BrightGreen = 0x0A,
    BrightCyan = 0x0B,
    BrightRed = 0x0C,
    BrightMagenta = 0x0D,
    Yellow = 0x0E,
    White = 0x0F
};

void console_clear(ConsoleColor color);
void console_write(const char* text, ConsoleColor color);
`
    },
    "linker.ld": {
      content: `ENTRY(_start)

SECTIONS
{
    . = 1M;

    .multiboot ALIGN(8) : {
        KEEP(*(.multiboot))
    }

    .text ALIGN(4K) : {
        *(.text .text.*)
    }

    .rodata ALIGN(4K) : {
        *(.rodata .rodata.*)
    }

    .data ALIGN(4K) : {
        *(.data .data.*)
    }

    .bss ALIGN(4K) : {
        *(COMMON)
        *(.bss .bss.*)
    }
}
`
    },
    "kerno.project.json": {
      content: `{
  "name": "My First OS",
  "target": "x86_64",
  "bootloader": "GRUB / Multiboot2",
  "language": ["Assembly", "C++"],
  "entry": "boot/entry.asm",
  "kernel": "src/kernel.cpp",
  "linkerScript": "linker.ld"
}
`
    },
    "docs/architecture.md": {
      content: `# Kerno OS — Architecture Notes

## Boot flow

1. Firmware starts the selected bootloader.
2. GRUB loads the kernel image and transfers control according to the configured boot protocol.
3. The assembly entry point establishes the kernel execution environment.
4. The C++ kernel entry initializes early kernel services.

## Source map

- \`boot/\`: low-level entry and hardware I/O examples.
- \`src/\`: C++ kernel implementation.
- \`include/\`: shared kernel interfaces.
- \`linker.ld\`: kernel memory layout.
- \`boot/grub.cfg\`: boot menu configuration.

> These files are starter examples for editing and learning. A compatible boot protocol, compiler flags, linker setup, and early CPU initialization must be validated before treating an image as bootable.
`
    }
  });

  const state = {
    projectName: "My First OS",
    files: {},
    openTabs: [],
    activeFile: "src/kernel.cpp",
    splitFile: "boot/entry.asm",
    collapsedFolders: new Set(["build"]),
    dirtyFiles: new Set(),
    editor: null,
    splitEditor: null,
    models: {},
    activeView: "project",
    activeOutput: "problems",
    theme: "dark",
    outputExpanded: false,
    autosaveTimer: null,
    settings: { fontSize: 13, tabSize: 4, wordWrap: "off" },
    selectedStarter: "text"
  };

  function languageFor(path) {
    const ext = path.split(".").pop().toLowerCase();
    if (["asm", "s", "inc"].includes(ext)) return "kerno-asm";
    if (["c", "h", "cc", "cpp", "cxx", "hpp", "hh", "hxx"].includes(ext)) return "cpp";
    if (ext === "json") return "json";
    if (ext === "md") return "markdown";
    if (ext === "cfg" || ext === "ini") return "ini";
    if (ext === "ld") return "kerno-linker";
    if (["txt", "mk"].includes(ext) || path.toLowerCase().endsWith("makefile")) return "plaintext";
    return "plaintext";
  }

  function languageLabel(path) {
    const language = languageFor(path);
    return ({
      "kerno-asm": "Assembly · NASM",
      cpp: path.endsWith(".c") ? "C" : "C++",
      json: "JSON",
      markdown: "Markdown",
      ini: "GRUB Config",
      "kerno-linker": "Linker Script",
      plaintext: "Text"
    })[language] || "Text";
  }

  function markFor(path) {
    const language = languageFor(path);
    if (language === "kerno-asm") return ["A", "asm"];
    if (language === "cpp") return [path.endsWith(".h") || path.endsWith(".hpp") ? "H" : "C", path.endsWith(".h") || path.endsWith(".hpp") ? "header" : "cpp"];
    if (language === "json") return ["{}", "json"];
    if (language === "ini") return ["≡", "config"];
    if (language === "kerno-linker") return ["L", "linker"];
    if (language === "markdown") return ["M", "text"];
    return ["·", "text"];
  }

  function normalizePath(value) {
    const raw = String(value || "").replace(/\\/g, "/").replace(/^\/+/, "");
    const parts = [];
    for (const part of raw.split("/")) {
      if (!part || part === ".") continue;
      if (part === "..") return "";
      if (/[\\x00-\\x1f]/.test(part)) return "";
      parts.push(part);
    }
    return parts.join("/");
  }

  function setDefaultFiles() {
    const samples = starterFiles();
    state.files = {};
    for (const [path, value] of Object.entries(samples)) {
      state.files[path] = { content: value.content, language: languageFor(path) };
    }
    state.openTabs = ["src/kernel.cpp", "boot/entry.asm", "boot/grub.cfg"];
    state.activeFile = "src/kernel.cpp";
    state.splitFile = "boot/entry.asm";
    state.dirtyFiles.clear();
    state.collapsedFolders = new Set();
  }

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
    window.setTimeout(() => node.remove(), 3600);
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = "none";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function activeContent(path = state.activeFile) {
    if (state.models[path]) return state.models[path].getValue();
    if (path === state.activeFile && $("#fallbackEditor").style.display === "block") return $("#fallbackEditor").value;
    return state.files[path]?.content ?? "";
  }

  function markDirty(path) {
    state.dirtyFiles.add(path);
    $("#unsavedIndicator").textContent = "UNSAVED CHANGES";
    $("#unsavedIndicator").classList.add("unsaved");
    $("#saveStatus").textContent = "Unsaved source changes";
    renderTabs();
    clearTimeout(state.autosaveTimer);
    state.autosaveTimer = window.setTimeout(() => saveWorkspace(true), 850);
  }

  function currentWorkspacePayload() {
    const files = {};
    Object.keys(state.files).forEach(path => { files[path] = activeContent(path); });
    return {
      version: 1,
      projectName: state.projectName,
      theme: state.theme,
      settings: state.settings,
      files,
      savedAt: new Date().toISOString()
    };
  }

  function saveWorkspace(silent = false) {
    Object.keys(state.files).forEach(path => {
      state.files[path].content = activeContent(path);
    });
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(currentWorkspacePayload()));
      state.dirtyFiles.clear();
      $("#unsavedIndicator").textContent = "SAVED IN BROWSER";
      $("#unsavedIndicator").classList.remove("unsaved");
      $("#saveStatus").textContent = "Saved in this browser";
      renderTabs();
      if (!silent) toast("Workspace saved", "Source files are stored in this browser on this device.");
      return true;
    } catch (error) {
      $("#saveStatus").textContent = "Browser storage unavailable";
      if (!silent) toast("Could not save in browser", "Use Export project to keep an external copy.");
      return false;
    }
  }

  function restoreWorkspace() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const saved = JSON.parse(raw);
      if (!saved || saved.version !== 1 || !saved.files || typeof saved.files !== "object") return false;
      const restored = {};
      Object.entries(saved.files).forEach(([rawPath, content]) => {
        const path = normalizePath(rawPath);
        if (path && typeof content === "string") restored[path] = { content, language: languageFor(path) };
      });
      if (!Object.keys(restored).length) return false;
      state.files = restored;
      state.projectName = typeof saved.projectName === "string" ? saved.projectName : "Restored OS";
      state.settings = { ...state.settings, ...(saved.settings || {}) };
      state.theme = saved.theme === "light" ? "light" : "dark";
      const firstCpp = Object.keys(restored).find(path => path.endsWith(".cpp") || path.endsWith(".c")) || Object.keys(restored)[0];
      state.openTabs = [firstCpp, ...Object.keys(restored).filter(path => path !== firstCpp).slice(0, 2)];
      state.activeFile = firstCpp;
      state.splitFile = state.openTabs[1] || firstCpp;
      return true;
    } catch {
      return false;
    }
  }

  function makeModel(path, content) {
    if (!window.monaco) return null;
    const encoded = path.split("/").map(encodeURIComponent).join("/");
    const uri = window.monaco.Uri.parse("file:///kerno/" + encoded);
    const existing = window.monaco.editor.getModel(uri);
    if (existing) return existing;
    const model = window.monaco.editor.createModel(content, languageFor(path), uri);
    model.onDidChangeContent(() => {
      state.files[path].content = model.getValue();
      markDirty(path);
    });
    return model;
  }

  function ensureModel(path) {
    if (!state.files[path]) return null;
    if (!state.models[path] && window.monaco) {
      state.models[path] = makeModel(path, state.files[path].content);
    }
    return state.models[path] || null;
  }

  function renderTabs() {
    const host = $("#openFiles");
    host.innerHTML = "";
    state.openTabs.forEach(path => {
      if (!state.files[path]) return;
      const [mark, kind] = markFor(path);
      const tab = document.createElement("button");
      tab.className = "file-tab" + (path === state.activeFile ? " active" : "");
      tab.type = "button";
      const icon = document.createElement("span");
      icon.className = "file-mark " + kind;
      icon.textContent = mark;
      const name = document.createElement("span");
      name.className = "tab-name";
      name.textContent = path.split("/").pop();
      tab.append(icon, name);
      if (state.dirtyFiles.has(path)) {
        const dirty = document.createElement("span");
        dirty.className = "tab-dirty";
        tab.append(dirty);
      }
      const close = document.createElement("span");
      close.className = "tab-close";
      close.textContent = "×";
      close.title = "Close tab";
      tab.append(close);
      tab.addEventListener("click", event => {
        if (event.target === close) closeTab(path);
        else setActiveFile(path);
      });
      host.append(tab);
    });
  }

  function closeTab(path) {
    const index = state.openTabs.indexOf(path);
    if (index < 0) return;
    state.openTabs.splice(index, 1);
    if (!state.openTabs.length) {
      const next = Object.keys(state.files)[0];
      if (next) state.openTabs.push(next);
    }
    if (state.activeFile === path) {
      const next = state.openTabs[Math.max(0, Math.min(index, state.openTabs.length - 1))];
      if (next) setActiveFile(next);
    }
    renderTabs();
  }

  function setActiveFile(path) {
    if (!state.files[path]) return;
    state.activeFile = path;
    if (!state.openTabs.includes(path)) state.openTabs.push(path);
    const model = ensureModel(path);
    if (state.editor && model) state.editor.setModel(model);
    else if (!state.editor) {
      $("#fallbackEditor").value = state.files[path].content;
      $("#fallbackEditor").style.display = "block";
    }
    $("#activeFilePath").textContent = path;
    $("#paneFileName").textContent = path.split("/").pop();
    $("#languageStatus").textContent = languageLabel(path);
    $("#languageDot").className = "file-language-dot " + markFor(path)[1];
    $("#paneRole").textContent = roleFor(path);
    renderTabs();
    renderTree();
    if (state.editor) state.editor.focus();
  }

  function roleFor(path) {
    if (path.startsWith("boot/") && path.endsWith(".asm")) return "BOOT / LOW LEVEL";
    if (path.startsWith("boot/")) return "BOOT CONFIGURATION";
    if (path.startsWith("src/")) return "KERNEL SOURCE";
    if (path.startsWith("include/")) return "KERNEL INTERFACE";
    if (path.endsWith(".ld")) return "MEMORY LAYOUT";
    if (path.endsWith(".json")) return "PROJECT METADATA";
    if (path.endsWith(".md")) return "PROJECT DOCUMENTATION";
    return "SOURCE FILE";
  }

  function buildTreeData() {
    const root = { folders: new Map(), files: [] };
    Object.keys(state.files).sort((a, b) => a.localeCompare(b)).forEach(path => {
      const parts = path.split("/");
      let node = root;
      for (const folder of parts.slice(0, -1)) {
        if (!node.folders.has(folder)) node.folders.set(folder, { folders: new Map(), files: [], path: (node.path ? node.path + "/" : "") + folder });
        node = node.folders.get(folder);
      }
      node.files.push({ name: parts[parts.length - 1], path });
    });
    return root;
  }

  function renderTreeChildren(parent, node) {
    const folders = [...node.folders.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    folders.forEach(([name, child]) => {
      const wrapper = document.createElement("div");
      wrapper.className = "tree-folder";
      const head = document.createElement("button");
      head.className = "tree-folder-head";
      head.type = "button";
      const arrow = document.createElement("span");
      arrow.className = "folder-arrow";
      const collapsed = state.collapsedFolders.has(child.path);
      arrow.textContent = collapsed ? "›" : "⌄";
      const glyph = document.createElement("span");
      glyph.className = "folder-glyph";
      glyph.textContent = "▰";
      const label = document.createElement("span");
      label.textContent = name;
      const count = document.createElement("span");
      count.className = "folder-count";
      count.textContent = countFiles(child);
      head.append(arrow, glyph, label, count);
      head.addEventListener("click", () => {
        if (state.collapsedFolders.has(child.path)) state.collapsedFolders.delete(child.path);
        else state.collapsedFolders.add(child.path);
        renderTree();
      });
      wrapper.append(head);
      if (!collapsed) {
        const contents = document.createElement("div");
        contents.className = "folder-contents";
        renderTreeChildren(contents, child);
        wrapper.append(contents);
      }
      parent.append(wrapper);
    });
    node.files.forEach(item => {
      const row = document.createElement("button");
      row.className = "tree-file" + (state.activeFile === item.path ? " active" : "");
      row.type = "button";
      const [mark, kind] = markFor(item.path);
      const icon = document.createElement("span");
      icon.className = "file-mark " + kind;
      icon.textContent = mark;
      const name = document.createElement("span");
      name.className = "tree-file-name";
      name.textContent = item.name;
      row.append(icon, name);
      if (state.dirtyFiles.has(item.path)) {
        const dot = document.createElement("span");
        dot.className = "file-state";
        row.append(dot);
      }
      const actions = document.createElement("span");
      actions.className = "file-row-actions";
      const rename = document.createElement("button");
      rename.type = "button"; rename.textContent = "✎"; rename.title = "Rename file";
      rename.addEventListener("click", event => { event.stopPropagation(); renameFile(item.path); });
      const remove = document.createElement("button");
      remove.type = "button"; remove.textContent = "×"; remove.title = "Remove file";
      remove.addEventListener("click", event => { event.stopPropagation(); deleteFile(item.path); });
      actions.append(rename, remove);
      row.append(actions);
      row.addEventListener("click", () => setActiveFile(item.path));
      parent.append(row);
    });
  }

  function countFiles(node) {
    let count = node.files.length;
    for (const child of node.folders.values()) count += countFiles(child);
    return count;
  }

  function renderTree() {
    const host = $("#fileTree");
    if (!host) return;
    host.innerHTML = "";
    const tree = buildTreeData();
    renderTreeChildren(host, tree);
    $("#fileCountStatus").textContent = Object.keys(state.files).length + " source files";
  }

  function renameFile(oldPath) {
    const oldName = oldPath.split("/").pop();
    const proposed = window.prompt("Rename file", oldName);
    if (!proposed || proposed === oldName) return;
    const nextPath = normalizePath(oldPath.includes("/") ? oldPath.slice(0, oldPath.lastIndexOf("/") + 1) + proposed : proposed);
    if (!nextPath || state.files[nextPath]) {
      toast("Could not rename file", "Choose a valid, unused file name.");
      return;
    }
    const content = activeContent(oldPath);
    state.files[nextPath] = { content, language: languageFor(nextPath) };
    delete state.files[oldPath];
    if (state.models[oldPath]) {
      state.models[oldPath].dispose();
      delete state.models[oldPath];
    }
    if (state.openTabs.includes(oldPath)) state.openTabs = state.openTabs.map(path => path === oldPath ? nextPath : path);
    state.dirtyFiles.delete(oldPath);
    if (state.activeFile === oldPath) state.activeFile = nextPath;
    if (state.splitFile === oldPath) state.splitFile = nextPath;
    ensureModel(nextPath);
    setActiveFile(state.activeFile);
    updateSplitSelect();
    if (state.splitEditor) state.splitEditor.setModel(ensureModel(state.splitFile));
    saveWorkspace(true);
    toast("File renamed", oldPath + " → " + nextPath);
  }

  function deleteFile(path) {
    if (!window.confirm("Remove " + path + " from this workspace?")) return;
    if (state.models[path]) {
      state.models[path].dispose();
      delete state.models[path];
    }
    delete state.files[path];
    state.dirtyFiles.delete(path);
    state.openTabs = state.openTabs.filter(item => item !== path);
    if (!Object.keys(state.files).length) {
      state.files["src/kernel.cpp"] = { content: "// Start writing your kernel here.\\n", language: "cpp" };
    }
    if (state.activeFile === path) state.activeFile = state.openTabs[0] || Object.keys(state.files)[0];
    if (state.splitFile === path) state.splitFile = state.activeFile;
    if (!state.openTabs.length) state.openTabs.push(state.activeFile);
    setActiveFile(state.activeFile);
    updateSplitSelect();
    if (state.splitEditor) state.splitEditor.setModel(ensureModel(state.splitFile));
    saveWorkspace(true);
    toast("File removed", path);
  }

  function createFile() {
    $("#newFilePath").value = "src/new_module.cpp";
    $("#newFileModal").classList.remove("hidden");
    $("#newFilePath").focus();
    $("#newFilePath").select();
  }

  function confirmCreateFile() {
    const path = normalizePath($("#newFilePath").value.trim());
    if (!path || !/^[\w.\-/]+$/.test(path) || path.endsWith("/") || state.files[path]) {
      toast("Invalid file path", "Use a new relative path such as src/new_module.cpp.");
      return;
    }
    state.files[path] = { content: defaultContent(path), language: languageFor(path) };
    ensureModel(path);
    state.openTabs.push(path);
    $("#newFileModal").classList.add("hidden");
    setActiveFile(path);
    renderTree();
    markDirty(path);
    toast("Source file created", path);
  }

  function defaultContent(path) {
    const lang = languageFor(path);
    if (lang === "kerno-asm") return "; New NASM source file\\nBITS 64\\nSECTION .text\\n";
    if (lang === "cpp") return "#include <stdint.h>\\n\\n// New kernel module\\n";
    if (lang === "json") return "{\\n  \\n}\\n";
    if (lang === "kerno-linker") return "/* Linker script */\\nSECTIONS\\n{\\n    . = 1M;\\n}\\n";
    if (lang === "markdown") return "# New document\\n";
    return "";
  }

  function exportActiveFile() {
    if (!state.files[state.activeFile]) return toast("No file selected");
    const content = activeContent();
    downloadBlob(new Blob([content], { type: "text/plain;charset=utf-8" }), state.activeFile.split("/").pop());
    toast("File exported", state.activeFile.split("/").pop() + " downloaded.");
  }

  async function exportProject() {
    Object.keys(state.files).forEach(path => { state.files[path].content = activeContent(path); });
    const manifest = {
      format: "kerno-project",
      version: 1,
      projectName: state.projectName,
      target: "x86_64",
      exportedAt: new Date().toISOString(),
      files: Object.entries(state.files).map(([path, file]) => ({ path, content: file.content }))
    };
    if (!window.JSZip) {
      downloadBlob(new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" }), safeFileName(state.projectName) + ".kerno-project.json");
      toast("Project exported as JSON", "ZIP support is unavailable; all text source is included in the manifest.");
      return;
    }
    const zip = new window.JSZip();
    Object.entries(state.files).forEach(([path, file]) => zip.file(path, file.content));
    zip.file("Kerno-Project.json", JSON.stringify(manifest, null, 2));
    try {
      const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
      downloadBlob(blob, safeFileName(state.projectName) + ".kerno.zip");
      toast("Project archive exported", Object.keys(state.files).length + " source files packaged.");
    } catch (error) {
      toast("Export failed", error.message || "The project archive could not be created.");
    }
  }

  function safeFileName(name) {
    return String(name || "kerno-project").trim().replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "") || "kerno-project";
  }

  function isLikelyBinary(path) {
    return /\.(png|jpe?g|gif|webp|ico|bmp|elf|iso|bin|o|a|so|dll|exe|class|woff2?|ttf|pdf|mp3|mp4|zip)$/i.test(path);
  }

  async function addImportedText(path, content, overwrite = true) {
    const safePath = normalizePath(path);
    if (!safePath || isLikelyBinary(safePath)) return false;
    if (new Blob([content]).size > MAX_IMPORT_BYTES) return false;
    if (!overwrite && state.files[safePath]) return false;
    if (state.models[safePath]) state.models[safePath].dispose();
    state.files[safePath] = { content, language: languageFor(safePath) };
    delete state.models[safePath];
    ensureModel(safePath);
    if (!state.openTabs.includes(safePath)) state.openTabs.push(safePath);
    return true;
  }

  async function importZip(file) {
    if (!window.JSZip) throw new Error("ZIP support did not load. Check your network and try again.");
    const zip = await window.JSZip.loadAsync(file);
    let imported = 0;
    let skipped = 0;
    const entries = [];
    zip.forEach((path, entry) => { if (!entry.dir && path !== "Kerno-Project.json") entries.push([path, entry]); });
    for (const [path, entry] of entries) {
      if (isLikelyBinary(path)) { skipped++; continue; }
      const content = await entry.async("string");
      if (await addImportedText(path, content)) imported++;
      else skipped++;
    }
    const manifestFile = zip.file("Kerno-Project.json");
    if (manifestFile) {
      try {
        const manifest = JSON.parse(await manifestFile.async("string"));
        if (manifest.format === "kerno-project" && manifest.projectName) setProjectName(manifest.projectName);
      } catch { /* source archive remains usable even if its optional manifest is malformed */ }
    }
    return { imported, skipped };
  }

  async function importProjectManifest(file) {
    const manifest = JSON.parse(await file.text());
    if (manifest.format !== "kerno-project" || !Array.isArray(manifest.files)) return false;
    let imported = 0;
    for (const item of manifest.files) {
      if (typeof item.path === "string" && typeof item.content === "string" && await addImportedText(item.path, item.content)) imported++;
    }
    if (manifest.projectName) setProjectName(manifest.projectName);
    return imported;
  }

  async function importFiles(fileList) {
    const files = [...fileList];
    if (!files.length) return;
    let imported = 0;
    let skipped = 0;
    const commonRoot = files.length > 1 && files.every(file => file.webkitRelativePath) ?
      files.map(file => file.webkitRelativePath.split("/")[0]).every((root, _, all) => root === all[0]) : false;
    for (const file of files) {
      const name = file.name.toLowerCase();
      try {
        if (name.endsWith(".zip") || name.endsWith(".kerno")) {
          const result = await importZip(file);
          imported += result.imported; skipped += result.skipped;
          continue;
        }
        if (name.endsWith(".kerno-project.json")) {
          const count = await importProjectManifest(file);
          if (count === false) skipped++; else imported += count;
          continue;
        }
        if (isLikelyBinary(file.name) || file.size > MAX_IMPORT_BYTES) { skipped++; continue; }
        let path = file.webkitRelativePath || file.name;
        if (commonRoot) path = path.split("/").slice(1).join("/");
        if (await addImportedText(path, await file.text())) imported++;
        else skipped++;
      } catch (error) {
        skipped++;
        toast("Could not import " + file.name, error.message || "Unsupported or unreadable file.");
      }
    }
    if (imported) {
      const first = state.openTabs[state.openTabs.length - 1];
      if (first) setActiveFile(first);
      renderTree();
      renderTabs();
      saveWorkspace(true);
    }
    toast(imported + " file(s) imported", skipped ? skipped + " item(s) skipped (binary, oversized, or unsupported)." : "Added to the current workspace.");
  }

  function setProjectName(name) {
    state.projectName = String(name || "Untitled OS").trim().slice(0, 48) || "Untitled OS";
    $("#projectNameLabel").textContent = state.projectName;
    if ($("#sideProjectName")) $("#sideProjectName").textContent = state.projectName;
  }

  function applyTheme() {
    document.body.classList.toggle("light-theme", state.theme === "light");
    if (window.monaco && state.editor) {
      window.monaco.editor.setTheme(state.theme === "dark" ? "kerno-dark" : "kerno-light");
    }
  }

  function toggleTheme() {
    state.theme = state.theme === "dark" ? "light" : "dark";
    applyTheme();
    saveWorkspace(true);
    toast(state.theme === "dark" ? "Dark theme enabled" : "Light theme enabled");
  }

  function registerCustomLanguages(monaco) {
    monaco.languages.register({ id: "kerno-asm", extensions: [".asm", ".s", ".inc"], aliases: ["NASM", "Assembly", "asm"] });
    monaco.languages.setMonarchTokensProvider("kerno-asm", {
      tokenizer: {
        root: [
          [/;.*$/, "comment"],
          [/\b(section|global|extern|align|times|bits|default|db|dw|dd|dq|resb|resw|resd|equ|incbin)\b/i, "keyword"],
          [/\b(mov|add|sub|mul|div|cmp|jmp|je|jne|call|ret|push|pop|cli|sti|hlt|xor|lea|int|and|or|in|out|test|shl|shr)\b/i, "keyword"],
          [/\b(rax|rbx|rcx|rdx|rsi|rdi|rsp|rbp|r8|r9|r10|r11|r12|r13|r14|r15|eax|ebx|ecx|edx|ax|bx|cx|dx|al|ah|bl|bh)\b/i, "variable"],
          [/0x[0-9a-fA-F]+|\b\d+\b/, "number"],
          [/\.[a-zA-Z_][\w.]*/, "type"],
          [/\b[a-zA-Z_][\w]*:/, "type"],
          [/"[^"]*"/, "string"]
        ]
      }
    });
    monaco.languages.register({ id: "kerno-linker", extensions: [".ld"], aliases: ["Linker Script"] });
    monaco.languages.setMonarchTokensProvider("kerno-linker", {
      tokenizer: {
        root: [
          [/\/\*.*?\*\//, "comment"],
          [/\/\/.*$/, "comment"],
          [/\b(ENTRY|SECTIONS|KEEP|ALIGN|PROVIDE|ASSERT|ORIGIN|LENGTH)\b/, "keyword"],
          [/\.[a-zA-Z_][\w.]*/, "type"],
          [/0x[0-9a-fA-F]+|\b\d+[kKmM]?\b/, "number"],
          [/[{}():;]/, "delimiter"]
        ]
      }
    });
  }

  function defineThemes(monaco) {
    monaco.editor.defineTheme("kerno-dark", {
      base: "vs-dark", inherit: true,
      rules: [
        { token: "comment", foreground: "75889A", fontStyle: "italic" },
        { token: "keyword", foreground: "C5A4DF" },
        { token: "string", foreground: "A9D4B4" },
        { token: "number", foreground: "DDB77B" },
        { token: "type", foreground: "8CB9EF" },
        { token: "variable", foreground: "8CC9B3" }
      ],
      colors: {
        "editor.background": "#0E131A",
        "editor.foreground": "#DCE5EF",
        "editorLineNumber.foreground": "#566679",
        "editorLineNumber.activeForeground": "#C4D0DD",
        "editor.lineHighlightBackground": "#17212C",
        "editor.selectionBackground": "#34516B88",
        "editorCursor.foreground": "#9DD5BD",
        "editorIndentGuide.background1": "#202B37",
        "editorIndentGuide.activeBackground1": "#456052",
        "editorWidget.background": "#1A2530",
        "editorSuggestWidget.background": "#1A2530"
      }
    });
    monaco.editor.defineTheme("kerno-light", {
      base: "vs", inherit: true,
      rules: [
        { token: "comment", foreground: "788A96", fontStyle: "italic" },
        { token: "keyword", foreground: "8C50A8" },
        { token: "string", foreground: "357A51" },
        { token: "number", foreground: "9A641B" },
        { token: "type", foreground: "2767A5" }
      ],
      colors: {
        "editor.background": "#FFFFFF",
        "editor.foreground": "#263540",
        "editorLineNumber.foreground": "#9BA8B2",
        "editorLineNumber.activeForeground": "#526372",
        "editor.lineHighlightBackground": "#F1F6F5",
        "editorCursor.foreground": "#26795E",
        "editor.selectionBackground": "#B6DCCB88"
      }
    });
  }

  function editorOptions(model) {
    return {
      model,
      theme: state.theme === "dark" ? "kerno-dark" : "kerno-light",
      automaticLayout: true,
      fontFamily: '"DM Mono", Consolas, monospace',
      fontSize: Number(state.settings.fontSize) || 13,
      lineHeight: 22,
      minimap: { enabled: false },
      padding: { top: 17, bottom: 20 },
      scrollBeyondLastLine: false,
      renderLineHighlight: "line",
      cursorBlinking: "smooth",
      smoothScrolling: true,
      roundedSelection: false,
      tabSize: Number(state.settings.tabSize) || 4,
      wordWrap: state.settings.wordWrap,
      glyphMargin: false,
      folding: true,
      guides: { indentation: true },
      automaticClosingBrackets: "always",
      bracketPairColorization: { enabled: true },
      suggest: { showWords: true }
    };
  }

  function initMonaco() {
    if (!window.require || !window.require.config) {
      showFallbackEditor();
      toast("Monaco could not load", "The built-in text area is available. Check the CDN connection for syntax highlighting.");
      return;
    }
    window.require.config({ paths: { vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs" } });
    window.MonacoEnvironment = {
      getWorkerUrl: function () {
        const worker = "self.MonacoEnvironment={baseUrl:'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/'};importScripts('https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs/base/worker/workerMain.js');";
        return "data:text/javascript;charset=utf-8," + encodeURIComponent(worker);
      }
    };
    window.require(["vs/editor/editor.main"], function () {
      const monaco = window.monaco;
      registerCustomLanguages(monaco);
      defineThemes(monaco);
      Object.entries(state.files).forEach(([path, file]) => {
        state.models[path] = makeModel(path, file.content);
      });
      state.editor = monaco.editor.create($("#editorHost"), editorOptions(state.models[state.activeFile]));
      state.editor.onDidChangeCursorPosition(event => {
        $("#cursorStatus").textContent = "Ln " + event.position.lineNumber + ", Col " + event.position.column;
      });
      state.editor.onDidChangeModel(() => updateActiveFileMeta());
      $("#fallbackEditor").style.display = "none";
      if (!$("#splitPane").classList.contains("hidden")) createSplitEditor();
      updateActiveFileMeta();
    }, function () {
      showFallbackEditor();
      toast("Monaco could not load", "Using the built-in text editor instead.");
    });
  }

  function showFallbackEditor() {
    $("#fallbackEditor").style.display = "block";
    $("#fallbackEditor").value = state.files[state.activeFile]?.content || "";
    $("#fallbackEditor").oninput = () => {
      if (!state.files[state.activeFile]) return;
      state.files[state.activeFile].content = $("#fallbackEditor").value;
      markDirty(state.activeFile);
    };
    $("#fallbackEditor").onkeyup = updateCursorFromFallback;
    $("#fallbackEditor").onclick = updateCursorFromFallback;
  }

  function updateCursorFromFallback() {
    const input = $("#fallbackEditor");
    const before = input.value.slice(0, input.selectionStart);
    const line = before.split("\\n");
    $("#cursorStatus").textContent = "Ln " + line.length + ", Col " + (line[line.length - 1].length + 1);
  }

  function updateActiveFileMeta() {
    $("#activeFilePath").textContent = state.activeFile;
    $("#paneFileName").textContent = state.activeFile.split("/").pop();
    $("#languageStatus").textContent = languageLabel(state.activeFile);
    $("#paneRole").textContent = roleFor(state.activeFile);
  }

  function createSplitEditor() {
    if (!window.monaco || !state.editor) return;
    if (!state.splitFile || !state.files[state.splitFile]) state.splitFile = state.openTabs.find(path => path !== state.activeFile) || state.activeFile;
    $("#splitPane").classList.remove("hidden");
    $("#splitButton").classList.add("active");
    updateSplitSelect();
    if (!state.splitEditor) {
      state.splitEditor = window.monaco.editor.create($("#splitEditorHost"), editorOptions(ensureModel(state.splitFile)));
    } else {
      state.splitEditor.setModel(ensureModel(state.splitFile));
      state.splitEditor.layout();
    }
    state.editor.layout();
  }

  function updateSplitSelect() {
    const select = $("#splitFileSelect");
    if (!select) return;
    select.innerHTML = "";
    Object.keys(state.files).sort().forEach(path => {
      const option = document.createElement("option");
      option.value = path;
      option.textContent = path;
      option.selected = path === state.splitFile;
      select.append(option);
    });
  }

  function closeSplit() {
    $("#splitPane").classList.add("hidden");
    $("#splitButton").classList.remove("active");
    state.splitEditor?.layout();
    state.editor?.layout();
  }

  function toggleSplit() {
    if (!$("#splitPane").classList.contains("hidden")) {
      closeSplit();
      return;
    }
    state.splitFile = state.openTabs.find(path => path !== state.activeFile) || state.activeFile;
    createSplitEditor();
    toast("Split editor opened", "Both panes edit the same project files.");
  }

  const outputViews = {
    problems: '<div class="output-empty"><span class="empty-icon">✓</span><div><strong>No editor problems detected</strong><p>Live compiler diagnostics will appear when a build service is connected.</p></div></div>',
    build: '<div class="output-empty"><span class="empty-icon">⌁</span><div><strong>No build has been run</strong><p>Build output is not simulated as a successful compilation. Connect a native toolchain to build a real kernel.</p></div></div>',
    serial: '<div class="output-empty"><span class="empty-icon">∿</span><div><strong>Serial channel is disconnected</strong><p>Kernel serial output will appear here when a QEMU session is connected.</p></div></div>',
    notes: '<div class="output-line"><span class="output-info">[EDITOR]</span><span>Monaco provides source editing and syntax highlighting for C/C++, NASM Assembly, linker scripts, JSON, GRUB configuration, and Markdown.</span></div><div class="output-line"><span class="output-info">[FILES]</span><span>Import individual source files, a directory, or a Kerno ZIP archive. Export the active file or the complete project.</span></div><div class="output-line"><span class="output-warn">[BUILD]</span><span>Build &amp; Boot is a frontend placeholder. No compiler, linker, GRUB tool, ISO packager, or QEMU process runs in the browser.</span></div>'
  };

  function setOutput(view) {
    state.activeOutput = view;
    $$(".output-tab").forEach(tab => tab.classList.toggle("active", tab.dataset.output === view));
    $("#outputContent").innerHTML = outputViews[view] || outputViews.problems;
  }

  function appendOutput(message, type = "info") {
    const line = document.createElement("div");
    line.className = "output-line";
    const stamp = document.createElement("span");
    stamp.className = type === "warn" ? "output-warn" : type === "ok" ? "output-ok" : "output-info";
    stamp.textContent = "[" + new Date().toLocaleTimeString() + "]";
    const text = document.createElement("span");
    text.textContent = message;
    line.append(stamp, text);
    $("#outputContent").append(line);
  }

  function runBuildPreview() {
    setOutput("build");
    $("#outputContent").innerHTML = "";
    appendOutput("Kerno frontend requested a build.", "info");
    appendOutput("No native toolchain is connected. No compile or ISO packaging was attempted.", "warn");
    appendOutput("Next integration: local build service with NASM, cross-compiler, linker, GRUB and xorriso.", "info");
    toast("Build service not connected", "This action does not create an ISO or start an emulator.");
  }

  function renderProjectView() {
    $("#sideHeading").textContent = "Project map";
    $("#sideActionButton").title = "Create source file";
    $("#sideActionButton").textContent = "＋";
    $("#panelView").innerHTML = `<div class="project-card"><div class="project-card-icon">K</div><div class="project-card-copy"><strong id="sideProjectName"></strong><span>Kernel project · source workspace</span></div><span class="live-dot"></span></div><div class="tree-toolbar"><span>PROJECT FILES</span><div><button class="mini-action" id="newFileButton" title="New file">＋</button><button class="mini-action" id="importFolderButton" title="Import source folder">⇧</button><button class="mini-action" id="refreshTreeButton" title="Refresh file map">↻</button></div></div><div class="file-tree" id="fileTree"></div><div class="panel-footnote"><span class="footnote-mark">i</span><span>Source files are editable. Save locally or export a project archive.</span></div>`;
    $("#sideProjectName").textContent = state.projectName;
    $("#newFileButton").addEventListener("click", createFile);
    $("#importFolderButton").addEventListener("click", () => $("#folderInput").click());
    $("#refreshTreeButton").addEventListener("click", () => { renderTree(); toast("Project map refreshed"); });
    renderTree();
  }

  const snippets = [
    { group: "C++ KERNEL", items: [
      { name: "Kernel entry point", detail: "Freestanding kernel_main()", language: "cpp", code: 'extern "C" void kernel_main() {\\n    // Kernel initialization starts here.\\n    for (;;) {\\n        __asm__ volatile ("hlt");\\n    }\\n}\\n' },
      { name: "VGA text cell", detail: "Write one character to text memory", language: "cpp", code: "volatile uint16_t* const vga = reinterpret_cast<volatile uint16_t*>(0xB8000);\\nvga[0] = static_cast<uint16_t>(\'K\') | (static_cast<uint16_t>(0x0F) << 8);\\n" },
      { name: "Freestanding memset", detail: "Small memory initialization helper", language: "cpp", code: 'extern "C" void* kerno_memset(void* dst, int value, size_t size) {\\n    auto* out = static_cast<uint8_t*>(dst);\\n    for (size_t i = 0; i < size; ++i) out[i] = static_cast<uint8_t>(value);\\n    return dst;\\n}\\n' }
    ]},
    { group: "NASM ASSEMBLY", items: [
      { name: "64-bit entry stub", detail: "Kernel entry after long-mode handoff", language: "asm", code: "BITS 64\\nSECTION .text\\nGLOBAL _start\\nEXTERN kernel_main\\n_start:\\n    cli\\n    call kernel_main\\n.hang:\\n    hlt\\n    jmp .hang\\n" },
      { name: "Port output", detail: "Write one byte to an I/O port", language: "asm", code: "GLOBAL kerno_outb\\nkerno_outb:\\n    mov dx, di\\n    mov al, sil\\n    out dx, al\\n    ret\\n" },
      { name: "Save general registers", detail: "Simple register preservation pattern", language: "asm", code: "    push rbx\\n    push rbp\\n    push r12\\n    ; ... your routine ...\\n    pop r12\\n    pop rbp\\n    pop rbx\\n    ret\\n" }
    ]}
  ];

  function insertAtCursor(text) {
    if (state.editor) {
      const selection = state.editor.getSelection();
      state.editor.executeEdits("kerno-snippet", [{ range: selection, text, forceMoveMarkers: true }]);
      state.editor.focus();
    } else {
      const input = $("#fallbackEditor");
      const start = input.selectionStart;
      const end = input.selectionEnd;
      input.setRangeText(text, start, end, "end");
      state.files[state.activeFile].content = input.value;
      markDirty(state.activeFile);
      input.focus();
    }
  }

  function renderSnippetsView() {
    $("#sideHeading").textContent = "Code patterns";
    $("#sideActionButton").textContent = "?";
    $("#sideActionButton").title = "How code patterns work";
    $("#panelView").innerHTML = '<div class="panel-footnote"><span class="footnote-mark">+</span><span>Select a pattern to insert it at the editor cursor. Choose the matching language file first.</span></div>';
    snippets.forEach(group => {
      const block = document.createElement("div");
      block.className = "snippet-group";
      const heading = document.createElement("h3");
      heading.textContent = group.group;
      block.append(heading);
      group.items.forEach(item => {
        const button = document.createElement("button");
        button.className = "snippet-button";
        const name = document.createElement("strong");
        name.textContent = item.name;
        const detail = document.createElement("span");
        detail.textContent = item.detail;
        button.append(name, detail);
        button.addEventListener("click", () => {
          const isAsm = item.language === "asm";
          if (isAsm !== (languageFor(state.activeFile) === "kerno-asm")) {
            toast("Choose a matching source file", isAsm ? "Open a .asm file before inserting this Assembly pattern." : "Open a C or C++ file before inserting this pattern.");
            return;
          }
          insertAtCursor(item.code);
          toast("Pattern inserted", item.name);
        });
        block.append(button);
      });
      $("#panelView").append(block);
    });
  }

  function renderSettingsView() {
    $("#sideHeading").textContent = "Editor settings";
    $("#sideActionButton").textContent = "↺";
    $("#sideActionButton").title = "Reset editor settings";
    $("#panelView").innerHTML = `<label class="setting-row">Font size<select id="fontSizeSetting"><option value="11">11 px</option><option value="12">12 px</option><option value="13">13 px</option><option value="14">14 px</option><option value="15">15 px</option><option value="16">16 px</option></select></label><label class="setting-row">Tab width<select id="tabSizeSetting"><option value="2">2 spaces</option><option value="4">4 spaces</option><option value="8">8 spaces</option></select></label><label class="setting-row">Line wrapping<select id="wordWrapSetting"><option value="off">Off</option><option value="on">On</option></select></label><p class="setting-note">These settings apply to the Monaco editor and are stored with this browser workspace.</p><button class="tool-button" id="themeSettingButton">Toggle dark / light theme</button>`;
    $("#fontSizeSetting").value = String(state.settings.fontSize);
    $("#tabSizeSetting").value = String(state.settings.tabSize);
    $("#wordWrapSetting").value = state.settings.wordWrap;
    $("#fontSizeSetting").addEventListener("change", event => updateEditorSetting("fontSize", Number(event.target.value)));
    $("#tabSizeSetting").addEventListener("change", event => updateEditorSetting("tabSize", Number(event.target.value)));
    $("#wordWrapSetting").addEventListener("change", event => updateEditorSetting("wordWrap", event.target.value));
    $("#themeSettingButton").addEventListener("click", toggleTheme);
  }

  function updateEditorSetting(key, value) {
    state.settings[key] = value;
    [state.editor, state.splitEditor].forEach(editor => {
      if (!editor) return;
      if (key === "fontSize") editor.updateOptions({ fontSize: value });
      if (key === "tabSize") editor.updateOptions({ tabSize: value });
      if (key === "wordWrap") editor.updateOptions({ wordWrap: value });
    });
    saveWorkspace(true);
  }

  function activateView(view) {
    state.activeView = view;
    $$(".rail-button[data-view]").forEach(button => button.classList.toggle("active", button.dataset.view === view));
    if (view === "project") renderProjectView();
    if (view === "snippets") renderSnippetsView();
    if (view === "settings") renderSettingsView();
  }

  const commands = [
    ["Save workspace", "save", "Ctrl + S"],
    ["Import files / ZIP project", "import", "Ctrl + O"],
    ["Export active source file", "export-file", "Ctrl + Shift + E"],
    ["Export complete project ZIP", "export-project", "Ctrl + Shift + S"],
    ["Create source file", "new-file", ""],
    ["Open project map", "project", ""],
    ["Open code patterns", "snippets", ""],
    ["Open editor settings", "settings", ""],
    ["Toggle split editor", "split", ""],
    ["Toggle output panel", "output", "Ctrl + J"],
    ["Build & Boot (preview)", "build", "Ctrl + B"],
    ["Toggle light / dark theme", "theme", ""],
    ["Toggle focus mode", "focus", ""]
  ];

  function openCommandPalette() {
    $("#commandBackdrop").classList.remove("hidden");
    $("#commandInput").value = "";
    renderCommands("");
    $("#commandInput").focus();
  }

  function renderCommands(query) {
    const q = query.trim().toLowerCase();
    const items = [
      ...commands.filter(item => item[0].toLowerCase().includes(q)).map(item => ({ label: item[0], action: item[1], key: item[2] })),
      ...Object.keys(state.files).filter(path => path.toLowerCase().includes(q)).map(path => ({ label: "Open " + path, action: "file:" + path, key: "FILE" }))
    ];
    const host = $("#commandResults");
    host.innerHTML = "";
    items.forEach((item, index) => {
      const button = document.createElement("button");
      button.className = "command-item" + (index === 0 ? " active" : "");
      const label = document.createElement("span");
      label.textContent = item.label;
      const key = document.createElement("kbd");
      key.textContent = item.key || "↵";
      button.append(label, key);
      button.addEventListener("click", () => runCommand(item.action));
      host.append(button);
    });
    if (!items.length) {
      const none = document.createElement("div");
      none.className = "command-item";
      none.textContent = "No matching action or file";
      host.append(none);
    }
  }

  function runCommand(action) {
    $("#commandBackdrop").classList.add("hidden");
    if (action.startsWith("file:")) return setActiveFile(action.slice(5));
    const actions = {
      save: () => saveWorkspace(),
      import: () => $("#importInput").click(),
      "export-file": exportActiveFile,
      "export-project": exportProject,
      "new-file": createFile,
      project: () => activateView("project"),
      snippets: () => activateView("snippets"),
      settings: () => activateView("settings"),
      split: toggleSplit,
      output: toggleOutput,
      build: runBuildPreview,
      theme: toggleTheme,
      focus: toggleFocusMode
    };
    actions[action]?.();
  }

  function toggleOutput() {
    const panel = $("#outputPanel");
    const resizer = $("#bottomResizer");
    const hidden = panel.classList.toggle("collapsed");
    resizer.style.display = hidden ? "none" : "";
  }

  function toggleFocusMode() {
    document.body.classList.toggle("focus-mode");
    state.editor?.layout();
    state.splitEditor?.layout();
  }

  function createProject() {
    const name = $("#newProjectName").value.trim() || "Untitled OS";
    if (!window.confirm("Create a new workspace? The current workspace will be replaced in this browser. Export it first to keep a copy.")) return;
    setDefaultFiles();
    if (state.selectedStarter === "framebuffer") {
      state.files["src/framebuffer.cpp"] = {
        language: "cpp",
        content: `#include <stdint.h>

// Framebuffer interface placeholder.
// Connect this structure to the framebuffer information supplied by your boot protocol.
struct Framebuffer {
    uintptr_t address;
    uint32_t width;
    uint32_t height;
    uint32_t pitch;
    uint8_t bits_per_pixel;
};

void framebuffer_initialize(const Framebuffer& framebuffer) {
    (void)framebuffer;
    // Validate pixel format and dimensions before drawing.
}
`
      };
    }
    Object.values(state.models).forEach(model => model.dispose());
    state.models = {};
    state.editor?.dispose();
    state.splitEditor?.dispose();
    state.editor = null;
    state.splitEditor = null;
    setProjectName(name);
    state.openTabs = ["src/kernel.cpp", "boot/entry.asm", "boot/grub.cfg"];
    state.activeFile = "src/kernel.cpp";
    state.splitFile = "boot/entry.asm";
    $("#newProjectModal").classList.add("hidden");
    activateView("project");
    renderTabs();
    if (window.monaco) {
      Object.entries(state.files).forEach(([path, file]) => state.models[path] = makeModel(path, file.content));
      state.editor = window.monaco.editor.create($("#editorHost"), editorOptions(state.models[state.activeFile]));
      if (!$("#splitPane").classList.contains("hidden")) createSplitEditor();
      $("#fallbackEditor").style.display = "none";
    } else {
      showFallbackEditor();
    }
    setActiveFile(state.activeFile);
    saveWorkspace(true);
    toast("New OS workspace created", name + " · starter source files loaded.");
  }

  function setProjectName(name) {
    state.projectName = String(name || "Untitled OS").trim().slice(0, 48) || "Untitled OS";
    $("#projectNameLabel").textContent = state.projectName;
    $("#sideProjectName").textContent = state.projectName;
  }

  function bindResizer(element, onMove) {
    element.addEventListener("pointerdown", event => {
      event.preventDefault();
      element.classList.add("dragging");
      element.setPointerCapture(event.pointerId);
      const move = moveEvent => onMove(moveEvent.clientY);
      const stop = () => {
        element.classList.remove("dragging");
        element.removeEventListener("pointermove", move);
        element.removeEventListener("pointerup", stop);
        state.editor?.layout();
        state.splitEditor?.layout();
      };
      element.addEventListener("pointermove", move);
      element.addEventListener("pointerup", stop);
    });
  }

  function applyOutputSize(height) {
    const bounded = Math.max(90, Math.min(window.innerHeight * .62, window.innerHeight - 150));
    document.documentElement.style.setProperty("--output-height", Math.max(90, Math.min(height, bounded)) + "px");
  }

  function wireEvents() {
    $("#newProjectButton").addEventListener("click", () => $("#newProjectModal").classList.remove("hidden"));
    $("#importButton").addEventListener("click", () => $("#importInput").click());
    $("#importInput").addEventListener("change", event => { importFiles(event.target.files); event.target.value = ""; });
    $("#folderInput").addEventListener("change", event => { importFiles(event.target.files); event.target.value = ""; });
    $("#exportFileButton").addEventListener("click", exportActiveFile);
    $("#exportProjectButton").addEventListener("click", exportProject);
    $("#buildButton").addEventListener("click", runBuildPreview);
    $("#saveButton").addEventListener("click", () => saveWorkspace());
    $("#splitButton").addEventListener("click", toggleSplit);
    $("#closeSplitButton").addEventListener("click", closeSplit);
    $("#splitFileSelect").addEventListener("change", event => {
      state.splitFile = event.target.value;
      if (state.splitEditor) state.splitEditor.setModel(ensureModel(state.splitFile));
    });
    $("#newFileButton").addEventListener("click", createFile);
    $("#sideActionButton").addEventListener("click", () => {
      if (state.activeView === "settings") {
        state.settings = { fontSize: 13, tabSize: 4, wordWrap: "off" };
        renderSettingsView();
        updateEditorSetting("fontSize", 13);
        updateEditorSetting("tabSize", 4);
        updateEditorSetting("wordWrap", "off");
      } else if (state.activeView === "snippets") {
        toast("Code patterns", "Select a pattern below to insert it at the cursor.");
      } else createFile();
    });
    $("#refreshTreeButton").addEventListener("click", () => { renderTree(); toast("Project map refreshed"); });
    $("#themeButton").addEventListener("click", toggleTheme);
    $("#focusButton").addEventListener("click", toggleFocusMode);
    $("#commandButton").addEventListener("click", openCommandPalette);
    $("#helpButton").addEventListener("click", () => {
      setOutput("notes");
      toast("Kerno Kernel Studio", "A focused OS source workspace with browser-based import and export.");
    });
    $("#editorMenuButton").addEventListener("click", openCommandPalette);
    $("#clearOutputButton").addEventListener("click", () => { $("#outputContent").innerHTML = ""; });
    $("#expandOutputButton").addEventListener("click", () => {
      state.outputExpanded = !state.outputExpanded;
      applyOutputSize(state.outputExpanded ? window.innerHeight * .48 : 190);
      $("#expandOutputButton").textContent = state.outputExpanded ? "⌄" : "⌃";
    });
    $("#hideOutputButton").addEventListener("click", toggleOutput);
    $$(".output-tab").forEach(tab => tab.addEventListener("click", () => setOutput(tab.dataset.output)));
    $$(".rail-button[data-view]").forEach(button => button.addEventListener("click", () => activateView(button.dataset.view)));
    $("#closeNewFileModal").addEventListener("click", () => $("#newFileModal").classList.add("hidden"));
    $("#cancelNewFile").addEventListener("click", () => $("#newFileModal").classList.add("hidden"));
    $("#confirmNewFile").addEventListener("click", confirmCreateFile);
    $("#newFilePath").addEventListener("keydown", event => { if (event.key === "Enter") confirmCreateFile(); });
    $("#newFileModal").addEventListener("click", event => { if (event.target === $("#newFileModal")) $("#newFileModal").classList.add("hidden"); });
    $("#closeNewProjectModal").addEventListener("click", () => $("#newProjectModal").classList.add("hidden"));
    $("#cancelNewProject").addEventListener("click", () => $("#newProjectModal").classList.add("hidden"));
    $("#confirmNewProject").addEventListener("click", createProject);
    $("#newProjectModal").addEventListener("click", event => { if (event.target === $("#newProjectModal")) $("#newProjectModal").classList.add("hidden"); });
    $$(".starter-card").forEach(card => card.addEventListener("click", () => {
      state.selectedStarter = card.dataset.starter;
      $$(".starter-card").forEach(item => item.classList.toggle("selected", item === card));
    }));
    bindResizer($("#bottomResizer"), y => applyOutputSize(window.innerHeight - y - 23));

    $("#commandInput").addEventListener("input", event => renderCommands(event.target.value));
    $("#commandInput").addEventListener("keydown", event => {
      if (event.key === "Escape") $("#commandBackdrop").classList.add("hidden");
      if (event.key === "Enter") $(".command-item.active")?.click() || $(".command-item")?.click();
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const items = $$(".command-item", $("#commandResults"));
        if (!items.length) return;
        const current = items.findIndex(item => item.classList.contains("active"));
        const next = event.key === "ArrowDown" ? (current + 1) % items.length : (current - 1 + items.length) % items.length;
        items.forEach((item, index) => item.classList.toggle("active", index === next));
        items[next].scrollIntoView({ block: "nearest" });
      }
    });
    $("#commandBackdrop").addEventListener("click", event => {
      if (event.target === $("#commandBackdrop")) $("#commandBackdrop").classList.add("hidden");
    });
    document.addEventListener("keydown", event => {
      const mod = event.ctrlKey || event.metaKey;
      if (mod && event.shiftKey && event.key.toLowerCase() === "p") { event.preventDefault(); openCommandPalette(); }
      if (mod && event.key.toLowerCase() === "s") { event.preventDefault(); saveWorkspace(); }
      if (mod && event.key.toLowerCase() === "o") { event.preventDefault(); $("#importInput").click(); }
      if (mod && event.shiftKey && event.key.toLowerCase() === "e") { event.preventDefault(); exportActiveFile(); }
      if (mod && event.shiftKey && event.key.toLowerCase() === "s") { event.preventDefault(); exportProject(); }
      if (mod && event.key.toLowerCase() === "b") { event.preventDefault(); runBuildPreview(); }
      if (mod && event.key.toLowerCase() === "j") { event.preventDefault(); toggleOutput(); }
      if (event.key === "Escape") {
        $("#commandBackdrop").classList.add("hidden");
        $("#newFileModal").classList.add("hidden");
        $("#newProjectModal").classList.add("hidden");
      }
    });
  }

  function boot() {
    setDefaultFiles();
    const restored = restoreWorkspace();
    setProjectName(state.projectName);
    $("#newProjectName").value = state.projectName;
    $("#outputContent").innerHTML = outputViews.problems;
    if (state.theme === "light") document.body.classList.add("light-theme");
    renderProjectView();
    renderTabs();
    setActiveFile(state.activeFile);
    updateSplitSelect();
    wireEvents();
    initMonaco();
    if (restored) toast("Workspace restored", "Your last browser-saved Kerno source project was reopened.");
    else $("#saveStatus").textContent = "Starter workspace loaded";
  }

  boot();
})();
