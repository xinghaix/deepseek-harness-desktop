package desktop

import (
	"strings"
	"sync/atomic"

	"deepseek-harness-desktop/internal/desktopstate"
)

type desktopPrefs struct {
	confirmQuitWhenBusy atomic.Bool
	closeToTray         atomic.Bool
	traySessionLimit    atomic.Int32
	language            atomic.Value // string; "" / "system" = follow system
}

func (p *desktopPrefs) load() {
	p.confirmQuitWhenBusy.Store(true)
	p.closeToTray.Store(false)
	p.traySessionLimit.Store(defaultTraySessionLimit)
	p.language.Store("")
	file, err := desktopstate.Load()
	if err != nil {
		return
	}
	prefs := file.Prefs
	if prefs.ConfirmQuitWhenBusy != nil {
		p.confirmQuitWhenBusy.Store(*prefs.ConfirmQuitWhenBusy)
	}
	if prefs.CloseToTray != nil {
		p.closeToTray.Store(*prefs.CloseToTray)
	}
	if prefs.TraySessionLimit != nil {
		p.traySessionLimit.Store(int32(clampTraySessionLimit(*prefs.TraySessionLimit)))
	}
	if prefs.Language != nil {
		p.language.Store(*prefs.Language)
	}
}

func (p *desktopPrefs) save() error {
	confirm := p.confirmQuitWhenBusy.Load()
	closeToTray := p.closeToTray.Load()
	limit := int(p.traySessionLimit.Load())
	return desktopstate.Update(func(f *desktopstate.File) {
		f.Prefs.ConfirmQuitWhenBusy = &confirm
		f.Prefs.CloseToTray = &closeToTray
		f.Prefs.TraySessionLimit = &limit
		if lang := p.getLanguage(); lang != "" {
			langCopy := lang
			f.Prefs.Language = &langCopy
		} else {
			f.Prefs.Language = nil
		}
	})
}

func (p *desktopPrefs) getLanguage() string {
	v, _ := p.language.Load().(string)
	return v
}

func (p *desktopPrefs) setLanguage(code string) {
	p.language.Store(strings.TrimSpace(code))
}
