#!/usr/bin/env python3
"""Desktop version tags must remain independent of plugin release tags."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().with_name("app-version.sh")


class AppVersionTest(unittest.TestCase):
    def test_plugin_tags_do_not_change_desktop_version(self):
        with tempfile.TemporaryDirectory() as directory:
            env = {k: v for k, v in os.environ.items()
                   if k not in ("VERSION", "APP_VERSION") and not k.startswith("GIT_")}

            def git(*args):
                return subprocess.check_output(
                    ["git", *args], cwd=directory, env=env, text=True,
                    stderr=subprocess.STDOUT).strip()

            def version(*args):
                return subprocess.check_output(
                    ["sh", str(SCRIPT), *args], cwd=directory, env=env, text=True).strip()

            git("init", "-q")
            git("config", "user.name", "Version Test")
            git("config", "user.email", "version-test@example.invalid")
            git("commit", "--allow-empty", "-qm", "initial")
            self.assertEqual(version(), "0.0.0-dev")
            git("tag", "web-fetch-allowlist-v0.1.1")
            self.assertEqual(version(), "0.0.0-dev")
            git("tag", "v0.1.5")
            self.assertEqual(version(), "0.1.5")
            git("commit", "--allow-empty", "-qm", "development")
            git("tag", "sandbox-escalation-fix-v0.2.1")
            self.assertEqual(version(), "0.1.5-dev")
            git("commit", "--allow-empty", "-qm", "later development")
            self.assertEqual(version(), "0.1.5-dev")
            self.assertEqual(version("v9.8.7"), "9.8.7")


if __name__ == "__main__":
    unittest.main()
