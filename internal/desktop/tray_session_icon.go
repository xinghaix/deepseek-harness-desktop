package desktop

import (
	"bytes"
	"image"
	"image/color"
	"image/png"
	"sync"
)

// Menu-item status pips for recent sessions (NSMenuItem/Win/Linux SetBitmap).
// Colors: running = deep-teal R2; error = macOS-ish system red.
var (
	traySessionPipOnce sync.Once
	traySessionPipRun  []byte
	traySessionPipErr  []byte
)

func traySessionRunningPipPNG() []byte {
	traySessionPipOnce.Do(initTraySessionPips)
	return traySessionPipRun
}

func traySessionErrorPipPNG() []byte {
	traySessionPipOnce.Do(initTraySessionPips)
	return traySessionPipErr
}

func initTraySessionPips() {
	traySessionPipRun = mustSessionPipPNG(color.NRGBA{R: 13, G: 148, B: 136, A: 255})
	traySessionPipErr = mustSessionPipPNG(color.NRGBA{R: 220, G: 68, B: 70, A: 255})
}

func mustSessionPipPNG(fill color.NRGBA) []byte {
	const size = 32
	img := image.NewRGBA(image.Rect(0, 0, size, size))
	cx, cy := float64(size)/2, float64(size)/2
	r := float64(size) * 0.28
	fillCircle(img, cx, cy, r+1.5, color.NRGBA{R: 255, G: 255, B: 255, A: 220})
	fillCircle(img, cx, cy, r, fill)
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		// Extremely unlikely; return empty so SetBitmap is skipped.
		return nil
	}
	return buf.Bytes()
}
