# Isolated native navigation and readiness probe

Run from the repository root on a machine with the target native WebView SDK. The probe owns its temporary windows and ephemeral HTTP listener; it does not start DSH, restart the desktop application, read user credentials, or launch a system browser. The bridge fixture serves the production renderer client unchanged, but its recording HTTP endpoint is not a test of production bridge authentication.

```sh
go run -tags wails,production ./tools/navigation-probe -bridge
go run -tags wails,production ./tools/navigation-probe -bridge -readiness baseline
go run -tags wails,production ./tools/navigation-probe -bridge -readiness minimal
go test ./internal/desktop -run TestChatRuntime -count=1
```

## Window action coverage

With `-bridge`, each remote document calls the production `window.__DSH_DESKTOP_REQUEST_WINDOW_ACTION__` for `minimize`, `maximize`, `close`, `settings`, and `dismiss-config`. The unchanged production client sends `chatWindowAction` with its real payload over the fixture HTTP adapter. The Go handler records and validates each action; the report asserts each arrived exactly once per document, while `Call.ByName` remains absent. Only the final native side effects are replaced: the fixture does **not** actually minimize, close, maximize, or show configuration windows.

## Readiness differential

Both readiness modes start with the production Chat window options. They remove only the delimited native-readiness bootstrap. Baseline leaves it absent. Minimal defers the **exact production bootstrap** until an HTTP request has asked Go to execute a marker via native `ExecJS`, then executes that bootstrap twice to check same-document idempotency. Both perform one actual page reload. Minimal also invokes all six compatibility callbacks through native `ExecJS`.

Expected observations on macOS (Wails beta.22):

| Signal | Baseline | Minimal |
|---|---|---|
| Remote `Call.ByName` | undefined | undefined |
| Embedded native Ping | 1 | 1 |
| Host `WindowRuntimeReady`, two documents | 0 | 2 |
| Initial document marker before readiness | 0 | 0 |
| Initial document marker after readiness | 0 | 1 |
| Reload document marker before readiness | 0 | 1 |
| Reload document marker after readiness | 0 | 1 |
| Native callback exercise per document | 0 | 1 |
| Bridge external calls, two documents | 4 | 4 |
| Captured JS errors | none | none |

The reload-before-readiness marker is intentional: beta.22 keeps its Go `runtimeLoaded` flag true across navigation. Each new document still needs callback installation and its own readiness signal for lifecycle hooks. The initial document demonstrates the original queue stall; reload demonstrates reinstatement and per-document idempotency.

## Audited protocol constraints

- `runtime.Core` installs flags/environment and `_wails.invoke`, then emits the DOM event `wails:runtime-config-ready` in a microtask. This is **not** host readiness and does not install `Call`.
- Host readiness is the exact string `wails:runtime:ready`. Common Go handling emits `WindowRuntimeReady` first, sets `runtimeLoaded`, calls `SetResizable`, and flushes queued JS. Calling `ExecJS` before a native implementation exists drops the call rather than queues it.
- macOS and Linux Core wrap `webkit.messageHandlers.external.postMessage` with its receiver intact. Windows Core stores an unbound `chrome.webview.postMessage`; the minimal bootstrap preserves the WebView2 receiver, as the full runtime does.
- Native ordinary/window events use `_wails.dispatchWailsEvent`; no separate JS `dispatchWindowEvent` callback is required. Current dispatch is guarded, so absence loses events rather than throws. Windows `SetResizable` calls `_wails.setResizable` without a guard. Drag/drop native sites can call `handleDragEnter`, `handleDragLeave`, `handleDragOver`, and `handlePlatformFileDrop` without guards.
- The production minimal bootstrap preserves existing callbacks, waits for the real Windows/Linux resize adapter, and provides disabled-drop/event compatibility sinks. It creates no Call API, subscriptions, or renderer RPC transport.
- Full runtime `runtime.ts` exposes `setTransport/getTransport`; its default is same-origin POST `/wails/runtime`. There is no desktop flag that transparently changes these calls to native IPC. Android has a separate auto-detected `invokeAsync` transport, not a desktop solution.
- The bootstrap is restricted to the exact configured HTTP loopback origin and top frame, skips management/full-runtime pages, bounds native readiness retries, and sends once per document. This is a narrow lifecycle guard, not a native origin ACL.
- The macOS FPS tuning helper attempts tuning immediately and only registers its readiness fallback if the native window is not yet available. Missing readiness blocks that fallback, not necessarily every tuning invocation.

Native execution was verified on macOS only. Windows/Linux message semantics and callback requirements were source-audited, with a receiver-sensitive Windows unit replay; this is not native Windows/Linux acceptance.
