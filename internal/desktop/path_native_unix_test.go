//go:build wails && (darwin || linux)

package desktop

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// Exercise the real Wails adapter, replacing only the OS executable so no GUI opens.
func TestNativeFileHandlerPreservesLiteralArgument(t *testing.T) {
	dir := t.TempDir()
	command := "xdg-open"
	if runtime.GOOS == "darwin" {
		command = "open"
	}
	capture := filepath.Join(dir, "captured")
	script := "#!/bin/sh\nprintf \"%s|%s\" \"$#\" \"$1\" > \"$DSH_OPEN_CAPTURE\"\n"
	if err := os.WriteFile(filepath.Join(dir, command), []byte(script), 0700); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", dir)
	t.Setenv("DSH_OPEN_CAPTURE", capture)
	target := filepath.Join(dir, "literal $HOME spaces ü & quote'")
	if err := (&application.BrowserManager{}).OpenFile(target); err != nil {
		t.Fatal(err)
	}
	deadline := time.Now().Add(5 * time.Second)
	for {
		raw, err := os.ReadFile(capture)
		if err == nil && len(raw) > 0 {
			want := "1|" + target
			if string(raw) != want {
				t.Fatalf("native argv = %q, want %q", raw, want)
			}
			return
		}
		if time.Now().After(deadline) {
			t.Fatalf("native opener did not capture argv: %v", err)
		}
		time.Sleep(10 * time.Millisecond)
	}
}
