//go:build wails

package desktop

import (
	"errors"
	"testing"
)

func TestBridgeExternalURLAdapterRejectsUnsafeURLs(t *testing.T) {
	adapter := bridgeHostAdapter{}
	for _, raw := range []string{"", "javascript:alert(1)", "file:///etc/passwd", "https://user:password@example.com", "http://127.0.0.1:3080/?token=secret"} {
		if err := adapter.OpenExternalURL(raw); !errors.Is(err, errExternalURL) {
			t.Fatalf("unsafe URL did not use the native sanitizer: %v", err)
		}
	}
}
