#!/bin/sh
# Cross-platform build entry (also used by `make build`).
# Usage: ./scripts/build.sh [version]
#        VERSION=0.2.0 ./scripts/build.sh
#        make build VERSION=0.2.0
set -eu

root=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
cd "$root"

version=$(sh "$root/scripts/app-version.sh" "${1:-${VERSION:-}}")

goos=${GOOS:-$(go env GOOS)}
goarch=${GOARCH:-$(go env GOARCH)}
dist=${DIST:-dist}
app=deepseek-harness-desktop
bundle_name="Deepseek Harness Desktop"
ldflags="-s -w -X deepseek-harness-desktop/internal/version.Version=$version"
tags=${BUILD_TAGS:-wails}

# Pin the publisher key in every production binary; never rely on runtime env.
update_key=${DSH_UPDATE_MANIFEST_PUBLIC_KEY:-}
if [ "${DSH_REQUIRE_SIGNED_UPDATES:-0}" = 1 ] && [ -z "$update_key" ]; then
	echo "DSH_UPDATE_MANIFEST_PUBLIC_KEY is required for production updates" >&2
	exit 1
fi
if [ -n "$update_key" ]; then
	case "$update_key" in
		*[!0-9a-fA-F]*) echo "update public key must be 64 hex characters" >&2; exit 1 ;;
	esac
	if [ "${#update_key}" -ne 64 ]; then
		echo "update public key must be 64 hex characters" >&2
		exit 1
	fi
	ldflags="$ldflags -X deepseek-harness-desktop/internal/update.ManifestPublicKey=hex:$update_key"
fi

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
