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
tags=${BUILD_TAGS:-wails,production}

# Immutable publisher identity for desktop Release manifest verification only.
# Never rotate/replace this key or turn the CI variable into an override.
expected_update_key=8c2659313bfe0ea8e05610ddcd88ba666697bec00ec3eb3eb669513fabe8c24f
update_key=$(tr -d '\r\n' < "$root/assets/update/release-public-key.hex")
if [ "$update_key" != "$expected_update_key" ]; then
	echo "repository update public key must not be changed" >&2
	exit 1
fi
ci_update_key=${DSH_UPDATE_MANIFEST_PUBLIC_KEY:-}
if [ -n "$ci_update_key" ] && [ "$ci_update_key" != "$update_key" ]; then
	echo "DSH_UPDATE_MANIFEST_PUBLIC_KEY cannot override the pinned publisher key" >&2
	exit 1
fi
ldflags="$ldflags -X deepseek-harness-desktop/internal/update.ManifestPublicKey=hex:$update_key"

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
