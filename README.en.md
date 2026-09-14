# Deepseek Harness Desktop

English · [中文](README.md)

A desktop window for the [DSH](https://github.com/deepseek-ai/dsh) you already installed—no second CLI, no config migration, no duplicate DSH Home.

See [Releases](https://github.com/xinghaix/deepseek-harness-desktop/releases) for builds. Architecture and contributor docs: [AGENTS.md](AGENTS.md).

## Who it’s for

- You already have `dsh` on the machine and want a dedicated window, tray, and OS shortcuts
- You want to manage the DSH process **owned by this desktop app** from Chat (start / stop / restart, desktop prefs)

## Install

1. Open [Releases](https://github.com/xinghaix/deepseek-harness-desktop/releases) and download your platform build:
   - **macOS (Apple Silicon):** `deepseek-harness-desktop-darwin-arm64.dmg` (Intel Macs can run the arm64 build via Rosetta)
   - **Linux:** `deepseek-harness-desktop-linux-amd64` or `…-arm64`
   - **Windows:** `deepseek-harness-desktop-windows-amd64.exe` or `…-arm64.exe`
2. macOS: open the DMG and drag the app to Applications. If Gatekeeper blocks it, use Finder → Right-click → Open.
3. Builds are self-signed and not notarized; Windows SmartScreen prompts are expected.

Building from source is covered in [AGENTS.md](AGENTS.md) (dev commands / release).

## Before you start

- A working `dsh` on PATH (`dsh --version` succeeds in a terminal)
- An existing or creatable DSH Home (the desktop only passes it through; it does not copy it)

## First launch

1. The app looks for `dsh` in common places (home, login-shell `PATH`, typical Node global dirs).
2. **Found:** starts DSH and opens Chat.
3. **Not found:** shows setup. Pick the `dsh` binary, DSH Home, and Chat workspace, then start; Chat opens on success.
4. On failure, setup shows a redacted error and lets you copy the full log; use **Retry** after fixing the issue.

The UI follows system light/dark mode. Chat always stays in the app WebView—never jumps to the system browser.

## Day-to-day

### Open desktop settings

Reopen setup from any of:

- macOS app menu; Windows / Linux **File** menu
- Shortcut: default `⌘,` / `Ctrl+,` (clearable / remappable in settings)
- DSH Chat → **Settings → Desktop settings**

### System tray

In setup or Desktop settings:

| Option | What it does |
|--------|----------------|
| Enable system tray | Master switch; off = no tray icon |
| Session list count | How many recent sessions appear in the tray menu (`0` hides the list) |
| Close window to tray | The Chat window **close** button hides to tray instead of quitting |

Notes:

- `⌘W` / `Ctrl+W` (if not cleared) hides Chat; a tray icon is used only when the tray is enabled, otherwise the app returns to the Dock / taskbar.
- The tray menu can open Chat, desktop settings, recent sessions, and Quit.
- While a session is running, the menu-bar icon shows an **emerald** badge; in the session list, running is `🟢` and error is `🔴`.

Linux tray support depends on StatusNotifier / AppIndicator in your desktop environment.

### Shortcuts

In setup or **Desktop settings → Shortcuts** you can:

- **Click a key chip** to record a new combo
- **Clear** a shortcut (no accelerator; menu items still work)
- **Restore defaults** for one or all

Defaults include open desktop settings, close/hide Chat, and quit; on macOS also system Hide / Hide Others. Conflicts are blocked.

### Updates

Check for updates manually in setup, or enable daily auto-check. New versions are **never** installed until you confirm.

### “Desktop settings” inside Chat

Chat **Settings** has a top-level **Desktop settings** entry (same level as Models / Plugins) for bridge status and the DSH process owned by this app. The bridge is injected automatically—you usually do not install a plugin by hand.

After upgrading, restart the desktop app or reload / reopen Chat if new options are missing.

## Privacy & boundaries (user view)

- Only the DSH process started by this app is managed; other `dsh` processes you started in a terminal are left alone.
- No workspace scanning for chat contents; no rewriting of DSH credentials or a second config copy.
- Desktop preferences live under a desktop runtime folder inside DSH Home; DSH’s own data stays managed by DSH.

## Need help?

- Downloads & notes: [Releases](https://github.com/xinghaix/deepseek-harness-desktop/releases)
- Bugs: repository Issues
- Architecture, process boundaries, build & release: [AGENTS.md](AGENTS.md)
