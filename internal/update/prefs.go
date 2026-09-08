package update

import (
	"context"
	"encoding/json"
	"math/rand/v2"
	"os"
	"path/filepath"
	"strings"
	"time"
)

var (
	autoCheckFirstDelay = 1 * time.Hour
	autoCheckInterval   = 24 * time.Hour
	autoCheckJitter     = 6 * time.Hour
	prefsFileName       = "update-prefs.json"
	stateDirEnv         = "DSH_DESKTOP_STATE_DIR"
	stateDirName        = ".deepseek-harness-desktop"
)

type prefsFile struct {
	AutoCheck *bool `json:"autoCheck"`
}

func (u *Updater) AutoCheckEnabled() bool {
	return u.autoCheck.Load()
}

func (u *Updater) SetAutoCheck(enabled bool) error {
	u.autoCheck.Store(enabled)
	return u.savePrefs()
}

func (u *Updater) loadPrefs() {
	u.autoCheck.Store(true)
	data, err := os.ReadFile(prefsPath())
	if err != nil {
		return
	}
	var file prefsFile
	if json.Unmarshal(data, &file) != nil || file.AutoCheck == nil {
		return
	}
	u.autoCheck.Store(*file.AutoCheck)
}

func (u *Updater) savePrefs() error {
	path := prefsPath()
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	enabled := u.autoCheck.Load()
	data, err := json.MarshalIndent(prefsFile{AutoCheck: &enabled}, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o600)
}

func prefsPath() string {
	if dir := strings.TrimSpace(os.Getenv(stateDirEnv)); dir != "" {
		return filepath.Join(dir, prefsFileName)
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return prefsFileName
	}
	return filepath.Join(home, stateDirName, prefsFileName)
}

// RunPeriodic waits until the app has been up, then occasionally checks GitHub.
// It never runs during process startup and never installs an update.
func (u *Updater) RunPeriodic(ctx context.Context) {
	select {
	case <-ctx.Done():
		return
	case <-time.After(autoCheckFirstDelay):
	}
	for {
		if u.autoCheck.Load() {
			c, cancel := context.WithTimeout(ctx, 20*time.Second)
			_, _ = u.Check(c)
			cancel()
		}
		wait := autoCheckInterval + time.Duration(rand.Int64N(int64(autoCheckJitter)))
		select {
		case <-ctx.Done():
			return
		case <-time.After(wait):
		}
	}
}
