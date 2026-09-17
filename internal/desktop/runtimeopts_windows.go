//go:build wails && windows

package desktop

import (
	"os"
	"strings"

	"golang.org/x/sys/windows"
)

const smRemoteSession = 0x1000

func windowsUseVisualHosting() bool {
	if session := strings.TrimSpace(os.Getenv("SESSIONNAME")); strings.HasPrefix(strings.ToUpper(session), "RDP") {
		return true
	}
	user32 := windows.NewLazySystemDLL("user32.dll")
	proc := user32.NewProc("GetSystemMetrics")
	if err := proc.Find(); err != nil {
		return false
	}
	r, _, _ := proc.Call(uintptr(smRemoteSession))
	return r != 0
}
