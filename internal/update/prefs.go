package update

import (
	"context"
	"math/rand/v2"
	"time"

	"deepseek-harness-desktop/internal/desktopstate"
)

var (
	autoCheckFirstDelay = 1 * time.Hour
	autoCheckInterval   = 24 * time.Hour
	autoCheckJitter     = 6 * time.Hour
)

func (u *Updater) AutoCheckEnabled() bool {
	return u.autoCheck.Load()
}

func (u *Updater) SetAutoCheck(enabled bool) error {
	u.autoCheck.Store(enabled)
	return u.savePrefs()
}

func (u *Updater) loadPrefs() {
	u.autoCheck.Store(true)
	file, err := desktopstate.Load()
	if err != nil || file.Update.AutoCheck == nil {
		return
	}
	u.autoCheck.Store(*file.Update.AutoCheck)
}

func (u *Updater) savePrefs() error {
	enabled := u.autoCheck.Load()
	return desktopstate.Update(func(f *desktopstate.File) {
		f.Update.AutoCheck = &enabled
	})
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
