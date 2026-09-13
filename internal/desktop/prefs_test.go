package desktop

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestConfirmQuitWhenBusyDefaultsOnAndPersists(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("DSH_DESKTOP_STATE_DIR", dir)
	var p desktopPrefs
	p.load()
	if !p.confirmQuitWhenBusy.Load() {
		t.Fatal("confirm-quit-when-busy must default to on")
	}
	p.confirmQuitWhenBusy.Store(false)
	if err := p.save(); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(dir, desktopPrefsFileName)); err != nil {
		t.Fatal(err)
	}
	var p2 desktopPrefs
	p2.load()
	if p2.confirmQuitWhenBusy.Load() {
		t.Fatal("disabled confirm-quit-when-busy was not persisted")
	}
}

func TestLanguagePreferencePersists(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("DSH_DESKTOP_STATE_DIR", dir)
	var p desktopPrefs
	p.load()
	if p.getLanguage() != "" {
		t.Fatalf("language must default empty (follow system), got %q", p.getLanguage())
	}
	p.setLanguage("ja")
	if err := p.save(); err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(filepath.Join(dir, desktopPrefsFileName))
	if err != nil {
		t.Fatal(err)
	}
	var file desktopPrefsFile
	if err := json.Unmarshal(raw, &file); err != nil {
		t.Fatal(err)
	}
	if file.Language == nil || *file.Language != "ja" {
		t.Fatalf("persisted language = %v", file.Language)
	}
	var p2 desktopPrefs
	p2.load()
	if p2.getLanguage() != "ja" {
		t.Fatalf("reloaded language = %q", p2.getLanguage())
	}
	// Clearing to system must omit or empty language on next save after set "".
	p2.setLanguage("")
	if err := p2.save(); err != nil {
		t.Fatal(err)
	}
	raw, err = os.ReadFile(filepath.Join(dir, desktopPrefsFileName))
	if err != nil {
		t.Fatal(err)
	}
	file = desktopPrefsFile{}
	if err := json.Unmarshal(raw, &file); err != nil {
		t.Fatal(err)
	}
	if file.Language != nil && *file.Language != "" {
		t.Fatalf("system follow should omit language, got %v", file.Language)
	}
}

func TestCloseToTrayDefaultsOffAndPersists(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("DSH_DESKTOP_STATE_DIR", dir)
	var p desktopPrefs
	p.load()
	if p.closeToTray.Load() {
		t.Fatal("close-to-tray must default to off")
	}
	if got := p.traySessionLimit.Load(); got != defaultTraySessionLimit {
		t.Fatalf("tray session limit default = %d, want %d", got, defaultTraySessionLimit)
	}
	p.closeToTray.Store(true)
	p.traySessionLimit.Store(int32(clampTraySessionLimit(99)))
	if err := p.save(); err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(filepath.Join(dir, desktopPrefsFileName))
	if err != nil {
		t.Fatal(err)
	}
	var file desktopPrefsFile
	if err := json.Unmarshal(raw, &file); err != nil {
		t.Fatal(err)
	}
	if file.CloseToTray == nil || !*file.CloseToTray {
		t.Fatal("closeToTray was not persisted as true")
	}
	if file.TraySessionLimit == nil || *file.TraySessionLimit != maxTraySessionLimit {
		t.Fatalf("traySessionLimit persisted = %v, want %d", file.TraySessionLimit, maxTraySessionLimit)
	}
	var p2 desktopPrefs
	p2.load()
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
	var p3 desktopPrefs
	p3.load()
	if p3.traySessionLimit.Load() != 0 {
		t.Fatal("zero traySessionLimit (hide list) was not persisted")
	}
}
