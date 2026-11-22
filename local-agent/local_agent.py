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
from urllib.parse import urlparse

VERSION = "0.1.0"
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
RUNTIME = {
    "process": None,
    "project_id": None,
    "artifact_id": None,
    "serial_path": None,
    "process_log_path": None,
    "display_url": None,
    "started_at": None,
    "command": None,
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
    try:
        result = subprocess.run(
            [found, "--version"], capture_output=True, text=True,
            timeout=3, check=False, encoding="utf-8", errors="replace"
        )
        version = (result.stdout or result.stderr).splitlines()[0][:180] if (result.stdout or result.stderr) else ""
    except (OSError, subprocess.TimeoutExpired):
        pass
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


def build_project(payload: dict) -> dict:
    if not BUILD_LOCK.acquire(blocking=False):
        return {"status": "failed", "message": "Another Kerno build is already running. Wait for it to finish.", "log": "Build lock is occupied."}
    logs: list[str] = []
    try:
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
        nasm = executable(settings.get("assembler"), "nasm")
        cpp_compiler = executable(settings.get("crossCompiler"), "x86_64-elf-g++")
        c_compiler = executable(settings.get("cCompiler"), "x86_64-elf-gcc")
        linker = executable(settings.get("linker"), "x86_64-elf-ld")
        grub = executable(settings.get("isoBuilder"), "grub-mkrescue")
        xorriso = shutil.which("xorriso")
        if not xorriso:
            raise RuntimeError("xorriso was not found. grub-mkrescue requires xorriso to package the ISO.")
        compiler_machine = subprocess.run([cpp_compiler, "-dumpmachine"], capture_output=True, text=True, timeout=5, check=False).stdout.strip()
        c_compiler_machine = subprocess.run([c_compiler, "-dumpmachine"], capture_output=True, text=True, timeout=5, check=False).stdout.strip()
        if not compiler_machine.startswith("x86_64-"):
            raise RuntimeError("Configured C++ cross compiler must target x86_64; reported target: " + (compiler_machine or "unknown"))
        if not c_compiler_machine.startswith("x86_64-"):
            raise RuntimeError("Configured C cross compiler must target x86_64; reported target: " + (c_compiler_machine or "unknown"))

        build_id = uuid.uuid4().hex
        workspace = BUILDS / (project["id"] + "-" + build_id[:10])
        output = workspace / "out"
        iso_root = workspace / "iso-root"
        output.mkdir(parents=True, exist_ok=True)
        write_project(project, workspace)
        log_file = workspace / "build.log"
        logs.append("Kerno native build · " + project["name"])
        logs.append("Target: x86_64 / BIOS / GRUB Multiboot2")
        logs.append("Source size: " + str(project["total_bytes"]) + " bytes")

        asm_files = sorted(path for path in project["files"] if path.startswith("boot/") and path.endswith(".asm"))
        object_files: list[str] = []
        for relative in asm_files:
            source = workspace.joinpath(*PurePosixPath(relative).parts)
            object_path = output / (safe_name(source.stem) + ".asm.o")
            run_command([nasm, "-f", "elf64", "-g", "-F", "dwarf", str(source), "-o", str(object_path)], workspace, logs)
            object_files.append(str(object_path))

        source_files = sorted(
            path for path in project["files"]
            if path.startswith("src/") and path.endswith((".cpp", ".cc", ".cxx", ".c"))
        )
        optimization = str(config.get("optimization", "debug"))
        opt_flag = {"debug": "-O0", "size": "-Os", "speed": "-O2"}.get(optimization, "-O0")
        for relative in source_files:
            source = workspace.joinpath(*PurePosixPath(relative).parts)
            object_path = output / (hashlib.sha1(relative.encode("utf-8")).hexdigest()[:12] + ".o")
            diagnostics = config.get("diagnostics") or {}
            is_c_source = source.suffix == ".c"
            selected_compiler = c_compiler if is_c_source else cpp_compiler
            args = [
                selected_compiler, "-m64", "-mcmodel=kernel", "-mno-red-zone", "-ffreestanding",
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
            object_files.append(str(object_path))

        if not object_files:
            raise RuntimeError("No assembly or C/C++ object files were generated.")
        kernel = output / "kernel.elf"
        linker_script = workspace / "linker.ld"
        run_command([linker, "-nostdlib", "-static", "-z", "max-page-size=0x1000", "-T", str(linker_script), "-o", str(kernel)] + object_files, workspace, logs, timeout=60)
        if not kernel.exists() or kernel.stat().st_size < 64:
            raise RuntimeError("Linker did not produce a valid kernel ELF.")
        header = kernel.read_bytes()[:5]
        if header[:4] != b"\x7fELF" or header[4] != 2:
            raise RuntimeError("Kernel output is not a 64-bit ELF image.")
        verify_multiboot2_header(kernel)

        grub_dir = iso_root / "boot" / "grub"
        grub_dir.mkdir(parents=True, exist_ok=True)
        shutil.copy2(kernel, iso_root / "boot" / "kernel.elf")
        shutil.copy2(workspace / "boot" / "grub.cfg", grub_dir / "grub.cfg")
        artifact_id = uuid.uuid4().hex
        artifact_name = safe_name(project["name"]) + "-" + artifact_id[:8] + ".iso"
        artifact_path = ARTIFACTS_DIR / artifact_name
        run_command([grub, "-o", str(artifact_path), str(iso_root)], workspace, logs, timeout=120)
        if not artifact_path.exists() or artifact_path.stat().st_size < 1024 * 128:
            raise RuntimeError("ISO packager did not produce a plausible ISO artifact.")

        metadata = {
            "id": artifact_id,
            "project_id": project["id"],
            "name": artifact_name,
            "path": str(artifact_path),
            "size_bytes": artifact_path.stat().st_size,
            "created_at": time.time(),
        }
        with STATE_LOCK:
            ARTIFACTS[artifact_id] = metadata
            PROJECT_ARTIFACTS[project["id"]] = artifact_id
        logs.append("Verified Multiboot2 header and 64-bit ELF output.")
        logs.append("ISO artifact: " + artifact_name + " (" + str(metadata["size_bytes"]) + " bytes)")
        log_file.write_text("\n".join(logs) + "\n", encoding="utf-8")
        return {
            "status": "success",
            "message": "Native build completed and the ISO artifact was verified.",
            "log": "\n".join(logs),
            "artifact": {
                "id": artifact_id,
                "name": artifact_name,
                "sizeBytes": metadata["size_bytes"],
                "downloadUrl": "/api/v1/artifacts/" + artifact_id,
            },
        }
    except (ValueError, FileNotFoundError, RuntimeError, subprocess.TimeoutExpired) as error:
        logs.append("BUILD FAILED: " + str(error))
        return {"status": "failed", "message": str(error), "log": "\n".join(logs)}
    except Exception as error:
        logs.append("UNEXPECTED BUILD ERROR: " + str(error))
        return {"status": "failed", "message": "Unexpected local build service error: " + str(error), "log": "\n".join(logs)}
    finally:
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
            "display_url": None, "started_at": None, "command": None
        })


