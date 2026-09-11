package i18n

import (
	"encoding/json"
	"fmt"
	"sync"
)

var (
	catalogOnce sync.Once
	catalogs    map[string]map[string]string
	catalogErr  error
)

func loadCatalogs() {
	catalogOnce.Do(func() {
		catalogs = make(map[string]map[string]string, len(supported))
		for _, code := range supported {
			data, err := readLocaleFile(code + ".json")
			if err != nil {
				catalogErr = fmt.Errorf("i18n: read %s: %w", code, err)
				return
			}
			var m map[string]string
			if err := json.Unmarshal(data, &m); err != nil {
				catalogErr = fmt.Errorf("i18n: parse %s: %w", code, err)
				return
			}
			catalogs[code] = m
		}
	})
}

// Catalog returns a flat string map for locale with English fallback for missing keys.
func Catalog(locale string) map[string]string {
	loadCatalogs()
	code := Normalize(locale)
	if code == "" {
		code = "en"
	}
	en := catalogs["en"]
	if en == nil {
		return map[string]string{}
	}
	if code == "en" {
		out := make(map[string]string, len(en))
		for k, v := range en {
			out[k] = v
		}
		return out
	}
	loc := catalogs[code]
	out := make(map[string]string, len(en))
	for k, v := range en {
		if loc != nil {
			if lv, ok := loc[k]; ok && lv != "" {
				out[k] = lv
				continue
			}
		}
		out[k] = v
	}
	return out
}

// MustLoad reports whether embedded catalogs loaded (for tests / startup).
func MustLoad() error {
	loadCatalogs()
	return catalogErr
}
