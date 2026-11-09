package desktop

import (
	"errors"
	"net"
	"net/url"
	"strconv"
	"strings"
	"unicode/utf8"
)

const maxSearchQueryRunes = 512

var errExternalURL = errors.New("external url not allowed")

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
	q := strings.TrimSpace(query)
	if q == "" {
		return "", errExternalURL
	}
	if utf8.RuneCountInString(q) > maxSearchQueryRunes {
		q = string([]rune(q)[:maxSearchQueryRunes])
	}
	return "https://www.google.com/search?q=" + url.QueryEscape(q), nil
}
