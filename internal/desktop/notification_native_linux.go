//go:build wails && linux

package desktop

import (
	"context"
	"slices"
	"time"

	"github.com/godbus/dbus/v5"
)

func platformNotificationStatus() string {
	conn, err := dbus.SessionBus()
	if err != nil {
		return "unavailable"
	}
	const name = "org.freedesktop.Notifications"
	ctx, cancel := context.WithTimeout(context.Background(), 750*time.Millisecond)
	defer cancel()
	var caps []string
	if err := conn.Object(name, "/org/freedesktop/Notifications").CallWithContext(ctx, name+".GetCapabilities", 0).Store(&caps); err != nil {
		return "unavailable"
	}
	if !slices.Contains(caps, "actions") {
		return "no-click"
	}
	return "unknown"
}
