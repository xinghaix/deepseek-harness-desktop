#!/usr/bin/env bash
# Real NSWindow/WKWebView integration; requires an interactive macOS GUI session.
set -euo pipefail
if [[ "$(uname -s)" != Darwin ]]; then
  echo "SKIP: native context-menu regression requires macOS"
  exit 0
fi
root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
out="$(mktemp -d "${TMPDIR:-/tmp}/dsh-native-context.XXXXXX")"
echo "Native context-menu evidence: $out"
flags=(-fno-objc-arc -fblocks -framework Cocoa -framework WebKit)
if [[ -n "${DSH_CONTEXT_MENU_HEADER:-}" ]]; then
  flags+=("-DDSH_CONTEXT_MENU_HEADER=\"${DSH_CONTEXT_MENU_HEADER}\"")
fi
xcrun clang "${flags[@]}" "$root/tools/context-menu-probe/main.m" -o "$out/probe"
status=0
for scenario in text link both blank; do
  if "$out/probe" "$scenario" "$root/internal/desktop/chrome.go" > "$out/$scenario.log" 2>&1; then
    echo "PASS: $scenario (native menu + original items + action payloads)"
  else
    result=$?
    echo "FAIL: $scenario (exit $result); inspect $out/$scenario.log" >&2
    status=1
  fi
done
echo "Evidence retained: $out"
exit "$status"
