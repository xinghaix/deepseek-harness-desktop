//go:build wails && !darwin

package desktop

import "github.com/wailsapp/wails/v3/pkg/application"

func unlockWebKitDisplayRefresh(application.Window) {}

func applyNativeWindowBackground(window application.Window, colour application.RGBA) {
	if window == nil {
		return
	}
	window.SetBackgroundColour(colour)
}

func isPlatformDarkMode() bool {
	if app := application.Get(); app != nil && app.Env != nil {
		return app.Env.IsDarkMode()
	}
	return false
}

func teardownClosedWindowWebView(application.Window) {}

func maxWebContentPhysFootprint(...application.Window) uint64 {
	return 0
}

func isNativeWindowShown(window application.Window) bool {
	if window == nil {
		return false
	}
	return window.IsVisible()
}

func purgeWebViewMemoryCache(...application.Window) {}

