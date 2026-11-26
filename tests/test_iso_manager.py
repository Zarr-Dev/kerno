import struct
import tempfile
import unittest
from pathlib import Path

import iso_manager


def make_test_iso(path: Path, bootable=True, platform=0):
    size = 32 * iso_manager.SECTOR_SIZE
    image = bytearray(size)
    pvd = memoryview(image)[16 * iso_manager.SECTOR_SIZE:17 * iso_manager.SECTOR_SIZE]
    pvd[0] = 1
    pvd[1:6] = b"CD001"
    pvd[6] = 1
    pvd[40:72] = b"KERNO TEST ISO".ljust(32, b" ")

    boot = memoryview(image)[17 * iso_manager.SECTOR_SIZE:18 * iso_manager.SECTOR_SIZE]
    boot[0] = 0
    boot[1:6] = b"CD001"
    boot[6] = 1
    boot[7:30] = b"EL TORITO SPECIFICATION"
    struct.pack_into("<I", boot, 71, 20)

    terminator = memoryview(image)[18 * iso_manager.SECTOR_SIZE:19 * iso_manager.SECTOR_SIZE]
    terminator[0] = 255
    terminator[1:6] = b"CD001"
    terminator[6] = 1

    catalog = memoryview(image)[20 * iso_manager.SECTOR_SIZE:21 * iso_manager.SECTOR_SIZE]
    catalog[0] = 1
    catalog[1] = platform
    catalog[30:32] = b"\x55\xaa"
    total = sum(struct.unpack_from("<H", catalog, offset)[0] for offset in range(0, 32, 2)) & 0xFFFF
    struct.pack_into("<H", catalog, 28, (-total) & 0xFFFF)
    catalog[32] = 0x88 if bootable else 0x00
    path.write_bytes(image)


class ISOManagerTests(unittest.TestCase):
    def test_valid_bios_bootable_iso(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "boot.iso"
            make_test_iso(path, True, 0)
            result = iso_manager.inspect_iso_structure(path)
            self.assertTrue(result["iso9660Valid"])
            self.assertTrue(result["hasElTorito"])
            self.assertTrue(result["elToritoCatalogValid"])
            self.assertTrue(result["bootableBIOS"])
            self.assertEqual(result["volumeId"], "KERNO TEST ISO")

    def test_valid_efi_catalog_is_not_claimed_as_bios(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "efi.iso"
            make_test_iso(path, True, 0xEF)
            result = iso_manager.inspect_iso_structure(path)
            self.assertFalse(result["bootableBIOS"])
            self.assertTrue(result["bootableEFI"])

    def test_xorriso_report_detects_bios_and_uefi_boot_images(self):
        from unittest.mock import patch
        from types import SimpleNamespace

        report = "\\n".join([
            "El Torito boot img :   1 BIOS y  none   0x0000   0x0000",
            "El Torito boot img :   2 UEFI y  none   0x0000   0x0000",
            "El Torito boot img :   3 BIOS n  none   0x0000   0x0000",
        ])
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "multi-boot.iso"
            make_test_iso(path, True, 0)
            completed = SimpleNamespace(returncode=0, stdout=report, stderr="")
            with patch("iso_manager.shutil.which", return_value="/usr/bin/xorriso"), patch("iso_manager.subprocess.run", return_value=completed):
                result = iso_manager.inspect_iso_image(path)

        self.assertTrue(result["bootableBIOS"])
        self.assertTrue(result["bootableEFI"])
        self.assertEqual(result["bootPlatforms"], ["BIOS", "EFI"])
        self.assertTrue(result["bootable"])

    def test_xorriso_report_ignores_non_bootable_entries(self):
        from unittest.mock import patch
        from types import SimpleNamespace

        report = "El Torito boot img :   1 BIOS n  none   0x0000   0x0000"
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "nonboot.iso"
            make_test_iso(path, False, 0)
            completed = SimpleNamespace(returncode=0, stdout=report, stderr="")
            with patch("iso_manager.shutil.which", return_value="/usr/bin/xorriso"), patch("iso_manager.subprocess.run", return_value=completed):
                result = iso_manager.inspect_iso_image(path)

        self.assertFalse(result["bootableBIOS"])
        self.assertFalse(result["bootableEFI"])
        self.assertFalse(result["bootable"])

    def test_invalid_iso_is_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "invalid.iso"
            path.write_bytes(b"not an iso".ljust(64 * 1024, b"\0"))
            with self.assertRaises(RuntimeError):
                iso_manager.inspect_iso_structure(path)

    def test_non_sector_aligned_iso_is_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "bad.iso"
            make_test_iso(path)
            path.write_bytes(path.read_bytes() + b"x")
            with self.assertRaises(RuntimeError):
                iso_manager.inspect_iso_structure(path)


if __name__ == "__main__":
    unittest.main()
