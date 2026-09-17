//go:build wails

package desktop

import (
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
)

const statusEmitDebounce = 16 * time.Millisecond

// emitStatusChanged is the notify half of notify-pull. It never serializes
// Status/logs through eval; the frontend pulls Status() after the signal.
func (d *Service) emitStatusChanged() {
	d.statusEmitMu.Lock()
	defer d.statusEmitMu.Unlock()
	if d.statusEmitTimer != nil {
		d.statusEmitTimer.Stop()
	}
	d.statusEmitTimer = time.AfterFunc(statusEmitDebounce, func() {
		app := application.Get()
		if app == nil {
			return
		}
		app.Event.Emit(StatusChangedEvent)
	})
}
