#!/bin/sh
# Build a drag-to-Applications DMG. No Finder, no attach, no Apple events.
# Prefer hdiutil: newer macOS still has `diskutil image`, but its create-from
# flags differ from what we used and break CI (unknown --volumeName).
set -eu

if [ $# -ne 2 ]; then
	echo "usage: $0 <app-bundle> <output.dmg>" >&2
	exit 2
fi

host=$(uname -s 2>/dev/null || echo unknown)
if [ "$host" != Darwin ]; then
	echo "package-darwin-dmg: skip DMG on $host"
	exit 0
fi

app=$1
out=$2
if [ ! -d "$app" ]; then
	echo "package-darwin-dmg: missing app bundle: $app" >&2
	exit 1
fi

volname="Deepseek Harness Desktop"
appname="$volname.app"
staging=$(mktemp -d "${TMPDIR:-/tmp}/dsh-dmg.XXXXXX")
cleanup() {
	rm -rf "$staging"
}
trap cleanup EXIT

ditto "$app" "$staging/$appname"
ln -s /Applications "$staging/Applications"

rm -f "$out"
mkdir -p "$(dirname "$out")"

hdiutil create \
	-volname "$volname" \
	-srcfolder "$staging" \
	-ov \
	-fs HFS+ \
	-format UDZO \
	-imagekey zlib-level=9 \
	"$out" >/dev/null

echo "wrote $out"
