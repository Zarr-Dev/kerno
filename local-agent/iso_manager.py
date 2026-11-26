"""Safe ISO import, inspection and extraction helpers for Kerno Local Service."""
from __future__ import annotations

import hashlib
import os
import re
import shutil
import subprocess
import tempfile
import uuid
import zipfile
from pathlib import Path, PurePosixPath

SECTOR_SIZE = 2048
MIN_ISO_BYTES = 19 * SECTOR_SIZE
MAX_ISO_BYTES = int(os.environ.get("KERNO_MAX_ISO_BYTES", str(4 * 1024**3)))
MAX_EXTRACTED_BYTES = int(os.environ.get("KERNO_MAX_EXTRACTED_ISO_BYTES", str(2 * 1024**3)))
MAX_EXTRACTED_FILES = 50_000
PREVIEW_LIMIT = 500
CHUNK_SIZE = 1024 * 1024


def _safe_filename(value: object) -> str:
    raw = str(value or "uploaded.iso").replace("\\", "/").split("/")[-1]
    cleaned = re.sub(r"[^A-Za-z0-9._ -]+", "_", raw).strip(" .")
    if not cleaned:
        cleaned = "uploaded.iso"
    if not cleaned.lower().endswith(".iso"):
        cleaned += ".iso"
    return cleaned[:120]


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(CHUNK_SIZE), b""):
            digest.update(chunk)
    return digest.hexdigest()


