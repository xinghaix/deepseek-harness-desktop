#!/bin/sh
# Print the desktop version to stamp into the binary.
# Prefers VERSION (env or first arg). Otherwise:
#   - HEAD exactly matches a git tag → that release (e.g. 0.1.1)
#   - else latest release tag + "-dev" (e.g. 0.1.1-dev)
#   - no tags at all → 0.0.0-dev
set -eu
v=${1:-${VERSION:-${APP_VERSION:-}}}
v=${v#v}
v=${v#V}
if [ -n "$v" ]; then
	printf '%s\n' "$v"
	exit 0
fi

exact=$(git describe --tags --exact-match 2>/dev/null || true)
exact=${exact#v}
exact=${exact#V}
if [ -n "$exact" ]; then
	printf '%s\n' "$exact"
	exit 0
fi

tag=$(git describe --tags --abbrev=0 2>/dev/null || true)
tag=${tag#v}
tag=${tag#V}
if [ -z "$tag" ]; then
	printf '%s\n' "0.0.0-dev"
	exit 0
fi
printf '%s\n' "${tag}-dev"
