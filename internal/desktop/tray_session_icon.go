package desktop

import (
	"bytes"
	"image"
	"image/color"
	"image/png"
	"sync"
)

// Menu-item status pips for recent sessions (NSMenuItem/Win/Linux SetBitmap).
//
// Size is 16×16 so AppKit treats the PNG as ~16pt. Wails darwin setMenuItemBitmap
// does [menuItem setImage:] without setSize; a 32×32 PNG becomes 32pt and is
// typically clipped/invisible in NSMenuItem. Colors: running = emerald 翠绿 #10B981;
// error = red #DC4446. SetBitmap alone is still unreliable in macOS status-item
// menus — traySessionMenuLabel uses 🟢/🔴 so menu rows show color; idle padded.
var (
	traySessionPipOnce sync.Once
	traySessionPipRun  []byte
	traySessionPipErr  []byte
)

const traySessionPipSize = 16

func traySessionRunningPipPNG() []byte {
	traySessionPipOnce.Do(initTraySessionPips)
	return traySessionPipRun
}

func traySessionErrorPipPNG() []byte {
	traySessionPipOnce.Do(initTraySessionPips)
	return traySessionPipErr
}

func initTraySessionPips() {
	traySessionPipRun = mustSessionPipPNG(color.NRGBA{R: 16, G: 185, B: 129, A: 255})
	traySessionPipErr = mustSessionPipPNG(color.NRGBA{R: 220, G: 68, B: 70, A: 255})
}

func mustSessionPipPNG(fill color.NRGBA) []byte {
	const size = traySessionPipSize
	img := image.NewRGBA(image.Rect(0, 0, size, size))
	cx, cy := float64(size)/2, float64(size)/2
	r := float64(size) * 0.36
	fillCircle(img, cx, cy, r+1.5, color.NRGBA{R: 255, G: 255, B: 255, A: 220})
	fillCircle(img, cx, cy, r, fill)
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		// Extremely unlikely; return empty so SetBitmap is skipped.
		return nil
	}
	return buf.Bytes()
}
