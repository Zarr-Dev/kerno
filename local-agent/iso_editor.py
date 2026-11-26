"""Safe editable workspaces and boot-preserving repacking for ISO images."""
from __future__ import annotations

import os
import re
import shutil
import stat
import subprocess
import tempfile
import uuid
from pathlib import Path, PurePosixPath

from iso_manager import (
    MAX_EXTRACTED_BYTES,
    MAX_ISO_BYTES,
    MAX_ISO_BYTES as _MAX_IMAGE_BYTES,
    MAX_EXTRACTED_FILES,
    _inside,
    inspect_iso_image,
    sha256_file,
)

MAX_EDITOR_FILES = 50_000
MAX_EDITOR_LIST = 2_000
MAX_EDITOR_TEXT_BYTES = 2 * 1024 * 1024
MAX_EDITOR_UPLOAD_BYTES = 16 * 1024 * 1024


def normalize_iso_path(value: object) -> str:
    raw = str(value or "")
    if not raw or "\x00" in raw or chr(92) in raw or raw.startswith("/"):
        raise ValueError("ISO paths must be relative and use forward slashes.")
    parsed = PurePosixPath(raw)
    if parsed.is_absolute() or not parsed.parts:
        raise ValueError("The selected ISO path is invalid.")
    if any(part in ("", ".", "..") or ":" in part for part in parsed.parts):
        raise ValueError("The selected ISO path contains an unsafe component.")
    return parsed.as_posix()


def _target(root: Path, relative_path: str, create_parents: bool = False) -> Path:
    root = Path(root).resolve(strict=True)
    parts = PurePosixPath(normalize_iso_path(relative_path)).parts
    current = root
    for index, part in enumerate(parts):
        current = current / part
        leaf = index == len(parts) - 1
        if current.is_symlink():
            raise ValueError("Symbolic links cannot be opened or modified in the ISO Editor.")
        if current.exists():
            resolved = current.resolve(strict=True)
            if not _inside(root, resolved):
                raise ValueError("The selected path escapes the ISO workspace.")
            if not leaf and not resolved.is_dir():
                raise ValueError("A parent component is not a directory.")
        elif not leaf and create_parents:
            current.mkdir()
        elif not leaf:
            raise FileNotFoundError("The selected ISO directory does not exist.")
    if not _inside(root, current.parent):
        raise ValueError("The selected path escapes the ISO workspace.")
    return current


def scan_workspace(workspace_root: Path) -> dict:
    root = Path(workspace_root).resolve(strict=True)
    if not root.is_dir():
        raise RuntimeError("The ISO workspace is not a directory.")
    entries = []
    file_count = 0
    total_bytes = 0
    link_count = 0
    for current, directories, files in os.walk(root, topdown=True, followlinks=False):
        parent = Path(current)
        safe_dirs = []
        for name in sorted(directories):
            item = parent / name
            relative = item.relative_to(root).as_posix()
            if item.is_symlink():
                link_count += 1
                if len(entries) < MAX_EDITOR_LIST:
                    entries.append({"path": relative, "kind": "symlink", "sizeBytes": 0, "editable": False})
            elif item.is_dir() and _inside(root, item):
                safe_dirs.append(name)
        directories[:] = safe_dirs
        for name in sorted(files):
            item = parent / name
            relative = item.relative_to(root).as_posix()
            if item.is_symlink():
                link_count += 1
                if len(entries) < MAX_EDITOR_LIST:
                    entries.append({"path": relative, "kind": "symlink", "sizeBytes": 0, "editable": False})
                continue
            if not item.is_file() or not _inside(root, item):
                continue
            size = item.stat().st_size
            file_count += 1
            total_bytes += size
            if len(entries) < MAX_EDITOR_LIST:
                entries.append({
                    "path": relative,
                    "kind": "file",
                    "sizeBytes": size,
                    "editable": size <= MAX_EDITOR_TEXT_BYTES,
                })
            if file_count > MAX_EDITOR_FILES:
                raise RuntimeError("The ISO contains more than 50,000 regular files.")
            if total_bytes > MAX_EXTRACTED_BYTES:
                raise RuntimeError("The ISO workspace exceeds the 2 GiB extracted-content limit.")
    entries.sort(key=lambda item: item["path"].casefold())
    return {
        "files": entries,
        "fileCount": file_count,
        "totalBytes": total_bytes,
        "symbolicLinks": link_count,
        "previewTruncated": file_count + link_count > len(entries),
    }


