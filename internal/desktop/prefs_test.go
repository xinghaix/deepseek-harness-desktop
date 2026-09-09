package desktop

import (
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
