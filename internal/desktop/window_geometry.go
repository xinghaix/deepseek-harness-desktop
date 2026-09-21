//go:build wails

package desktop

import (
	"deepseek-harness-desktop/internal/desktopstate"

	"github.com/wailsapp/wails/v3/pkg/application"
)

const (
	DefaultChatWidth  = 1280
	DefaultChatHeight = 860
	MinChatWidth      = 900
	MinChatHeight     = 640
	MaxChatWidth      = 16384
	MaxChatHeight     = 16384
	MaxCoordinate     = 32768
)

type ResolvedWindowGeometry struct {
	Width           int
	Height          int
	InitialPosition application.WindowStartPosition
	X               int
	Y               int
	Screen          *application.Screen
	StartState      application.WindowState
}

// ResolveChatWindowGeometry validates and clamps saved window dimensions and coordinates
// against connected screens. If the saved display was disconnected or resolution shrunk,
// it gracefully falls back to the primary screen centered and within work area bounds.
func ResolveChatWindowGeometry(saved *desktopstate.WindowState, screens []*application.Screen, primary *application.Screen) ResolvedWindowGeometry {
	width := DefaultChatWidth
	height := DefaultChatHeight
	startState := application.WindowStateNormal

	if saved != nil {
		if saved.Width > 0 {
			width = saved.Width
		}
		if saved.Height > 0 {
			height = saved.Height
		}
		if saved.Maximised {
			startState = application.WindowStateMaximised
		}
	}

	if width < MinChatWidth {
		width = MinChatWidth
	} else if width > MaxChatWidth {
		width = MaxChatWidth
	}
	if height < MinChatHeight {
		height = MinChatHeight
	} else if height > MaxChatHeight {
		height = MaxChatHeight
	}

	if len(screens) == 0 {
		return ResolvedWindowGeometry{
			Width:           width,
			Height:          height,
			InitialPosition: application.WindowCentered,
			StartState:      startState,
		}
	}

	var targetScreen *application.Screen
	displayChanged := false

	if saved != nil && (saved.DisplayID != "" || saved.DisplayName != "") {
		for _, s := range screens {
			if s == nil {
				continue
			}
			if saved.DisplayID != "" && s.ID == saved.DisplayID {
				targetScreen = s
				break
			}
			if targetScreen == nil && saved.DisplayName != "" && s.Name == saved.DisplayName {
				targetScreen = s
			}
		}
	}

	if targetScreen == nil {
		displayChanged = true
		if primary != nil {
			targetScreen = primary
		} else if len(screens) > 0 {
			targetScreen = screens[0]
		}
	}

	if targetScreen != nil && targetScreen.WorkArea.Width > 0 && targetScreen.WorkArea.Height > 0 {
		waW := targetScreen.WorkArea.Width
		waH := targetScreen.WorkArea.Height

		if width > waW {
			width = waW
		}
		if height > waH {
			height = waH
		}
		if waW >= MinChatWidth && width < MinChatWidth {
			width = MinChatWidth
		}
		if waH >= MinChatHeight && height < MinChatHeight {
			height = MinChatHeight
		}
	}

	initialPosition := application.WindowCentered
	relX := 0
	relY := 0

	if !displayChanged && saved != nil && saved.X >= 0 && saved.Y >= 0 && saved.X <= MaxCoordinate && saved.Y <= MaxCoordinate && targetScreen != nil {
		waW := targetScreen.WorkArea.Width
		waH := targetScreen.WorkArea.Height
		if waW > 0 && waH > 0 {
			maxX := waW - width
			if maxX < 0 {
				maxX = 0
			}
			maxY := waH - height
			if maxY < 0 {
				maxY = 0
			}
			relX = saved.X
			if relX > maxX {
				relX = maxX
			}
			relY = saved.Y
			if relY > maxY {
				relY = maxY
			}
			initialPosition = application.WindowXY
		}
	}

	return ResolvedWindowGeometry{
		Width:           width,
		Height:          height,
		InitialPosition: initialPosition,
		X:               relX,
		Y:               relY,
		Screen:          targetScreen,
		StartState:      startState,
	}
}

// ApplySavedChatWindowGeometry checks whether rememberWindowSize is enabled and applies
// the resolved geometry onto the WebviewWindowOptions.
func ApplySavedChatWindowGeometry(options application.WebviewWindowOptions) application.WebviewWindowOptions {
	file, err := desktopstate.Load()
	if err != nil {
		return options
	}
	if file.Prefs.RememberWindowSize != nil && !*file.Prefs.RememberWindowSize {
		return options
	}
	if file.WindowState == nil {
		return options
	}

	app := application.Get()
	var screens []*application.Screen
	var primary *application.Screen
	if app != nil && app.Screen != nil {
		screens = app.Screen.GetAll()
		primary = app.Screen.GetPrimary()
	}

	geom := ResolveChatWindowGeometry(file.WindowState, screens, primary)
	options.Width = geom.Width
	options.Height = geom.Height
	options.InitialPosition = geom.InitialPosition
	options.X = geom.X
	options.Y = geom.Y
	if geom.Screen != nil {
		options.Screen = geom.Screen
	}
	if geom.StartState != application.WindowStateNormal {
		options.StartState = geom.StartState
	}
	return options
}
