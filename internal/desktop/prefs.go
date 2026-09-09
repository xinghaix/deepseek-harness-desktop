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
	ConfirmQuitWhenBusy *bool `json:"confirmQuitWhenBusy"`
}

type desktopPrefs struct {
	confirmQuitWhenBusy atomic.Bool
}

func (p *desktopPrefs) load() {
	p.confirmQuitWhenBusy.Store(true)
	data, err := os.ReadFile(desktopPrefsPath())
	if err != nil {
		return
	}
	var file desktopPrefsFile
	if json.Unmarshal(data, &file) != nil || file.ConfirmQuitWhenBusy == nil {
		return
	}
	p.confirmQuitWhenBusy.Store(*file.ConfirmQuitWhenBusy)
}

func (p *desktopPrefs) save() error {
	path := desktopPrefsPath()
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	enabled := p.confirmQuitWhenBusy.Load()
	data, err := json.MarshalIndent(desktopPrefsFile{ConfirmQuitWhenBusy: &enabled}, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o600)
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
