package desktop

import (
	"encoding/json"
	"errors"
	"net"
	"net/url"
	"strconv"
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
	// net/url does not implement browser IDNA/UTS46 hostname normalization.
	// Fail closed for credentials on ambiguous Unicode hosts; ordinary IDN
	// links without a token remain usable without adding a second URL parser.
	ambiguousHost := strings.IndexFunc(u.Hostname(), func(r rune) bool { return r > 127 }) >= 0
	if isLoopbackHost(u.Hostname()) || ambiguousHost {
		query, err := url.ParseQuery(u.RawQuery)
		// Do not let malformed queries or duplicate values hide an authentication token.
		if err != nil {
			return "", errExternalURL
		}
		for _, token := range query["token"] {
			if strings.TrimSpace(token) != "" {
				return "", errExternalURL
			}
		}
	}
	return u.String(), nil
}

func isLoopbackHost(host string) bool {
	host = strings.Trim(strings.ToLower(strings.TrimSpace(host)), "[]")
	host = strings.TrimSuffix(host, ".")
	if host == "localhost" || strings.HasSuffix(host, ".localhost") {
		return true
	}
	// Scoped IPv6 literals must not evade the loopback/unspecified-address guard.
	if address, _, ok := strings.Cut(host, "%"); ok {
		host = address
	}
	if ip := net.ParseIP(host); ip != nil {
		return ip.IsLoopback() || ip.IsUnspecified()
	}
	// Browsers accept legacy IPv4 forms that net.ParseIP intentionally rejects:
	// 127.1, a single 32-bit integer, and octal/hexadecimal components.
	parts := strings.Split(host, ".")
	if len(parts) > 4 {
		return false
	}
	var address uint64
	for i, part := range parts {
		base := 10
		if strings.HasPrefix(part, "0x") {
			base, part = 16, part[2:]
		} else if len(part) > 1 && part[0] == '0' {
			base, part = 8, part[1:]
		}
		if part == "" {
			return false
		}
		value, err := strconv.ParseUint(part, base, 32)
		if err != nil {
			return false
		}
		if i < len(parts)-1 {
			if value > 255 {
				return false
			}
			address = address<<8 | value
		} else {
			bits := uint(8 * (5 - len(parts)))
			if value >= uint64(1)<<bits {
				return false
			}
			address = address<<bits | value
		}
	}
	return address == 0 || address>>24 == 127
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
