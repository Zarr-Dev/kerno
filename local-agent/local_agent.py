#!/usr/bin/env python3
"""Kerno Local Service.

Loopback-only native execution bridge for Kerno. No shell is used for toolchain
execution. The first native build target is x86_64 + BIOS + GRUB/Multiboot2.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import platform
import re
import secrets
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path, PurePosixPath
from urllib.parse import parse_qs, urlparse

from iso_manager import extract_iso_archive, inspect_iso_image, receive_iso_upload
from iso_editor import (
    delete_file as delete_iso_file,
    extract_workspace as extract_iso_workspace,
    is_boot_image_path,
    scan_workspace as list_iso_workspace_files,
    read_text_file as read_iso_text_file,
    repack_workspace as repack_iso_workspace,
    write_file as write_iso_workspace_file,
)

VERSION = "0.5.0"
HOST = "127.0.0.1"
PORT = int(os.environ.get("KERNO_LOCAL_PORT", "8765"))
MAX_REQUEST = 24 * 1024 * 1024
MAX_FILE = 2 * 1024 * 1024
MAX_PROJECT = 20 * 1024 * 1024
MAX_FILES = 500
BUILD_TIMEOUT = 150
ROOT = Path(os.environ.get("KERNO_DATA_DIR", Path.home() / ".kerno-local")).expanduser()
BUILDS = ROOT / "builds"
ARTIFACTS_DIR = ROOT / "artifacts"
LOGS = ROOT / "logs"
TOKEN_FILE = ROOT / "pairing.token"

DEFAULT_ORIGINS = {
    "https://kernomus.vercel.app",
    "https://kerno-drab.vercel.app",
    "https://kerno-zarr-devs-projects.vercel.app",
    "https://kerno-git-main-zarr-devs-projects.vercel.app",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
    "http://localhost:5500",
    "http://127.0.0.1:5500",
}
EXTRA_ORIGINS = {
    item.strip().rstrip("/")
    for item in os.environ.get("KERNO_ALLOWED_ORIGINS", "").split(",")
    if item.strip()
}
ALLOWED_ORIGINS = DEFAULT_ORIGINS | EXTRA_ORIGINS

for folder in (ROOT, BUILDS, ARTIFACTS_DIR, LOGS):
    folder.mkdir(parents=True, exist_ok=True)

if TOKEN_FILE.exists():
    PAIRING_TOKEN = TOKEN_FILE.read_text(encoding="utf-8").strip()
else:
    PAIRING_TOKEN = secrets.token_urlsafe(32)
    TOKEN_FILE.write_text(PAIRING_TOKEN, encoding="utf-8")
    try:
        TOKEN_FILE.chmod(0o600)
    except OSError:
        pass

BUILD_LOCK = threading.Lock()
STATE_LOCK = threading.RLock()
ARTIFACTS: dict[str, dict] = {}
PROJECT_ARTIFACTS: dict[str, str] = {}
IMPORTED_ISOS: dict[str, dict] = {}
ISO_ARCHIVES: dict[str, dict] = {}
ISO_WORKSPACES: dict[str, dict] = {}
ISO_LOCK = threading.Lock()
RUNTIME = {
    "process": None,
    "project_id": None,
    "artifact_id": None,
    "serial_path": None,
    "process_log_path": None,
    "display_url": None,
    "started_at": None,
    "command": None,
    "health_checks": [],
    "boot_mode": None,
    "iso_name": None,
}


def safe_id(value: object) -> str:
    raw = str(value or "")
    cleaned = re.sub(r"[^A-Za-z0-9_-]", "", raw)[:64]
    return cleaned or uuid.uuid4().hex


def safe_name(value: object) -> str:
    name = re.sub(r"[^A-Za-z0-9._-]+", "-", str(value or "kerno-project")).strip("-._")
    return name[:48] or "kerno-project"


def normalize_project_path(value: object) -> str:
    raw = str(value or "").replace("\\", "/")
    if not raw or "\x00" in raw or raw.startswith("/") or re.match(r"^[A-Za-z]:", raw):
        raise ValueError("Project file paths must be relative.")
    path = PurePosixPath(raw)
    if any(part in ("", ".", "..") for part in path.parts):
        raise ValueError("Project file path contains an unsafe segment.")
    if any(part.lower() in (".git", ".kerno-local") for part in path.parts):
        raise ValueError("Repository metadata and local service folders are not accepted.")
    result = path.as_posix()
    if len(result) > 240:
        raise ValueError("Project file path is too long.")
    return result


def within(parent: Path, child: Path) -> bool:
    try:
        return os.path.commonpath((str(parent.resolve()), str(child.resolve()))) == str(parent.resolve())
    except (ValueError, OSError):
        return False


def read_project(payload: dict) -> dict:
    project = payload.get("project")
    if not isinstance(project, dict):
        raise ValueError("Request must contain a project object.")
    config = project.get("config") or {}
    files = project.get("files")
    if not isinstance(config, dict) or not isinstance(files, dict):
        raise ValueError("Project config and files must be objects.")
    if not 1 <= len(files) <= MAX_FILES:
        raise ValueError("Project must contain between 1 and 500 source files.")
    clean = {}
    total = 0
    for raw_path, text in files.items():
        path = normalize_project_path(raw_path)
        if not isinstance(text, str):
            raise ValueError("Only UTF-8 text source files can be passed to the native builder.")
        data = text.encode("utf-8")
        if len(data) > MAX_FILE:
            raise ValueError("Source file exceeds the 2 MiB per-file limit: " + path)
        total += len(data)
        if total > MAX_PROJECT:
            raise ValueError("Project exceeds the 20 MiB source limit.")
        clean[path] = text
    return {
        "id": safe_id(project.get("id")),
        "name": safe_name(project.get("name")),
        "config": config,
        "files": clean,
        "total_bytes": total,
    }


def write_project(project: dict, destination: Path) -> None:
    destination.mkdir(parents=True, exist_ok=True)
    for relative, content in project["files"].items():
        target = destination.joinpath(*PurePosixPath(relative).parts)
        if not within(destination, target):
            raise ValueError("Resolved project path escapes the build workspace.")
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8", newline="\n")


def executable(value: object, fallback: str) -> str:
    candidate = str(value or fallback).strip()
    if not candidate or "\x00" in candidate or "\n" in candidate or "\r" in candidate:
        raise ValueError("Invalid tool executable setting.")
    found = shutil.which(candidate)
    if not found:
        raise FileNotFoundError("Required tool was not found on PATH: " + candidate)
    return found


def probe_tool(value: object, fallback: str) -> dict:
    candidate = str(value or fallback).strip()
    found = shutil.which(candidate) if candidate else None
    if not found:
        return {"available": False, "command": candidate, "path": None, "version": None}
    version = ""
    for flag in ("--version", "-v"):
        try:
            result = subprocess.run(
                [found, flag], capture_output=True, text=True,
                timeout=3, check=False, encoding="utf-8", errors="replace"
            )
            output = (result.stdout or result.stderr or "").strip()
            if output:
                version = output.splitlines()[0][:180]
                break
        except (OSError, subprocess.TimeoutExpired):
            continue
    return {"available": True, "command": candidate, "path": found, "version": version}


def host_memory() -> dict:
    total = available = None
    try:
        page = os.sysconf("SC_PAGE_SIZE")
        total = int(os.sysconf("SC_PHYS_PAGES") * page / (1024 * 1024))
        available = int(os.sysconf("SC_AVPHYS_PAGES") * page / (1024 * 1024))
    except (AttributeError, ValueError, OSError):
        try:
            import ctypes

            class MemoryStatus(ctypes.Structure):
                _fields_ = [
                    ("length", ctypes.c_ulong),
                    ("memory_load", ctypes.c_ulong),
                    ("total_phys", ctypes.c_ulonglong),
                    ("avail_phys", ctypes.c_ulonglong),
                    ("total_page", ctypes.c_ulonglong),
                    ("avail_page", ctypes.c_ulonglong),
                    ("total_virtual", ctypes.c_ulonglong),
                    ("avail_virtual", ctypes.c_ulonglong),
                    ("avail_extended", ctypes.c_ulonglong),
                ]

            status = MemoryStatus()
            status.length = ctypes.sizeof(MemoryStatus)
            if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(status)):
                total = int(status.total_phys / (1024 * 1024))
                available = int(status.avail_phys / (1024 * 1024))
        except Exception:
            pass
    return {"totalMiB": total, "availableMiB": available}


def toolchain_report(settings: dict) -> dict:
    settings = settings if isinstance(settings, dict) else {}
    return {
        "assembler": probe_tool(settings.get("assembler"), "nasm"),
        "crossCompiler": probe_tool(settings.get("crossCompiler"), "x86_64-elf-g++"),
        "cCompiler": probe_tool(settings.get("cCompiler"), "x86_64-elf-gcc"),
        "linker": probe_tool(settings.get("linker"), "x86_64-elf-ld"),
        "isoBuilder": probe_tool(settings.get("isoBuilder"), "grub-mkrescue"),
        "xorriso": probe_tool("xorriso", "xorriso"),
        "objcopy": probe_tool(settings.get("objcopy"), "x86_64-elf-objcopy"),
        "readelf": probe_tool(settings.get("readelf"), "x86_64-elf-readelf"),
        "make": probe_tool("make", "make"),
        "qemu": probe_tool(settings.get("qemuBinary"), "qemu-system-x86_64"),
    }


def host_diagnostics(settings: dict | None = None) -> dict:
    memory = host_memory()
    shell_name = "cmd.exe" if os.name == "nt" else ("zsh" if os.environ.get("SHELL", "").endswith("zsh") else "bash/sh")
    shell_path = shutil.which("cmd.exe" if os.name == "nt" else "bash") or shutil.which("sh")
    return {
        "platform": platform.platform(),
        "system": platform.system(),
        "release": platform.release(),
        "machine": platform.machine(),
        "processor": platform.processor() or "Not reported by host",
        "logicalCpus": os.cpu_count() or 1,
        "pythonVersion": platform.python_version(),
        "commandPrompt": shell_name,
        "commandPromptPath": shell_path,
        "memory": memory,
        "toolchain": toolchain_report(settings or {}),
        "note": "Host diagnostics only. Kerno does not allocate host RAM or execute arbitrary commands from the browser."
    }


def tail_text(path: Path | None, limit: int = 12000) -> str:
    if not path or not path.exists():
        return ""
    try:
        with path.open("rb") as handle:
            handle.seek(max(0, path.stat().st_size - limit))
            return handle.read(limit).decode("utf-8", errors="replace")
    except OSError:
        return ""


def run_command(argv: list[str], cwd: Path, log: list[str], timeout: int = 45) -> None:
    display = " ".join(json.dumps(arg) if " " in arg else arg for arg in argv)
    log.append("$ " + display)
    try:
        result = subprocess.run(
            argv, cwd=str(cwd), capture_output=True, text=True,
            timeout=timeout, check=False, encoding="utf-8", errors="replace"
        )
    except subprocess.TimeoutExpired as error:
        out = error.stdout or ""
        if isinstance(out, bytes):
            out = out.decode("utf-8", errors="replace")
        log.append(str(out)[-12000:])
        raise RuntimeError("Command timed out after " + str(timeout) + " seconds: " + argv[0])
    except OSError as error:
        raise RuntimeError("Could not start " + argv[0] + ": " + str(error))
    output = (result.stdout or "") + (result.stderr or "")
    if output:
        log.append(output[-20000:].rstrip())
    if result.returncode != 0:
        log.append("Exit code: " + str(result.returncode))
        raise RuntimeError("Command failed: " + argv[0] + " (exit " + str(result.returncode) + ")")


def verify_multiboot2_header(kernel: Path) -> None:
    data = kernel.read_bytes()[:32768]
    magic = bytes.fromhex("d65052e8")
    offset = data.find(magic)
    if offset < 0 or offset % 8 != 0:
        raise RuntimeError("Kernel does not contain an 8-byte-aligned Multiboot2 header in its first 32 KiB.")
    if offset + 16 > len(data):
        raise RuntimeError("Multiboot2 header is truncated.")
    import struct
    header_magic, architecture, length, checksum = struct.unpack_from("<IIII", data, offset)
    if header_magic != 0xE85250D6 or architecture != 0:
        raise RuntimeError("Kernel Multiboot2 header has an unsupported architecture field.")
    if length < 24 or offset + length > len(data):
        raise RuntimeError("Multiboot2 header length is invalid.")
    if (header_magic + architecture + length + checksum) & 0xFFFFFFFF:
        raise RuntimeError("Multiboot2 header checksum is invalid.")
    if data[offset + length - 8:offset + length] != b"\x00" * 8:
        raise RuntimeError("Multiboot2 end tag is missing or invalid.")


def verify_elf64_x86_64(kernel: Path) -> dict:
    import struct

    data = kernel.read_bytes()
    if len(data) < 64 or data[:4] != b"\x7fELF":
        raise RuntimeError("Kernel is not a complete ELF image.")
    ident = data[:16]
    if ident[4] != 2 or ident[5] != 1 or ident[6] != 1:
        raise RuntimeError("Kernel must be ELF64, little-endian and use the current ELF version.")

    e_type, e_machine = struct.unpack_from("<HH", data, 16)
    if e_type != 2:
        raise RuntimeError("Kernel ELF must be ET_EXEC; a relocatable or shared object is not bootable.")
    if e_machine != 62:
        raise RuntimeError("Kernel ELF machine is not x86_64 (EM_X86_64).")

    entry = struct.unpack_from("<Q", data, 24)[0]
    phoff = struct.unpack_from("<Q", data, 32)[0]
    phentsize = struct.unpack_from("<H", data, 54)[0]
    phnum = struct.unpack_from("<H", data, 56)[0]
    if entry == 0 or phnum == 0 or phentsize < 56 or phnum > 256:
        raise RuntimeError("Kernel ELF entry point or program-header table is invalid.")
    if phoff > len(data) or phoff + phentsize * phnum > len(data):
        raise RuntimeError("Kernel ELF program-header table extends beyond the file.")

    entry_is_executable = False
    for index in range(phnum):
        offset = phoff + index * phentsize
        p_type, p_flags = struct.unpack_from("<II", data, offset)
        if p_type != 1 or not (p_flags & 1):
            continue
        p_vaddr = struct.unpack_from("<Q", data, offset + 16)[0]
        p_memsz = struct.unpack_from("<Q", data, offset + 40)[0]
        if p_memsz and p_vaddr <= entry < p_vaddr + p_memsz:
            entry_is_executable = True
            break
    if not entry_is_executable:
        raise RuntimeError("Kernel ELF entry point is not inside an executable PT_LOAD segment.")
    return {"entryPoint": "0x" + format(entry, "x"), "machine": "EM_X86_64", "type": "ET_EXEC"}


def run_capture(argv: list[str], cwd: Path, log: list[str], timeout: int = 30) -> str:
    display = " ".join(json.dumps(arg) if " " in arg else arg for arg in argv)
    log.append("$ " + display)
    try:
        result = subprocess.run(
            argv, cwd=str(cwd), capture_output=True, text=True,
            timeout=timeout, check=False, encoding="utf-8", errors="replace"
        )
    except subprocess.TimeoutExpired as error:
        output = error.stdout or ""
        if isinstance(output, bytes):
            output = output.decode("utf-8", errors="replace")
        log.append(str(output)[-12000:])
        raise RuntimeError("Command timed out after " + str(timeout) + " seconds: " + argv[0])
    except OSError as error:
        raise RuntimeError("Could not start " + argv[0] + ": " + str(error))
    output = ((result.stdout or "") + "\n" + (result.stderr or "")).strip()
    if output:
        log.append(output[-20000:])
    if result.returncode != 0:
        log.append("Exit code: " + str(result.returncode))
        raise RuntimeError("Command failed: " + argv[0] + " (exit " + str(result.returncode) + ")")
    return output


def verify_iso_image(image_path: Path, xorriso: str, cwd: Path, log: list[str]) -> dict:
    import struct

    if not image_path.is_file():
        raise RuntimeError("ISO artifact does not exist.")
    size = image_path.stat().st_size
    if size < 64 * 1024 or size % 2048 != 0:
        raise RuntimeError("ISO size or sector alignment is invalid.")
    with image_path.open("rb") as handle:
        handle.seek(16 * 2048)
        primary = handle.read(2048)
        if len(primary) != 2048 or primary[0] != 1 or primary[1:6] != b"CD001" or primary[6] != 1:
            raise RuntimeError("ISO9660 primary volume descriptor is missing or invalid.")

        has_terminator = False
        boot_catalog_lba = None
        descriptor_count = min(64, size // 2048)
        for sector in range(16, descriptor_count):
            handle.seek(sector * 2048)
            descriptor = handle.read(2048)
            if len(descriptor) != 2048 or descriptor[1:6] != b"CD001" or descriptor[6] != 1:
                continue
            descriptor_type = descriptor[0]
            if descriptor_type == 0 and descriptor[7:30].rstrip(b" \x00") == b"EL TORITO SPECIFICATION":
                boot_catalog_lba = struct.unpack_from("<I", descriptor, 71)[0]
            if descriptor_type == 255:
                has_terminator = True
                break
        if not has_terminator:
            raise RuntimeError("ISO9660 volume descriptor terminator is missing.")
        if not boot_catalog_lba or boot_catalog_lba * 2048 + 64 > size:
            raise RuntimeError("El Torito boot record or boot catalog pointer is missing.")

        handle.seek(boot_catalog_lba * 2048)
        catalog = handle.read(2048)
    validation = catalog[:32]
    if len(validation) != 32 or validation[0] != 1 or validation[30:32] != b"\x55\xaa":
        raise RuntimeError("El Torito validation entry is invalid.")
    checksum = sum(struct.unpack_from("<H", validation, offset)[0] for offset in range(0, 32, 2)) & 0xFFFF
    if checksum != 0:
        raise RuntimeError("El Torito validation-entry checksum is invalid.")
    if catalog[32] != 0x88:
        raise RuntimeError("El Torito default boot entry is not marked bootable.")

    listing = run_capture(
        [xorriso, "-indev", str(image_path), "-find", "/", "-type", "f", "-print"],
        cwd, log, timeout=45
    )
    normalized_listing = listing.replace("\\", "/").lower()
    if "/boot/kernel.elf" not in normalized_listing:
        raise RuntimeError("ISO filesystem is missing /boot/kernel.elf.")
    if "/boot/grub/grub.cfg" not in normalized_listing:
        raise RuntimeError("ISO filesystem is missing /boot/grub/grub.cfg.")

    return {
        "sizeBytes": size,
        "iso9660": "primary volume descriptor and terminator valid",
        "elTorito": "validation catalog and bootable default entry valid",
        "bootFiles": ["/boot/kernel.elf", "/boot/grub/grub.cfg"],
        "bootCatalogLba": boot_catalog_lba,
    }


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def build_project(payload: dict) -> dict:
    if not BUILD_LOCK.acquire(blocking=False):
        return {"status": "failed", "message": "Another Kerno build is already running. Wait for it to finish.", "log": "Build lock is occupied."}
    logs: list[str] = []
    health_checks: list[dict] = []
    current_stage = "Project validation"
    workspace: Path | None = None
    artifact_path: Path | None = None
    artifact_registered = False
    keep_build_logs = True
    build_log_path = LOGS / ("build-" + uuid.uuid4().hex + ".log")

    def stage(name: str) -> None:
        nonlocal current_stage
        current_stage = name
        logs.append("\n[STAGE] " + name)

    def health(name: str, detail: str) -> None:
        health_checks.append({"stage": name, "status": "passed", "detail": detail})
        logs.append("[HEALTH: PASS] " + name + " — " + detail)

    try:
        stage("Project manifest and target")
        project = read_project(payload)
        config = project["config"]
        architecture = str(config.get("architecture", ""))
        firmware = str(config.get("firmware", ""))
        bootloader = str(config.get("bootloader", ""))
        if (architecture, firmware, bootloader) != ("x86_64", "bios", "grub"):
            raise RuntimeError(
                "Native build target not enabled yet. The first validated pipeline supports x86_64 + BIOS + GRUB/Multiboot2. "
                "Other architecture templates remain editable but are not reported as buildable."
            )
        if not any(path.startswith("src/") and path.endswith((".cpp", ".cc", ".cxx", ".c")) for path in project["files"]):
            raise RuntimeError("No C/C++ source files found under src/.")
        if "boot/entry.asm" not in project["files"] or "linker.ld" not in project["files"] or "boot/grub.cfg" not in project["files"]:
            raise RuntimeError("Required files are missing: boot/entry.asm, linker.ld or boot/grub.cfg.")
        if "mb2_header_start" not in project["files"]["boot/entry.asm"] or "long_mode_start" not in project["files"]["boot/entry.asm"]:
            raise RuntimeError("The x86_64 entry source is not the Kerno Multiboot2 long-mode scaffold. Regenerate or update boot/entry.asm first.")

        settings = payload.get("settings") or {}
        if not isinstance(settings, dict):
            raise ValueError("Build settings must be an object.")
        diagnostics = config.get("diagnostics") or {}
        if not isinstance(diagnostics, dict):
            raise ValueError("Project diagnostics configuration must be an object.")
        memory_config = config.get("memory") or {}
        if not isinstance(memory_config, dict):
            raise ValueError("Project memory configuration must be an object.")
        guest_ram = int(memory_config.get("guestMiB", 512))
        heap_reserve = int(memory_config.get("heapReserveMiB", 16))
        stack_reserve = int(memory_config.get("stackReserveKiB", 512))
        kernel_base = int(str(memory_config.get("kernelBase", "0x00100000")), 16)
        if not 64 <= guest_ram <= 32768 or not 1 <= heap_reserve <= 8192 or not 64 <= stack_reserve <= 1048576:
            raise ValueError("Guest RAM, heap or stack planning values are outside supported limits.")
        if heap_reserve + stack_reserve / 1024 + 1 >= guest_ram:
            raise ValueError("Kernel heap and stack reservations must remain below guest RAM.")
        if kernel_base < 0x100000 or kernel_base >= 0x40000000 or kernel_base % 4096:
            raise ValueError("Kernel link base must be page-aligned and inside the first 1 GiB identity-mapped region.")
        boot_config = project["files"]["boot/grub.cfg"]
        if (
            "menuentry" not in boot_config
            or not re.search(r"(?m)^\s*multiboot2\s+/boot/kernel\.elf(?:\s|$)", boot_config)
            or not re.search(r"(?m)^\s*boot\s*$", boot_config)
        ):
            raise RuntimeError("GRUB menu must load /boot/kernel.elf with multiboot2 and execute the boot command.")
        health("Project manifest and target", "Relative paths, source limits, x86_64/BIOS/GRUB target and kernel reservations validated.")
        keep_build_logs = bool(diagnostics.get("retainBuildLogs", settings.get("retainBuildLogs", True)))
        log_level = {"quiet": 0, "error": 1, "warn": 2, "info": 3, "debug": 4}.get(
            str(diagnostics.get("logLevel", settings.get("kernelLogLevel", "info"))), 3
        )
        stage("Native toolchain health")
        nasm = executable(settings.get("assembler"), "nasm")
        cpp_compiler = executable(settings.get("crossCompiler"), "x86_64-elf-g++")
        c_compiler = executable(settings.get("cCompiler"), "x86_64-elf-gcc")
        linker = executable(settings.get("linker"), "x86_64-elf-ld")
        grub = executable(settings.get("isoBuilder"), "grub-mkrescue")
        xorriso = shutil.which("xorriso")
        if not xorriso:
            raise RuntimeError("xorriso was not found. grub-mkrescue requires xorriso to package the ISO.")
        compiler_machine = run_capture([cpp_compiler, "-dumpmachine"], BUILDS, logs, timeout=8).splitlines()[0].strip()
        c_compiler_machine = run_capture([c_compiler, "-dumpmachine"], BUILDS, logs, timeout=8).splitlines()[0].strip()
        if not compiler_machine.startswith("x86_64-"):
            raise RuntimeError("Configured C++ cross compiler must target x86_64; reported target: " + (compiler_machine or "unknown"))
        if not c_compiler_machine.startswith("x86_64-"):
            raise RuntimeError("Configured C cross compiler must target x86_64; reported target: " + (c_compiler_machine or "unknown"))
        health("Native toolchain health", "NASM, C/C++ compilers, linker, GRUB and xorriso resolved; both compiler targets are x86_64.")

        stage("Prepare build workspace")
        build_id = uuid.uuid4().hex
        workspace = BUILDS / (project["id"] + "-" + build_id[:10])
        output = workspace / "out"
        iso_root = workspace / "iso-root"
        output.mkdir(parents=True, exist_ok=True)
        write_project(project, workspace)
        logs.append("Kerno native build · " + project["name"])
        logs.append("Target: x86_64 / BIOS / GRUB Multiboot2")
        logs.append("Source size: " + str(project["total_bytes"]) + " bytes")
        health("Prepare build workspace", "Validated source manifest staged in a fresh isolated temporary build directory.")

        stage("Assembly")
        asm_files = sorted(path for path in project["files"] if path.startswith("boot/") and path.endswith(".asm"))
        object_files: list[str] = []
        for relative in asm_files:
            source = workspace.joinpath(*PurePosixPath(relative).parts)
            object_path = output / (safe_name(source.stem) + ".asm.o")
            nasm_args = [nasm, "-f", "elf64"]
            if bool(diagnostics.get("debugSymbols", settings.get("debugSymbols", True))):
                nasm_args.extend(["-g", "-F", "dwarf"])
            nasm_args.extend([str(source), "-o", str(object_path)])
            run_command(nasm_args, workspace, logs)
            if not object_path.is_file() or object_path.stat().st_size == 0:
                raise RuntimeError("NASM did not produce a non-empty object file: " + relative)
            object_files.append(str(object_path))
        health("Assembly", str(len(asm_files)) + " NASM source file(s) assembled into ELF64 objects.")

        stage("Freestanding C/C++ compilation")
        source_files = sorted(
            path for path in project["files"]
            if path.startswith("src/") and path.endswith((".cpp", ".cc", ".cxx", ".c"))
        )
        optimization = str(config.get("optimization", "debug"))
        opt_flag = {"debug": "-O0", "size": "-Os", "speed": "-O2"}.get(optimization, "-O0")
        for relative in source_files:
            source = workspace.joinpath(*PurePosixPath(relative).parts)
            object_path = output / (hashlib.sha1(relative.encode("utf-8")).hexdigest()[:12] + ".o")
            is_c_source = source.suffix == ".c"
            selected_compiler = c_compiler if is_c_source else cpp_compiler
            args = [
                selected_compiler, "-DKERNO_KERNEL_LOG_LEVEL=" + str(log_level), "-m64", "-mcmodel=kernel", "-mno-red-zone", "-ffreestanding",
                "-fno-stack-protector", "-fno-pic", "-fno-pie", "-fno-builtin",
                "-mno-mmx", "-mno-sse", "-mno-sse2", opt_flag,
                "-Wall", "-Wextra", "-I", str(workspace / "include"), "-c", str(source), "-o", str(object_path)
            ]
            if is_c_source:
                args[1:1] = ["-std=c11"]
            else:
                args[1:1] = ["-std=c++20", "-fno-exceptions", "-fno-rtti"]
            if bool(diagnostics.get("debugSymbols", settings.get("debugSymbols", True))):
                args.append("-g")
            if bool(diagnostics.get("warningsAsErrors", settings.get("warningsAsErrors", False))):
                args.append("-Werror")
            run_command(args, workspace, logs, timeout=90)
            if not object_path.is_file() or object_path.stat().st_size == 0:
                raise RuntimeError("Compiler did not produce a non-empty object file: " + relative)
            object_files.append(str(object_path))
        health("Freestanding C/C++ compilation", str(len(source_files)) + " source file(s) compiled with freestanding kernel flags.")

        if not object_files:
            raise RuntimeError("No assembly or C/C++ object files were generated.")
        stage("ELF64 x86_64 linking and entry validation")
        kernel = output / "kernel.elf"
        linker_script = workspace / "linker.ld"
        run_command([linker, "-nostdlib", "-static", "-z", "max-page-size=0x1000", "-T", str(linker_script), "-o", str(kernel)] + object_files, workspace, logs, timeout=60)
        if not kernel.exists() or kernel.stat().st_size < 64:
            raise RuntimeError("Linker did not produce a valid kernel ELF.")
        elf_report = verify_elf64_x86_64(kernel)
        health("ELF64 x86_64 linking and entry validation", "ET_EXEC x86_64; executable entry point " + elf_report["entryPoint"] + " lies in a PT_LOAD segment.")

        stage("Multiboot2 header validation")
        verify_multiboot2_header(kernel)
        health("Multiboot2 header validation", "Header magic, 8-byte alignment, architecture, length, checksum and end tag are valid.")

        stage("Stage bootable ISO root")
        grub_dir = iso_root / "boot" / "grub"
        grub_dir.mkdir(parents=True, exist_ok=True)
        shutil.copy2(kernel, iso_root / "boot" / "kernel.elf")
        shutil.copy2(workspace / "boot" / "grub.cfg", grub_dir / "grub.cfg")
        if not (iso_root / "boot" / "kernel.elf").is_file() or not (grub_dir / "grub.cfg").is_file():
            raise RuntimeError("The staged ISO root is missing the kernel or GRUB configuration.")
        health("Stage bootable ISO root", "Kernel and GRUB configuration copied to their required paths.")
        stage("Bootloader compatibility validation")
        grub_file = shutil.which("grub-file")
        if grub_file:
            run_command([grub_file, "--is-x86-multiboot2", str(kernel)], workspace, logs, timeout=10)
            health("GRUB Multiboot2 compatibility", "grub-file confirms an x86 Multiboot2 kernel.")
        else:
            logs.append("[HEALTH: INFO] grub-file is not installed; structural Multiboot2 validation remains authoritative.")

        stage("GRUB ISO packaging")
        artifact_id = uuid.uuid4().hex
        artifact_name = safe_name(project["name"]) + "-" + artifact_id[:8] + ".iso"
        artifact_path = ARTIFACTS_DIR / artifact_name
        run_command([grub, "-o", str(artifact_path), str(iso_root)], workspace, logs, timeout=150)
        if not artifact_path.exists() or artifact_path.stat().st_size < 64 * 1024:
            raise RuntimeError("ISO packager did not produce a plausible image.")

        stage("ISO9660, El Torito and boot-file verification")
        iso_report = verify_iso_image(artifact_path, xorriso, workspace, logs)
        health("ISO9660 filesystem", iso_report["iso9660"])
        health("El Torito BIOS boot catalog", iso_report["elTorito"])
        health("ISO boot-file layout", "Both /boot/kernel.elf and /boot/grub/grub.cfg are present and readable.")

        stage("Artifact integrity")
        iso_sha256 = sha256_file(artifact_path)
        if len(iso_sha256) != 64:
            raise RuntimeError("Could not calculate an ISO SHA-256 integrity digest.")
        health("Artifact integrity", "ISO size " + str(iso_report["sizeBytes"]) + " bytes; SHA-256 calculated.")

        metadata = {
            "id": artifact_id,
            "project_id": project["id"],
            "name": artifact_name,
            "path": str(artifact_path),
            "size_bytes": artifact_path.stat().st_size,
            "sha256": iso_sha256,
            "kernel_sha256": sha256_file(kernel),
            "kernel_entry": elf_report["entryPoint"],
            "health_checks": health_checks.copy(),
            "created_at": time.time(),
        }
        logs.append("Verified ELF64 x86_64 entry point, Multiboot2 header and ISO9660/El Torito structure.")
        logs.append("ISO SHA-256: " + iso_sha256)
        logs.append("ISO artifact: " + artifact_name + " (" + str(metadata["size_bytes"]) + " bytes)")
        if keep_build_logs:
            build_log_path.write_text("\n".join(logs) + "\n", encoding="utf-8")
        with STATE_LOCK:
            ARTIFACTS[artifact_id] = metadata
            PROJECT_ARTIFACTS[project["id"]] = artifact_id
        artifact_registered = True
        return {
            "status": "success",
            "message": "Native build completed and the ISO artifact was verified.",
            "log": "\n".join(logs),
            "healthChecks": health_checks,
            "artifact": {
                "id": artifact_id,
                "name": artifact_name,
                "sizeBytes": metadata["size_bytes"],
                "sha256": iso_sha256,
                "kernelEntry": elf_report["entryPoint"],
                "healthChecks": health_checks,
                "downloadUrl": "/api/v1/artifacts/" + artifact_id,
            },
        }
    except (ValueError, FileNotFoundError, RuntimeError, subprocess.TimeoutExpired) as error:
        if current_stage and not any(item.get("stage") == current_stage for item in health_checks):
            health_checks.append({"stage": current_stage, "status": "failed", "detail": str(error)})
        logs.append("[HEALTH: FAIL] " + current_stage + " — " + str(error))
        logs.append("BUILD FAILED: " + str(error))
        if keep_build_logs:
            try:
                build_log_path.write_text("\n".join(logs) + "\n", encoding="utf-8")
            except OSError:
                pass
        return {"status": "failed", "message": str(error), "log": "\n".join(logs), "healthChecks": health_checks}
    except Exception as error:
        if current_stage and not any(item.get("stage") == current_stage for item in health_checks):
            health_checks.append({"stage": current_stage, "status": "failed", "detail": str(error)})
        logs.append("[HEALTH: FAIL] " + current_stage + " — " + str(error))
        logs.append("UNEXPECTED BUILD ERROR: " + str(error))
        if keep_build_logs:
            try:
                build_log_path.write_text("\n".join(logs) + "\n", encoding="utf-8")
            except OSError:
                pass
        return {"status": "failed", "message": "Unexpected local build service error: " + str(error), "log": "\n".join(logs), "healthChecks": health_checks}
    finally:
        if workspace is not None:
            shutil.rmtree(workspace, ignore_errors=True)
        if artifact_path is not None and artifact_path.exists() and not artifact_registered:
            try:
                artifact_path.unlink()
            except OSError:
                pass
        BUILD_LOCK.release()


def port_available(port: int) -> bool:
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        sock.bind((HOST, port))
        return True
    except OSError:
        return False
    finally:
        sock.close()


def stop_qemu_process() -> None:
    with STATE_LOCK:
        process = RUNTIME.get("process")
        if not process:
            return
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=3)
        RUNTIME.update({
            "process": None, "project_id": None, "artifact_id": None,
            "display_url": None, "started_at": None, "command": None, "health_checks": [],
            "boot_mode": None, "iso_name": None
        })


def start_qemu(payload: dict) -> dict:
    project = read_project(payload)
    config = project["config"]
    if config.get("architecture") != "x86_64" or config.get("firmware") != "bios" or config.get("bootloader") != "grub":
        raise RuntimeError("QEMU boot profile is currently enabled for x86_64 + BIOS + GRUB projects only.")
    settings = payload.get("settings") or {}
    if not isinstance(settings, dict):
        raise ValueError("QEMU settings must be an object.")
    qemu_cfg = config.get("qemu") or {}
    if not isinstance(qemu_cfg, dict):
        raise ValueError("QEMU machine configuration must be an object.")
    binary = executable(qemu_cfg.get("binary") or settings.get("qemuBinary"), "qemu-system-x86_64")
    with STATE_LOCK:
        current = RUNTIME.get("process")
        if current and current.poll() is None:
            if RUNTIME.get("project_id") == project["id"]:
                return emulator_status()
            raise RuntimeError("A QEMU machine is already running. Stop it before starting another project.")

    artifact_request = (payload.get("buildArtifact") or {}).get("id")
    artifact_id = str(artifact_request or PROJECT_ARTIFACTS.get(project["id"]) or "")
    metadata = ARTIFACTS.get(artifact_id)
    if not metadata or metadata.get("project_id") != project["id"]:
        raise RuntimeError("No ISO built by this local service was found for this project. Run Build first.")
    iso_path = Path(metadata["path"])
    if not iso_path.is_file():
        raise RuntimeError("The previously built ISO artifact is no longer available. Build the project again.")
    preflight_log: list[str] = []
    preflight_checks: list[dict] = []
    expected_sha256 = str(metadata.get("sha256") or "")
    if not re.fullmatch(r"[a-fA-F0-9]{64}", expected_sha256):
        raise RuntimeError("The ISO artifact does not have a verified SHA-256 record. Rebuild the project with the current Kerno Local Agent.")
    xorriso = executable("xorriso", "xorriso")
    verify_iso_image(iso_path, xorriso, LOGS, preflight_log)
    actual_sha256 = sha256_file(iso_path)
    if not hmac.compare_digest(actual_sha256.lower(), expected_sha256.lower()):
        raise RuntimeError("ISO SHA-256 integrity check failed. The artifact may have changed after build.")
    preflight_checks.append({"stage": "ISO integrity", "status": "passed", "detail": "SHA-256 matches the verified build artifact."})
    preflight_checks.append({"stage": "ISO boot structure", "status": "passed", "detail": "ISO9660, El Torito and required GRUB/kernel files revalidated."})

    ram = int((config.get("memory") or {}).get("guestMiB", settings.get("guestMemoryMiB", 512)))
    cpus = int(qemu_cfg.get("vcpus", settings.get("qemuVcpus", 2)))
    machine = str(qemu_cfg.get("machine", settings.get("qemuMachine", "q35")))
    display = str(qemu_cfg.get("display", settings.get("qemuDisplay", "std")))
    accel = str(qemu_cfg.get("acceleration", settings.get("qemuAcceleration", "auto")))
    cpu_model = str(qemu_cfg.get("cpuModel", settings.get("qemuCpuModel", "max")))
    network = str(qemu_cfg.get("network", settings.get("qemuNetwork", "none")))
    diagnostics = config.get("diagnostics") or {}
    if not isinstance(diagnostics, dict):
        raise ValueError("Project diagnostics configuration must be an object.")
    serial_backend = str(diagnostics.get("serialBackend", settings.get("serialBackend", "file")))
    vnc_port = int(qemu_cfg.get("vncPort", settings.get("qemuVncPort", 5901)))
    if not 64 <= ram <= 32768 or not 1 <= cpus <= 32:
        raise ValueError("QEMU guest memory or vCPU count is outside the supported limits.")
    host = host_memory()
    available_host = host.get("availableMiB")
    if available_host is not None and available_host < ram + max(256, int(ram * 0.1)):
        preflight_checks.append({"stage": "Host memory capacity", "status": "warning", "detail": "Available host memory is below the recommended guest RAM plus safety margin."})
    else:
        preflight_checks.append({"stage": "Host memory capacity", "status": "passed", "detail": "Host memory estimate is sufficient for the configured guest RAM."})
    if machine not in ("q35", "pc"):
        raise ValueError("For x86_64, choose the q35 or pc machine profile.")
    if display not in ("std", "virtio", "none"):
        raise ValueError("Unsupported QEMU display profile.")
    if accel not in ("auto", "kvm", "whpx", "tcg"):
        raise ValueError("Unsupported QEMU acceleration setting.")
    if cpu_model not in ("max", "qemu64", "Nehalem"):
        raise ValueError("Unsupported QEMU CPU model.")
    if network not in ("none", "user"):
        raise ValueError("Unsupported QEMU network mode.")
    if serial_backend not in ("file", "null"):
        raise ValueError("Unsupported serial backend.")
    if not 5900 <= vnc_port <= 5999:
        raise ValueError("VNC port must be between 5900 and 5999.")
    display_number = vnc_port - 5900
    websocket_port = 5700 + display_number
    if not port_available(vnc_port) or not port_available(websocket_port):
        raise RuntimeError("QEMU VNC or WebSocket port is already in use. Change the VNC port in Settings.")

    session_dir = LOGS / ("qemu-" + uuid.uuid4().hex[:12])
    session_dir.mkdir(parents=True, exist_ok=True)
    serial_path = session_dir / "serial.log"
    process_log = session_dir / "qemu-process.log"
    serial_device = "file:serial.log" if serial_backend == "file" else "null"
    network_device = "user,model=e1000" if network == "user" else "none"
    cmd = [
        binary, "-name", "Kerno-" + project["id"][:10],
        "-machine", machine, "-cpu", cpu_model, "-m", str(ram), "-smp", str(cpus),
        "-cdrom", str(iso_path),
        "-boot", "order=d", "-nic", network_device, "-monitor", "none",
        "-serial", serial_device, "-display", "none", "-vga", "std",
        "-vnc", HOST + ":" + str(display_number) + ",websocket=" + HOST + ":" + str(websocket_port),
        "-no-reboot", "-no-shutdown",
    ]
    if display == "virtio":
        cmd[cmd.index("-vga") + 1] = "virtio"
    elif display == "none":
        cmd[cmd.index("-vga") + 1] = "none"
    if accel != "auto":
        cmd.extend(["-accel", accel])

    log_handle = process_log.open("ab")
    try:
        kwargs = {
            "cwd": str(session_dir),
            "stdin": subprocess.DEVNULL,
            "stdout": log_handle,
            "stderr": subprocess.STDOUT,
            "close_fds": True,
        }
        if os.name == "nt":
            kwargs["creationflags"] = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
        else:
            kwargs["start_new_session"] = True
        process = subprocess.Popen(cmd, **kwargs)
    finally:
        log_handle.close()

    time.sleep(0.8)
    if process.poll() is not None:
        detail = tail_text(process_log, 6000)
        raise RuntimeError("QEMU exited during startup. " + detail[-1000:])

    display_url = "ws://" + HOST + ":" + str(websocket_port)
    with STATE_LOCK:
        RUNTIME.update({
            "process": process,
            "project_id": project["id"],
            "artifact_id": artifact_id,
            "serial_path": serial_path,
            "process_log_path": process_log,
            "display_url": display_url,
            "started_at": time.time(),
            "command": cmd,
            "health_checks": preflight_checks,
            "boot_mode": "project",
            "iso_name": None,
        })
    return emulator_status()


def start_imported_iso_qemu(payload: dict) -> dict:
    """Boot an imported, independently validated BIOS ISO without a Kerno project."""
    iso_id = str(payload.get("isoId") or "")
    if not re.fullmatch(r"[A-Za-z0-9_-]{8,64}", iso_id):
        raise ValueError("A valid imported ISO must be selected before starting QEMU.")
    metadata = IMPORTED_ISOS.get(iso_id)
    if not metadata:
        raise RuntimeError("The imported ISO is not available in this Local Service session. Import it again.")
    iso_path = Path(metadata.get("path") or "")
    if not iso_path.is_file():
        raise RuntimeError("The imported ISO file is no longer available. Import it again.")

    settings = payload.get("settings") or {}
    if not isinstance(settings, dict):
        raise ValueError("QEMU settings must be an object.")
    binary = executable(settings.get("qemuBinary"), "qemu-system-x86_64")
    xorriso = executable("xorriso", "xorriso")
    inspection = inspect_iso_image(iso_path, xorriso)
    expected_sha256 = str(metadata.get("sha256") or "")
    if not re.fullmatch(r"[a-fA-F0-9]{64}", expected_sha256):
        raise RuntimeError("Imported ISO has no valid SHA-256 record. Import the image again.")
    actual_sha256 = sha256_file(iso_path)
    if not hmac.compare_digest(actual_sha256.lower(), expected_sha256.lower()):
        raise RuntimeError("ISO SHA-256 integrity check failed. The imported image may have changed.")
    if not inspection.get("bootableBIOS"):
        raise RuntimeError("This ISO has no validated El Torito BIOS boot entry. Kerno v0.1 boots BIOS-compatible images; UEFI-only boot is planned for a later stage.")

    with STATE_LOCK:
        current = RUNTIME.get("process")
        if current and current.poll() is None:
            raise RuntimeError("A QEMU machine is already running. Stop it before starting another image.")

    ram = int(settings.get("guestMemoryMiB", 512))
    cpus = int(settings.get("qemuVcpus", 2))
    machine = str(settings.get("qemuMachine", "q35"))
    display = str(settings.get("qemuDisplay", "std"))
    accel = str(settings.get("qemuAcceleration", "auto"))
    cpu_model = str(settings.get("qemuCpuModel", "max"))
    network = str(settings.get("qemuNetwork", "none"))
    serial_backend = str(settings.get("serialBackend", "file"))
    vnc_port = int(settings.get("qemuVncPort", 5901))
    if not 64 <= ram <= 32768 or not 1 <= cpus <= 32:
        raise ValueError("QEMU guest memory or vCPU count is outside the supported limits.")
    if machine not in ("q35", "pc"):
        raise ValueError("For x86_64, choose the q35 or pc machine profile.")
    if display not in ("std", "virtio", "none"):
        raise ValueError("Unsupported QEMU display profile.")
    if accel not in ("auto", "kvm", "whpx", "tcg"):
        raise ValueError("Unsupported QEMU acceleration setting.")
    if cpu_model not in ("max", "qemu64", "Nehalem"):
        raise ValueError("Unsupported QEMU CPU model.")
    if network not in ("none", "user"):
        raise ValueError("Unsupported QEMU network mode.")
    if serial_backend not in ("file", "null"):
        raise ValueError("Unsupported serial backend.")
    if not 5900 <= vnc_port <= 5999:
        raise ValueError("VNC port must be between 5900 and 5999.")
    display_number = vnc_port - 5900
    websocket_port = 5700 + display_number
    if not port_available(vnc_port) or not port_available(websocket_port):
        raise RuntimeError("QEMU VNC or WebSocket port is already in use. Change the VNC port in Settings.")

    host = host_memory()
    available_host = host.get("availableMiB")
    preflight_checks = [
        {"stage": "Imported ISO integrity", "status": "passed", "detail": "SHA-256 matches the uploaded image."},
        {"stage": "BIOS boot compatibility", "status": "passed", "detail": "A bootable El Torito BIOS entry was found."},
    ]
    if available_host is not None and available_host < ram + max(256, int(ram * 0.1)):
        preflight_checks.append({"stage": "Host memory capacity", "status": "warning", "detail": "Available host memory is below the recommended guest RAM plus safety margin."})
    else:
        preflight_checks.append({"stage": "Host memory capacity", "status": "passed", "detail": "Host memory estimate is sufficient for the configured guest RAM."})

    session_dir = LOGS / ("qemu-iso-" + uuid.uuid4().hex[:12])
    session_dir.mkdir(parents=True, exist_ok=True)
    serial_path = session_dir / "serial.log"
    process_log = session_dir / "qemu-process.log"
    serial_device = "file:serial.log" if serial_backend == "file" else "null"
    network_device = "user,model=e1000" if network == "user" else "none"
    cmd = [
        binary, "-name", "Kerno-ISO-" + iso_id[:10],
        "-machine", machine, "-cpu", cpu_model, "-m", str(ram), "-smp", str(cpus),
        "-cdrom", str(iso_path),
        "-boot", "order=d", "-nic", network_device, "-monitor", "none",
        "-serial", serial_device, "-display", "none", "-vga", "std",
        "-vnc", HOST + ":" + str(display_number) + ",websocket=" + HOST + ":" + str(websocket_port),
        "-no-reboot", "-no-shutdown",
    ]
    if display == "virtio":
        cmd[cmd.index("-vga") + 1] = "virtio"
    elif display == "none":
        cmd[cmd.index("-vga") + 1] = "none"
    if accel != "auto":
        cmd.extend(["-accel", accel])

    log_handle = process_log.open("ab")
    try:
        kwargs = {
            "cwd": str(session_dir),
            "stdin": subprocess.DEVNULL,
            "stdout": log_handle,
            "stderr": subprocess.STDOUT,
            "close_fds": True,
        }
        if os.name == "nt":
            kwargs["creationflags"] = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
        else:
            kwargs["start_new_session"] = True
        process = subprocess.Popen(cmd, **kwargs)
    finally:
        log_handle.close()

    time.sleep(0.8)
    if process.poll() is not None:
        detail = tail_text(process_log, 6000)
        raise RuntimeError("QEMU exited during startup. " + detail[-1000:])

    display_url = "ws://" + HOST + ":" + str(websocket_port)
    with STATE_LOCK:
        RUNTIME.update({
            "process": process,
            "project_id": None,
            "artifact_id": iso_id,
            "serial_path": serial_path,
            "process_log_path": process_log,
            "display_url": display_url,
            "started_at": time.time(),
            "command": cmd,
            "health_checks": preflight_checks,
            "boot_mode": "external-iso",
            "iso_name": metadata.get("name") or "Imported ISO",
        })
    return emulator_status()



def emulator_status() -> dict:
    with STATE_LOCK:
        process = RUNTIME.get("process")
        if process and process.poll() is not None:
            RUNTIME.update({"process": None, "display_url": None})
            process = None
        running = bool(process and process.poll() is None)
        serial_path = RUNTIME.get("serial_path")
        process_log_path = RUNTIME.get("process_log_path")
        return {
            "status": "running" if running else "stopped",
            "projectId": RUNTIME.get("project_id") if running else None,
            "displayUrl": RUNTIME.get("display_url") if running else None,
            "serialOutput": tail_text(serial_path, 12000),
            "processLog": tail_text(process_log_path, 4000),
            "startedAt": RUNTIME.get("started_at") if running else None,
            "healthChecks": RUNTIME.get("health_checks") or [],
            "bootMode": RUNTIME.get("boot_mode") if running else None,
            "isoName": RUNTIME.get("iso_name") if running else None,
        }


class Handler(BaseHTTPRequestHandler):
    server_version = "KernoLocalService/" + VERSION

    def log_message(self, fmt: str, *args) -> None:
        sys.stdout.write("[Kerno] " + (fmt % args) + "\n")

    def request_origin(self) -> str:
        return self.headers.get("Origin", "").rstrip("/")

    def valid_host_header(self) -> bool:
        try:
            host = urlparse("//" + self.headers.get("Host", "")).hostname
        except ValueError:
            host = None
        return (host or "").lower() in ("127.0.0.1", "localhost", "::1")

    def send_cors(self) -> None:
        origin = self.request_origin()
        if origin in ALLOWED_ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Kerno-Token")
            self.send_header("Access-Control-Max-Age", "600")
            self.send_header("Access-Control-Allow-Private-Network", "true")

    def send_json(self, status: int, value: dict) -> None:
        data = json.dumps(value, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_cors()
        self.end_headers()
        self.wfile.write(data)

    def authorized(self) -> bool:
        if not self.valid_host_header():
            self.send_json(403, {"message": "Kerno Local Service only accepts loopback Host headers."})
            return False
        origin = self.request_origin()
        if origin and origin not in ALLOWED_ORIGINS:
            self.send_json(403, {"message": "Origin is not in Kerno Local Service allow-list."})
            return False
        supplied = self.headers.get("X-Kerno-Token", "")
        if not supplied or not hmac.compare_digest(supplied, PAIRING_TOKEN):
            self.send_json(401, {"message": "Invalid or missing Kerno pairing token. Add the token in Settings → Advanced."})
            return False
        return True

    def read_json(self) -> dict:
        if self.headers.get("Content-Type", "").split(";")[0].strip().lower() != "application/json":
            raise ValueError("Content-Type must be application/json.")
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0 or length > MAX_REQUEST:
            raise ValueError("Request body is empty or exceeds the 24 MiB limit.")
        raw = self.rfile.read(length)
        data = json.loads(raw.decode("utf-8"))
        if not isinstance(data, dict):
            raise ValueError("JSON request body must be an object.")
        return data

    def do_OPTIONS(self) -> None:
        origin = self.request_origin()
        if origin not in ALLOWED_ORIGINS or not self.valid_host_header():
            self.send_response(403)
            self.end_headers()
            return
        self.send_response(204)
        self.send_cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self) -> None:
        if not self.authorized():
            return
        path = urlparse(self.path).path
        if path == "/api/v1/health":
            self.send_json(200, {
                "service": "kerno-local-agent",
                "apiVersion": VERSION,
                "platform": platform.platform(),
                "qemu": emulator_status()["status"],
            })
            return
        if path == "/api/v1/toolchain":
            self.send_json(200, {"tools": toolchain_report({})})
            return
        if path == "/api/v1/host/diagnostics":
            self.send_json(200, host_diagnostics({}))
            return
        if path == "/api/v1/emulator/status":
            self.send_json(200, emulator_status())
            return
        if path.startswith("/api/v1/iso/download/"):
            iso_id = path.rsplit("/", 1)[-1]
            metadata = IMPORTED_ISOS.get(iso_id)
            if not metadata:
                self.send_json(404, {"message": "Imported ISO was not found in this Local Service session."})
                return
            file_path = Path(metadata.get("path") or "")
            try:
                handle = file_path.open("rb")
            except OSError:
                self.send_json(404, {"message": "ISO file is no longer available."})
                return
            try:
                size = os.fstat(handle.fileno()).st_size
                self.send_response(200)
                self.send_header("Content-Type", "application/octet-stream")
                self.send_header("Content-Length", str(size))
                download_name = metadata.get("name") or "kerno-edited.iso"
                self.send_header("Content-Disposition", 'attachment; filename="' + safe_name(download_name) + '"')
                self.send_header("Cache-Control", "no-store")
                self.send_cors()
                self.end_headers()
                shutil.copyfileobj(handle, self.wfile)
            finally:
                handle.close()
            return
        if path.startswith("/api/v1/iso/workspaces/"):
            parts = path.strip("/").split("/")
            if len(parts) != 6:
                self.send_json(404, {"message": "ISO workspace route was not found."})
                return
            iso_id = parts[4]
            workspace = ISO_WORKSPACES.get(iso_id)
            if not workspace:
                self.send_json(404, {"message": "Open the ISO Editor workspace first."})
                return
            if parts[5] == "files":
                summary = list_iso_workspace_files(Path(workspace["root"]))
                query = parse_qs(urlparse(self.path).query)
                prefix = (query.get("prefix") or [""])[0].strip().casefold()
                if prefix:
                    summary["files"] = [entry for entry in summary["files"] if entry["path"].casefold().startswith(prefix)]
                self.send_json(200, {"workspaceId": workspace["id"], **summary})
                return
            if parts[5] == "file":
                query = parse_qs(urlparse(self.path).query)
                relative_path = (query.get("path") or [""])[0]
                result = read_iso_text_file(Path(workspace["root"]), relative_path)
                self.send_json(200, result)
                return
        if path.startswith("/api/v1/iso/archives/"):
            archive_id = path.rsplit("/", 1)[-1]
            metadata = ISO_ARCHIVES.get(archive_id)
            if not metadata:
                self.send_json(404, {"message": "Extracted ISO archive was not found in this Local Service session."})
                return
            file_path = Path(metadata["path"])
            if not file_path.is_file():
                self.send_json(404, {"message": "Extracted ISO archive is no longer available."})
                return
            self.send_response(200)
            self.send_header("Content-Type", "application/zip")
            self.send_header("Content-Length", str(file_path.stat().st_size))
            self.send_header("Content-Disposition", 'attachment; filename="' + metadata["name"] + '"')
            self.send_header("Cache-Control", "no-store")
            self.send_cors()
            self.end_headers()
            with file_path.open("rb") as handle:
                shutil.copyfileobj(handle, self.wfile)
            return
        if path.startswith("/api/v1/iso/imports/"):
            iso_id = path.rsplit("/", 1)[-1]
            metadata = IMPORTED_ISOS.get(iso_id)
            if not metadata:
                self.send_json(404, {"message": "Imported ISO was not found in this Local Service session."})
                return
            response = {key: value for key, value in metadata.items() if key != "path"}
            self.send_json(200, response)
            return
        if path.startswith("/api/v1/artifacts/"):
            artifact_id = path.rsplit("/", 1)[-1]
            metadata = ARTIFACTS.get(artifact_id)
            if not metadata:
                self.send_json(404, {"message": "Artifact not found in this Local Service session."})
                return
            file_path = Path(metadata["path"])
            if not file_path.is_file():
                self.send_json(404, {"message": "Artifact file is no longer available."})
                return
            self.send_response(200)
            self.send_header("Content-Type", "application/octet-stream")
            self.send_header("Content-Length", str(file_path.stat().st_size))
            self.send_header("Content-Disposition", 'attachment; filename="' + metadata["name"] + '"')
            self.send_header("Cache-Control", "no-store")
            self.send_cors()
            self.end_headers()
            with file_path.open("rb") as handle:
                shutil.copyfileobj(handle, self.wfile)
            return
        self.send_json(404, {"message": "Unknown Kerno Local Service endpoint."})

    def do_POST(self) -> None:
        if not self.authorized():
            return
        path = urlparse(self.path).path
        try:
            if path == "/api/v1/iso/import":
                content_type = self.headers.get("Content-Type", "").split(";", 1)[0].strip().lower()
                if content_type != "application/octet-stream":
                    raise ValueError("ISO upload must use application/octet-stream.")
                try:
                    content_length = int(self.headers.get("Content-Length", "0"))
                except ValueError as error:
                    raise ValueError("ISO upload Content-Length is invalid.") from error
                if not ISO_LOCK.acquire(blocking=False):
                    raise RuntimeError("Another ISO import or extraction is running. Wait for it to finish.")
                try:
                    xorriso = executable("xorriso", "xorriso")
                    query = parse_qs(urlparse(self.path).query)
                    filename = (query.get("name") or ["uploaded.iso"])[0]
                    imported = receive_iso_upload(self.rfile, content_length, filename, ARTIFACTS_DIR, xorriso)
                finally:
                    ISO_LOCK.release()
                IMPORTED_ISOS[imported["id"]] = imported
                response = {key: value for key, value in imported.items() if key != "path"}
                self.send_json(201, {"status": "imported", "iso": response})
                return

            if path == "/api/v1/iso/workspace/file":
                content_type = self.headers.get("Content-Type", "").split(";", 1)[0].strip().lower()
                if content_type != "application/octet-stream":
                    raise ValueError("ISO Editor uploads must use application/octet-stream.")
                query = parse_qs(urlparse(self.path).query)
                iso_id = (query.get("isoId") or [""])[0]
                relative_path = (query.get("path") or [""])[0]
                metadata = IMPORTED_ISOS.get(iso_id)
                workspace = ISO_WORKSPACES.get(iso_id)
                if not metadata or not workspace:
                    raise RuntimeError("Open the ISO Editor workspace before editing files.")
                if is_boot_image_path(relative_path, metadata.get("inspection", {}).get("bootImagePaths", [])):
                    raise ValueError("This file is used directly as an El Torito boot image and is protected to preserve bootability.")
                try:
                    content_length = int(self.headers.get("Content-Length", "0"))
                except ValueError as error:
                    raise ValueError("ISO Editor upload Content-Length is invalid.") from error
                if content_length < 0 or content_length > 16 * 1024 * 1024:
                    raise ValueError("A single edited or uploaded ISO file cannot exceed 16 MiB.")
                content = self.rfile.read(content_length)
                if len(content) != content_length:
                    raise ValueError("ISO Editor upload ended before the declared Content-Length was received.")
                if not ISO_LOCK.acquire(blocking=False):
                    raise RuntimeError("Another ISO operation is running. Wait for it to finish.")
                try:
                    result = write_iso_workspace_file(Path(workspace["root"]), relative_path, content)
                    workspace["dirty"] = True
                finally:
                    ISO_LOCK.release()
                self.send_json(200, {"status": "saved", "file": result})
                return

            data = self.read_json()
            if path == "/api/v1/iso/workspace/open":
                iso_id = str(data.get("isoId") or "")
                metadata = IMPORTED_ISOS.get(iso_id)
                if not metadata:
                    raise RuntimeError("The selected imported ISO is unavailable. Import it again.")
                workspace = ISO_WORKSPACES.get(iso_id)
                if not workspace or not Path(workspace.get("root") or "").is_dir():
                    if not ISO_LOCK.acquire(blocking=False):
                        raise RuntimeError("Another ISO operation is running. Wait for it to finish.")
                    try:
                        created = extract_iso_workspace(
                            Path(metadata.get("path") or ""),
                            ARTIFACTS_DIR,
                            executable("xorriso", "xorriso")
                        )
                    finally:
                        ISO_LOCK.release()
                    workspace = {
                        "id": created["id"],
                        "directory": created["directory"],
                        "root": created["root"],
                        "dirty": False,
                    }
                    ISO_WORKSPACES[iso_id] = workspace
                summary = list_iso_workspace_files(Path(workspace["root"]))
                self.send_json(200, {
                    "status": "opened",
                    "workspaceId": workspace["id"],
                    "dirty": bool(workspace.get("dirty")),
                    "bootImagePaths": metadata.get("inspection", {}).get("bootImagePaths", []),
                    **summary,
                })
                return
            if path == "/api/v1/iso/workspace/delete":
                iso_id = str(data.get("isoId") or "")
                relative_path = str(data.get("path") or "")
                metadata = IMPORTED_ISOS.get(iso_id)
                workspace = ISO_WORKSPACES.get(iso_id)
                if not metadata or not workspace:
                    raise RuntimeError("Open the ISO Editor workspace before editing files.")
                if is_boot_image_path(relative_path, metadata.get("inspection", {}).get("bootImagePaths", [])):
                    raise ValueError("This file is used directly as an El Torito boot image and is protected to preserve bootability.")
                if not ISO_LOCK.acquire(blocking=False):
                    raise RuntimeError("Another ISO operation is running. Wait for it to finish.")
                try:
                    result = delete_iso_file(Path(workspace["root"]), relative_path)
                    workspace["dirty"] = True
                finally:
                    ISO_LOCK.release()
                self.send_json(200, {"status": "deleted", "file": result})
                return
            if path == "/api/v1/iso/workspace/repack":
                iso_id = str(data.get("isoId") or "")
                metadata = IMPORTED_ISOS.get(iso_id)
                workspace = ISO_WORKSPACES.get(iso_id)
                if not metadata or not workspace:
                    raise RuntimeError("Open the ISO Editor workspace before rebuilding the ISO.")
                if not workspace.get("dirty"):
                    raise RuntimeError("There are no unsaved file changes to rebuild.")
                if not ISO_LOCK.acquire(blocking=False):
                    raise RuntimeError("Another ISO operation is running. Wait for it to finish.")
                try:
                    with STATE_LOCK:
                        current = RUNTIME.get("process")
                        if current and current.poll() is None:
                            raise RuntimeError("Stop the running QEMU machine before rebuilding an ISO.")
                    source_path = Path(metadata.get("path") or "")
                    expected_sha = str(metadata.get("sha256") or "")
                    if not source_path.is_file() or not re.fullmatch(r"[a-fA-F0-9]{64}", expected_sha):
                        raise RuntimeError("The source ISO or its integrity record is unavailable.")
                    if not hmac.compare_digest(sha256_file(source_path).lower(), expected_sha.lower()):
                        raise RuntimeError("The source ISO SHA-256 changed. Re-import the image before rebuilding.")
                    output_path = ARTIFACTS_DIR / ("iso-edited-" + uuid.uuid4().hex + ".iso")
                    result = repack_iso_workspace(
                        source_path,
                        Path(workspace["root"]),
                        output_path,
                        metadata.get("inspection") or {},
                        executable("xorriso", "xorriso")
                    )
                    previous_path = source_path
                    if "originalPath" not in metadata:
                        metadata["originalPath"] = str(source_path)
                    metadata["path"] = result["path"]
                    metadata["sha256"] = result["sha256"]
                    metadata["sizeBytes"] = result["sizeBytes"]
                    metadata["inspection"] = result["inspection"]
                    if "originalName" not in metadata:
                        metadata["originalName"] = metadata.get("name") or "uploaded.iso"
                    metadata["name"] = Path(metadata["originalName"]).stem + "-edited.iso"
                    metadata["edited"] = True
                    metadata["parentSha256"] = expected_sha
                    workspace["dirty"] = False
                    if previous_path != Path(metadata["originalPath"]):
                        previous_path.unlink(missing_ok=True)
                finally:
                    ISO_LOCK.release()
                self.send_json(200, {
                    "status": "repacked",
                    "iso": {key: value for key, value in metadata.items() if key not in ("path", "originalPath")},
                    "xorrisoLog": result.get("xorrisoLog", ""),
                })
                return
            if path == "/api/v1/iso/extract":
                iso_id = str(data.get("isoId") or "")
                metadata = IMPORTED_ISOS.get(iso_id)
                if not metadata:
                    raise RuntimeError("The selected ISO is not available. Import it again.")
                iso_path = Path(metadata.get("path") or "")
                if not iso_path.is_file():
                    raise RuntimeError("The imported ISO file is no longer available.")
                if not hmac.compare_digest(sha256_file(iso_path).lower(), str(metadata.get("sha256") or "").lower()):
                    raise RuntimeError("ISO SHA-256 integrity check failed. Re-import the image before extracting it.")
                if not ISO_LOCK.acquire(blocking=False):
                    raise RuntimeError("Another ISO import or extraction is running. Wait for it to finish.")
                try:
                    extracted = extract_iso_archive(iso_path, ARTIFACTS_DIR, executable("xorriso", "xorriso"))
                finally:
                    ISO_LOCK.release()
                ISO_ARCHIVES[extracted["id"]] = extracted
                response = {key: value for key, value in extracted.items() if key != "path"}
                self.send_json(200, {"status": "extracted", "archive": response})
                return
            if path == "/api/v1/emulator/start-iso":
                if not ISO_LOCK.acquire(blocking=False):
                    raise RuntimeError("Another ISO operation is running. Wait for it to finish.")
                try:
                    result = start_imported_iso_qemu(data)
                finally:
                    ISO_LOCK.release()
                self.send_json(200, result)
                return
            if path == "/api/v1/toolchain":
                settings = data.get("settings") or {}
                self.send_json(200, {"tools": toolchain_report(settings)})
                return
            if path == "/api/v1/host/diagnostics":
                settings = data.get("settings") or {}
                self.send_json(200, host_diagnostics(settings))
                return
            if path == "/api/v1/build":
                result = build_project(data)
                self.send_json(200, result)
                return
            if path == "/api/v1/emulator/start":
                if not ISO_LOCK.acquire(blocking=False):
                    raise RuntimeError("Another ISO operation is running. Wait for it to finish.")
                try:
                    result = start_qemu(data)
                finally:
                    ISO_LOCK.release()
                self.send_json(200, result)
                return
            if path == "/api/v1/emulator/stop":
                if not ISO_LOCK.acquire(blocking=False):
                    raise RuntimeError("Another ISO operation is running. Wait for it to finish.")
                try:
                    stop_qemu_process()
                finally:
                    ISO_LOCK.release()
                self.send_json(200, {"status": "stopped"})
                return
            if path == "/api/v1/memory/estimate":
                project = data.get("project") or {}
                config = project.get("config") or {}
                memory = config.get("memory") or {}
                requested = int(memory.get("guestMiB", (data.get("settings") or {}).get("guestMemoryMiB", 512)))
                heap = int(memory.get("heapReserveMiB", (data.get("settings") or {}).get("heapReserveMiB", 16)))
                stack_kib = int(memory.get("stackReserveKiB", (data.get("settings") or {}).get("stackReserveKiB", 512)))
                if not 64 <= requested <= 32768:
                    raise ValueError("Guest RAM must be between 64 and 32768 MiB.")
                if not 1 <= heap <= 8192 or not 64 <= stack_kib <= 1048576:
                    raise ValueError("Kernel heap or stack planning value is outside the supported range.")
                if heap + stack_kib / 1024 + 1 >= requested:
                    raise ValueError("Kernel heap and stack reservations must remain below guest RAM.")
                host = host_memory()
                source_bytes = 0
                files = project.get("files") or {}
                if isinstance(files, dict):
                    source_bytes = sum(len(str(value).encode("utf-8")) for value in files.values())
                reserved = heap + stack_kib / 1024 + 1
                available = host["availableMiB"]
                feasible = None if available is None else available >= requested + max(512, int(requested * 0.15))
                self.send_json(200, {
                    "host": host,
                    "guest": {"requestedMiB": requested, "plannedReserveMiB": round(reserved, 2), "unreservedMiB": round(max(0, requested - reserved), 2)},
                    "sourceBytes": source_bytes,
                    "recommended": feasible,
                    "note": "This is a host capacity estimate and guest configuration plan; it does not reserve or allocate physical RAM.",
                })
                return
            self.send_json(404, {"message": "Unknown Kerno Local Service endpoint."})
        except ValueError as error:
            self.send_json(400, {"status": "failed", "message": str(error)})
        except FileNotFoundError as error:
            self.send_json(503, {"status": "failed", "message": str(error)})
        except RuntimeError as error:
            self.send_json(409, {"status": "failed", "message": str(error)})
        except Exception as error:
            self.send_json(500, {"status": "failed", "message": "Local service error: " + str(error)})


def main() -> None:
    if not sys.version_info >= (3, 10):
        raise SystemExit("Kerno Local Service requires Python 3.10 or newer.")
    print("Kerno Local Service " + VERSION)
    print("Listening only on http://" + HOST + ":" + str(PORT))
    print("Pairing token (paste into Kerno Settings → Advanced):")
    print(PAIRING_TOKEN)
    print("Allowed website origins:")
    for origin in sorted(ALLOWED_ORIGINS):
        print("  " + origin)
    print("Data directory: " + str(ROOT))
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    server.daemon_threads = True
    try:
        server.serve_forever(poll_interval=0.4)
    except KeyboardInterrupt:
        print("\nStopping Kerno Local Service...")
    finally:
        stop_qemu_process()
        server.server_close()


if __name__ == "__main__":
    main()
