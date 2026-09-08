#!/bin/sh
# Cross-platform build entry that does not require the `task` CLI.
# Usage: ./scripts/build.sh [version]
#        VERSION=0.2.0 ./scripts/build.sh
set -eu

root=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
cd "$root"

version=${1:-${VERSION:-}}
version=${version#v}
if [ -z "$version" ]; then
	version=$(git describe --tags --abbrev=0 2>/dev/null || true)
	version=${version#v}
fi
if [ -z "$version" ]; then
	version=dev
fi

goos=${GOOS:-$(go env GOOS)}
goarch=${GOARCH:-$(go env GOARCH)}
dist=${DIST:-dist}
app=deepseek-harness-desktop
bundle_name="Deepseek Harness Desktop"
ldflags="-X deepseek-harness-desktop/internal/version.Version=$version"
tags=${BUILD_TAGS:-wails}

mkdir -p "$dist"
echo "building $app $version ($goos/$goarch)"

case $goos in
linux)
	CGO_ENABLED=${CGO_ENABLED:-1} GOOS=linux GOARCH="$goarch" \
		go build -tags "$tags" -ldflags "$ldflags" -trimpath -buildvcs=false -o "$dist/$app" .
	sh scripts/sign.sh "$dist/$app"
	;;
windows)
	CGO_ENABLED=${CGO_ENABLED:-0} GOOS=windows GOARCH="$goarch" \
		go build -tags "$tags" -ldflags "$ldflags" -trimpath -buildvcs=false -o "$dist/$app.exe" .
	if command -v powershell >/dev/null 2>&1 || command -v powershell.exe >/dev/null 2>&1; then
		sh scripts/sign.sh "$dist/$app.exe"
	else
		sh scripts/sign.sh "$dist/$app.exe"
	fi
	;;
darwin)
	CGO_ENABLED=${CGO_ENABLED:-1} GOOS=darwin GOARCH="$goarch" \
		go build -tags "$tags" -ldflags "$ldflags" -trimpath -buildvcs=false -o "$dist/$app" .
	bundle="$dist/$bundle_name.app"
	rm -rf "$dist/$app.app" "$bundle"
	mkdir -p "$bundle/Contents/MacOS" "$bundle/Contents/Resources/plugins"
	go run ./tools/icons
	cp "$dist/$app" "$bundle/Contents/MacOS/$app"
	cp assets/darwin/icons.icns "$bundle/Contents/Resources/icons.icns"
	cp assets/darwin/Info.plist "$bundle/Contents/Info.plist"
	python3 scripts/stamp-plist-version.py "$bundle/Contents/Info.plist" "$version"
	cp -R plugins/deepseek-harness-desktop-bridge "$bundle/Contents/Resources/plugins/deepseek-harness-desktop-bridge"
	chmod 755 "$bundle/Contents/MacOS/$app"
	sh scripts/sign.sh "$bundle"
	sh scripts/package-darwin-dmg.sh "$bundle" "$dist/$app-darwin-$goarch.dmg"
	;;
*)
	echo "unsupported GOOS=$goos" >&2
	exit 1
	;;
esac

echo "done $version -> $dist/"
