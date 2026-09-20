//go:build wails

package desktop

import (
	"runtime"

	"deepseek-harness-desktop/internal/i18n"

	"github.com/wailsapp/wails/v3/pkg/application"
)

const (
	setupWindowName  = "main"
	configWindowName = "config"
	chatWindowName   = "dsh"
)

func ManagementWindowOptions(url string) application.WebviewWindowOptions {
	options := application.WebviewWindowOptions{
		Name:               setupWindowName,
		Title:              "Deepseek Harness Desktop",
		Width:              980,
		Height:             760,
		MinWidth:           760,
		MinHeight:          620,
		URL:                url,
		UseApplicationMenu: true,
		DevToolsEnabled:    false,
		Permissions:        deniedWebviewPermissions(),
	}
	return applyDesktopWindowChrome(options)
}

func ConfigModalWindowOptions(url string, locale string) application.WebviewWindowOptions {
	if locale == "" {
		locale = "en"
	}
	options := application.WebviewWindowOptions{
		Name:                  configWindowName,
		Title:                 i18n.T(locale, "window.config_title"),
		Width:                 720,
		Height:                680,
		MinWidth:              560,
		MinHeight:             480,
		URL:                   url,
		AlwaysOnTop:           true,
		Hidden:                true,
		Frameless:             true,
		DisableResize:         true,
		CloseButtonState:      application.ButtonHidden,
		MinimiseButtonState:   application.ButtonHidden,
		MaximiseButtonState:   application.ButtonHidden,
		FullscreenButtonState: application.ButtonHidden,
		UseApplicationMenu:    true,
		DevToolsEnabled:       false,
		Permissions:           deniedWebviewPermissions(),
		JS:                    desktopModalChromeJS,
	}
	if runtime.GOOS == "darwin" {
		// Default Frameless keeps NSWindowStyleMaskTitled|Closable so traffic
		// lights stay. A custom radius forces a true borderless window.
		options.Mac.InvisibleTitleBarHeight = 0
		options.Mac.CornerRadius = 12
	}
	return applyPlatformWindowRuntime(options)
}

func ChatWindowOptions(url string) application.WebviewWindowOptions {
	options := application.WebviewWindowOptions{
		Name:               chatWindowName,
		Title:              "Deepseek Harness Desktop",
		Width:              1280,
		Height:             860,
		MinWidth:           900,
		MinHeight:          640,
		URL:                url,
		UseApplicationMenu: true,
		DevToolsEnabled:    false,
		Permissions:        deniedWebviewPermissions(),
	}
	// applyDesktopWindowChrome already sets MacTitleBarHiddenInsetUnified, traffic
	// lights, and InvisibleTitleBarHeight = desktopNativeTopInset (Wails macOS
	// invisible native drag strip). Do NOT override Height to 0 — that kills
	// native drag. Zoom uses JS click-timing → ToggleChatZoom (not AppleActionOnDoubleClick).
	// Docs: https://v3.wails.io/features/windows/frameless/
	options = applyDesktopWindowChrome(options)
	// Remote Chat has only Wails Core: install gesture callbacks before signalling
	// native readiness so queued ExecJS and WindowRuntimeReady hooks can run.
	options.JS += desktopChatDragJS + desktopChatRuntimeScript(url)
	return options
}

const desktopModalChromeJS = "(function(){document.documentElement.classList.add('dsh-desktop-config','dsh-desktop-config-modal');var content=document.querySelector('body > .app-shell');if(content){content.classList.add('dsh-window-content','dsh-window-management');content.style.setProperty('--dsh-window-top-inset','0px');}})();"

const dimChatJS = "(function(){var id='dsh-desktop-config-dim';var el=document.getElementById(id);if(!el){el=document.createElement('div');el.id=id;el.style.cssText='position:fixed;inset:0;background:rgba(15,18,24,.42);z-index:2147483646;cursor:pointer';document.documentElement.appendChild(el);}el.onclick=function(){window.__DSH_DESKTOP_REQUEST_WINDOW_ACTION__('dismiss-config');};})();"
const undimChatJS = "var el=document.getElementById('dsh-desktop-config-dim');if(el)el.remove();"
const showDiscardConfigJS = "var el=document.getElementById('discard-config');if(el)el.hidden=false;"

func deniedWebviewPermissions() map[application.PermissionType]application.Permission {
	return map[application.PermissionType]application.Permission{
		application.PermissionMicrophone:    application.PermissionDeny,
		application.PermissionCamera:        application.PermissionDeny,
		application.PermissionGeolocation:   application.PermissionDeny,
		application.PermissionNotifications: application.PermissionDeny,
		application.PermissionClipboardRead: application.PermissionDeny,
	}
}

func applyDesktopWindowChrome(options application.WebviewWindowOptions) application.WebviewWindowOptions {
	options = applyPlatformWindowRuntime(options)
	options.DevToolsEnabled = false
	options.OpenInspectorOnStartup = false
	options.EnableFileDrop = false
	options.Permissions = deniedWebviewPermissions()
	if runtime.GOOS == "darwin" {
		options.Mac.WebviewPreferences.JavaScriptCanOpenWindowsAutomatically.Set(false)
		options.Frameless = false
		options.OpenInspectorOnStartup = false
		options.EnableFileDrop = false
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
