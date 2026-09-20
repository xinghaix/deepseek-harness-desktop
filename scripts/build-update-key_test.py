"""Exercise the real build entry with a compiler stub; never package an app."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
KEY = (ROOT / "assets/update/release-public-key.hex").read_text().strip()


class BuildUpdateKeyTest(unittest.TestCase):
    def run_build(self, target="darwin", override=None, repository_key=KEY):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "scripts").mkdir()
            (root / "assets/update").mkdir(parents=True)
            shutil.copyfile(ROOT / "scripts/build.sh", root / "scripts/build.sh")
            (root / "scripts/app-version.sh").write_text("echo 0.1.4-dev\n")
            if repository_key is not None:
                (root / "assets/update/release-public-key.hex").write_text(repository_key)
            compiler = root / "go"
            compiler.write_text('#!/bin/sh\nprintf "%s\\n" "$@"\nexit 73\n')
            compiler.chmod(0o755)
            env = dict(os.environ, PATH=str(root) + os.pathsep + os.environ["PATH"],
                       GOOS=target, GOARCH="arm64", DSH_REQUIRE_SIGNED_UPDATES="1")
            env.pop("DSH_UPDATE_MANIFEST_PUBLIC_KEY", None)
            if override is not None:
                env["DSH_UPDATE_MANIFEST_PUBLIC_KEY"] = override
            return subprocess.run(["sh", str(root / "scripts/build.sh")],
                                  env=env, capture_output=True, text=True)

    def test_default_key_all_platforms(self):
        self.assertEqual(len(bytes.fromhex(KEY)), 32)
        for target in ("darwin", "linux", "windows"):
            with self.subTest(target=target):
                result = self.run_build(target=target)
                self.assertEqual(result.returncode, 73, result.stderr)
                self.assertIn("ManifestPublicKey=hex:" + KEY, result.stdout)

    def test_publisher_override_is_forbidden(self):
        result = self.run_build(override="ab" * 32)
        self.assertEqual(result.returncode, 1)
        self.assertIn("cannot override", result.stderr)
        self.assertNotIn("ManifestPublicKey=", result.stdout)

    def test_matching_ci_key_is_accepted(self):
        result = self.run_build(override=KEY)
        self.assertEqual(result.returncode, 73, result.stderr)
        self.assertIn("ManifestPublicKey=hex:" + KEY, result.stdout)

    def test_repository_key_is_immutable(self):
        result = self.run_build(repository_key="ab" * 32)
        self.assertEqual(result.returncode, 1)
        self.assertIn("must not be changed", result.stderr)
        self.assertNotIn("ManifestPublicKey=", result.stdout)

    def test_empty_override_uses_repository_key(self):
        result = self.run_build(override="")
        self.assertEqual(result.returncode, 73, result.stderr)
        self.assertIn("ManifestPublicKey=hex:" + KEY, result.stdout)

    def test_crlf_key(self):
        result = self.run_build(repository_key=KEY + "\r\n")
        self.assertEqual(result.returncode, 73, result.stderr)
        self.assertIn("ManifestPublicKey=hex:" + KEY, result.stdout)

    def test_invalid_override_does_not_fall_back(self):
        for key in ("00", "z" * 64):
            result = self.run_build(override=key)
            self.assertEqual(result.returncode, 1)
            self.assertIn("cannot override", result.stderr)
            self.assertNotIn("ManifestPublicKey=", result.stdout)

    def test_missing_empty_or_invalid_repository_key_fails(self):
        for key in (None, "", "00", "z" * 64):
            result = self.run_build(repository_key=key)
            self.assertNotEqual(result.returncode, 0)
            self.assertNotEqual(result.returncode, 73)
            self.assertNotIn("ManifestPublicKey=", result.stdout)


if __name__ == "__main__":
    unittest.main()
