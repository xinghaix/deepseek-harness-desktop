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
	return applyDesktopWindowChrome(options, true)
}

func ChatWindowOptions(url string) application.WebviewWindowOptions {
	options := application.WebviewWindowOptions{
		Name:               "dsh",
		Title:              "Deepseek Harness Desktop - DSH",
		Width:              1280,
		Height:             860,
		MinWidth:           900,
		MinHeight:          640,
		URL:                url,
		UseApplicationMenu: true,
		Windows:            application.WindowsWindow{Theme: application.SystemDefault},
		DevToolsEnabled:    false,
	}
	return applyDesktopWindowChrome(options, false)
}

func applyDesktopWindowChrome(options application.WebviewWindowOptions, management bool) application.WebviewWindowOptions {
	if runtime.GOOS == "darwin" {
		// macOS 使用原生 traffic lights。紧凑 unified 标题栏保留原生按钮，
		// 同时减少顶部垂直留白；注入 CSS/脚本使用同一安全区基准，避免按钮覆盖内容。
		options.Frameless = false
		options.Mac.TitleBar = application.MacTitleBarHiddenInsetUnified
		options.Mac.TitleBar.ToolbarStyle = application.MacToolbarStyleUnifiedCompact
		options.Mac.InvisibleTitleBarHeight = desktopNativeTopInset
		options.JS = desktopChromeScript(management, true)
		// CSS 由 WebView 在导航完成后直接注入，和异步挂载的 React DOM
		// 解耦；JS 仍负责给配置页和 sidebar 写入动态标记。
		options.CSS = escapeWailsCSS(desktopSidebarTransitionCSS + desktopNativeWindowInsetCSS)
		return options
	}
	options.Frameless = true
	options.JS = desktopChromeScript(management, false)
	return options
}
