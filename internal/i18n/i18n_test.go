package i18n

import (
	"testing"
)

func TestMustLoad(t *testing.T) {
	if err := MustLoad(); err != nil {
		t.Fatal(err)
	}
}

func TestSupported(t *testing.T) {
	got := Supported()
	want := []string{"en", "zh-CN", "de", "fr", "es", "ja", "ko", "pt"}
	if len(got) != len(want) {
		t.Fatalf("Supported() len = %d, want %d", len(got), len(want))
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("Supported()[%d] = %q, want %q", i, got[i], want[i])
		}
	}
}

func TestNormalize(t *testing.T) {
	cases := map[string]string{
		"":            "",
		"en":          "en",
		"EN-US":       "en",
		"en_GB.UTF-8": "en",
		"zh":          "zh-CN",
		"zh-CN":       "zh-CN",
		"zh_CN":       "zh-CN",
		"zh-Hans":     "zh-CN",
		"zh-Hans-CN":  "zh-CN",
		"ja-JP":       "ja",
		"ko_KR":       "ko",
		"pt-BR":       "pt",
		"de_DE.UTF-8": "de",
		"fr":          "fr",
		"es-MX":       "es",
		"C":           "",
		"nope":        "",
	}
	for in, want := range cases {
		if got := Normalize(in); got != want {
			t.Fatalf("Normalize(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestResolveOrder(t *testing.T) {
	if got := Resolve("ja", "zh-CN"); got != "ja" {
		t.Fatalf("pref wins: got %q", got)
	}
	if got := Resolve("system", "zh_CN.UTF-8"); got != "zh-CN" {
		t.Fatalf("system follow: got %q", got)
	}
	if got := Resolve("", "zh-Hans-CN"); got != "zh-CN" {
		t.Fatalf("unset + zh*: got %q", got)
	}
	if got := Resolve("", "xx-YY"); got != "en" {
		t.Fatalf("unset + unknown -> en: got %q", got)
	}
	if got := Resolve("not-a-locale", "de"); got != "de" {
		t.Fatalf("bad pref falls through to system: got %q", got)
	}
	locale, source := ResolveWithSource("", "unknown-tag")
	if locale != "en" || source != "default" {
		t.Fatalf("default source: %q %q", locale, source)
	}
	locale, source = ResolveWithSource("ko", "en")
	if locale != "ko" || source != "preference" {
		t.Fatalf("preference source: %q %q", locale, source)
	}
	locale, source = ResolveWithSource("", "fr_FR")
	if locale != "fr" || source != "system" {
		t.Fatalf("system source: %q %q", locale, source)
	}
}

func TestCatalogKeyParity(t *testing.T) {
	if err := MustLoad(); err != nil {
		t.Fatal(err)
	}
	en := Catalog("en")
	if len(en) == 0 {
		t.Fatal("empty english catalog")
	}
	for _, code := range Supported() {
		cat := Catalog(code)
		if len(cat) != len(en) {
			t.Fatalf("%s key count %d != en %d", code, len(cat), len(en))
		}
		for k := range en {
			if _, ok := cat[k]; !ok {
				t.Fatalf("%s missing key %q", code, k)
			}
			if cat[k] == "" {
				t.Fatalf("%s empty value for %q", code, k)
			}
		}
		for k := range cat {
			if _, ok := en[k]; !ok {
				t.Fatalf("%s has extra key %q", code, k)
			}
		}
	}
}

func TestTReplace(t *testing.T) {
	got := T("en", "detect.verified", "dsh", "1.2.3")
	if got != "Verified dsh, version: 1.2.3" {
		t.Fatalf("T replace = %q", got)
	}
	got = T("zh-CN", "detect.verified", "dsh", "1.2.3")
	if got != "已验证 dsh，版本：1.2.3" {
		t.Fatalf("zh T = %q", got)
	}
}

func TestCatalogEnglishFallback(t *testing.T) {
	// Unknown locale resolves via Normalize to "" then Catalog uses en.
	cat := Catalog("zz-ZZ")
	if cat["menu.quit"] != Catalog("en")["menu.quit"] {
		t.Fatal("unknown locale should fall back to english catalog content")
	}
}

func TestActiveLocale(t *testing.T) {
	prev := Active()
	t.Cleanup(func() { SetActive(prev) })
	SetActive("")
	if Active() != "en" {
		t.Fatalf("empty -> en, got %q", Active())
	}
	SetActive("zh-CN")
	if Active() != "zh-CN" {
		t.Fatalf("zh-CN active, got %q", Active())
	}
	got := TActive("chrome.close")
	if got != "关闭" {
		t.Fatalf("TActive zh close = %q", got)
	}
	SetActive("en")
	if TActive("chrome.close") != "Close" {
		t.Fatalf("TActive en close = %q", TActive("chrome.close"))
	}
	if ErrorfActive("err.app_not_ready").Error() != TActive("err.app_not_ready") {
		t.Fatal("ErrorfActive mismatch")
	}
}
