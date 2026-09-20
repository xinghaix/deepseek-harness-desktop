package desktop

import (
	"os"
	"strings"
	"testing"
)

func TestDismissCleanConfigPreservesUnsavedEdits(t *testing.T) {
	for _, dirty := range []bool{false, true} {
		focused, dismissed := 0, 0
		left := dismissCleanConfig(dirty, func() { focused++ }, func() { dismissed++ })
		if dirty {
			if left || focused != 1 || dismissed != 0 {
				t.Fatalf("dirty navigation discarded config: left=%v focus=%d dismiss=%d", left, focused, dismissed)
			}
		} else if !left || focused != 0 || dismissed != 1 {
			t.Fatalf("clean navigation did not dismiss: left=%v focus=%d dismiss=%d", left, focused, dismissed)
		}
	}
}

// Source wiring contract only: native WebView window lifecycle is not exercised.
func TestChatNavigationUsesGuardedConfigDismissal(t *testing.T) {
	raw, err := os.ReadFile(repoFile(t, "internal", "desktop", "service.go"))
	if err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"OpenDSH", "TryDismissConfig"} {
		start := strings.Index(string(raw), "func (d *Service) "+name+"() error {")
		if start < 0 {
			t.Fatalf("missing %s", name)
		}
		body := string(raw)[start:]
		if end := strings.Index(body, "\nfunc "); end >= 0 {
			body = body[:end]
		}
		if !strings.Contains(body, "d.tryDismissConfigModal(app, chat)") || strings.Contains(body, "d.dismissConfigModal(app, chat)") {
			t.Fatalf("%s must use the same dirty-config guard rather than discard edits", name)
		}
	}
}
