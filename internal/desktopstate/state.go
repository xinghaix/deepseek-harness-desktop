// Package desktopstate stores durable desktop-shell preferences in one file:
// DSH_HOME/.deepseek-harness-desktop/desktop-state.json
// (same desktop runtime dir as desktop-process / desktop-bridge-endpoint).
//
// Override with DSH_DESKTOP_STATE_DIR. DSH_HOME defaults to $DSH_HOME or ~/.dsh.
package desktopstate

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

const (
	StateDirEnv  = "DSH_DESKTOP_STATE_DIR"
	StateDirName = ".deepseek-harness-desktop"
	FileName     = "desktop-state.json"

	legacyDesktopPrefs = "desktop-prefs.json"
	legacyLaunchOpts   = "launch-options.json"
	legacyUpdatePrefs  = "update-prefs.json"
)

// File is the on-disk schema (versioned).
type File struct {
	Version int         `json:"version"`
	Prefs   Prefs       `json:"prefs"`
	Launch  Launch      `json:"launch"`
	Update  UpdatePrefs `json:"update"`
}

type Prefs struct {
	ConfirmQuitWhenBusy *bool             `json:"confirmQuitWhenBusy,omitempty"`
	TrayEnabled         *bool             `json:"trayEnabled,omitempty"`
	CloseToTray         *bool             `json:"closeToTray,omitempty"`
	TraySessionLimit    *int              `json:"traySessionLimit,omitempty"`
	ShowCopySessionId   *bool             `json:"showCopySessionId,omitempty"`
	Language            *string           `json:"language,omitempty"`
	Shortcuts           map[string]string `json:"shortcuts,omitempty"`
}

type Launch struct {
	LastStartSucceeded bool          `json:"lastStartSucceeded"`
	Options            LaunchOptions `json:"options"`
}

type LaunchOptions struct {
	Executable string `json:"executable"`
	Home       string `json:"home"`
	DesktopDir string `json:"desktopDir"`
	Workspace  string `json:"workspace"`
	Port       int    `json:"port"`
}

type UpdatePrefs struct {
	AutoCheck *bool `json:"autoCheck,omitempty"`
}

var (
	mu      sync.Mutex
	cached  File
	cacheOK bool
)

func Dir() (string, error) {
	mu.Lock()
	defer mu.Unlock()
	return dirUnlocked()
}

func Path() (string, error) {
	mu.Lock()
	defer mu.Unlock()
	return pathUnlocked()
}

func dirUnlocked() (string, error) {
	if dir := strings.TrimSpace(os.Getenv(StateDirEnv)); dir != "" {
		return dir, nil
	}
	// Prefer Home already loaded into cache (user-configured DSH Home).
	if cacheOK {
		if home := strings.TrimSpace(cached.Launch.Options.Home); home != "" {
			return dataDirForHome(home), nil
		}
	}
	home, err := resolveDSHHome()
	if err != nil {
		return "", err
	}
	return dataDirForHome(home), nil
}

func pathUnlocked() (string, error) {
	dir, err := dirUnlocked()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, FileName), nil
}

func resolveDSHHome() (string, error) {
	if home := strings.TrimSpace(os.Getenv("DSH_HOME")); home != "" {
		return home, nil
	}
	userHome, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(userHome, ".dsh"), nil
}

func dataDirForHome(home string) string {
	home = filepath.Clean(home)
	if filepath.Base(home) == StateDirName {
		return home
	}
	return filepath.Join(home, StateDirName)
}

func emptyFile() File {
	return File{Version: 1}
}

func Load() (File, error) {
	mu.Lock()
	defer mu.Unlock()
	if cacheOK {
		return cached, nil
	}
	f, err := loadUnlocked()
	if err != nil {
		return File{}, err
	}
	cached, cacheOK = f, true
	return f, nil
}