def inspect_iso_structure(image_path: Path) -> dict:
    """Check ISO9660 descriptors and the El Torito catalog without trusting its name."""
    path = Path(image_path)
    if not path.is_file():
        raise RuntimeError("ISO file is missing.")
    size = path.stat().st_size
    if size < MIN_ISO_BYTES or size > MAX_ISO_BYTES or size % SECTOR_SIZE != 0:
        raise RuntimeError("ISO size is outside the allowed range or is not 2048-byte sector aligned.")

    primary_found = False
    terminator_found = False
    boot_catalog_lba = None
    volume_id = ""
    descriptor_limit = min(256, size // SECTOR_SIZE)

    with path.open("rb") as handle:
        for sector in range(16, descriptor_limit):
            handle.seek(sector * SECTOR_SIZE)
            descriptor = handle.read(SECTOR_SIZE)
            if len(descriptor) != SECTOR_SIZE:
                raise RuntimeError("ISO volume descriptor is truncated.")
            if descriptor[1:6] != b"CD001" or descriptor[6] != 1:
                continue
            descriptor_type = descriptor[0]
            if descriptor_type == 1:
                primary_found = True
                volume_id = descriptor[40:72].decode("ascii", errors="replace").strip(" \x00")
            elif descriptor_type == 0 and descriptor[7:30].rstrip(b" \x00") == b"EL TORITO SPECIFICATION":
                import struct
                boot_catalog_lba = struct.unpack_from("<I", descriptor, 71)[0]
            elif descriptor_type == 255:
                terminator_found = True
                break

        if not primary_found:
            raise RuntimeError("ISO9660 primary volume descriptor is missing or invalid.")
        if not terminator_found:
            raise RuntimeError("ISO9660 volume descriptor terminator is missing.")

        catalog_valid = False
        bios_bootable = False
        efi_bootable = False
        boot_platform = None
        if boot_catalog_lba:
            catalog_offset = boot_catalog_lba * SECTOR_SIZE
            if catalog_offset + 64 > size:
                raise RuntimeError("El Torito boot catalog points outside the ISO image.")
            handle.seek(catalog_offset)
            catalog = handle.read(SECTOR_SIZE)
            validation = catalog[:32]
            if len(validation) < 32 or validation[0] != 1 or validation[30:32] != b"\x55\xaa":
                raise RuntimeError("El Torito validation entry is invalid.")
            import struct
            checksum = sum(struct.unpack_from("<H", validation, offset)[0] for offset in range(0, 32, 2)) & 0xFFFF
            if checksum != 0:
                raise RuntimeError("El Torito validation-entry checksum is invalid.")
            catalog_valid = True
            platform_id = validation[1]
            boot_indicator = catalog[32]
            if boot_indicator == 0x88 and platform_id == 0x00:
                bios_bootable = True
                boot_platform = "BIOS"
            elif boot_indicator == 0x88 and platform_id == 0xEF:
                efi_bootable = True
                boot_platform = "EFI"

    return {
        "sizeBytes": size,
        "volumeId": volume_id or "(no volume label)",
        "iso9660Valid": True,
        "hasElTorito": bool(boot_catalog_lba),
        "elToritoCatalogValid": catalog_valid,
        "bootableBIOS": bios_bootable,
        "bootableEFI": efi_bootable,
        "bootPlatform": boot_platform,
        "bootCatalogLba": boot_catalog_lba,
    }


def inspect_iso_image(image_path: Path, xorriso_binary: str = "xorriso") -> dict:
    """Inspect the ISO and augment El Torito details using xorriso when available."""
    result = inspect_iso_structure(image_path)
    tool = shutil.which(xorriso_binary)
    if not tool:
        raise FileNotFoundError("xorriso was not found on PATH. Install it to inspect or extract ISO images.")

    try:
        proc = subprocess.run(
            [tool, "-no_rc", "-indev", str(Path(image_path)), "-report_el_torito", "plain", "-report_el_torito", "cmd"],
            cwd=str(Path(image_path).parent), capture_output=True, text=True,
            timeout=60, check=False, encoding="utf-8", errors="replace"
        )
    except subprocess.TimeoutExpired as error:
        raise RuntimeError("xorriso timed out while inspecting the ISO.") from error
    except OSError as error:
        raise RuntimeError("Could not start xorriso: " + str(error)) from error

    report = ((proc.stdout or "") + "\n" + (proc.stderr or "")).strip()
    if proc.returncode != 0:
        raise RuntimeError("xorriso could not inspect this ISO image: " + report[-900:])
    # xorriso reports each entry as: "El Torito boot img : N Pltf B Emul ...".
    # The platform column is BIOS/PPC/Mac/UEFI and B is y/n (bootable).
    boot_images = re.findall(
        r"(?im)^\s*El Torito boot img\s*:\s*\d+\s+([A-Za-z0-9x]+)\s+([yn])\s+",
        report,
    )
    for platform_name, bootable_flag in boot_images:
        if bootable_flag.lower() != "y":
            continue
        platform_name = platform_name.upper()
        if platform_name in ("BIOS", "0X00"):
            result["bootableBIOS"] = True
        elif platform_name in ("UEFI", "EFI", "0XEF"):
            result["bootableEFI"] = True
    # Keep paths of file-backed boot images protected in the editor.
    boot_paths = set()
    for line in report.splitlines():
        if not any(key in line for key in ("bin_path=", "efi_path=", "cat_path=")):
        match = re.search(r"""(?:bin_path|efi_path|cat_path)=(?:'([^']*)'|"([^"]*)"|(\S+))""", line)
        match = re.search(r"""(?:bin_path|efi_path)=(?:'([^']*)'|"([^"]*)"|(\S+))""", line)
        if not match:
            continue
        value = next((part for part in match.groups() if part is not None), "").strip()
        if value.startswith("/") and not value.startswith("--interval:"):
            try:
                boot_paths.add(PurePosixPath(value[1:]).as_posix())
            except ValueError:
                pass
    result["bootImagePaths"] = sorted(boot_paths)

    platforms = []
    if result["bootableBIOS"]:
        platforms.append("BIOS")
    if result["bootableEFI"]:
        platforms.append("EFI")
    result["bootPlatforms"] = platforms
    result["bootable"] = bool(platforms)
    result["xorrisoReport"] = report[-4000:]
    return result


def receive_iso_upload(stream, content_length: int, filename: str, destination: Path, xorriso_binary: str = "xorriso") -> dict:
    """Stream an ISO to disk, hash it, inspect it, and publish only a valid image."""
    if content_length < MIN_ISO_BYTES or content_length > MAX_ISO_BYTES:
        raise ValueError("ISO upload must be at least 38 KiB and must not exceed the configured maximum of 4 GiB.")
    if content_length % SECTOR_SIZE != 0:
        raise ValueError("ISO upload size must be aligned to 2048-byte sectors.")

    destination = Path(destination)
    destination.mkdir(parents=True, exist_ok=True)
    iso_id = uuid.uuid4().hex
    clean_name = _safe_filename(filename)
    temp_path = destination / ("iso-import-" + iso_id + ".part")
    final_path = destination / ("iso-import-" + iso_id + ".iso")
    digest = hashlib.sha256()
    remaining = content_length

    try:
        with temp_path.open("xb") as handle:
            while remaining:
                chunk = stream.read(min(CHUNK_SIZE, remaining))
                if not chunk:
                    raise ValueError("ISO upload ended before the declared Content-Length was received.")
                handle.write(chunk)
                digest.update(chunk)
                remaining -= len(chunk)
            handle.flush()
            os.fsync(handle.fileno())
        details = inspect_iso_image(temp_path, xorriso_binary)
        temp_path.replace(final_path)
        return {
            "id": iso_id,
            "name": clean_name,
            "path": str(final_path),
            "sha256": digest.hexdigest(),
            "sizeBytes": content_length,
            "inspection": details,
        }
    except Exception:
        temp_path.unlink(missing_ok=True)
        final_path.unlink(missing_ok=True)
        raise


def _inside(parent: Path, child: Path) -> bool:
    try:
        return os.path.commonpath((str(parent.resolve()), str(child.resolve()))) == str(parent.resolve())
    except (ValueError, OSError):
        return False


def extract_iso_archive(image_path: Path, destination: Path, xorriso_binary: str = "xorriso") -> dict:
    """Extract to an isolated temporary directory and package regular files as ZIP."""
    image_path = Path(image_path)
    destination = Path(destination)
    if not image_path.is_file():
        raise RuntimeError("The imported ISO is no longer available.")
    tool = shutil.which(xorriso_binary)
    if not tool:
        raise FileNotFoundError("xorriso was not found on PATH.")
    destination.mkdir(parents=True, exist_ok=True)
    archive_id = uuid.uuid4().hex
    archive_path = destination / ("iso-extracted-" + archive_id + ".zip")
    file_preview = []
    file_count = 0
    total_bytes = 0
    skipped_links = 0

    try:
        with tempfile.TemporaryDirectory(prefix="kerno-iso-extract-", dir=str(destination)) as temp_name:
            root = Path(temp_name) / "root"
            root.mkdir()
            try:
                proc = subprocess.run(
                    [tool, "-osirrox", "on", "-indev", str(image_path), "-extract", "/", str(root), "-end"],
                    cwd=str(root), capture_output=True, text=True, timeout=300, check=False,
                    encoding="utf-8", errors="replace"
                )
            except subprocess.TimeoutExpired as error:
                raise RuntimeError("xorriso timed out while extracting the ISO.") from error
            except OSError as error:
                raise RuntimeError("Could not start xorriso: " + str(error)) from error
            if proc.returncode != 0:
                detail = ((proc.stdout or "") + "\n" + (proc.stderr or "")).strip()
                raise RuntimeError("xorriso extraction failed: " + detail[-1200:])

            with zipfile.ZipFile(archive_path, "w", compression=zipfile.ZIP_STORED, allowZip64=True) as archive:
                for current, directories, files in os.walk(root, topdown=True, followlinks=False):
                    current_path = Path(current)
                    safe_directories = []
                    for directory in directories:
                        candidate = current_path / directory
                        if candidate.is_symlink():
                            skipped_links += 1
                        elif _inside(root, candidate):
                            safe_directories.append(directory)
                    directories[:] = safe_directories

                    for filename_item in files:
                        candidate = current_path / filename_item
                        if candidate.is_symlink() or not candidate.is_file() or not _inside(root, candidate):
                            skipped_links += 1
                            continue
                        relative = candidate.relative_to(root).as_posix()
                        parsed = PurePosixPath(relative)
                        if parsed.is_absolute() or any(part in ("", ".", "..") for part in parsed.parts):
                            raise RuntimeError("The extracted ISO contains an unsafe file path.")
                        size = candidate.stat().st_size
                        file_count += 1
                        total_bytes += size
                        if file_count > MAX_EXTRACTED_FILES:
                            raise RuntimeError("ISO contains more than 50,000 files; extraction was stopped.")
                        if total_bytes > MAX_EXTRACTED_BYTES:
                            raise RuntimeError("Extracted ISO content exceeds the configured 2 GiB safety limit.")
                        archive.write(candidate, relative)
                        if len(file_preview) < PREVIEW_LIMIT:
                            file_preview.append({"path": relative, "sizeBytes": size})

        archive_size = archive_path.stat().st_size
        return {
            "id": archive_id,
            "path": str(archive_path),
            "name": "kerno-iso-extracted.zip",
            "sizeBytes": archive_size,
            "fileCount": file_count,
            "totalExtractedBytes": total_bytes,
            "files": file_preview,
            "previewTruncated": file_count > len(file_preview),
            "skippedLinks": skipped_links,
        }
    except Exception:
        archive_path.unlink(missing_ok=True)
        raise
