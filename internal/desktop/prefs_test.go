package desktop

import (
	"os"
	"path/filepath"
	"testing"

	"deepseek-harness-desktop/internal/desktopstate"
)

func TestConfirmQuitWhenBusyDefaultsOnAndPersists(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("DSH_DESKTOP_STATE_DIR", dir)
	desktopstate.ResetCacheForTest()
	var p desktopPrefs
	p.load()
	if !p.confirmQuitWhenBusy.Load() {
		t.Fatal("confirm-quit-when-busy must default to on")
	}
	p.confirmQuitWhenBusy.Store(false)
	if err := p.save(); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(dir, desktopstate.FileName)); err != nil {
		t.Fatal(err)
	}
	desktopstate.ResetCacheForTest()
	var p2 desktopPrefs
	p2.load()
	if p2.confirmQuitWhenBusy.Load() {
		t.Fatal("disabled confirm-quit-when-busy was not persisted")
	}
}

func TestLanguagePreferencePersists(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("DSH_DESKTOP_STATE_DIR", dir)
	desktopstate.ResetCacheForTest()
	var p desktopPrefs
	p.load()
	if p.getLanguage() != "" {
		t.Fatalf("language must default empty (follow system), got %q", p.getLanguage())
	}
	p.setLanguage("ja")
	if err := p.save(); err != nil {
		t.Fatal(err)
	}
	file, err := desktopstate.Load()
	if err != nil {
		t.Fatal(err)
	}
	if file.Prefs.Language == nil || *file.Prefs.Language != "ja" {
		t.Fatalf("persisted language = %v", file.Prefs.Language)
	}
	desktopstate.ResetCacheForTest()
	var p2 desktopPrefs
	p2.load()
	if p2.getLanguage() != "ja" {
		t.Fatalf("reloaded language = %q", p2.getLanguage())
	}
	p2.setLanguage("")
	if err := p2.save(); err != nil {
		t.Fatal(err)
	}
	desktopstate.ResetCacheForTest()
	file, err = desktopstate.Load()
	if err != nil {
		t.Fatal(err)
	}
	if file.Prefs.Language != nil && *file.Prefs.Language != "" {
		t.Fatalf("system follow should omit language, got %v", file.Prefs.Language)
	}
}

func TestCloseToTrayDefaultsOffAndPersists(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("DSH_DESKTOP_STATE_DIR", dir)
	desktopstate.ResetCacheForTest()
	var p desktopPrefs
	p.load()
	if p.trayEnabled.Load() {
		t.Fatal("trayEnabled must default to off")
	}
	if p.closeToTray.Load() {
		t.Fatal("close-to-tray must default to off")
	}
	if got := p.traySessionLimit.Load(); got != defaultTraySessionLimit {
		t.Fatalf("tray session limit default = %d, want %d", got, defaultTraySessionLimit)
	}
	p.trayEnabled.Store(true)
	p.closeToTray.Store(true)
	p.traySessionLimit.Store(int32(clampTraySessionLimit(99)))
	if err := p.save(); err != nil {
		t.Fatal(err)
	}
	file, err := desktopstate.Load()
	if err != nil {
		t.Fatal(err)
	}
	if file.Prefs.CloseToTray == nil || !*file.Prefs.CloseToTray {
		t.Fatal("closeToTray was not persisted as true")
	}
	if file.Prefs.TraySessionLimit == nil || *file.Prefs.TraySessionLimit != maxTraySessionLimit {
		t.Fatalf("traySessionLimit persisted = %v, want %d", file.Prefs.TraySessionLimit, maxTraySessionLimit)
	}
	desktopstate.ResetCacheForTest()
	var p2 desktopPrefs
	p2.load()
	if !p2.trayEnabled.Load() {
		t.Fatal("enabled trayEnabled was not reloaded")
	}
	if !p2.closeToTray.Load() {
		t.Fatal("enabled close-to-tray was not reloaded")
	}
	if p2.traySessionLimit.Load() != maxTraySessionLimit {
		t.Fatalf("reloaded traySessionLimit = %d", p2.traySessionLimit.Load())
	}
	p2.traySessionLimit.Store(0)
	if err := p2.save(); err != nil {
		t.Fatal(err)
	}
	desktopstate.ResetCacheForTest()
	var p3 desktopPrefs
	p3.load()
	if p3.traySessionLimit.Load() != 0 {
		t.Fatal("zero traySessionLimit (hide list) was not persisted")
	}
}

func TestShortcutOverridesRoundTripIncludingCleared(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("DSH_DESKTOP_STATE_DIR", dir)
	desktopstate.ResetCacheForTest()
	var p desktopPrefs
	p.load()
	eff := p.effectiveShortcuts()
	if eff[ShortcutCloseChat] != "CmdOrCtrl+w" {
		t.Fatalf("default closeChat = %q", eff[ShortcutCloseChat])
	}
	p.setShortcutOverrides(map[string]string{
		ShortcutCloseChat: "",
		ShortcutQuit:      "CmdOrCtrl+q", // equals default → omitted
	})
	if err := p.save(); err != nil {
		t.Fatal(err)
	}
	file, err := desktopstate.Load()
	if err != nil {
		t.Fatal(err)
	}
	if file.Prefs.Shortcuts == nil || file.Prefs.Shortcuts[ShortcutCloseChat] != "" {
		t.Fatalf("cleared closeChat not persisted: %+v", file.Prefs.Shortcuts)
	}
	if _, ok := file.Prefs.Shortcuts[ShortcutQuit]; ok {
		t.Fatalf("default quit should be omitted from overrides: %+v", file.Prefs.Shortcuts)
	}
	desktopstate.ResetCacheForTest()
	var p2 desktopPrefs
	p2.load()
	eff2 := p2.effectiveShortcuts()
	if eff2[ShortcutCloseChat] != "" {
		t.Fatalf("reloaded closeChat = %q, want cleared", eff2[ShortcutCloseChat])
	}
	if eff2[ShortcutQuit] != "CmdOrCtrl+q" {
		t.Fatalf("reloaded quit = %q", eff2[ShortcutQuit])
	}
}
