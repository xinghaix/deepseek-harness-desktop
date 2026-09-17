package update

import (
	"os"
	"path/filepath"
	"testing"
)

func TestRestorePathKeepsBackupIfTargetRenameFailsToComplete(t *testing.T) {
	dir := t.TempDir()
	target := filepath.Join(dir, "installed")
	backup := target + ".old"
	if err := os.WriteFile(target, []byte("new"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(backup, []byte("old"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := restorePath(target, backup, true); err != nil {
		t.Fatal(err)
	}
	got, err := os.ReadFile(target)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != "old" {
		t.Fatalf("restored content %q", got)
	}
	if _, err := os.Stat(backup); !os.IsNotExist(err) {
		t.Fatalf("backup remains after restore: %v", err)
	}
}

func TestReplaceFileRestoresBackupWhenApplyFails(t *testing.T) {
	dir := t.TempDir()
	dest := filepath.Join(dir, "installed")
	if err := os.WriteFile(dest, []byte("old"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := replaceFile(dest, filepath.Join(dir, "missing")); err == nil {
		t.Fatal("replaceFile unexpectedly succeeded")
	}
	got, err := os.ReadFile(dest)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != "old" {
		t.Fatalf("destination was not restored: %q", got)
	}
	if _, err := os.Stat(dest + ".old"); !os.IsNotExist(err) {
		t.Fatalf("backup remains after failed replace: %v", err)
	}
}
