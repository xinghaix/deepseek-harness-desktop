#!/bin/sh
# Sign a macOS app. Local builds default to ad-hoc; production CI must set a
# Developer ID identity and can require notarization before publishing.
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

identity=${DSH_DARWIN_SIGN_IDENTITY:--}
if [ "$identity" = "-" ]; then
	if [ "${DSH_REQUIRE_PRODUCTION_SIGNING:-0}" = "1" ]; then
		echo "sign-darwin: DSH_DARWIN_SIGN_IDENTITY is required for production signing" >&2
		exit 1
	fi
	codesign --force --deep --sign - --timestamp=none --entitlements "$entitlements" "$app"
	codesign --verify --deep "$app"
	echo "ad-hoc signed $app (not notarized)"
else
	# Developer ID signatures use hardened runtime and a trusted timestamp.
	codesign --force --deep --options runtime --sign "$identity" --timestamp --entitlements "$entitlements" "$app"
	codesign --verify --deep --strict --verbose=2 "$app"
	if [ "${DSH_REQUIRE_NOTARIZATION:-0}" = "1" ]; then
		if ! command -v xcrun >/dev/null 2>&1; then
			echo "sign-darwin: xcrun is required for notarization" >&2
			exit 1
		fi
		xcrun stapler validate "$app"
	fi
	echo "Developer ID signed $app"
fi
codesign -dv --verbose=2 "$app" 2>&1 | sed -n '1,16p'
