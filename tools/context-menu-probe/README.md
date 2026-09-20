# Native macOS context-menu regression

Run from an interactive macOS GUI session with Xcode command-line tools:

```sh
bash scripts/test-context-menu-darwin.sh
```

The runner compiles [main.m](main.m) with the **actual production Objective-C implementation** in [context_menu_darwin.h](../../internal/desktop/context_menu_darwin.h). It extracts the current URL/context helpers and capturing `contextmenu` listener from [chrome.go](../../internal/desktop/chrome.go), rather than maintaining a duplicate JavaScript implementation. Source marker changes fail explicitly. The compiler uses non-ARC mode, matching the production cgo adapter. No Go build or Wails application is required.

The probe briefly opens its own NSWindow and nonpersistent WKWebView. It loads local HTML, installs the production message handler **after navigation**, checks repeated attachment through both the NSWindow traversal and WKWebView seams, and sends a native right-mouse event to its own hit-tested view. Actual WebKit constructs and tracks the NSMenu; the production hook receives it. The probe cancels its own menu and exits. It neither attaches to another app nor changes user preferences, persistent website data, or desktop processes. Do not run concurrent GUI automation against this probe.

## What is asserted

Four separate process/HTML scenarios cover:

- `text`: selected text, Search only.
- `link`: an unselectable anchor, Open only. WebKit may automatically select the word under a right-click on an ordinary anchor; CSS `user-select:none` makes this a genuine no-selection fixture without changing the emitted context.
- `both`: selected anchor text, Search and Open.
- `blank`: no selection/link, no added items.

Each case requires a real native tracking notification and production callback. Every original menu item must retain its identity, relative ordering, title, action, target, and submenu. Custom tag counts must match the scenario. Custom actions are dispatched with AppKit `sendAction:to:from:`; only the Go-boundary functions and localized titles are stubbed. Recorded Search/Open payloads must equal the actual fixture selection/URL. **No system browser launches**, network navigation, or external search occurs.

The fixture does not synthesize an NSMenu, manually call the production augmentation function, seed the native cache, or replace the production IPC handler. It does instrument the installed callback to observe the menu before and after the real production implementation. A missing callback/menu times out as a failure. Each case has a fresh process, so blank-context coverage is not a same-WebView stale-cache transition test.

## Evidence and limits

The runner retains its binary and per-scenario native logs in a printed temporary directory. Exit 0 means all four scenarios passed; nonzero means a compile/runtime/assertion failure. Non-macOS hosts print an explicit skip. Logs include original and final titles, callback receiver, private synchronous JS availability, individual assertions, and action counts.

Preservation checks cover whatever menu the OS actually supplied. Share, Look Up, Translate, and Speech were observed on macOS 27.0 build 26A428. Services was not present in this standalone application; its presence/functionality is **not** separately established by this probe. The identity/submenu checks protect it when present. This probe is not a packaged-Wails integration test, screenshot acceptance test, or proof that the system browser launches correctly.

For regression reproduction against a saved original implementation (the header must contain the original production code, not a replacement mock):

```sh
DSH_CONTEXT_MENU_HEADER=/absolute/path/to/original.h \
  bash scripts/test-context-menu-darwin.sh
```

The override affects only the test compiler. Headers without `DSH_CONTEXT_MENU_PUBLIC_MESSAGE_CACHE` skip the new attachment API, allowing the original synchronous-JS implementation to compile and reproduce missing custom items. The original implementation failed `text`, `link`, and `both` while `blank` passed on the tested host.