def start_qemu(payload: dict) -> dict:
    project = read_project(payload)
    config = project["config"]
    if config.get("architecture") != "x86_64" or config.get("firmware") != "bios" or config.get("bootloader") != "grub":
        raise RuntimeError("QEMU boot profile is currently enabled for x86_64 + BIOS + GRUB projects only.")
    settings = payload.get("settings") or {}
    qemu_cfg = config.get("qemu") or {}
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

    ram = int((config.get("memory") or {}).get("guestMiB", settings.get("guestMemoryMiB", 512)))
    cpus = int(qemu_cfg.get("vcpus", settings.get("qemuVcpus", 2)))
    machine = str(qemu_cfg.get("machine", settings.get("qemuMachine", "q35")))
    display = str(qemu_cfg.get("display", settings.get("qemuDisplay", "std")))
    accel = str(qemu_cfg.get("acceleration", settings.get("qemuAcceleration", "auto")))
    cpu_model = str(qemu_cfg.get("cpuModel", settings.get("qemuCpuModel", "max")))
    network = str(qemu_cfg.get("network", settings.get("qemuNetwork", "none")))
    diagnostics = config.get("diagnostics") or {}
    serial_backend = str(diagnostics.get("serialBackend", settings.get("serialBackend", "file")))
    vnc_port = int(qemu_cfg.get("vncPort", settings.get("qemuVncPort", 5901)))
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

    session_dir = LOGS / ("qemu-" + uuid.uuid4().hex[:12])
    session_dir.mkdir(parents=True, exist_ok=True)
    serial_path = session_dir / "serial.log"
    process_log = session_dir / "qemu-process.log"
    serial_device = "file:serial.log" if serial_backend == "file" else "null"
    network_device = "user,model=e1000" if network == "user" else "none"
    cmd = [
        binary, "-name", "Kerno-" + project["id"][:10],
        "-machine", machine, "-cpu", cpu_model, "-m", str(ram), "-smp", str(cpus),
        "-drive", "file=" + str(iso_path) + ",media=cdrom,readonly=on",
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
        }


class Handler(BaseHTTPRequestHandler):
    server_version = "KernoLocalService/" + VERSION

    def log_message(self, fmt: str, *args) -> None:
        sys.stdout.write("[Kerno] " + (fmt % args) + "\n")

    def request_origin(self) -> str:
        return self.headers.get("Origin", "").rstrip("/")

    def valid_host_header(self) -> bool:
        host = self.headers.get("Host", "").split(":")[0].strip("[]").lower()
        return host in ("127.0.0.1", "localhost")

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
            query = {}
            self.send_json(200, {"tools": toolchain_report(query)})
            return
        if path == "/api/v1/emulator/status":
            self.send_json(200, emulator_status())
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
            data = self.read_json()
            if path == "/api/v1/toolchain":
                settings = data.get("settings") or {}
                self.send_json(200, {"tools": toolchain_report(settings)})
                return
            if path == "/api/v1/build":
                result = build_project(data)
                self.send_json(200, result)
                return
            if path == "/api/v1/emulator/start":
                result = start_qemu(data)
                self.send_json(200, result)
                return
            if path == "/api/v1/emulator/stop":
                stop_qemu_process()
                self.send_json(200, {"status": "stopped"})
                return
            if path == "/api/v1/memory/estimate":
                project = data.get("project") or {}
                config = project.get("config") or {}
                memory = config.get("memory") or {}
                requested = int(memory.get("guestMiB", (data.get("settings") or {}).get("guestMemoryMiB", 512)))
                heap = int(memory.get("heapReserveMiB", (data.get("settings") or {}).get("heapReserveMiB", 16)))
                stack_kib = int(memory.get("stackReserveKiB", (data.get("settings") or {}).get("stackReserveKiB", 512)))
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
            self.send_json(200, {"status": "failed", "message": str(error)})
        except RuntimeError as error:
            self.send_json(200, {"status": "failed", "message": str(error)})
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
