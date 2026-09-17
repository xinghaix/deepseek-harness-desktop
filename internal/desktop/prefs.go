package desktop

import (
	"strings"
	"sync/atomic"

	"deepseek-harness-desktop/internal/desktopstate"
)

type desktopPrefs struct {
	confirmQuitWhenBusy   atomic.Bool
	trayEnabled           atomic.Bool
	closeToTray           atomic.Bool
	traySessionLimit      atomic.Int32
	showCopySessionId     atomic.Bool
	chatContentVisibility atomic.Bool
	language              atomic.Value // string; "" / "system" = follow system
	shortcuts             atomic.Value // map[string]string overrides; nil/empty = all defaults
}

func (p *desktopPrefs) load() {
	p.confirmQuitWhenBusy.Store(true)
	p.trayEnabled.Store(false)
	p.closeToTray.Store(false)
	p.traySessionLimit.Store(defaultTraySessionLimit)
	p.showCopySessionId.Store(true)
	p.chatContentVisibility.Store(true)
	p.language.Store("")
	p.shortcuts.Store(map[string]string(nil))
	file, err := desktopstate.Load()
	if err != nil {
		return
	}
	prefs := file.Prefs
	if prefs.ConfirmQuitWhenBusy != nil {
		p.confirmQuitWhenBusy.Store(*prefs.ConfirmQuitWhenBusy)
	}
	if prefs.TrayEnabled != nil {
		p.trayEnabled.Store(*prefs.TrayEnabled)
	} else if prefs.CloseToTray != nil && *prefs.CloseToTray {
		// Migration: older installs only had closeToTray; that implied a live tray.
		p.trayEnabled.Store(true)
	}
	if prefs.CloseToTray != nil {
		p.closeToTray.Store(*prefs.CloseToTray)
	}
	// closeToTray requires trayEnabled.
	if p.closeToTray.Load() && !p.trayEnabled.Load() {
		p.closeToTray.Store(false)
	}
	if prefs.TraySessionLimit != nil {
		p.traySessionLimit.Store(int32(clampTraySessionLimit(*prefs.TraySessionLimit)))
	}
	if prefs.ShowCopySessionId != nil {
		p.showCopySessionId.Store(*prefs.ShowCopySessionId)
	}
	if prefs.ChatContentVisibility != nil {
		p.chatContentVisibility.Store(*prefs.ChatContentVisibility)
	}
	if prefs.Language != nil {
		p.language.Store(*prefs.Language)
	}
	p.setShortcutOverrides(NormalizeShortcutOverrides(prefs.Shortcuts))
}

func (p *desktopPrefs) save() error {
	confirm := p.confirmQuitWhenBusy.Load()
	trayEnabled := p.trayEnabled.Load()
	closeToTray := p.closeToTray.Load() && trayEnabled
	limit := int(p.traySessionLimit.Load())
	showCopySessionId := p.showCopySessionId.Load()
	chatContentVisibility := p.chatContentVisibility.Load()
	shortcuts := NormalizeShortcutOverrides(p.getShortcutOverrides())
	return desktopstate.Update(func(f *desktopstate.File) {
		f.Prefs.ConfirmQuitWhenBusy = &confirm
		f.Prefs.TrayEnabled = &trayEnabled
		f.Prefs.CloseToTray = &closeToTray
		f.Prefs.TraySessionLimit = &limit
		f.Prefs.ShowCopySessionId = &showCopySessionId
		f.Prefs.ChatContentVisibility = &chatContentVisibility
		if lang := p.getLanguage(); lang != "" {
			langCopy := lang
			f.Prefs.Language = &langCopy
		} else {
			f.Prefs.Language = nil
		}
		f.Prefs.Shortcuts = shortcuts
	})
}

func (p *desktopPrefs) getLanguage() string {
	v, _ := p.language.Load().(string)
	return v
}

func (p *desktopPrefs) setLanguage(code string) {
	p.language.Store(strings.TrimSpace(code))
}

func (p *desktopPrefs) getShortcutOverrides() map[string]string {
	v, _ := p.shortcuts.Load().(map[string]string)
	return cloneShortcutMap(v)
}

func (p *desktopPrefs) setShortcutOverrides(overrides map[string]string) {
	p.shortcuts.Store(NormalizeShortcutOverrides(overrides))
}

func (p *desktopPrefs) effectiveShortcuts() map[string]string {
	return EffectiveShortcuts(p.getShortcutOverrides())
}
