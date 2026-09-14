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
	teal := 0
	// Top-right third: emerald pip (G dominant, jade/翠绿).
	for y := b.Min.Y; y < b.Min.Y+b.Dy()/3; y++ {
		for x := b.Max.X - b.Dx()/3; x < b.Max.X; x++ {
			r, g, bl, a := img.At(x, y).RGBA()
			if a > 0 && g > r+8<<8 && bl > r+5<<8 && g > 40<<8 {
				found = true
				teal++
			}
		}
	}
	if !found {
		t.Fatal("expected an emerald running pip in the top-right third of the icon")
	}
	if teal < 28 {
		t.Fatalf("teal badge too small for menu-bar visibility: %d pixels", teal)
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

func TestTrayIconBusyFramesStatic(t *testing.T) {
	base := loadSharedAppIcon(t)
	frames, err := trayIconBusyFrames(base)
	if err != nil {
		t.Fatal(err)
	}
	if len(frames) != 1 {
		t.Fatalf("got %d frames, want 1 static frame", len(frames))
	}
	still, err := trayIconWithRunningBadge(base, true)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(frames[0], still) {
		t.Fatal("busy frames should match the static running badge")
	}
}
