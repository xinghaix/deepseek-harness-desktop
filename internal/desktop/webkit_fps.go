//go:build wails

package desktop

import (
	"deepseek-harness-desktop/internal/desktopstate"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

var (
	chatIdeaDarkBackgroundRGBA    = application.RGBA{Red: 36, Green: 36, Blue: 36, Alpha: 255}
	chatDarkBackgroundRGBA        = application.RGBA{Red: 21, Green: 22, Blue: 26, Alpha: 255}
	chatLightBackgroundRGBA       = application.RGBA{Red: 255, Green: 255, Blue: 255, Alpha: 255}
	managementDarkBackgroundRGBA  = application.RGBA{Red: 27, Green: 31, Blue: 39, Alpha: 255}
	managementLightBackgroundRGBA = application.RGBA{Red: 247, Green: 248, Blue: 252, Alpha: 255}
)

func resolveChatBackgroundRGBA(themePref string, eyeCareEnabled bool, systemDark bool) application.RGBA {
	pref := normalizeThemePreference(themePref)
	switch pref {
	case "idea-dark":
		if eyeCareEnabled {
			return chatIdeaDarkBackgroundRGBA
		}
		return chatDarkBackgroundRGBA
	case "dark":
		return chatDarkBackgroundRGBA
	case "light":
		return chatLightBackgroundRGBA
	case "system":
		if systemDark {
			return chatDarkBackgroundRGBA
		}
		return chatLightBackgroundRGBA
	default:
		if eyeCareEnabled {
			return chatIdeaDarkBackgroundRGBA
		}
		if systemDark {
			return chatDarkBackgroundRGBA
		}
		return chatLightBackgroundRGBA
	}
}

func currentChatBackgroundRGBA() application.RGBA {
	eyeCare := true
	pref := ""
	if file, err := desktopstate.Load(); err == nil {
		if file.Prefs.EyeCareTheme != nil {
			eyeCare = *file.Prefs.EyeCareTheme
		}
		if file.Prefs.ThemePreference != nil {
			pref = *file.Prefs.ThemePreference
		}
	}
	return resolveChatBackgroundRGBA(pref, eyeCare, isPlatformDarkMode())
}

func currentManagementBackgroundRGBA() application.RGBA {
	if isPlatformDarkMode() {
		return managementDarkBackgroundRGBA
	}
	return managementLightBackgroundRGBA
}

func syncWindowThemeBackground(window application.Window) {
	if window == nil || window.NativeWindow() == nil {
		return
	}
	colour := currentManagementBackgroundRGBA()
	if window.Name() == chatWindowName {
		colour = currentChatBackgroundRGBA()
	}
	applyNativeWindowBackground(window, colour)
}

// TuneNativeWebView applies platform WebView runtime tweaks that Wails does not
// expose as window options. Safe to call more than once per window.
func TuneNativeWebView(window application.Window) {
	installNativeContextMenu()
	if window == nil {
		return
	}
	attached := attachNativeContextMenu(window)
	unlockWebKitDisplayRefresh(window)
	syncWindowThemeBackground(window)
	if window.NativeWindow() != nil && attached {
		return
	}
	window.RegisterHook(events.Common.WindowRuntimeReady, func(*application.WindowEvent) {
		attachNativeContextMenu(window)
		unlockWebKitDisplayRefresh(window)
		syncWindowThemeBackground(window)
	})
}

