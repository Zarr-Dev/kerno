# Kerno

**All-in-One Operating System Builder IDE**

Kerno is a website-first operating-system development environment. It combines a kernel source editor, project scaffolding, target and memory configuration, native build orchestration, and QEMU testing through a local execution service.

## Current product surface

### Project Hub

The first screen has no account requirement. It provides **New Project**, **Load Project**, and **Settings**, plus a list of recent workspaces stored in the current browser profile.

### Kernel Studio

- Vanilla HTML, CSS and JavaScript frontend.
- Monaco Editor for C, C++, NASM Assembly, GNU Assembly, linker scripts, GRUB configuration, JSON and Markdown.
- Multi-file source tabs, split editor, file tree, source import/export and project ZIP archives.
- OS-focused source scaffolds, including x86_64 Multiboot2 entry code, serial output, text console, memory helpers, a physical-frame allocator starter and an IDT starter.
- Settings categories for General, Appearance, Language, Editor, OS Architecture, Memory, QEMU & Emulator, Toolchain, Boot & Firmware, Diagnostics, Storage, Advanced, Accessibility and Keyboard Shortcuts.
- Separate **IDE defaults** and **current-project configuration**. Applying project settings does not overwrite the defaults used by future projects.

### Machine workspace

The Machine workspace contains a QEMU viewport, serial output, a hardware profile and process controls. The frontend uses the local execution service for QEMU lifecycle operations and a noVNC client for the VNC WebSocket stream.

### Native build and ISO export

A local build service can run the configured assembler, C/C++ cross-compilers, linker, GRUB ISO tooling and QEMU. Build results are reported only after the local service verifies the ELF/Multiboot2 output and returns an artifact.

**Current native build gate:** x86_64 + BIOS + GRUB + Multiboot2. The i686, AArch64 and RISC-V selections remain editable scaffolds; they are not currently claimed to produce bootable images.

## Run the website

Kerno uses no frontend framework or build step. Serve the repository root over HTTP:

```bash
python -m http.server 8000
```

Open http://localhost:8000.

Monaco Editor, JSZip and the noVNC client are loaded from version-pinned CDNs, so an internet connection is required for those features. A basic text editor remains available if Monaco does not load.

## Run Kerno Local Service

The native service is a separate local process. It does not run inside the browser and it must be started by the user on the machine that should compile and run the guest OS.

Requirements:
- Python 3.10 or newer.
- For native x86_64 ISO builds: NASM, `x86_64-elf-g++`, `x86_64-elf-gcc`, `x86_64-elf-ld`, `grub-mkrescue` and `xorriso`.
- For emulator testing: `qemu-system-x86_64`.

Start the service:

**Windows:** run `local-agent/start-local-agent.bat`.

**Linux/macOS:** run `local-agent/start-local-agent.sh`.

The service binds only to `127.0.0.1:8765). On startup it prints a pairing token. Copy that token into **Kerno Settings → Advanced → Pairing token**, keep the terminal service running, then use **Test local service** or **Connect local service** in Kerno.

The service stores its token and working files under `~/.kerno-local` (or the `KERNO_DATA_DIR` override). It exposes a loopback-only API, validates source paths and project-size limits, uses argument arrays rather than shell command strings, limits concurrent builds with a build lock, and manages QEMU process shutdown.

For a hosted Kerno website, the local service checks its Origin against the allow-list in `local-agent/local_agent.py`. Set `KERNO_ALLOWED_ORIGINS` to a comma-separated list of additional trusted website origins when self-hosting.

## Native build scope and kernel limitations

The first native pipeline is intentionally narrow: x86_64, BIOS firmware, GRUB and Multiboot2. The generated x86_64 entry stub establishes a 1 GiB identity map before entering long mode. The physical-frame allocator starter consumes the Multiboot2 memory map and manages 4 KiB frames within that 1 GiB mapped region. It maintains separate free/used and allocated-frame bitmaps so a frame that was never allocated by the PMM cannot be released through its public release function.

The starter IDT installs a fail-stop default handler, while external interrupts remain disabled. It is not a complete interrupt controller, scheduler, virtual-memory subsystem, heap allocator, SMP implementation or production kernel. Review and test every hardware-facing module before using it outside a disposable emulator.

The RAM and reservation settings are project planning and QEMU configuration inputs. They do not reserve host memory. The local service can report host-memory availability, but the guest allocator is a separate kernel subsystem.

## Data and privacy

- Workspace files and settings are stored in the browser's IndexedDB.
- Project archives can be exported as ZIP files.
- Native builds and QEMU run locally only after the pairing token is configured.
- The local service token is a local capability credential. Do not commit it to Git or share it.
- The local service does not accept arbitrary shell command strings from the frontend.

## Repository layout

```text
kerno/
├── index.html
├── styles.css
├── script.js
├── local-agent.js
├── novnc-client.js
└── local-agent/
    ├── local_agent.py
    ├── start-local-agent.bat
    ├── start-local-agent.sh
    └── README.md
```

## Development checks

The GitHub Actions validation workflow checks:
- JavaScript syntax for the browser scripts.
- Python syntax for the local service.

These syntax checks do not replace a native toolchain build, QEMU boot test, visual browser test or hardware test.

## Roadmap

1. Expand architecture-specific boot paths and validated toolchain profiles.
2. Add deeper kernel diagnostics and symbol/debug workflows.
3. Add robust process supervision, build cancellation and persistent artifact history.
4. Expand QEMU serial/VNC observability and machine profiles.
5. Validate each target through automated ISO and emulator boot tests.

## License

To be decided.
