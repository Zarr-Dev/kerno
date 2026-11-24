import os
import sys
import tempfile
import unittest
from unittest.mock import patch

TEST_DATA = tempfile.mkdtemp(prefix="kerno-vbox-tests-")
os.environ["KERNO_DATA_DIR"] = TEST_DATA
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "local-agent"))

import local_agent as agent  # noqa: E402


UUID_A = "12345678-1234-1234-1234-1234567890ab"
UUID_B = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"


class VirtualBoxParsingTests(unittest.TestCase):
    def test_parse_vm_list_and_escaped_names(self):
        output = (
            '"Kerno Dev" {' + UUID_A + '}\n'
            '"Ubuntu \\"Lab\\"" {' + UUID_B + '}\n'
            'A malformed row\n'
        )
        self.assertEqual(
            agent.parse_virtualbox_vm_list(output),
            [
                {"name": "Kerno Dev", "uuid": UUID_A},
                {"name": 'Ubuntu "Lab"', "uuid": UUID_B},
            ],
        )

    def test_parse_machine_readable_info(self):
        info = agent.parse_virtualbox_machine_info(
            'name="Kerno Dev"\nostype="Other_64"\nVMState="running"\nmemory=4096\ncpus=4\n'
        )
        self.assertEqual(info["name"], "Kerno Dev")
        self.assertEqual(info["ostype"], "Other_64")
        self.assertEqual(info["VMState"], "running")
        self.assertEqual(info["memory"], "4096")
        self.assertEqual(info["cpus"], "4")

    def test_invalid_uuid_is_rejected(self):
        with self.assertRaises(ValueError):
            agent.validate_virtualbox_uuid("../../not-a-vm")

    def test_inventory_reports_missing_installation(self):
        with patch.object(agent, "virtualbox_executable", return_value=None):
            result = agent.virtualbox_inventory()
        self.assertFalse(result["available"])
        self.assertEqual(result["machines"], [])
        self.assertIn("VBoxManage", result["message"])

    def test_inventory_marks_running_and_stopped_machines(self):
        with patch.object(agent, "virtualbox_executable", return_value="/usr/bin/VBoxManage"), \
             patch.object(agent, "run_virtualbox", side_effect=[
                 "7.1.4r165100",
                 '"Kerno Dev" {' + UUID_A + '}\n"Test VM" {' + UUID_B + '}',
                 '"Kerno Dev" {' + UUID_A + '}',
             ]):
            result = agent.virtualbox_inventory()
        self.assertTrue(result["available"])
        self.assertEqual(result["version"], "7.1.4r165100")
        self.assertEqual(result["machineCount"], 2)
        self.assertEqual(result["runningCount"], 1)
        self.assertEqual([item["state"] for item in result["machines"]], ["running", "powered_off"])

    def test_machine_info_requires_registered_vm(self):
        inventory = {
            "available": True,
            "machines": [{"uuid": UUID_A, "name": "Kerno Dev", "state": "running"}],
        }
        with patch.object(agent, "virtualbox_inventory", return_value=inventory), \
             patch.object(agent, "virtualbox_executable", return_value="/usr/bin/VBoxManage"), \
             patch.object(agent, "run_virtualbox", return_value='name="Kerno Dev"\nostype="Other_64"\nmemory=2048\ncpus=2'):
            info = agent.virtualbox_machine_info({"uuid": UUID_A.upper()})
        self.assertEqual(info["uuid"], UUID_A)
        self.assertEqual(info["memoryMiB"], 2048)
        self.assertEqual(info["cpus"], 2)
        self.assertEqual(info["osType"], "Other_64")
        with patch.object(agent, "virtualbox_inventory", return_value=inventory):
            with self.assertRaises(ValueError):
                agent.virtualbox_machine_info({"uuid": UUID_B})

    def test_start_uses_only_registered_uuid_and_allowed_mode(self):
        inventory = {
            "available": True,
            "machines": [{"uuid": UUID_A, "name": "Kerno Dev", "state": "powered_off"}],
        }
        with patch.object(agent, "virtualbox_inventory", return_value=inventory), \
             patch.object(agent, "virtualbox_executable", return_value="/usr/bin/VBoxManage"), \
             patch.object(agent, "run_virtualbox") as run:
            result = agent.virtualbox_start({"uuid": UUID_A, "mode": "headless"})
        self.assertEqual(result["status"], "started")
        run.assert_called_once_with(
            ["startvm", UUID_A, "--type", "headless"],
            timeout=45,
            binary="/usr/bin/VBoxManage",
        )
        with patch.object(agent, "virtualbox_inventory", return_value=inventory), \
             patch.object(agent, "run_virtualbox") as run:
            with self.assertRaises(ValueError):
                agent.virtualbox_start({"uuid": UUID_A, "mode": "shell"})
            run.assert_not_called()

    def test_start_refuses_unregistered_vm(self):
        with patch.object(agent, "virtualbox_inventory", return_value={"available": True, "machines": []}), \
             patch.object(agent, "run_virtualbox") as run:
            with self.assertRaises(ValueError):
                agent.virtualbox_start({"uuid": UUID_A, "mode": "gui"})
            run.assert_not_called()

    def test_shutdown_requests_acpi_only(self):
        inventory = {
            "available": True,
            "machines": [{"uuid": UUID_A, "name": "Kerno Dev", "state": "running"}],
        }
        with patch.object(agent, "virtualbox_inventory", return_value=inventory), \
             patch.object(agent, "virtualbox_executable", return_value="/usr/bin/VBoxManage"), \
             patch.object(agent, "run_virtualbox") as run:
            result = agent.virtualbox_shutdown({"uuid": UUID_A})
        self.assertEqual(result["status"], "shutdown-requested")
        run.assert_called_once_with(
            ["controlvm", UUID_A, "acpipowerbutton"],
            timeout=15,
            binary="/usr/bin/VBoxManage",
        )
        self.assertNotIn("poweroff", run.call_args.args[0])

    def test_shutdown_does_not_touch_stopped_vm(self):
        inventory = {
            "available": True,
            "machines": [{"uuid": UUID_A, "name": "Kerno Dev", "state": "powered_off"}],
        }
        with patch.object(agent, "virtualbox_inventory", return_value=inventory), \
             patch.object(agent, "run_virtualbox") as run:
            result = agent.virtualbox_shutdown({"uuid": UUID_A})
        self.assertEqual(result["status"], "not-running")
        run.assert_not_called()

    def test_runner_uses_argument_array_without_shell(self):
        completed = type("Completed", (), {"stdout": "ok", "stderr": "", "returncode": 0})()
        with patch.object(agent.subprocess, "run", return_value=completed) as run:
            result = agent.run_virtualbox(["list", "vms"], binary="/usr/bin/VBoxManage")
        self.assertEqual(result, "ok")
        args, kwargs = run.call_args
        self.assertEqual(args[0], ["/usr/bin/VBoxManage", "list", "vms"])
        self.assertFalse(kwargs.get("shell", False))


if __name__ == "__main__":
    unittest.main(verbosity=2)
