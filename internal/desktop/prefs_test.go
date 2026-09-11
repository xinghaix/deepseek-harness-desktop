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
