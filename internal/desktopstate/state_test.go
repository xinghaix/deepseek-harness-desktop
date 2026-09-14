package desktopstate

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestMigrateAndRoundTrip(t *testing.T) {
	dir := t.TempDir()
	t.Setenv(StateDirEnv, dir)
	ResetCacheForTest()

	confirm := true
	closeToTray := true
	limit := 5
	lang := "zh-CN"
	auto := false
	mustWrite := func(name string, v any) {
		t.Helper()
		b, err := jsonMarshal(v)
		if err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(dir, name), b, 0o600); err != nil {
			t.Fatal(err)
		}
	}
	mustWrite(legacyDesktopPrefs, map[string]any{
		"confirmQuitWhenBusy": confirm,
		"trayEnabled":         closeToTray,
		"closeToTray":         closeToTray,
		"traySessionLimit":    limit,
		"language":            lang,
	})
	mustWrite(legacyLaunchOpts, map[string]any{
		"lastStartSucceeded": true,
		"options": map[string]any{
			"executable": "/bin/dsh",
			"home":       "/tmp/home",
			"workspace":  "/tmp/ws",
			"port":       0,
		},
	})
	mustWrite(legacyUpdatePrefs, map[string]any{"autoCheck": auto})

	f, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if f.Prefs.Language == nil || *f.Prefs.Language != lang {
		t.Fatalf("prefs: %+v", f.Prefs)
	}
	if f.Launch.Options.Workspace != "/tmp/ws" || !f.Launch.LastStartSucceeded {
		t.Fatalf("launch: %+v", f.Launch)
	}
	if f.Update.AutoCheck == nil || *f.Update.AutoCheck {
		t.Fatalf("update: %+v", f.Update)
	}
	if _, err := os.Stat(filepath.Join(dir, FileName)); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{legacyDesktopPrefs, legacyLaunchOpts, legacyUpdatePrefs} {
		if _, err := os.Stat(filepath.Join(dir, name)); !os.IsNotExist(err) {
			t.Fatalf("legacy %s still present: %v", name, err)
		}
	}

	ResetCacheForTest()
	if err := Update(func(f *File) {
		ws := "/tmp/ws2"
		f.Launch.Options.Workspace = ws
	}); err != nil {
		t.Fatal(err)
	}
	ResetCacheForTest()
	again, err := Load()
	if err != nil || again.Launch.Options.Workspace != "/tmp/ws2" {
		t.Fatalf("reload: %+v err=%v", again.Launch, err)
	}
}

func jsonMarshal(v any) ([]byte, error) {
	return json.MarshalIndent(v, "", "  ")
}

func TestDirUsesDSHHome(t *testing.T) {
	t.Setenv(StateDirEnv, "")
	t.Setenv("DSH_HOME", filepath.Join(t.TempDir(), "dsh-home"))
	ResetCacheForTest()
	dir, err := Dir()
	if err != nil {
		t.Fatal(err)
	}
	want := filepath.Join(os.Getenv("DSH_HOME"), StateDirName)
	if dir != want {
		t.Fatalf("Dir()=%q want %q", dir, want)
	}
}