def extract_workspace(image_path: Path, destination: Path, xorriso_binary: str = "xorriso") -> dict:
    image_path = Path(image_path)
    destination = Path(destination)
    if not image_path.is_file():
        raise RuntimeError("The imported ISO is no longer available.")
    tool = shutil.which(xorriso_binary)
    if not tool:
        raise FileNotFoundError("xorriso was not found on PATH.")
    destination.mkdir(parents=True, exist_ok=True)
    workspace_id = uuid.uuid4().hex
    workspace_dir = destination / ("kerno-iso-workspace-" + workspace_id)
    root = workspace_dir / "root"
    workspace_dir.mkdir()
    root.mkdir()
    try:
        proc = subprocess.run(
            [tool, "-no_rc", "-osirrox", "on", "-follow", "off", "-indev", str(image_path),
             "-extract", "/", str(root), "-end"],
            cwd=str(workspace_dir), capture_output=True, text=True, timeout=600,
            check=False, encoding="utf-8", errors="replace"
        )
        if proc.returncode != 0:
            detail = ((proc.stdout or "") + "\n" + (proc.stderr or "")).strip()
            raise RuntimeError("xorriso could not open the ISO for editing: " + detail[-1200:])
        summary = scan_workspace(root)
        return {"id": workspace_id, "directory": str(workspace_dir), "root": str(root), **summary}
    except subprocess.TimeoutExpired as error:
        shutil.rmtree(workspace_dir, ignore_errors=True)
        raise RuntimeError("xorriso timed out while opening the ISO Editor workspace.") from error
    except Exception:
        shutil.rmtree(workspace_dir, ignore_errors=True)
        raise

def read_text_file(workspace_root: Path, relative_path: str) -> dict:
    target = _target(workspace_root, relative_path)
    if target.is_symlink() or not target.is_file():
        raise ValueError("The selected ISO entry is not a regular file.")
    size = target.stat().st_size
    if size > MAX_EDITOR_TEXT_BYTES:
        raise ValueError("The file is larger than the 2 MiB text-editor limit. Use Replace file to upload a new copy.")
    raw = target.read_bytes()
    if b"\x00" in raw:
        raise ValueError("This is a binary file. Use Replace file to upload a new copy.")
    try:
        content = raw.decode("utf-8")
    except UnicodeDecodeError as error:
        raise ValueError("This file is not UTF-8 text. Use Replace file to upload a new copy.") from error
    return {"path": normalize_iso_path(relative_path), "content": content, "sizeBytes": size}


def write_file(workspace_root: Path, relative_path: str, data: bytes) -> dict:
    if not isinstance(data, (bytes, bytearray)):
        raise TypeError("ISO file content must be bytes.")
    content = bytes(data)
    if len(content) > MAX_EDITOR_UPLOAD_BYTES:
        raise ValueError("A single edited or uploaded ISO file cannot exceed 16 MiB.")
    normalized = normalize_iso_path(relative_path)
    target = _target(workspace_root, normalized, create_parents=True)
    if target.is_symlink() or (target.exists() and not target.is_file()):
        raise ValueError("Only regular ISO files can be created or replaced.")
    summary = scan_workspace(workspace_root)
    previous_size = target.stat().st_size if target.exists() else 0
    if not target.exists() and summary["fileCount"] >= MAX_EDITOR_FILES:
        raise ValueError("The ISO already contains the maximum number of regular files.")
    if summary["totalBytes"] - previous_size + len(content) > MAX_EXTRACTED_BYTES:
        raise ValueError("The edited ISO would exceed the 2 GiB workspace limit.")
    temporary = target.parent / (".kerno-write-" + uuid.uuid4().hex + ".part")
    try:
        with temporary.open("xb") as handle:
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, target)
    except Exception:
        temporary.unlink(missing_ok=True)
        raise
    return {"path": normalized, "sizeBytes": len(content), "created": not target.exists()}


