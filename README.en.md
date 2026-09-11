# Deepseek Harness Desktop

English · [中文](README.md)

Deepseek Harness Desktop is a lightweight desktop companion for DSH. It reuses the `dsh` CLI and DSH Home already on the machine, and runs DSH Chat inside its own desktop WebView. It does not copy DSH, install a second CLI, migrate config, or take over other processes.

Architecture and process boundaries: [AGENTS.md](AGENTS.md) (Chinese; agent-oriented).

## First launch

1. On start, the app checks the home directory, login-shell `PATH`, and common global Node locations, and passes those paths to the CLI child process.
2. If `dsh` is found, it starts and opens Chat. Otherwise you get the setup page; after a successful start, Chat opens and setup closes.
3. To change `DSH Home`, Chat workspace, or the local port, reopen setup from the app menu (macOS) / File menu (Windows, Linux), the Chat settings control, or the bridge plugin. Port `0` means an OS-assigned free loopback port.
4. A successful start is remembered so the next cold start can skip repeating CLI discovery. Setup can still change paths and ports.
5. On failure, setup shows a redacted error and lets you copy the full log; use **Retry start** after fixing the issue.
6. UI follows the system light/dark appearance. macOS uses native traffic lights; Windows / Linux use in-page floating window controls and never jump to the system browser.

Setup can optionally install the desktop management bridge plugin. In DSH Chat under **Settings → Plugins → Desktop management**, you can view status and start / stop / restart the DSH process **owned by this desktop app**.

## Repository layout

| Path | Role |
|------|------|
| `main.go` | Wails entry, embedded assets, `main.DSH.*` bindings |
| `internal/dsh` | Process lifecycle, CLI discovery, loopback control plane (no Wails) |
| `internal/desktop` | Windows, title-bar injection, file dialogs |
| `assets/web` | Setup UI |
| `assets/shared` | Shared icon source |
| `assets/{darwin,linux,windows}` | Per-platform packaging inputs |
| `plugins/deepseek-harness-desktop-bridge` | Optional desktop management bridge |
| `dist/` | Build output (gitignored) |
| `scripts/` | Build, signing, version helpers |

## Bridge plugin

Source: [plugins/deepseek-harness-desktop-bridge](plugins/deepseek-harness-desktop-bridge). From the repo root:

```sh
dsh plugin --profile web add file:./plugins/deepseek-harness-desktop-bridge
```

The plugin talks to a limited control plane that listens only on `127.0.0.1`, over DSH’s authenticated RPC. Each run gets a random token injected only into the DSH child this app started. The token never appears in the page, logs, or status payloads, and there is no arbitrary shell endpoint.

## Build and test

Requires Go 1.27, Wails 3, and native WebView deps for the target OS (macOS: Xcode; Linux: GTK 4 / WebKitGTK 6; Windows: WebView2). `task` is optional:

```bash
go test -race ./...
./scripts/build.sh              # e.g. 0.1.1-dev
./scripts/build.sh 0.2.0        # explicit version
```

Version is stamped into `internal/version.Version` via `scripts/app-version.sh`:

- Explicit arg / `VERSION=` → used as-is
- HEAD exactly on a release tag → release number (e.g. `0.1.1`)
- Otherwise → latest release + `-dev` (e.g. `0.1.1-dev`)
- No tags → `0.0.0-dev`

With [go-task](https://taskfile.dev): `task build VERSION=0.2.0`.

Artifacts land in `dist/`. macOS also builds a drag-to-Applications DMG. Builds self-sign per platform (not Developer ID / EV, not notarized; downloaded macOS builds may need Open via context menu; Windows may hit SmartScreen):

- macOS: ad-hoc `codesign` + DMG
- Windows: per-user self-signed Authenticode
- Linux: `.sha256` checksum (no equivalent code-signing API)

Cross-compile examples:

```bash
GOOS=darwin GOARCH=arm64 ./scripts/build.sh 0.2.0
GOOS=linux GOARCH=amd64 ./scripts/build.sh 0.2.0
GOOS=linux GOARCH=arm64 ./scripts/build.sh 0.2.0
GOOS=windows GOARCH=amd64 ./scripts/build.sh 0.2.0
GOOS=windows GOARCH=arm64 ./scripts/build.sh 0.2.0
```

Combinations not actually built or run on the target OS are not claimed as verified.

The setup page can check GitHub Releases manually, or enable daily auto-check (first check ~1 hour after launch, then about once a day). New versions are **not** installed automatically.

### Icons

Shared source: `assets/shared/app-icon.svg`. Regenerate on a native Go toolchain for the target OS:

```bash
go run ./tools/icons
```

Linux packaging can use `assets/linux/deepseek-harness-desktop.desktop` and install `assets/linux/icons/hicolor` into the system icon theme.

### Release

Only version tags **on main** are packaged. On a commit already on main:

```bash
git tag -a vX.Y.Z -m "…"
git push origin vX.Y.Z
```

GitHub Actions (`.github/workflows/release.yml`) builds and self-signs **darwin-arm64 / linux-amd64 / linux-arm64 / windows-amd64 / windows-arm64**, then creates a Release with `SHA256SUMS`. Tags not ancestral to `origin/main` are rejected. Runtime version comes from `-ldflags`; no source edit required.

Versioning (baseline `0.1.0`):

- Small bugfix / feature → bump patch (`0.1.1`…)
- Larger change or important fix → bump minor, reset patch (`0.2.0`…)

## Data and process boundaries (summary)

- Only `DSH_HOME` is passed explicitly to the child; the desktop-owned dir is `DSH_HOME/.deepseek-harness-desktop` (mode `0700`), and it is not DSH’s cwd.
- Chat workspace is configurable (default: user home); project dirs or the desktop-owned dir are allowed.
- Single-instance app lock + DSH lock: at most one desktop-owned DSH per user; reopening reuses windows.
- On abnormal exit, the owned process tree is cleaned up; restart is blocked until exit is confirmed. Windows uses a Job Object (`taskkill /T` fallback); Unix uses a separate process group.
- No workspace scanning, no credential read/write, no second YAML; `settings.yaml` only opens an existing file. Occupied ports fail closed—other processes are never taken over.
- Startup raises Node `max-http-header-size` and applies a process-local `--patch` (`webview-boot`) for client combo loading without changing the user profile.

More detail: [AGENTS.md](AGENTS.md).
