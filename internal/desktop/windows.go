//go:build wails

package desktop

import (
	"runtime"

	"github.com/wailsapp/wails/v3/pkg/application"
)

func PrimaryWindowOptions(url string) application.WebviewWindowOptions {
	options := application.WebviewWindowOptions{
		Name:               "main",
		Title:              "Deepseek Harness Desktop",
		Width:              1280,
		Height:             860,
		MinWidth:           900,
		MinHeight:          640,
		URL:                url,
		UseApplicationMenu: true,
		Windows:            application.WindowsWindow{Theme: application.SystemDefault},
		DevToolsEnabled:    false,
	}
	return applyDesktopWindowChrome(options)
}

func ManagementWindowOptions(url string) application.WebviewWindowOptions {
	return PrimaryWindowOptions(url)
}

func ChatWindowOptions(url string) application.WebviewWindowOptions {
	return PrimaryWindowOptions(url)
}

func applyDesktopWindowChrome(options application.WebviewWindowOptions) application.WebviewWindowOptions {
	if runtime.GOOS == "darwin" {
		options.Frameless = false
		options.Mac.TitleBar = application.MacTitleBarHiddenInsetUnified
		options.Mac.TitleBar.ToolbarStyle = application.MacToolbarStyleUnifiedCompact
		options.Mac.InvisibleTitleBarHeight = desktopNativeTopInset
		options.JS = desktopChromeScript(true)
		options.CSS = escapeWailsCSS(desktopSidebarTransitionCSS + desktopNativeWindowInsetCSS)
		return options
	}
	options.Frameless = true
	options.JS = desktopChromeScript(false)
	return options
}