func loadUnlocked() (File, error) {
	path, err := pathUnlocked()
	if err != nil {
		return File{}, err
	}
	data, err := os.ReadFile(path)
	if err == nil {
		var f File
		if uerr := json.Unmarshal(data, &f); uerr != nil {
			return File{}, uerr
		}
		if f.Version == 0 {
			f.Version = 1
		}
		return f, nil
	}
	if !os.IsNotExist(err) {
		return File{}, err
	}
	// Migrate legacy split files once.
	f := migrateLegacyUnlocked()
	if hasAny(f) {
		if serr := writeUnlocked(f); serr != nil {
			return f, serr
		}
		removeLegacyUnlocked()
	}
	return f, nil
}

func hasAny(f File) bool {
	if f.Prefs.ConfirmQuitWhenBusy != nil || f.Prefs.CloseToTray != nil || f.Prefs.TraySessionLimit != nil || f.Prefs.ShowCopySessionId != nil || f.Prefs.Language != nil || len(f.Prefs.Shortcuts) > 0 {
		return true
	}
	if f.Update.AutoCheck != nil {
		return true
	}
	o := f.Launch.Options
	return strings.TrimSpace(o.Executable) != "" || strings.TrimSpace(o.Home) != "" || strings.TrimSpace(o.Workspace) != ""
}

func migrateLegacyUnlocked() File {
	f := emptyFile()
	dir, err := dirUnlocked()
	if err != nil {
		return f
	}
	if data, err := os.ReadFile(filepath.Join(dir, legacyDesktopPrefs)); err == nil {
		var legacy struct {
			ConfirmQuitWhenBusy *bool   `json:"confirmQuitWhenBusy"`
			TrayEnabled         *bool   `json:"trayEnabled"`
			CloseToTray         *bool   `json:"closeToTray"`
			TraySessionLimit    *int    `json:"traySessionLimit"`
			Language            *string `json:"language"`
		}
		if json.Unmarshal(data, &legacy) == nil {
			f.Prefs = Prefs{
				ConfirmQuitWhenBusy: legacy.ConfirmQuitWhenBusy,
				CloseToTray:         legacy.CloseToTray,
				TraySessionLimit:    legacy.TraySessionLimit,
				Language:            legacy.Language,
			}
		}
	}
	if data, err := os.ReadFile(filepath.Join(dir, legacyLaunchOpts)); err == nil {
		var legacy struct {
			LastStartSucceeded bool          `json:"lastStartSucceeded"`
			Options            LaunchOptions `json:"options"`
		}
		if json.Unmarshal(data, &legacy) == nil {
			f.Launch = Launch{LastStartSucceeded: legacy.LastStartSucceeded, Options: legacy.Options}
		}
	}
	if data, err := os.ReadFile(filepath.Join(dir, legacyUpdatePrefs)); err == nil {
		var legacy struct {
			AutoCheck *bool `json:"autoCheck"`
		}
		if json.Unmarshal(data, &legacy) == nil {
			f.Update.AutoCheck = legacy.AutoCheck
		}
	}
	return f
}

func removeLegacyUnlocked() {
	dir, err := dirUnlocked()
	if err != nil {
		return
	}
	for _, name := range []string{legacyDesktopPrefs, legacyLaunchOpts, legacyUpdatePrefs} {
		_ = os.Remove(filepath.Join(dir, name))
	}
}

func writeUnlocked(f File) error {
	if f.Version == 0 {
		f.Version = 1
	}
	path, err := pathUnlocked()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	payload, err := json.MarshalIndent(f, "", "  ")
	if err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(path), ".desktop-state-*.tmp")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	defer os.Remove(tmpPath)
	if _, err := tmp.Write(payload); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Chmod(0o600); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	if err := os.Rename(tmpPath, path); err != nil {
		return err
	}
	cached, cacheOK = f, true
	return nil
}

// Update mutates the cached file under lock and writes it back.
func Update(mutate func(*File)) error {
	mu.Lock()
	defer mu.Unlock()
	f, err := loadUnlocked()
	if err != nil {
		return err
	}
	mutate(&f)
	return writeUnlocked(f)
}

// ResetCacheForTest clears the in-memory cache (tests only).
func ResetCacheForTest() {
	mu.Lock()
	defer mu.Unlock()
	cacheOK = false
	cached = File{}
}
