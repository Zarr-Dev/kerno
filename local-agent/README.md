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
- POST /api/v1/iso/import (raw application/octet-stream body; returns ISO metadata and SHA-256)
- GET /api/v1/iso/imports/{iso_id}
- POST /api/v1/iso/extract (returns file preview and ZIP archive metadata)
- GET /api/v1/iso/archives/{archive_id}
- POST /api/v1/emulator/start-iso
- GET /api/v1/iso/download/{iso_id}
- POST /api/v1/iso/workspace/open
- GET /api/v1/iso/workspaces/{iso_id}/files
- GET /api/v1/iso/workspaces/{iso_id}/file?path={relative_path}
- POST /api/v1/iso/workspace/file?isoId={iso_id}&path={relative_path} (raw application/octet-stream body)
- POST /api/v1/iso/workspace/delete
- POST /api/v1/iso/workspace/repack

## ISO Workbench (Local Agent 0.5.0)

Kerno's ISO Workbench adds an independent workflow for external disk images. It does not send an imported image through the kernel-build validator: a Linux installer, rescue image or other distribution ISO is not expected to contain Kerno's `/boot/kernel.elf` or `/boot/grub/grub.cfg`.

The workflow is:

1. **Import** — the browser streams the ISO to the loopback Local Service as `application/octet-stream`. The service writes to a temporary file, checks the upload length and 2048-byte sector alignment, computes SHA-256, validates ISO9660 descriptors and checks the El Torito boot catalog with xorriso. Only a validated upload is registered.
2. **Inspect** — Kerno reports the volume label, size, checksum, ISO9660 structure and detected BIOS/EFI boot capability.
3. **Extract** — xorriso extracts the ISO into an isolated temporary folder. Kerno packages regular files into a ZIP archive, skips symbolic links, and enforces a 50,000-file / 2 GiB extracted-content limit. The UI previews up to 500 file paths; the ZIP contains the complete permitted extraction.
4. **Boot** — QEMU starts the imported image as a CD-ROM. Kerno v0.1 enables this direct external-ISO path only when a validated El Torito BIOS boot entry is present. UEFI-only boot is not yet supported by this path.
5. **Observe** — the existing QEMU/noVNC display, process log and serial console are reused. A running emulator process is not proof that the guest OS completed boot. The Kerno kernel-entry marker is only checked for Kerno-built projects, never for arbitrary external images.

Default limits are 4 GiB per uploaded ISO and 2 GiB of extracted regular-file content. They can be adjusted using `KERNO_MAX_ISO_BYTES` and `KERNO_MAX_EXTRACTED_ISO_BYTES`. Import records and archive metadata live in the Local Service process memory for the current session; restart the service and re-import an image if those records are lost. The actual uploaded files remain in the service artifact directory.

The Local Service API uses the same loopback Host check, Origin allow-list and pairing-token authorization as the existing build endpoints. The ISO upload route accepts only `application/octet-stream`; the browser does not submit a filesystem path or a shell command. xorriso and QEMU are invoked through argument arrays, not a shell.

## ISO Editor and boot-preserving repack (Local Agent 0.5.0)

The ISO Editor opens a separate local workspace for an imported image. It does not modify the imported ISO while the user is editing:

1. **Open** — xorriso extracts the ISO into a per-image workspace under the Local Service artifact directory. Extraction runs with symlink following disabled.
2. **Inspect and select** — the API returns a bounded file listing (up to 2,000 visible entries), file sizes and symbolic-link entries. Paths remain relative to the extracted root.
3. **Edit** — UTF-8 text files up to 2 MiB can be opened and saved. Other regular files can be added or replaced by uploading a new file. Individual file uploads are limited to 16 MiB. Regular files can be deleted; directories and symbolic links are not directly editable.
4. **Protect boot metadata** — file paths reported by xorriso as El Torito BIOS/EFI boot images or catalog files are protected from direct replacement and deletion. Boot configuration files such as GRUB configuration remain editable.
5. **Rebuild** — xorriso uses `-update_r` to synchronize additions, modifications and deletions from the workspace into a new output ISO. When an El Torito catalog exists, Kerno invokes `-boot_image any replay` after file synchronization so xorriso can reconstruct its recognized boot setup.
6. **Verify** — the new ISO must pass ISO9660 inspection, and every BIOS/EFI boot entry detected in the source must still be detected in the output. SHA-256 is calculated for the rebuilt image. The source image is retained as the original; the current editor image advances only after all checks pass.

The editor rejects absolute paths, parent-directory traversal, drive/stream separators and symbolic-link traversal. File writes use temporary files and atomic replacement. The Local Service serializes import, workspace edits, repacks and QEMU startup so that a rebuild cannot read a workspace while it is being changed or race with QEMU startup.

Limits: 4 GiB per imported ISO, 2 GiB total regular-file content in the workspace, 50,000 regular files, 2 MiB per text-editor file, 16 MiB per file upload, and 2,000 entries in the editor list. These are default product limits, not hard xorriso limitations.

Workspace paths and imported-image records are held by the running Local Service. The current ISO bytes remain under its artifact directory, but after restarting the service the user must import the image again and reopen the editor workspace. This release does not yet provide a persistent ISO catalogue or undo/version history.

## Build health and ISO integrity (Local Agent 0.5.0)

Each native build returns phase-by-phase health checks. The builder verifies the ELF64 x86_64 executable and entry segment, Multiboot2 header structure, GRUB compatibility when `grub-file` is available, the staged boot files, ISO9660 descriptors, El Torito validation/catalog entries, and an SHA-256 digest. An ISO is registered for download only after the required validations pass.

Starting QEMU repeats the ISO9660/El Torito and SHA-256 checks. A changed or legacy artifact without a recorded SHA-256 must be rebuilt using the current Local Agent before it can be booted.

After updating Kerno's repository, stop the previous Local Agent process and start it again from the updated `local-agent` folder. The running Python process does not update itself when the website is redeployed. Rebuild old projects to generate the new integrity metadata.

The build health report is a validation gate for the supported packaging format, not a guarantee that all kernel runtime behavior is correct. QEMU boot and the expected serial entry marker are separate checks.

## Current support boundary

The native ISO pipeline and QEMU boot profile currently support x86_64 + BIOS + GRUB + Multiboot2 only. Other architecture templates are source scaffolds and must not be treated as validated build targets.

The browser sends a structured manifest. The service validates relative file paths and project size, resolves executable names through PATH, starts tools using argument arrays (never shell=True), serializes builds with a process-wide build lock, and cleans temporary build workspaces after each request. The exported ISO is stored separately from the temporary compilation folder.

The starter physical memory manager uses a 4 KiB bitmap allocator within its first 1 GiB identity-mapped region. This is not a full kernel memory subsystem.
