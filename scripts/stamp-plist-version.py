#!/usr/bin/env python3
import pathlib
import re
import sys

if len(sys.argv) != 3:
    print("usage: stamp-plist-version.py <Info.plist> <version>", file=sys.stderr)
    raise SystemExit(2)

path = pathlib.Path(sys.argv[1])
version = sys.argv[2]
if version.startswith("v") or version.startswith("V"):
    version = version[1:]
text = path.read_text()
for key in ("CFBundleShortVersionString", "CFBundleVersion"):
    text, n = re.subn(
        rf"(<key>{key}</key>\s*<string>)[^<]+",
        rf"\g<1>{version}",
        text,
        count=1,
    )
    if n != 1:
        raise SystemExit(f"missing {key} in {path}")
path.write_text(text)
