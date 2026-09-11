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
	Language            *string `json:"language,omitempty"`
}

type desktopPrefs struct {
	confirmQuitWhenBusy atomic.Bool
	language            atomic.Value // string; "" / "system" = follow system
}

func (p *desktopPrefs) load() {
	p.confirmQuitWhenBusy.Store(true)
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
	if file.Language != nil {
		p.language.Store(*file.Language)
	}
}

func (p *desktopPrefs) save() error {
	path := desktopPrefsPath()
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	enabled := p.confirmQuitWhenBusy.Load()
	file := desktopPrefsFile{ConfirmQuitWhenBusy: &enabled}
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
