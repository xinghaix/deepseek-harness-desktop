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

	if saved != nil {
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
			if targetScreen == nil && s.Bounds.Width > 0 && s.Bounds.Height > 0 {
				if saved.X >= s.Bounds.X && saved.X < s.Bounds.X+s.Bounds.Width &&
					saved.Y >= s.Bounds.Y && saved.Y < s.Bounds.Y+s.Bounds.Height {
					targetScreen = s
				}
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

	initialPosition := application.WindowXY
	finalX := 0
	finalY := 0

	if targetScreen != nil && targetScreen.WorkArea.Width > 0 && targetScreen.WorkArea.Height > 0 {
		waX := targetScreen.WorkArea.X
		waY := targetScreen.WorkArea.Y
		waW := targetScreen.WorkArea.Width
		waH := targetScreen.WorkArea.Height

		if displayChanged || saved == nil || saved.X < -MaxCoordinate || saved.X > MaxCoordinate || saved.Y < -MaxCoordinate || saved.Y > MaxCoordinate {
			initialPosition = application.WindowCentered
			finalX = waX + (waW-width)/2
			finalY = waY + (waH-height)/2
		} else {
			minX := waX
			maxX := waX + waW - width
			minY := waY
			maxY := waY + waH - height
			if maxX < minX {
				maxX = minX
			}
			if maxY < minY {
				maxY = minY
			}
			finalX = saved.X
			if finalX < minX {
				finalX = minX
			} else if finalX > maxX {
				finalX = maxX
			}
			finalY = saved.Y
			if finalY < minY {
				finalY = minY
			} else if finalY > maxY {
				finalY = maxY
			}
		}
	}

	return ResolvedWindowGeometry{
		Width:           width,
		Height:          height,
		InitialPosition: initialPosition,
		X:               finalX,
		Y:               finalY,
		Screen:          nil,
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