def delete_file(workspace_root: Path, relative_path: str) -> dict:
    normalized = normalize_iso_path(relative_path)
    target = _target(workspace_root, normalized)
    if target.is_symlink() or not target.is_file():
        raise ValueError("Only regular file entries can be removed. Directories and symbolic links are preserved.")
    target.unlink()
    return {"path": normalized, "deleted": True}


def is_boot_image_path(relative_path: str, protected_paths: list[str]) -> bool:
    target = normalize_iso_path(relative_path).casefold()
    for protected in protected_paths or []:
        try:
            boot_path = normalize_iso_path(protected).casefold()
        except ValueError:
            continue
        if target == boot_path or target.startswith(boot_path + "/") or boot_path.startswith(target + "/"):
            return True
    return False


def repack_workspace(
    image_path: Path,
    workspace_root: Path,
    destination: Path,
    original_inspection: dict,
    xorriso_binary: str = "xorriso",
) -> dict:
    image_path = Path(image_path)
    workspace_root = Path(workspace_root).resolve(strict=True)
    destination = Path(destination)
    if not image_path.is_file() or not workspace_root.is_dir():
        raise RuntimeError("The ISO image or editing workspace is no longer available.")
    scan_workspace(workspace_root)
    tool = shutil.which(xorriso_binary)
    if not tool:
        raise FileNotFoundError("xorriso was not found on PATH.")
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists():
        raise FileExistsError("The output ISO path already exists.")
    command = [
        tool, "-no_rc", "-abort_on", "FAILURE", "-return_with", "FAILURE", "32",
        "-indev", str(image_path), "-outdev", str(destination),
        "-follow", "off", "-update_r", str(workspace_root), "/",
    ]
    if original_inspection.get("hasElTorito"):
        command.extend(["-boot_image", "any", "replay"])
    command.extend(["-commit", "-end"])
    try:
        process = subprocess.run(
            command, cwd=str(workspace_root.parent), capture_output=True, text=True,
            timeout=900, check=False, encoding="utf-8", errors="replace"
        )
    except subprocess.TimeoutExpired as error:
        destination.unlink(missing_ok=True)
        raise RuntimeError("xorriso timed out while rebuilding the edited ISO.") from error
    except OSError as error:
        destination.unlink(missing_ok=True)
        raise RuntimeError("Could not start xorriso: " + str(error)) from error
    output_log = ((process.stdout or "") + "\n" + (process.stderr or "")).strip()
    if process.returncode != 0 or not destination.is_file() or destination.stat().st_size < 19 * 2048:
        destination.unlink(missing_ok=True)
        raise RuntimeError("xorriso failed to rebuild the ISO: " + output_log[-1600:])
    try:
        inspection = inspect_iso_image(destination, xorriso_binary)
        if not inspection.get("iso9660Valid"):
            raise RuntimeError("The rebuilt ISO did not pass ISO9660 validation.")
        for flag in ("bootableBIOS", "bootableEFI"):
            if original_inspection.get(flag) and not inspection.get(flag):
                raise RuntimeError("The rebuilt ISO lost its original " + flag + " boot entry.")
        return {
            "path": str(destination),
            "sha256": sha256_file(destination),
            "sizeBytes": destination.stat().st_size,
            "inspection": inspection,
            "xorrisoLog": output_log[-5000:],
        }
    except Exception:
        destination.unlink(missing_ok=True)
        raise

