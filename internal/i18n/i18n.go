package i18n

import (
	"errors"
	"strings"
	"sync/atomic"
)

// Supported locale codes (BCP 47-ish). English is the catalog source of truth.
var supported = []string{"en", "zh-CN", "de", "fr", "es", "ja", "ko", "pt"}

var nativeNames = map[string]string{
	"en":    "English",
	"zh-CN": "简体中文",
	"de":    "Deutsch",
	"fr":    "Français",
	"es":    "Español",
	"ja":    "日本語",
	"ko":    "한국어",
	"pt":    "Português",
}

// Supported returns the fixed list of locale codes.
func Supported() []string {
	out := make([]string, len(supported))
	copy(out, supported)
	return out
}

// NativeName returns the end-user label for a supported locale, or the code.
func NativeName(code string) string {
	if n, ok := nativeNames[Normalize(code)]; ok {
		return n
	}
	return code
}

// Normalize maps a language tag or preference into a supported locale code.
// Unknown values return "".
func Normalize(code string) string {
	raw := strings.TrimSpace(code)
	if raw == "" {
		return ""
	}
	raw = strings.ReplaceAll(raw, "_", "-")
	// Strip encoding / modifier: zh-CN.UTF-8@euro -> zh-CN
	if i := strings.IndexAny(raw, ".@"); i >= 0 {
		raw = raw[:i]
	}
	lower := strings.ToLower(raw)
	switch lower {
	case "c", "posix":
		return ""
	}

	parts := strings.Split(lower, "-")
	if len(parts) == 0 || parts[0] == "" {
		return ""
	}
	lang := parts[0]

	switch lang {
	case "zh":
		// Hans / CN / SG -> zh-CN; anything else Chinese still maps to zh-CN for our set.
		return "zh-CN"
	case "en":
		return "en"
	case "de":
		return "de"
	case "fr":
		return "fr"
	case "es":
		return "es"
	case "ja":
		return "ja"
	case "ko":
		return "ko"
	case "pt":
		return "pt"
	}

	// Exact match against supported (case-insensitive).
	for _, s := range supported {
		if strings.EqualFold(s, raw) || strings.EqualFold(s, lang) {
			return s
		}
	}
	return ""
}

// MatchSystem maps an OS / LANG-style tag into a supported locale, or "".
func MatchSystem(tag string) string {
	return Normalize(tag)
}

// Resolve picks the effective locale:
//  1. saved preference if set and not "system" (and normalizable)
//  2. else system tag mapped into the supported set
//  3. else English
func Resolve(pref, systemTag string) string {
	locale, _ := ResolveWithSource(pref, systemTag)
	return locale
}

// ResolveWithSource is Resolve plus a source label: preference | system | default.
func ResolveWithSource(pref, systemTag string) (locale, source string) {
	pref = strings.TrimSpace(pref)
	if pref != "" && !strings.EqualFold(pref, "system") {
		if n := Normalize(pref); n != "" {
			return n, "preference"
		}
	}
	if n := MatchSystem(systemTag); n != "" {
		return n, "system"
	}
	return "en", "default"
}

// T looks up key in locale (with English fallback) and replaces {0},{1},… with vars.
func T(locale, key string, vars ...string) string {
	cat := Catalog(locale)
	s, ok := cat[key]
	if !ok || s == "" {
		s = key
	}
	for i, v := range vars {
		token := "{" + itoa(i) + "}"
		s = strings.ReplaceAll(s, token, v)
	}
	return s
}

func itoa(i int) string {
	if i == 0 {
		return "0"
	}
	var b [12]byte
	pos := len(b)
	for i > 0 {
		pos--
		b[pos] = byte('0' + i%10)
		i /= 10
	}
	return string(b[pos:])
}

// Active locale for backend user-facing strings (dsh/update/desktop errors).
// Defaults to English before desktop prefs resolve.
var activeLocale atomic.Value // string

func init() {
	activeLocale.Store("en")
}

// SetActive sets the process-wide active locale used by TActive.
// Empty or unknown values fall back to English.
func SetActive(locale string) {
	n := Normalize(locale)
	if n == "" {
		n = "en"
	}
	activeLocale.Store(n)
}

// Active returns the current process-wide locale (never empty; default "en").
func Active() string {
	v, _ := activeLocale.Load().(string)
	if v == "" {
		return "en"
	}
	return v
}

// TActive looks up key in the Active locale (with English fallback).
func TActive(key string, vars ...string) string {
	return T(Active(), key, vars...)
}

// ErrorfActive returns errors.New(TActive(key, vars...)).
func ErrorfActive(key string, vars ...string) error {
	return errors.New(TActive(key, vars...))
}
