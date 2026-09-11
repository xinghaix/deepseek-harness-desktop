package dsh

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestComputeCLISearchDirectoriesIncludesHomebrewCellarNodeBin(t *testing.T) {
	if runtime.GOOS != "darwin" {
		t.Skip("Homebrew Cellar layout is macOS-specific")
	}
	matches, _ := filepath.Glob("/opt/homebrew/Cellar/node/*/bin")
	if len(matches) == 0 {
		matches, _ = filepath.Glob("/usr/local/Cellar/node/*/bin")
	}
	if len(matches) == 0 {
		t.Skip("no Homebrew Cellar node bin installed")
	}
	want, err := filepath.Abs(matches[0])
	if err != nil {
		t.Fatal(err)
	}
	dirs := computeCLISearchDirectories()
	for _, dir := range dirs {
		if dir == want {
			return
		}
	}
	t.Fatalf("computeCLISearchDirectories missing %s", want)
}

func TestCLICandidatesFindsHomebrewCellarDSHWithoutPATH(t *testing.T) {
	if runtime.GOOS != "darwin" {
		t.Skip("Homebrew Cellar layout is macOS-specific")
	}
	matches, _ := filepath.Glob("/opt/homebrew/Cellar/node/*/bin/dsh")
	if len(matches) == 0 {
		matches, _ = filepath.Glob("/usr/local/Cellar/node/*/bin/dsh")
	}
	if len(matches) == 0 {
		t.Skip("no Homebrew Cellar dsh installed")
	}
	want, err := filepath.Abs(matches[0])
	if err != nil {
		t.Fatal(err)
	}

	oldPath := os.Getenv("PATH")
	t.Cleanup(func() { _ = os.Setenv("PATH", oldPath) })
	_ = os.Setenv("PATH", "/usr/bin:/bin")

	// Bypass warm-cache Once from other tests: probe via compute + join.
	foundDir := false
	for _, dir := range computeCLISearchDirectories() {
		if filepath.Join(dir, "dsh") == want || sameFilePath(filepath.Join(dir, "dsh"), want) {
			foundDir = true
			break
		}
	}
	if !foundDir {
		t.Fatalf("Cellar node bin not in search dirs; want parent of %s", want)
	}

	info, err := os.Stat(want)
	if err != nil || info.IsDir() {
		t.Fatalf("expected dsh binary at %s", want)
	}
}

func sameFilePath(a, b string) bool {
	ai, errA := os.Stat(a)
	bi, errB := os.Stat(b)
	if errA != nil || errB != nil {
		return false
	}
	return os.SameFile(ai, bi)
}
