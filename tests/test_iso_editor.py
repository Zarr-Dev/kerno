import shutil
import tempfile
import unittest
from pathlib import Path

import iso_editor


class ISOEditorUnitTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name) / "workspace"
        (self.root / "etc").mkdir(parents=True)
        (self.root / "etc" / "issue").write_text("Kerno test\n", encoding="utf-8")

    def tearDown(self):
        self.temp.cleanup()

    def test_rejects_absolute_parent_and_windows_paths(self):
        for path in ("../outside.txt", "/etc/passwd", r"..\outside.txt", "C:/boot.ini", ""):
            with self.subTest(path=path):
                with self.assertRaises(ValueError):
                    iso_editor.normalize_iso_path(path)

    def test_read_write_add_and_replace_text(self):
        first = iso_editor.read_text_file(self.root, "etc/issue")
        self.assertEqual(first["content"], "Kerno test\n")

        updated = iso_editor.write_file(self.root, "etc/issue", b"Edited banner\n")
        self.assertFalse(updated["created"])
        self.assertEqual(iso_editor.read_text_file(self.root, "etc/issue")["content"], "Edited banner\n")

        added = iso_editor.write_file(self.root, "docs/notes.txt", b"New file\n")
        self.assertTrue(added["created"])
        self.assertEqual(iso_editor.read_text_file(self.root, "docs/notes.txt")["content"], "New file\n")

    def test_rejects_binary_as_text_but_allows_binary_replacement(self):
        (self.root / "boot.bin").write_bytes(b"\x00\x01\x02")
        with self.assertRaises(ValueError):
            iso_editor.read_text_file(self.root, "boot.bin")
        result = iso_editor.write_file(self.root, "boot.bin", b"\x00\x01\x02\x03")
        self.assertEqual(result["sizeBytes"], 4)

    def test_delete_regular_file_and_refresh_summary(self):
        iso_editor.delete_file(self.root, "etc/issue")
        self.assertFalse((self.root / "etc" / "issue").exists())
        self.assertEqual(iso_editor.scan_workspace(self.root)["fileCount"], 0)

    def test_symlinks_are_not_followed_or_edited(self):
        outside = Path(self.temp.name) / "outside.txt"
        outside.write_text("outside", encoding="utf-8")
        link = self.root / "outside-link"
        link.symlink_to(outside)
        summary = iso_editor.scan_workspace(self.root)
        self.assertEqual(summary["symbolicLinks"], 1)
        with self.assertRaises(ValueError):
            iso_editor.read_text_file(self.root, "outside-link")
        with self.assertRaises(ValueError):
            iso_editor.write_file(self.root, "outside-link", b"overwrite")

    def test_boot_image_paths_and_parent_directories_are_protected(self):
        protected = ["boot/eltorito.img", "boot/boot.cat"]
        self.assertTrue(iso_editor.is_boot_image_path("boot/eltorito.img", protected))
        self.assertTrue(iso_editor.is_boot_image_path("boot", protected))
        self.assertFalse(iso_editor.is_boot_image_path("boot/grub/grub.cfg", protected))
        self.assertFalse(iso_editor.is_boot_image_path("etc/issue", protected))

    def test_editor_file_and_workspace_limits_are_enforced(self):
        with self.assertRaises(ValueError):
            iso_editor.write_file(self.root, "too-large.bin", b"x" * (iso_editor.MAX_EDITOR_UPLOAD_BYTES + 1))


@unittest.skipUnless(shutil.which("xorriso"), "xorriso is not installed on this runner")
class ISOEditorXorrisoIntegrationTests(unittest.TestCase):
    def test_repack_preserves_bios_boot_and_applies_file_changes(self):
        import subprocess

        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary)
            source_tree = base / "source"
            (source_tree / "boot").mkdir(parents=True)
            (source_tree / "etc").mkdir()
            (source_tree / "boot" / "eltorito.img").write_bytes(b"\x00" * 4096)
            (source_tree / "boot" / "grub.cfg").write_text("set timeout=5\n", encoding="utf-8")
            (source_tree / "etc" / "issue").write_text("Original\n", encoding="utf-8")
            (source_tree / "remove-me.txt").write_text("remove", encoding="utf-8")

            source_iso = base / "source.iso"
            build = subprocess.run(
                [
                    shutil.which("xorriso"), "-no_rc", "-as", "mkisofs",
                    "-o", str(source_iso), "-V", "KERNO-EDITOR-TEST", "-R", "-J",
                    "-b", "boot/eltorito.img", "-c", "boot/boot.cat",
                    "-no-emul-boot", "-boot-load-size", "4", "-boot-info-table",
                    str(source_tree),
                ],
                capture_output=True, text=True, timeout=120, check=False,
            )
            self.assertEqual(build.returncode, 0, build.stdout + "\n" + build.stderr)

            original = iso_editor.inspect_iso_image(source_iso)
            self.assertTrue(original["iso9660Valid"])
            self.assertTrue(original["bootableBIOS"])
            self.assertIn("boot/eltorito.img", original["bootImagePaths"])
            self.assertIn("boot/boot.cat", original["bootImagePaths"])

            opened = iso_editor.extract_workspace(source_iso, base / "workspaces")
            root = Path(opened["root"])
            iso_editor.write_file(root, "etc/issue", b"Edited issue\n")
            iso_editor.write_file(root, "docs/added.txt", b"Added from ISO Editor\n")
            iso_editor.delete_file(root, "remove-me.txt")

            output_iso = base / "edited.iso"
            result = iso_editor.repack_workspace(
                source_iso, root, output_iso, original
            )
            self.assertTrue(result["inspection"]["bootableBIOS"])
            self.assertTrue(output_iso.is_file())

            reopened = iso_editor.extract_workspace(output_iso, base / "reopened")
            edited_root = Path(reopened["root"])
            self.assertEqual(iso_editor.read_text_file(edited_root, "etc/issue")["content"], "Edited issue\n")
            self.assertEqual(iso_editor.read_text_file(edited_root, "docs/added.txt")["content"], "Added from ISO Editor\n")
            self.assertFalse((edited_root / "remove-me.txt").exists())


if __name__ == "__main__":
    unittest.main()
