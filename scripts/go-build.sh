#!/bin/sh
# Stamp internal/version.Version then exec go build.
# Usage: scripts/go-build.sh [version] -- [go build args...]
# Version via scripts/app-version.sh (explicit, exact tag, or latest-tag-dev).
set -eu
root=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
ver=${1:-}
if [ "$#" -gt 0 ]; then
	shift
fi
if [ "${1:-}" = "--" ]; then
	shift
fi
ver=$(sh "$root/scripts/app-version.sh" "$ver")
echo "stamping version $ver" >&2
exec go build -ldflags "-X deepseek-harness-desktop/internal/version.Version=$ver" "$@"
