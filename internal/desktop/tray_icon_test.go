package desktop

import (
	"bytes"
	"image/png"
	"os"
	"path/filepath"
	"testing"
)

func TestTrayIconWithRunningBadgeIdleReturnsSameBytes(t *testing.T) {
	base := loadSharedAppIcon(t)
	got, err := trayIconWithRunningBadge(base, false)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(got, base) {
		t.Fatal("idle tray icon must reuse the original PNG bytes")
	}
}

func TestTrayIconWithRunningBadgeAddsPip(t *testing.T) {
	base := loadSharedAppIcon(t)
	got, err := trayIconWithRunningBadge(base, true)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Equal(got, base) {
		t.Fatal("running tray icon must differ from the base PNG")
	}
	img, err := png.Decode(bytes.NewReader(got))
	if err != nil {
		t.Fatal(err)
	}
	b := img.Bounds()
	if b.Dx() != trayIconCanvasSize || b.Dy() != trayIconCanvasSize {
		t.Fatalf("busy tray icon canvas = %dx%d, want %dx%d (menu-bar readable)", b.Dx(), b.Dy(), trayIconCanvasSize, trayIconCanvasSize)
	}
	found := false
	cyan := 0
	for y := b.Min.Y; y < b.Min.Y+b.Dy()/3; y++ {
		for x := b.Max.X - b.Dx()/3; x < b.Max.X; x++ {
			r, g, bl, a := img.At(x, y).RGBA()
			// Cyan/tech pip: strong blue-green, not the pale icon background.
			if a > 0 && bl > r+15<<8 && g > r+10<<8 {
				found = true
				cyan++
			}
		}
	}
	if !found {
		t.Fatal("expected a cyan running pip in the top-right third of the icon")
	}
	// At 64px canvas with ~24% ring + dark well, expect a clear cyan cluster.
	if cyan < 28 {
		t.Fatalf("cyan badge too small for menu-bar visibility: %d pixels", cyan)
	}
}

func loadSharedAppIcon(t *testing.T) []byte {
	t.Helper()
	path := filepath.Join("..", "..", "assets", "shared", "app-icon.png")
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return data
}

func TestTrayIconBusyFramesLoop(t *testing.T) {
	base := loadSharedAppIcon(t)
	frames, err := trayIconBusyFrames(base)
	if err != nil {
		t.Fatal(err)
	}
	if len(frames) != trayBusyFrameCount {
		t.Fatalf("got %d frames, want %d", len(frames), trayBusyFrameCount)
	}
	if bytes.Equal(frames[0], frames[trayBusyFrameCount/2]) {
		t.Fatal("animation frames should differ across the cycle")
	}
	img0, err := png.Decode(bytes.NewReader(frames[0]))
	if err != nil {
		t.Fatal(err)
	}
	if img0.Bounds().Dx() != trayIconCanvasSize {
		t.Fatalf("frame canvas width = %d, want %d", img0.Bounds().Dx(), trayIconCanvasSize)
	}
}
