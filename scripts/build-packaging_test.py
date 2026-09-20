"""Exercise real packaging without external plugins or native build tools."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


class BuildPackagingTest(unittest.TestCase):
    def test_packaging_without_external_plugins(self):
        for target in ("darwin", "linux", "windows"):
            for arch in ("amd64", "arm64"):
                with self.subTest(target=target, arch=arch), tempfile.TemporaryDirectory() as tmp:
                    root = Path(tmp)
                    (root / "scripts").mkdir()
                    (root / "assets/update").mkdir(parents=True)
                    (root / "assets/darwin").mkdir(parents=True)
                    for name in ("build.sh", "stamp-plist-version.py"):
                        shutil.copyfile(ROOT / "scripts" / name, root / "scripts" / name)
                    shutil.copyfile(ROOT / "assets/update/release-public-key.hex",
                                    root / "assets/update/release-public-key.hex")
                    for name in ("Info.plist", "icons.icns"):
                        shutil.copyfile(ROOT / "assets/darwin" / name, root / "assets/darwin" / name)
                    (root / "scripts/app-version.sh").write_text('echo "0.0.0-test"\n')
                    # Stub only compilation, signing and disk-image creation. Keep
                    # real mkdir/cp/chmod/plist stamping so missing inputs fail.
                    compiler = root / "go"
                    compiler.write_text(
                        '#!/bin/sh\nset -eu\n'
                        'while [ "$#" -gt 0 ]; do\n'
                        '  if [ "$1" = "-o" ]; then printf stub > "$2"; exit 0; fi\n'
                        '  shift\ndone\nexit 1\n'
                    )
                    compiler.chmod(0o755)
                    (root / "scripts/sign.sh").write_text('test -e "$1"\n')
                    (root / "scripts/package-darwin-dmg.sh").write_text(
                        'set -eu\ntest -d "$1"\nprintf stub > "$2"\n'
                    )
                    env = dict(os.environ, PATH=str(root) + os.pathsep + os.environ["PATH"],
                               GOOS=target, GOARCH=arch, DIST=str(root / "dist"))
                    env.pop("DSH_UPDATE_MANIFEST_PUBLIC_KEY", None)
                    result = subprocess.run(["sh", str(root / "scripts/build.sh")],
                                            env=env, capture_output=True, text=True)
                    self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                    dist = root / "dist"
                    executable = "deepseek-harness-desktop" + (".exe" if target == "windows" else "")
                    self.assertTrue((dist / executable).is_file())
                    if target == "darwin":
                        contents = dist / "Deepseek Harness Desktop.app/Contents"
                        self.assertTrue((contents / "MacOS" / executable).is_file())
                        self.assertTrue((contents / "Resources/icons.icns").is_file())
                        self.assertFalse((contents / "Resources/plugins").exists())
                        self.assertTrue((dist / f"deepseek-harness-desktop-darwin-{arch}.dmg").is_file())


if __name__ == "__main__":
    unittest.main()
