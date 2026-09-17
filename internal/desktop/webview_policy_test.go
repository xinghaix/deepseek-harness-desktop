//go:build wails

package desktop

import "testing"

func TestValidateChatURL(t *testing.T) {
	tests := []struct {
		name string
		url  string
		ok   bool
	}{
		{"token", "http://127.0.0.1:43123/?token=one-time", true},
		{"plain", "http://127.0.0.1:43123/", true},
		{"javascript", "javascript:alert(1)", false},
		{"data", "data:text/html,hello", false},
		{"file", "file:///tmp/chat", false},
		{"wrong-host", "http://127.0.0.1.evil:43123/", false},
		{"wrong-port", "http://127.0.0.1:43123/?token=a&port=other", false},
		{"userinfo", "http://user@127.0.0.1:43123/", false},
		{"fragment", "http://127.0.0.1:43123/#x", false},
		{"wrong-scheme", "https://127.0.0.1:43123/", false},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := validateChatURL(test.url, true) == nil; got != test.ok {
				t.Fatalf("validateChatURL(%q) = %v, want %v", test.url, got, test.ok)
			}
		})
	}
}

func TestValidateChatURLRejectsQueryAfterTokenPath(t *testing.T) {
	if err := validateChatURL("http://127.0.0.1:43123/?token=one", false); err == nil {
		t.Fatal("expected token query to be rejected for a post-login URL")
	}
}
