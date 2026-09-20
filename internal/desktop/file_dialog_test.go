package desktop

import (
	"errors"
	"testing"
)

func TestFileDialogCancellation(t *testing.T) {
	cancelled := errors.New("cancelled by user")
	for _, goos := range []string{"darwin", "windows", "linux"} {
		t.Run(goos, func(t *testing.T) {
			nativeErr := error(nil)
			if goos == "windows" {
				nativeErr = cancelled
			}
			path, err := normalizeFileDialogResult(goos, "", nativeErr)
			if path != "" || err != nil {
				t.Fatalf("cancel = %q, %v; want empty successful selection", path, err)
			}
			want := "literal $HOME path"
			if path, err := normalizeFileDialogResult(goos, want, nil); path != want || err != nil {
				t.Fatalf("selection changed: %q, %v", path, err)
			}
			failure := errors.New("native picker failed")
			if _, err := normalizeFileDialogResult(goos, "", failure); !errors.Is(err, failure) {
				t.Fatalf("native failure swallowed: %v", err)
			}
		})
	}
	if _, err := normalizeFileDialogResult("darwin", "", cancelled); !errors.Is(err, cancelled) {
		t.Fatal("Windows-specific sentinel applied to another platform")
	}
}
