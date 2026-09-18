package desktop

import (
	"os"
	"regexp"
	"sort"
	"strings"
	"testing"

	"deepseek-harness-desktop/internal/i18n"
)

// The bridge client renders inside the DSH Chat webview, which cannot reach Wails
// bindings: it localizes through the catalog served by GET /v1/locale-bundle. A key typo
// there degrades silently to the in-file English fallback (or prints the raw key), so
// every referenced key is pinned here against the embedded catalog instead.
func TestDesktopBridgeClientUsesRealCatalogKeys(t *testing.T) {
	root := repoFile(t, "internal", "dsh", "desktopbridge", "lib")
	en := i18n.Catalog("en")
	if len(en) == 0 {
		t.Fatal("english catalog is empty")
	}

	// t("some.key") — the client uses double quotes; accept single quotes too.
	call := regexp.MustCompile("\\bt\\(\\s*[\"']([A-Za-z0-9_.]+)[\"']")
	for _, name := range []string{"client.js", "index.js"} {
		raw, err := os.ReadFile(root + "/" + name)
		if err != nil {
			t.Fatal(err)
		}
		matches := call.FindAllStringSubmatch(string(raw), -1)
		if name == "client.js" && len(matches) == 0 {
			t.Fatal("client.js references no catalog keys; the localization wiring is gone")
		}
		missing := make([]string, 0)
		referenced := make(map[string]bool, len(matches))
		for _, match := range matches {
			key := match[1]
			if referenced[key] {
				continue
			}
			referenced[key] = true
			if _, ok := en[key]; !ok {
				missing = append(missing, key)
			}
		}
		if len(missing) > 0 {
			sort.Strings(missing)
			t.Fatalf("%s references catalog keys missing from en.json: %s", name, strings.Join(missing, ", "))
		}
	}

	// Bare "bridge.*" literals (e.g. the code->key error map) must also resolve, or the UI
	// would print a raw key.
	literal := regexp.MustCompile("\"(bridge\\.[a-z0-9_]+)\"")
	for _, name := range []string{"client.js", "index.js"} {
		raw, err := os.ReadFile(root + "/" + name)
		if err != nil {
			t.Fatal(err)
		}
		missing := make([]string, 0)
		for _, match := range literal.FindAllStringSubmatch(string(raw), -1) {
			if _, ok := en[match[1]]; !ok {
				missing = append(missing, match[1])
			}
		}
		if len(missing) > 0 {
			sort.Strings(missing)
			t.Fatalf("%s has bridge.* literals that are not catalog keys: %s", name, strings.Join(missing, ", "))
		}
	}

	// Every supported locale must be able to render the panel, so the surface strings
	// must resolve everywhere, not just in English.
	for _, code := range i18n.Supported() {
		catalog := i18n.Catalog(code)
		for _, key := range []string{
			"bridge.overlay_label", "bridge.overlay_toolbar", "bridge.overlay_copied",
			"bridge.overlay_more", "bridge.card_status", "bridge.card_prefs",
			"bridge.card_enhancements", "bridge.apply_paths", "bridge.reconnect",
			"bridge.err_call", "tray.open_settings",
		} {
			if value, ok := catalog[key]; !ok || strings.TrimSpace(value) == "" {
				t.Fatalf("locale %s is missing a non-empty %q", code, key)
			}
		}
	}
}
