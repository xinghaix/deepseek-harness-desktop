#!/bin/sh
# Print the desktop version to stamp into the binary.
# Prefers VERSION (env or first arg), then the latest git tag, else "dev".
set -eu
v=${1:-${VERSION:-${APP_VERSION:-}}}
v=${v#v}
v=${v#V}
if [ -z "$v" ]; then
	v=$(git describe --tags --abbrev=0 2>/dev/null || true)
	v=${v#v}
	v=${v#V}
fi
if [ -z "$v" ]; then
	v=dev
fi
printf '%s\n' "$v"
