package dsh

import (
	"os"
	"path/filepath"
	"testing"
)

func TestNormalizeLocationOptionsDefaultWorkspace(t *testing.T) {
	home := t.TempDir()
	for _, workspace := range []string{"", "  "} {
		got, err := NormalizeLocationOptions(Options{Home: home, Workspace: workspace})
		if err != nil {
			t.Fatalf("workspace %q: %v", workspace, err)
		}
		want := filepath.Join(home, "workspaces")
		if got.Workspace != want {
			t.Fatalf("workspace = %q, want %q", got.Workspace, want)
		}
		if _, err := os.Stat(want); !os.IsNotExist(err) {
			t.Fatalf("location normalization must not create workspace: %v", err)
		}
	}
	explicit := filepath.Join(home, "space $literal ü")
	got, err := NormalizeLocationOptions(Options{Home: home, Workspace: explicit})
	if err != nil || got.Workspace != explicit {
		t.Fatalf("explicit workspace changed: %+v, %v", got, err)
	}
}
