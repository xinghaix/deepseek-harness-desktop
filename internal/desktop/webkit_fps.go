//go:build wails

package desktop

import (
	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

// TuneNativeWebView applies platform WebView runtime tweaks that Wails does not
// expose as window options. Safe to call more than once per window.
func TuneNativeWebView(window application.Window) {
	if window == nil {
		return
	}
	unlockWebKitDisplayRefresh(window)
	if window.NativeWindow() != nil {
		return
	}
	window.RegisterHook(events.Common.WindowRuntimeReady, func(*application.WindowEvent) {
		unlockWebKitDisplayRefresh(window)
	})
}
