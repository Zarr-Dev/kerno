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

### External ISO Workbench (development branch, v0.1 scope)

The Machine workspace has a separate ISO Workbench for importing external `.iso` files, inspecting their ISO9660 and El Torito metadata, extracting their files with xorriso, downloading the extracted tree as ZIP, and starting compatible images in QEMU. External images are validated independently from Kerno's own kernel build output: Linux installers and rescue images are not expected to contain Kerno-specific kernel paths.

The initial direct-boot path is limited to images with a validated **El Torito BIOS boot entry**. EFI/UEFI metadata is reported, but UEFI-only external boot is not yet enabled in this Kerno v0.1 stage. QEMU starting successfully means the emulator process and display endpoint are active; it does not prove that the guest OS completed its boot sequence. The existing Kerno kernel-entry marker is deliberately not applied to external images.

The staged ISO Workbench roadmap is:
- **v0.1 (current):** external ISO import, ISO9660/El Torito inspection, SHA-256 checks, safe ZIP extraction, and BIOS boot through QEMU.
- **v0.2 (planned):** UEFI boot through OVMF firmware and EFI boot-path checks.
- **v0.3 (planned):** a persistent local ISO library with import history and image metadata.
- **v0.4 (planned):** ISO editing/remaster workflows and broader boot-profile validation.

Only v0.1 is implemented in this branch. Later stages are roadmap targets, not available features.

Default limits are 4 GiB per ISO upload, 2 GiB of extracted regular files, 50,000 extracted files, and a 500-entry UI preview. Imported images are streamed to the local machine, hashed with SHA-256, and inspected before being registered. The extraction archive skips symbolic links and is served from the loopback Local Service. See [local-agent/README.md](local-agent/README.md) for endpoints, limits and operating details.

## Kerno Academy

The Project Hub now includes a guided Tutorial Center with nine stages: IDE orientation, host setup, project scaffolding, the BIOS/GRUB/Multiboot2 boot chain, kernel source and linker layout, low-level memory/console/interrupt modules, toolchain health, ISO validation, and QEMU boot inspection. Stage completion is saved locally in IndexedDB.

The current course intentionally teaches the validated x86_64 + BIOS + GRUB + Multiboot2 target. The scaffold templates for other architectures are not yet validated native build paths.

## Build health and ISO verification

The editor provides syntax highlighting, indentation, snippets, completions and debounced structural diagnostics for unmatched brackets and unfinished strings/comments. JSON files also receive syntax validation. These lightweight editor checks are not a C/C++ compiler or a semantic language server: misspelled identifiers, type errors and target-specific issues are confirmed by the native compiler during a build. The Local Agent build pipeline reports explicit stages and health checks. Before registering an ISO artifact it validates:

- ELF64 little-endian x86_64 executable type, program-header bounds, and an entry point inside an executable load segment.
- Multiboot2 header alignment, magic, architecture field, length, checksum, and end tag.
- ISO9660 primary volume descriptor and descriptor terminator.
- El Torito boot record/catalog, validation entry checksum/signature, and bootable default entry.
- Required ISO paths: `/boot/kernel.elf` and `/boot/grub/grub.cfg`.
- SHA-256 digest of the generated ISO.

QEMU start repeats the ISO structure and SHA-256 checks before creating a guest process. A running QEMU process is not treated as proof that the kernel executed: Kerno separately watches COM1 serial output for the scaffold's kernel-entry marker.

A build or QEMU health report describes the checks actually performed. It does not prove the operating system is production-ready or that every subsystem is correct.

## Run the website

Kerno uses no frontend framework or build step. Serve the repository root over HTTP:

```bash
python -m http.server 8000
```

Open http://localhost:8000.

Monaco Editor and JSZip are loaded from version-pinned CDNs only when the editor or archive feature is opened; the noVNC client is loaded for the machine display. An internet connection is required for these features. If Monaco cannot load, a basic text editor remains available, but it does not provide syntax highlighting or live diagnostics.

## Host PC and Command Prompt diagnostics

The Toolchain settings include a read-only host scan for the operating system, CPU architecture, logical CPU count, memory, Python runtime, command environment and PATH-resolved development tools. The scan requires Kerno Local Service to be paired.

On Windows, run `local-agent/diagnose-windows.cmd` from Command Prompt to independently check Python, NASM, x86_64 cross GCC/G++, linker, GRUB ISO tooling, xorriso and QEMU. It does not install software or modify PATH.

Kerno does not expose arbitrary shell execution through its browser API. Native build and QEMU operations use fixed argument arrays and validated project manifests.

## Run Kerno Local Service

The native service is a separate local process. It does not run inside the browser and it must be started by the user on the machine that should compile and run the guest OS.

Requirements:
- Python 3.10 or newer.
- For native x86_64 ISO builds: NASM, `x86_64-elf-g++`, `x86_64-elf-gcc`, `x86_64-elf-ld`, `grub-mkrescue` and `xorriso`.
- For emulator testing: `qemu-system-x86_64`.

Start the service:

**Windows:** run `local-agent/start-local-agent.bat`.

**Linux/macOS:** run `local-agent/start-local-agent.sh`.

The service binds only to `127.0.0.1:8765`. On startup it prints a pairing token. Copy that token into **Kerno Settings → Advanced → Pairing token**, keep the terminal service running, then use **Test local service** or **Connect local service** in Kerno.

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
├── tests/
│   └── test_iso_manager.py
└── local-agent/
    ├── iso_manager.py
    ├── local_agent.py
    ├── start-local-agent.bat
    ├── start-local-agent.sh
    └── README.md
```

## Development checks

The GitHub Actions validation workflow checks:
- JavaScript syntax for the browser scripts.
- Python syntax for the local service and ISO manager.
- ISO9660 / El Torito parser unit tests.

These syntax checks do not replace a native toolchain build, QEMU boot test, visual browser test or hardware test.

## Roadmap

1. Expand architecture-specific boot paths and validated toolchain profiles.
2. Add deeper kernel diagnostics and symbol/debug workflows.
3. Add robust process supervision, build cancellation and persistent artifact history.
4. Expand QEMU serial/VNC observability and machine profiles.
5. Validate each target through automated ISO and emulator boot tests.

## License

To be decided.
