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
	Version       int          `json:"version"`
	Prefs         Prefs        `json:"prefs"`
	Launch        Launch       `json:"launch"`
	Update        UpdatePrefs  `json:"update"`
	WindowState   *WindowState `json:"windowState,omitempty"`
	LastSessionID string       `json:"lastSessionId,omitempty"`
}

type WindowState struct {
	Width       int    `json:"width"`
	Height      int    `json:"height"`
	X           int    `json:"x,omitempty"`
	Y           int    `json:"y,omitempty"`
	Maximised   bool   `json:"maximised,omitempty"`
	DisplayID   string `json:"displayId,omitempty"`
	DisplayName string `json:"displayName,omitempty"`
}

type Prefs struct {
	ConfirmQuitWhenBusy   *bool             `json:"confirmQuitWhenBusy,omitempty"`
	TrayEnabled           *bool             `json:"trayEnabled,omitempty"`
	CloseToTray           *bool             `json:"closeToTray,omitempty"`
	TraySessionLimit      *int              `json:"traySessionLimit,omitempty"`
	ShowCopySessionId     *bool             `json:"showCopySessionId,omitempty"`
	HoverMessageActions   *bool             `json:"hoverMessageActions,omitempty"`
	ChatContentVisibility *bool             `json:"chatContentVisibility,omitempty"`
	PromptOverlayMaxLines *int              `json:"promptOverlayMaxLines,omitempty"`
	RestoreLastSession    *bool             `json:"restoreLastSession,omitempty"`
	RememberWindowSize    *bool             `json:"rememberWindowSize,omitempty"`
	Language              *string           `json:"language,omitempty"`
	Shortcuts             map[string]string `json:"shortcuts,omitempty"`
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
		ValidateFile(&f)
		return f, nil
	}
	if !os.IsNotExist(err) {
		return File{}, err
	}
	// Migrate legacy split files once.
	f := migrateLegacyUnlocked()
	if hasAny(f) {
		ValidateFile(&f)
		if serr := writeUnlocked(f); serr != nil {
			return f, serr
		}
		removeLegacyUnlocked()
	}
	return f, nil
}

