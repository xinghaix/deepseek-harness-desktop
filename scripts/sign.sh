#!/bin/sh
# Sign the just-built artifact with whatever the current host can do.
# Missing platform tools skip with a message (exit 0) so the same Taskfile
# works for native and cross builds.
set -eu

if [ $# -ne 1 ]; then
	echo "usage: $0 <artifact>" >&2
	exit 2
fi

root=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
target=$1
host=$(uname -s 2>/dev/null || echo unknown)

write_checksum() {
	file=$1
	if [ ! -f "$file" ]; then
		return 0
	fi
	base=$(basename "$file")
	dir=$(dirname "$file")
	if command -v sha256sum >/dev/null 2>&1; then
		(cd "$dir" && sha256sum "$base") > "$file.sha256"
	elif command -v shasum >/dev/null 2>&1; then
		(cd "$dir" && shasum -a 256 "$base") > "$file.sha256"
	else
		echo "sign: no sha256sum/shasum; skip checksum" >&2
		return 0
	fi
	echo "wrote $file.sha256"
}

case $target in
	*.app)
		target=${target%/}
		if [ "$host" != Darwin ]; then
			echo "sign: skip macOS codesign on $host"
			exit 0
		fi
		sh "$root/scripts/sign-darwin.sh" "$target"
		;;
	*.exe)
		if command -v powershell.exe >/dev/null 2>&1; then
			powershell.exe -ExecutionPolicy Bypass -File "$root/scripts/sign-windows.ps1" "$target"
		elif command -v pwsh >/dev/null 2>&1; then
			pwsh -ExecutionPolicy Bypass -File "$root/scripts/sign-windows.ps1" "$target"
		else
			echo "sign: skip Authenticode (PowerShell not available on $host)"
		fi
		write_checksum "$target"
		;;
	*)
		if [ ! -f "$target" ]; then
			echo "sign: missing artifact: $target" >&2
			exit 1
		fi
		write_checksum "$target"
		;;
esac
