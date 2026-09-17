package desktop

import (
	"strings"
	"testing"
)

func TestSanitizeExternalURL(t *testing.T) {
	t.Parallel()
	ok, err := sanitizeExternalURL("https://example.com/path?q=1")
	if err != nil || ok != "https://example.com/path?q=1" {
		t.Fatalf("https example: %q %v", ok, err)
	}
	if _, err := sanitizeExternalURL("http://127.0.0.1:58046/?token=secret"); err == nil {
		t.Fatal("loopback token URL must be rejected")
	}
	if got, err := sanitizeExternalURL("http://127.0.0.1:3000/"); err != nil || got != "http://127.0.0.1:3000/" {
		t.Fatalf("loopback without token should open: %q %v", got, err)
	}
	for _, raw := range []string{
		"",
		"javascript:alert(1)",
		"data:text/html,hi",
		"file:///etc/passwd",
		"ftp://example.com",
		"/relative",
		"https://user:pass@example.com/",
	} {
		if _, err := sanitizeExternalURL(raw); err == nil {
			t.Fatalf("expected reject %q", raw)
		}
	}
}

func TestWebSearchURL(t *testing.T) {
	t.Parallel()
	got, err := webSearchURL("foo bar")
	if err != nil || got != "https://www.google.com/search?q=foo+bar" {
		t.Fatalf("default search = %q %v", got, err)
	}
	got, err = webSearchURLWithHint("x", "Search with DuckDuckGo")
	if err != nil || got != "https://duckduckgo.com/?q=x" {
		t.Fatalf("ddg hint = %q %v", got, err)
	}
	if _, err := webSearchURL("   "); err == nil {
		t.Fatal("empty query must be rejected")
	}
	long := strings.Repeat("你", maxSearchQueryRunes+8)
	got, err = webSearchURL(long)
	if err != nil || !strings.Contains(got, "https://www.google.com/search?q=") {
		t.Fatalf("long query: %v %q", err, got)
	}
}

func TestParseContextPayload(t *testing.T) {
	t.Parallel()
	p := parseContextPayload(`{"text":"  hi  ","href":"https://example.com/a"}`)
	if p.Text != "hi" || p.Href != "https://example.com/a" {
		t.Fatalf("payload = %+v", p)
	}
	p = parseContextPayload(`{"text":"x","href":"javascript:alert(1)"}`)
	if p.Href != "" {
		t.Fatalf("javascript href leaked: %q", p.Href)
	}
}

func TestBrowserNameMaps(t *testing.T) {
	t.Parallel()
	if got := browserNameFromProgID("ChromeHTML"); got != "Google Chrome" {
		t.Fatalf("ChromeHTML = %q", got)
	}
	if got := browserNameFromProgID("FirefoxURL-308046B0AF4A39CB"); got != "Firefox" {
		t.Fatalf("FirefoxURL = %q", got)
	}
	if got := browserNameFromDesktopFile("google-chrome.desktop"); got != "Google Chrome" {
		t.Fatalf("desktop file = %q", got)
	}
	if got := browserNameFromProgID("unknown"); got != "" {
		t.Fatalf("unknown progid = %q", got)
	}
}
