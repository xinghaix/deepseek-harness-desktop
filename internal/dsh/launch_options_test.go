package dsh

import (
	"os"
	"path/filepath"
	"testing"

	"deepseek-harness-desktop/internal/desktopstate"
)

func TestPersistedLaunchOptionsRoundTrip(t *testing.T) {
	stateDir := t.TempDir()
	t.Setenv(desktopStateDirEnv, stateDir)
	desktopstate.ResetCacheForTest()
	o := Options{
		Executable: "/usr/local/bin/dsh",
		Home:       filepath.Join(stateDir, "home"),
		Workspace:  filepath.Join(stateDir, "ws"),
		Port:       0,
	}
	if err := os.MkdirAll(o.Home, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(o.Workspace, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := savePersistedLaunchOptions(o, true); err != nil {
		t.Fatal(err)
	}
	succeeded, loaded, ok, err := loadPersistedLaunchOptions()
	if err != nil || !ok {
		t.Fatalf("load: ok=%v err=%v", ok, err)
	}
	if !succeeded {
		t.Fatal("expected lastStartSucceeded")
	}
	if loaded.Workspace != o.Workspace || loaded.Home != o.Home || loaded.Executable != o.Executable {
		t.Fatalf("got %+v want %+v", loaded, o)
	}
	defaults, err := defaultOptions()
	if err != nil {
		t.Fatal(err)
	}
	merged := applyPersistedToDefaults(defaults)
	if merged.Workspace != o.Workspace {
		t.Fatalf("Defaults merge workspace=%q want %q", merged.Workspace, o.Workspace)
	}
	if _, err := os.Stat(filepath.Join(stateDir, desktopstate.FileName)); err != nil {
		t.Fatal(err)
	}
}
