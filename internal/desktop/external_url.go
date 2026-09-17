package desktop

import (
	"encoding/json"
	"errors"
	"net"
	"net/url"
	"strings"
	"unicode/utf8"

	"deepseek-harness-desktop/internal/i18n"
)

const (
	maxSearchQueryRunes = 512
	maxContextTextRunes = 2048

	contextMenuSearch = "dsh-search"
	contextMenuLink   = "dsh-link"
	contextMenuBoth   = "dsh-both"
)

var errExternalURL = errors.New("external url not allowed")

type contextPayload struct {
	Text string `json:"text"`
	Href string `json:"href"`
}

func sanitizeExternalURL(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", errExternalURL
	}
	u, err := url.Parse(raw)
	if err != nil || u == nil {
		return "", errExternalURL
	}
	scheme := strings.ToLower(u.Scheme)
	if scheme != "http" && scheme != "https" {
		return "", errExternalURL
	}
	if u.Host == "" || u.User != nil {
		return "", errExternalURL
	}
	if isLoopbackHost(u.Hostname()) && strings.TrimSpace(u.Query().Get("token")) != "" {
		return "", errExternalURL
	}
	return u.String(), nil
}

func isLoopbackHost(host string) bool {
	host = strings.Trim(strings.ToLower(strings.TrimSpace(host)), "[]")
	if host == "localhost" || host == "0.0.0.0" {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

func webSearchURL(query string) (string, error) {
	return webSearchURLWithHint(query, "")
}

func webSearchURLWithHint(query, hint string) (string, error) {
	q := strings.TrimSpace(query)
	if q == "" {
		return "", errExternalURL
	}
	if utf8.RuneCountInString(q) > maxSearchQueryRunes {
		q = string([]rune(q)[:maxSearchQueryRunes])
	}
	return searchEngineBase(hint) + url.QueryEscape(q), nil
}

func searchEngineBase(hint string) string {
	h := strings.ToLower(hint)
	switch {
	case strings.Contains(h, "duckduckgo"):
		return "https://duckduckgo.com/?q="
	case strings.Contains(h, "bing"):
		return "https://www.bing.com/search?q="
	case strings.Contains(h, "yahoo"):
		return "https://search.yahoo.com/search?p="
	case strings.Contains(h, "ecosia"):
		return "https://www.ecosia.org/search?q="
	default:
		return "https://www.google.com/search?q="
	}
}

func parseContextPayload(raw string) contextPayload {
	var payload contextPayload
	_ = json.Unmarshal([]byte(raw), &payload)
	payload.Text = clipRunes(strings.TrimSpace(payload.Text), maxContextTextRunes)
	if href, err := sanitizeExternalURL(payload.Href); err == nil {
		payload.Href = href
	} else {
		payload.Href = ""
	}
	return payload
}

func clipRunes(s string, max int) string {
	if max <= 0 || utf8.RuneCountInString(s) <= max {
		return s
	}
	return string([]rune(s)[:max])
}

func defaultBrowserDisplayName() string {
	if name := strings.TrimSpace(lookupDefaultBrowserName()); name != "" {
		return name
	}
	return i18n.TActive("chrome.default_browser")
}

func browserNameFromProgID(id string) string {
	id = strings.TrimSpace(id)
	lower := strings.ToLower(id)
	switch {
	case lower == "chromehtml" || lower == "chromebhtml":
		return "Google Chrome"
	case lower == "msedgehtm" || lower == "msedgebhtml":
		return "Microsoft Edge"
	case strings.HasPrefix(lower, "firefoxurl") || lower == "firefoxhtml":
		return "Firefox"
	case lower == "bravehtml":
		return "Brave"
	case strings.HasPrefix(lower, "operastable") || lower == "operahtml":
		return "Opera"
	case lower == "safari" || strings.HasPrefix(lower, "com.apple.safari"):
		return "Safari"
	default:
		return ""
	}
}

func browserNameFromDesktopFile(id string) string {
	id = strings.TrimSpace(strings.ToLower(id))
	id = strings.TrimSuffix(id, ".desktop")
	switch id {
	case "google-chrome", "google-chrome-stable", "com.google.chrome":
		return "Google Chrome"
	case "firefox", "org.mozilla.firefox":
		return "Firefox"
	case "chromium", "chromium-browser":
		return "Chromium"
	case "microsoft-edge", "microsoft-edge-stable", "com.microsoft.edge":
		return "Microsoft Edge"
	case "brave-browser", "brave":
		return "Brave"
	case "org.mozilla.firefox-esr", "firefox-esr":
		return "Firefox"
	default:
		return ""
	}
}

var lookupDefaultBrowserName = func() string { return "" }
