//go:build wails

package desktop

import (
	"testing"

	"deepseek-harness-desktop/internal/desktopstate"

	"github.com/wailsapp/wails/v3/pkg/application"
)

func TestResolveChatWindowGeometry_NilState(t *testing.T) {
	primary := &application.Screen{
		ID:       "screen-1",
		Name:     "Built-in Display",
		WorkArea: application.Rect{X: 0, Y: 25, Width: 1440, Height: 875},
	}
	screens := []*application.Screen{primary}

	geom := ResolveChatWindowGeometry(nil, screens, primary)
	if geom.Width != DefaultChatWidth || geom.Height != DefaultChatHeight {
		t.Fatalf("expected default %dx%d, got %dx%d", DefaultChatWidth, DefaultChatHeight, geom.Width, geom.Height)
	}
	if geom.InitialPosition != application.WindowCentered {
		t.Fatalf("expected WindowCentered, got %v", geom.InitialPosition)
	}
	if geom.StartState != application.WindowStateNormal {
		t.Fatalf("expected WindowStateNormal, got %v", geom.StartState)
	}
}

func TestResolveChatWindowGeometry_MinBoundsClamping(t *testing.T) {
	primary := &application.Screen{
		ID:       "screen-1",
		WorkArea: application.Rect{X: 0, Y: 0, Width: 1920, Height: 1080},
	}
	screens := []*application.Screen{primary}

	saved := &desktopstate.WindowState{
		Width:  400, // too small
		Height: 300, // too small
	}

	geom := ResolveChatWindowGeometry(saved, screens, primary)
	if geom.Width != MinChatWidth || geom.Height != MinChatHeight {
		t.Fatalf("expected min bounds %dx%d, got %dx%d", MinChatWidth, MinChatHeight, geom.Width, geom.Height)
	}
}

func TestResolveChatWindowGeometry_WorkAreaClamping(t *testing.T) {
	// Small laptop screen
	primary := &application.Screen{
		ID:       "screen-laptop",
		WorkArea: application.Rect{X: 0, Y: 0, Width: 1366, Height: 768},
	}
	screens := []*application.Screen{primary}

	saved := &desktopstate.WindowState{
		DisplayID: "screen-laptop",
		Width:     2560, // from external 4K screen
		Height:    1440,
	}

	geom := ResolveChatWindowGeometry(saved, screens, primary)
	if geom.Width > 1366 || geom.Height > 768 {
		t.Fatalf("expected clamped to work area <= 1366x768, got %dx%d", geom.Width, geom.Height)
	}
}

func TestResolveChatWindowGeometry_MultiMonitorDisconnectFallback(t *testing.T) {
	primary := &application.Screen{
		ID:       "screen-builtin",
		Name:     "Built-in Display",
		WorkArea: application.Rect{X: 0, Y: 25, Width: 1440, Height: 875},
	}
	// External monitor was disconnected, only primary remains in screens
	screens := []*application.Screen{primary}

	saved := &desktopstate.WindowState{
		DisplayID:   "screen-external-4k",
		DisplayName: "LG UltraFine 4K",
		Width:       1600,
		Height:      1000,
		X:           200,
		Y:           150,
	}

	geom := ResolveChatWindowGeometry(saved, screens, primary)
	// Must fall back to primary screen and center
	if geom.Screen != primary {
		t.Fatalf("expected fallback to primary screen, got %v", geom.Screen)
	}
	if geom.InitialPosition != application.WindowCentered {
		t.Fatalf("expected WindowCentered on fallback display, got %v", geom.InitialPosition)
	}
	// Must clamp to primary work area
	if geom.Width > 1440 || geom.Height > 875 {
		t.Fatalf("expected clamped to primary work area <= 1440x875, got %dx%d", geom.Width, geom.Height)
	}
}

func TestResolveChatWindowGeometry_MultiMonitorConnectedPreservesPosition(t *testing.T) {
	primary := &application.Screen{
		ID:       "screen-builtin",
		Name:     "Built-in Display",
		WorkArea: application.Rect{X: 0, Y: 0, Width: 1440, Height: 900},
	}
	external := &application.Screen{
		ID:       "screen-external",
		Name:     "External Monitor",
		WorkArea: application.Rect{X: 1440, Y: 0, Width: 2560, Height: 1440},
	}
	screens := []*application.Screen{primary, external}

	saved := &desktopstate.WindowState{
		DisplayID:   "screen-external",
		DisplayName: "External Monitor",
		Width:       1400,
		Height:      900,
		X:           100,
		Y:           120,
	}

	geom := ResolveChatWindowGeometry(saved, screens, primary)
	if geom.Screen != external {
		t.Fatalf("expected external screen, got %v", geom.Screen)
	}
	if geom.InitialPosition != application.WindowXY {
		t.Fatalf("expected WindowXY, got %v", geom.InitialPosition)
	}
	if geom.X != 100 || geom.Y != 120 {
		t.Fatalf("expected X=100, Y=120, got X=%d, Y=%d", geom.X, geom.Y)
	}
}

func TestResolveChatWindowGeometry_MaximisedState(t *testing.T) {
	primary := &application.Screen{
		ID:       "screen-1",
		WorkArea: application.Rect{X: 0, Y: 0, Width: 1920, Height: 1080},
	}
	screens := []*application.Screen{primary}

	saved := &desktopstate.WindowState{
		DisplayID: "screen-1",
		Width:     1280,
		Height:    860,
		Maximised: true,
	}

	geom := ResolveChatWindowGeometry(saved, screens, primary)
	if geom.StartState != application.WindowStateMaximised {
		t.Fatalf("expected WindowStateMaximised, got %v", geom.StartState)
	}
}

func TestResolveChatWindowGeometry_TamperedValues(t *testing.T) {
	primary := &application.Screen{
		ID:       "screen-1",
		WorkArea: application.Rect{X: 0, Y: 0, Width: 1920, Height: 1080},
	}
	screens := []*application.Screen{primary}

	saved := &desktopstate.WindowState{
		DisplayID: "screen-1",
		Width:     99999999, // extremely large
		Height:    -100,     // negative
		X:         -9999999, // out of bounds
		Y:         9999999,  // out of bounds
	}

	geom := ResolveChatWindowGeometry(saved, screens, primary)
	if geom.Width != 1920 || geom.Height != DefaultChatHeight {
		t.Fatalf("expected width clamped to work area (1920) and height fallback to default (860), got %dx%d", geom.Width, geom.Height)
	}
	if geom.InitialPosition != application.WindowCentered {
		t.Fatalf("expected WindowCentered for invalid X/Y, got %v", geom.InitialPosition)
	}
}

