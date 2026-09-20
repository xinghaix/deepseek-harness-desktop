//go:build wails

package desktop

import (
	"errors"
	"os"
	"path/filepath"
	"testing"

	"deepseek-harness-desktop/internal/dsh"
)

func TestServiceOpenLocationsPreservePaths(t *testing.T) {
	root := t.TempDir()
	home := filepath.Join(root, "home $DSH_OPEN_LITERAL ü")
	workspace := filepath.Join(home, "workspaces")
	if err := os.MkdirAll(workspace, 0700); err != nil {
		t.Fatal(err)
	}
	settings := filepath.Join(home, "settings.yaml")
	if err := os.WriteFile(settings, []byte("# test only"), 0600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("DSH_OPEN_LITERAL", "must-not-expand")
	var opened []string
	service := &Service{nativeOpenPath: func(path string) error { opened = append(opened, path); return nil }}
	options := dsh.Options{Home: home}
	for _, action := range []struct {
		name, want string
		open       func(dsh.Options) error
	}{
		{"home", home, service.OpenHome}, {"workspace", workspace, service.OpenWorkspace}, {"settings", settings, service.OpenSettings},
	} {
		t.Run(action.name, func(t *testing.T) {
			if err := action.open(options); err != nil {
				t.Fatal(err)
			}
			if got := opened[len(opened)-1]; got != action.want {
				t.Fatalf("opened %q, want literal %q", got, action.want)
			}
		})
	}
	sentinel := errors.New("native handler unavailable")
	service.nativeOpenPath = func(string) error { return sentinel }
	if err := service.OpenHome(options); !errors.Is(err, sentinel) {
		t.Fatalf("native error lost: %v", err)
	}
	service.nativeOpenPath = func(string) error { t.Fatal("invalid path reached native opener"); return nil }
	if err := service.OpenWorkspace(dsh.Options{Home: home, Workspace: settings}); err == nil {
		t.Fatal("file accepted as workspace")
	}
	if err := service.OpenHome(dsh.Options{Home: filepath.Join(root, "missing")}); err == nil {
		t.Fatal("missing home accepted")
	}
}