func hasAny(f File) bool {
	if f.Prefs.ConfirmQuitWhenBusy != nil || f.Prefs.CloseToTray != nil || f.Prefs.TraySessionLimit != nil || f.Prefs.ShowCopySessionId != nil || f.Prefs.HoverMessageActions != nil || f.Prefs.ChatContentVisibility != nil || f.Prefs.PromptOverlayMaxLines != nil || f.Prefs.RestoreLastSession != nil || f.Prefs.RememberWindowSize != nil || f.Prefs.Language != nil || len(f.Prefs.Shortcuts) > 0 {
		return true
	}
	if f.Update.AutoCheck != nil {
		return true
	}
	if f.WindowState != nil || strings.TrimSpace(f.LastSessionID) != "" {
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
	ValidateFile(&f)
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

const (
	MinSavedChatWidth  = 900
	MinSavedChatHeight = 640
	MaxSavedChatWidth  = 16384
	MaxSavedChatHeight = 16384
	MaxCoordinateBound = 32768
)

// ValidateSessionID checks if a session ID contains only safe alphanumeric/hyphen/underscore/dot characters
// and is within a bounded length (1 to 128 bytes).
func ValidateSessionID(id string) bool {
	id = strings.TrimSpace(id)
	if len(id) == 0 || len(id) > 128 {
		return false
	}
	first := id[0]
	if !((first >= 'a' && first <= 'z') || (first >= 'A' && first <= 'Z') || (first >= '0' && first <= '9')) {
		return false
	}
	for i := 1; i < len(id); i++ {
		c := id[i]
		if (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '-' || c == '_' || c == '.' {
			continue
		}
		return false
	}
	return true
}

// SanitizeSessionID returns the session ID if valid, or empty string if invalid or tampered.
func SanitizeSessionID(id string) string {
	id = strings.TrimSpace(id)
	if !ValidateSessionID(id) {
		return ""
	}
	return id
}

// ValidateWindowState ensures window dimensions, coordinates, and strings are safely bounded.
func ValidateWindowState(ws *WindowState) *WindowState {
	if ws == nil {
		return nil
	}
	res := *ws
	if res.Width <= 0 {
		res.Width = 1280
	} else if res.Width < MinSavedChatWidth {
		res.Width = MinSavedChatWidth
	} else if res.Width > MaxSavedChatWidth {
		res.Width = MaxSavedChatWidth
	}

	if res.Height <= 0 {
		res.Height = 860
	} else if res.Height < MinSavedChatHeight {
		res.Height = MinSavedChatHeight
	} else if res.Height > MaxSavedChatHeight {
		res.Height = MaxSavedChatHeight
	}

	if res.X < -MaxCoordinateBound || res.X > MaxCoordinateBound {
		res.X = 0
	}
	if res.Y < -MaxCoordinateBound || res.Y > MaxCoordinateBound {
		res.Y = 0
	}

	res.DisplayID = sanitizeString(res.DisplayID, 256)
	res.DisplayName = sanitizeString(res.DisplayName, 256)
	return &res
}

// ValidateFile validates and sanitizes all fields of a File loaded from or written to disk,
// guarding against maliciously tampered configuration parameters and values.
func ValidateFile(f *File) {
	if f == nil {
		return
	}
	if f.Version <= 0 {
		f.Version = 1
	}

	// 1. Validate LastSessionID
	f.LastSessionID = SanitizeSessionID(f.LastSessionID)

	// 2. Validate WindowState
	f.WindowState = ValidateWindowState(f.WindowState)

	// 3. Validate Prefs
	if f.Prefs.TraySessionLimit != nil {
		lim := *f.Prefs.TraySessionLimit
		if lim < 0 {
			lim = 0
		} else if lim > 20 {
			lim = 20
		}
		f.Prefs.TraySessionLimit = &lim
	}
	if f.Prefs.PromptOverlayMaxLines != nil {
		lines := *f.Prefs.PromptOverlayMaxLines
		if lines < 2 {
			lines = 2
		} else if lines > 21 {
			lines = 21
		}
		f.Prefs.PromptOverlayMaxLines = &lines
	}
	if f.Prefs.Language != nil {
		lang := sanitizeString(*f.Prefs.Language, 32)
		if lang == "" {
			f.Prefs.Language = nil
		} else {
			f.Prefs.Language = &lang
		}
	}
	if f.Prefs.CloseToTray != nil && *f.Prefs.CloseToTray {
		if f.Prefs.TrayEnabled == nil || !*f.Prefs.TrayEnabled {
			f.Prefs.CloseToTray = nil
		}
	}
	if f.Prefs.Shortcuts != nil {
		cleanShortcuts := make(map[string]string)
		for k, v := range f.Prefs.Shortcuts {
			kClean := sanitizeString(k, 64)
			vClean := sanitizeString(v, 64)
			if kClean != "" {
				cleanShortcuts[kClean] = vClean
			}
		}
		f.Prefs.Shortcuts = cleanShortcuts
	}

	// 4. Validate Launch Options
	if f.Launch.Options.Port < 0 || f.Launch.Options.Port > 65535 {
		f.Launch.Options.Port = 0
	}
	f.Launch.Options.Executable = sanitizePath(f.Launch.Options.Executable)
	f.Launch.Options.Home = sanitizePath(f.Launch.Options.Home)
	f.Launch.Options.Workspace = sanitizePath(f.Launch.Options.Workspace)
	f.Launch.Options.DesktopDir = sanitizePath(f.Launch.Options.DesktopDir)
}

func sanitizeString(s string, maxRunes int) string {
	s = strings.TrimSpace(s)
	if len(s) == 0 {
		return ""
	}
	var b strings.Builder
	b.Grow(len(s))
	count := 0
	for _, r := range s {
		if r < 32 || r == 127 {
			continue
		}
		b.WriteRune(r)
		count++
		if count >= maxRunes {
			break
		}
	}
	return b.String()
}

func sanitizePath(p string) string {
	p = strings.TrimSpace(p)
	if strings.IndexByte(p, 0) >= 0 {
		return ""
	}
	if len(p) > 4096 {
		return ""
	}
	return p
}

// SaveWindowState updates the persistent chat window geometry and display metadata.
func SaveWindowState(ws WindowState) error {
	validated := ValidateWindowState(&ws)
	return Update(func(f *File) {
		f.WindowState = validated
	})
}

// LoadWindowState returns the persistent chat window geometry if present.
func LoadWindowState() (*WindowState, error) {
	f, err := Load()
	if err != nil {
		return nil, err
	}
	return ValidateWindowState(f.WindowState), nil
}

// SaveLastSessionID updates the persistent ID of the last active chat session.
func SaveLastSessionID(id string) error {
	cleanID := SanitizeSessionID(id)
	return Update(func(f *File) {
		f.LastSessionID = cleanID
	})
}

// LoadLastSessionID returns the persistent ID of the last active chat session.
func LoadLastSessionID() (string, error) {
	f, err := Load()
	if err != nil {
		return "", err
	}
	return SanitizeSessionID(f.LastSessionID), nil
}
