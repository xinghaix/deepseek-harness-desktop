//go:build wails && linux

package desktop

import (
	"context"
	"os/exec"
	"strings"
	"time"
)

func init() {
	lookupDefaultBrowserName = linuxDefaultBrowserName
}

func linuxDefaultBrowserName() string {
	ctx, cancel := context.WithTimeout(context.Background(), 800*time.Millisecond)
	defer cancel()
	out, err := exec.CommandContext(ctx, "xdg-settings", "get", "default-web-browser").Output()
	if err != nil {
		return ""
	}
	return browserNameFromDesktopFile(strings.TrimSpace(string(out)))
}
