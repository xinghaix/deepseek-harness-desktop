//go:build wails

package desktop

import (
	"testing"

	"deepseek-harness-desktop/internal/i18n"
)

func TestSetLanguagePersistsAndLocaleBundle(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("DSH_DESKTOP_STATE_DIR", dir)
	s := &Service{}
	s.prefs.load()

	bundle, err := s.SetLanguage("ja")
	if err != nil {
		t.Fatal(err)
	}
	if bundle.Locale != "ja" {
		t.Fatalf("locale = %q, want ja", bundle.Locale)
	}
	if bundle.Source != "preference" {
		t.Fatalf("source = %q", bundle.Source)
	}
	if bundle.Catalog["menu.quit"] != i18n.Catalog("ja")["menu.quit"] {
		t.Fatal("bundle catalog is not Japanese")
	}
	if got := s.prefs.getLanguage(); got != "ja" {
		t.Fatalf("pref = %q", got)
	}

	var reloaded Service
	reloaded.prefs.load()
	again := reloaded.LocaleBundle()
	if again.Locale != "ja" || again.Language != "ja" {
		t.Fatalf("reloaded bundle = %+v", again)
	}

	if _, err := s.SetLanguage("system"); err != nil {
		t.Fatal(err)
	}
	if s.prefs.getLanguage() != "" {
		t.Fatal("system should clear stored language")
	}
}

func TestResolveUnsetSystemChinese(t *testing.T) {
	if got := i18n.Resolve("", "zh_CN.UTF-8"); got != "zh-CN" {
		t.Fatalf("got %q", got)
	}
	if got := i18n.Resolve("", "zz-ZZ"); got != "en" {
		t.Fatalf("got %q", got)
	}
}
