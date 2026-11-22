# Kerno Local Service

Kerno Local Service is the native execution companion for the browser IDE.

## Requirements

- Python 3.10+
- x86_64 native build tools for the current build target:
  - NASM
  - x86_64-elf-g++
  - x86_64-elf-gcc
  - x86_64-elf-ld
  - grub-mkrescue
  - xorriso
- QEMU emulator: qemu-system-x86_64

The service can start without the build tools installed, but its toolchain scan will report missing executables and build requests will fail with a clear diagnostic.

## Windows Command Prompt diagnostics

Run `diagnose-windows.cmd` from Command Prompt to check Python, NASM, the x86_64 cross compilers, linker, GRUB ISO builder, xorriso and QEMU. It is read-only: it does not install software or change PATH.

Kerno's **Settings → Toolchain → Host PC & Command Prompt** panel can also inspect host OS, CPU architecture, logical CPU count, memory and PATH-resolved tool availability while the Local Service is connected.

## Start

Windows:

```bat
start-local-agent.bat
```

Linux / macOS:

```sh
chmod +x start-local-agent.sh
./start-local-agent.sh
```

The service binds to 127.0.0.1:8765 and prints a pairing token. Paste the token into **Kerno Settings → Advanced → Pairing token**. Keep the terminal process running while building or testing.

## Data directory

By default, local service data is stored in:

```text
~/.kerno-local/
├── pairing.token
├── builds/
├── artifacts/
└── logs/
```

Set KERNO_DATA_DIR to use a different path. Set KERNO_LOCAL_PORT to change the port. Set KERNO_ALLOWED_ORIGINS to add extra trusted website origins as a comma-separated list.

## API

All routes require the X-Kerno-Token header. Browser origins are restricted to the service allow-list.

- GET /api/v1/health
- POST /api/v1/toolchain
- POST /api/v1/memory/estimate
- POST /api/v1/build
- GET /api/v1/emulator/status
- POST /api/v1/emulator/start
- POST /api/v1/emulator/stop
- GET /api/v1/artifacts/{artifact_id}

## Current support boundary

The native ISO pipeline and QEMU boot profile currently support x86_64 + BIOS + GRUB + Multiboot2 only. Other architecture templates are source scaffolds and must not be treated as validated build targets.

The browser sends a structured manifest. The service validates relative file paths and project size, resolves executable names through PATH, starts tools using argument arrays (never shell=True), serializes builds with a process-wide build lock, and cleans temporary build workspaces after each request. The exported ISO is stored separately from the temporary compilation folder.

The starter physical memory manager uses a 4 KiB bitmap allocator within its first 1 GiB identity-mapped region. This is not a full kernel memory subsystem.
