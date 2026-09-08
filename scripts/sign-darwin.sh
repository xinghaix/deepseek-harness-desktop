#!/bin/sh
# Ad-hoc sign a macOS .app so local and CI builds can launch without a
# Developer ID. This is not Apple notarization.
set -eu

if [ $# -ne 1 ]; then
	echo "usage: $0 <path-to-app>" >&2
	exit 2
fi

host=$(uname -s 2>/dev/null || echo unknown)
if [ "$host" != Darwin ]; then
	echo "sign-darwin: skip codesign on $host"
	exit 0
fi

app=$1
if [ ! -d "$app" ]; then
	echo "sign-darwin: missing app bundle: $app" >&2
	exit 1
fi

root=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
entitlements=$root/assets/darwin/entitlements.plist
if [ ! -f "$entitlements" ]; then
	echo "sign-darwin: missing entitlements: $entitlements" >&2
	exit 1
fi

# "-" is the ad-hoc identity; --timestamp=none is required because ad-hoc
# signatures cannot be submitted to Apple's timestamp server.
codesign --force --deep --sign - --timestamp=none --entitlements "$entitlements" "$app"
codesign --verify --deep "$app"
codesign -dv --verbose=2 "$app" 2>&1 | sed -n '1,16p'
echo "ad-hoc signed $app"
