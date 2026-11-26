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
