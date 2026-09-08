//go:build wails

package desktop

import (
	"runtime"

	"github.com/wailsapp/wails/v3/pkg/application"
)

func ManagementWindowOptions(url string) application.WebviewWindowOptions {
	options := application.WebviewWindowOptions{
		Name:               "main",
		Title:              "Deepseek Harness Desktop",
		Width:              980,
		Height:             760,
		MinWidth:           760,
		MinHeight:          620,
		URL:                url,
		UseApplicationMenu: true,
		Windows:            application.WindowsWindow{Theme: application.SystemDefault},
		DevToolsEnabled:    false,
	}
	return applyDesktopWindowChrome(options)
}

func ConfigModalWindowOptions(url string) application.WebviewWindowOptions {
	options := ManagementWindowOptions(url)
	options.Width = 720
	options.Height = 680
	options.MinWidth = 640
	options.MinHeight = 520
	options.AlwaysOnTop = true
	options.Hidden = true
	options.Title = "桌面配置"
	return options
}

func ChatWindowOptions(url string) application.WebviewWindowOptions {
	options := application.WebviewWindowOptions{
		Name:               "dsh",
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

const dimChatJS = "(function(){var id='dsh-desktop-config-dim';if(document.getElementById(id))return;var el=document.createElement('div');el.id=id;el.style.cssText='position:fixed;inset:0;background:rgba(15,18,24,.42);z-index:2147483646;pointer-events:none';document.documentElement.appendChild(el);})();"
const undimChatJS = "var el=document.getElementById('dsh-desktop-config-dim');if(el)el.remove();"

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
