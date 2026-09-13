package desktop

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
)

const desktopPrefsFileName = "desktop-prefs.json"

type desktopPrefsFile struct {
	ConfirmQuitWhenBusy *bool   `json:"confirmQuitWhenBusy"`
	CloseToTray         *bool   `json:"closeToTray"`
	TraySessionLimit    *int    `json:"traySessionLimit"`
	Language            *string `json:"language,omitempty"`
}

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
	data, err := os.ReadFile(desktopPrefsPath())
	if err != nil {
		return
	}
	var file desktopPrefsFile
	if json.Unmarshal(data, &file) != nil {
		return
	}
	if file.ConfirmQuitWhenBusy != nil {
		p.confirmQuitWhenBusy.Store(*file.ConfirmQuitWhenBusy)
	}
	if file.CloseToTray != nil {
		p.closeToTray.Store(*file.CloseToTray)
	}
	if file.TraySessionLimit != nil {
		p.traySessionLimit.Store(int32(clampTraySessionLimit(*file.TraySessionLimit)))
	}
	if file.Language != nil {
		p.language.Store(*file.Language)
	}
}

func (p *desktopPrefs) save() error {
	path := desktopPrefsPath()
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	confirm := p.confirmQuitWhenBusy.Load()
	closeToTray := p.closeToTray.Load()
	limit := int(p.traySessionLimit.Load())
	file := desktopPrefsFile{ConfirmQuitWhenBusy: &confirm, CloseToTray: &closeToTray, TraySessionLimit: &limit}
	if lang := p.getLanguage(); lang != "" {
		langCopy := lang
		file.Language = &langCopy
	}
	data, err := json.MarshalIndent(file, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o600)
}

func (p *desktopPrefs) getLanguage() string {
	v, _ := p.language.Load().(string)
	return v
}

func (p *desktopPrefs) setLanguage(code string) {
	p.language.Store(strings.TrimSpace(code))
}

func desktopPrefsPath() string {
	if dir := strings.TrimSpace(os.Getenv("DSH_DESKTOP_STATE_DIR")); dir != "" {
		return filepath.Join(dir, desktopPrefsFileName)
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return desktopPrefsFileName
	}
	return filepath.Join(home, ".deepseek-harness-desktop", desktopPrefsFileName)
}
