//go:build wails

package desktop

import (
	"strings"

	"deepseek-harness-desktop/internal/i18n"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// DesktopPrefs is the JSON shape exposed to the config UI.
type DesktopPrefs struct {
	ConfirmQuitWhenBusy bool   `json:"confirmQuitWhenBusy"`
	Language            string `json:"language"`
	ResolvedLocale      string `json:"resolvedLocale"`
	SystemLocale        string `json:"systemLocale"`
	Source              string `json:"source"`
}

// SupportedLocale is one entry in LocaleBundle.Supported.
type SupportedLocale struct {
	Code       string `json:"code"`
	NativeName string `json:"nativeName"`
}

// LocaleBundle is the catalog + metadata the web UI loads for i18n.
type LocaleBundle struct {
	Locale    string            `json:"locale"`
	Catalog   map[string]string `json:"catalog"`
	Supported []SupportedLocale `json:"supported"`
	Source    string            `json:"source"`
	Language  string            `json:"language"`
}

func (d *Service) DesktopPrefs() DesktopPrefs {
	pref := d.prefs.getLanguage()
	system := i18n.SystemTag()
	resolved, source := i18n.ResolveWithSource(pref, system)
	return DesktopPrefs{
		ConfirmQuitWhenBusy: d.prefs.confirmQuitWhenBusy.Load(),
		Language:            pref,
		ResolvedLocale:      resolved,
		SystemLocale:        i18n.Normalize(system),
		Source:              source,
	}
}

func (d *Service) SetConfirmQuitWhenBusy(enabled bool) (DesktopPrefs, error) {
	d.prefs.confirmQuitWhenBusy.Store(enabled)
	if err := d.prefs.save(); err != nil {
		return d.DesktopPrefs(), err
	}
	return d.DesktopPrefs(), nil
}

func (d *Service) resolvedLocale() string {
	return i18n.Resolve(d.prefs.getLanguage(), i18n.SystemTag())
}

func (d *Service) LocaleBundle() LocaleBundle {
	pref := d.prefs.getLanguage()
	system := i18n.SystemTag()
	resolved, source := i18n.ResolveWithSource(pref, system)
	supported := make([]SupportedLocale, 0, len(i18n.Supported())+1)
	for _, code := range i18n.Supported() {
		supported = append(supported, SupportedLocale{Code: code, NativeName: i18n.NativeName(code)})
	}
	return LocaleBundle{
		Locale:    resolved,
		Catalog:   i18n.Catalog(resolved),
		Supported: supported,
		Source:    source,
		Language:  pref,
	}
}

// SetLanguage saves the UI language preference ("" / "system" = follow OS) and rebuilds the app menu.
func (d *Service) SetLanguage(code string) (LocaleBundle, error) {
	code = strings.TrimSpace(code)
	if code == "" || strings.EqualFold(code, "system") {
		d.prefs.setLanguage("")
	} else {
		n := i18n.Normalize(code)
		if n == "" {
			return d.LocaleBundle(), errUnsupportedLanguage(code)
		}
		d.prefs.setLanguage(n)
	}
	if err := d.prefs.save(); err != nil {
		return d.LocaleBundle(), err
	}
	i18n.SetActive(d.resolvedLocale())
	d.rebuildApplicationMenu()
	return d.LocaleBundle(), nil
}

func errUnsupportedLanguage(code string) error {
	return &languageError{code: code}
}

type languageError struct{ code string }

func (e *languageError) Error() string {
	return "unsupported language: " + e.code
}

func (d *Service) rebuildApplicationMenu() {
	app := application.Get()
	if app == nil {
		return
	}
	app.Menu.SetApplicationMenu(ApplicationMenu(app, d))
}
