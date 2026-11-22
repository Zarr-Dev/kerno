# Kerno

**All-in-One Operating System Builder IDE**

Kerno is a website-first, OS-focused development environment for organizing kernel source, editing Assembly and C/C++, configuring the boot path, and preparing operating-system projects for native builds and emulator testing.

## Current frontend: Kernel Studio

The current frontend is a browser-based source workspace with an OS-oriented project map rather than a generic code-editor shell.

### Editor and source languages

- Monaco Editor for C, C++, NASM Assembly, linker scripts, JSON, GRUB configuration, and Markdown.
- Multi-file tabs and a two-pane split editor.
- Starter source files for kernel entry, console output, memory helpers, port I/O examples, GRUB configuration, and linker layout.
- Code patterns panel for inserting small C++ and Assembly examples at the cursor.
- Editor controls for font size, tab width, line wrapping, and light/dark theme.

### Project file operations

- Import multiple text/source files.
- Import a directory using the browser's folder picker.
- Import a Kerno ZIP archive.
- Export the active source file.
- Export the entire source workspace as a `.kerno.zip` archive, preserving relative file paths.
- Create, rename, and remove source files.
- Browser-local workspace save and automatic draft restore.

The browser editor accepts text-based source and project files. Binary artifacts such as ISO, ELF, object, image, and executable files are intentionally not loaded into the text editor.

## Run locally

Kerno uses no frontend framework or bundler. Serve this directory over HTTP:

```bash
python -m http.server 8000
```

Open [http://localhost:8000](http://localhost:8000).

The Monaco Editor and ZIP import/export library are loaded from pinned CDN versions. An internet connection is required for syntax highlighting and ZIP archive support. If Monaco is unavailable, a basic text-area editor remains available.

## Repository structure

```text
kerno/
├── index.html
├── styles.css
├── script.js
└── README.md
```

## Important architecture boundary

A normal browser page cannot directly execute native programs such as NASM, a cross-compiler, a linker, GRUB tooling, xorriso, or QEMU. The current **Build & Boot** control is explicitly a frontend placeholder; it does not claim a successful compilation, create an ISO, or launch a VM.

Real builds and emulator sessions will require a separately designed local execution service or another authorized backend. The current source files are editable starter examples and have not yet been validated as a complete bootable OS toolchain.

## Roadmap

1. Refine Kernel Studio editor and file operations.
2. Add a versioned workspace/project format and richer OS configuration.
3. Connect an asynchronous local build service and native toolchain.
4. Add QEMU lifecycle management, serial output, and emulator streaming.
5. Validate real ISO creation, export, and production packaging.

## License

To be decided.
