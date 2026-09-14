package desktop

import (
	"bytes"
	"image"
	"image/color"
	"image/draw"
	"image/png"
	"math"

	xdraw "golang.org/x/image/draw"
)

const (
	// Kept for callers that still reference the period; busy badge is static.
	trayBusyFramePeriod = 100
	// Canvas size for tray icons. NSStatusBar scales to ~18–22pt.
	trayIconCanvasSize = 64
	// Online-dot radius (~14% ≈ 9px at 64); 9% read as a speck in real menu bars.
	trayBusyDotFrac = 0.14
)

// trayIconWithRunningBadge returns base unchanged when running is false.
// When running, overlays a deep-teal status dot at the top-right (R2).
func trayIconWithRunningBadge(base []byte, running bool) ([]byte, error) {
	if !running {
		return base, nil
	}
	return trayIconBusyFrame(base)
}

// trayIconIdleCanvas downscales the app icon to the tray canvas so idle/busy
// SetIcon calls share the same pixel size (helps macOS status-item updates).
func trayIconIdleCanvas(base []byte) ([]byte, error) {
	if len(base) == 0 {
		return base, nil
	}
	src, err := png.Decode(bytes.NewReader(base))
	if err != nil {
		return base, err
	}
	canvas := resizeToTrayCanvas(src, trayIconCanvasSize)
	var buf bytes.Buffer
	if err := png.Encode(&buf, canvas); err != nil {
		return base, err
	}
	return buf.Bytes(), nil
}

// trayIconBusyFrames returns a single static badged frame (no animation).
func trayIconBusyFrames(base []byte) ([][]byte, error) {
	if len(base) == 0 {
		return nil, nil
	}
	still, err := trayIconBusyFrame(base)
	if err != nil {
		return nil, err
	}
	return [][]byte{still}, nil
}

func trayIconBusyFrame(base []byte) ([]byte, error) {
	if len(base) == 0 {
		return base, nil
	}
	src, err := png.Decode(bytes.NewReader(base))
	if err != nil {
		return base, err
	}
	canvas := resizeToTrayCanvas(src, trayIconCanvasSize)
	b := canvas.Bounds()
	w, h := b.Dx(), b.Dy()
	if w < 8 || h < 8 {
		return base, nil
	}
	out := image.NewRGBA(image.Rect(0, 0, w, h))
	draw.Draw(out, out.Bounds(), canvas, b.Min, draw.Src)

	minSide := w
	if h < minSide {
		minSide = h
	}
	r := float64(minSide) * trayBusyDotFrac
	if r < 3.0 {
		r = 3.0
	}
	if max := float64(minSide) * 0.16; r > max {
		r = max
	}
	margin := float64(minSide) * 0.06
	// Top-right: matches iOS/macOS/Android badge convention; clears the whale mark.
	cx := float64(w) - margin - r
	cy := margin + r

	// Light halo so the teal disc stays readable on dark menu bars / dark icon edges.
	fillCircle(out, cx, cy, r+1.5, color.NRGBA{R: 255, G: 255, B: 255, A: 220})
	// Deep teal (R2) — ocean-adjacent, not traffic-light green.
	fillCircle(out, cx, cy, r, color.NRGBA{R: 13, G: 148, B: 136, A: 255})

	var buf bytes.Buffer
	if err := png.Encode(&buf, out); err != nil {
		return base, err
	}
	return buf.Bytes(), nil
}

func resizeToTrayCanvas(src image.Image, size int) *image.RGBA {
	if size < 8 {
		size = 8
	}
	b := src.Bounds()
	w, h := b.Dx(), b.Dy()
	if w <= 0 || h <= 0 {
		return image.NewRGBA(image.Rect(0, 0, size, size))
	}
	if w <= size && h <= size {
		out := image.NewRGBA(image.Rect(0, 0, w, h))
		draw.Draw(out, out.Bounds(), src, b.Min, draw.Src)
		return out
	}
	out := image.NewRGBA(image.Rect(0, 0, size, size))
	xdraw.CatmullRom.Scale(out, out.Bounds(), src, b, draw.Src, nil)
	return out
}

func fillCircle(dst *image.RGBA, cx, cy, radius float64, col color.NRGBA) {
	if radius <= 0 {
		return
	}
	minX := int(math.Floor(cx - radius - 1))
	maxX := int(math.Ceil(cx + radius + 1))
	minY := int(math.Floor(cy - radius - 1))
	maxY := int(math.Ceil(cy + radius + 1))
	bounds := dst.Bounds()
	r2 := radius * radius
	for y := minY; y <= maxY; y++ {
		if y < bounds.Min.Y || y >= bounds.Max.Y {
			continue
		}
		for x := minX; x <= maxX; x++ {
			if x < bounds.Min.X || x >= bounds.Max.X {
				continue
			}
			dx := float64(x) + 0.5 - cx
			dy := float64(y) + 0.5 - cy
			d2 := dx*dx + dy*dy
			if d2 > r2 {
				continue
			}
			cover := 1.0
			edge := radius - math.Sqrt(d2)
			if edge < 1 {
				cover = edge
				if cover <= 0 {
					continue
				}
			}
			blendOver(dst, x, y, col, cover)
		}
	}
}

func blendOver(dst *image.RGBA, x, y int, col color.NRGBA, cover float64) {
	if cover <= 0 {
		return
	}
	if cover > 1 {
		cover = 1
	}
	a := float64(col.A) / 255 * cover
	if a <= 0 {
		return
	}
	i := dst.PixOffset(x, y)
	sr, sg, sb, sa := float64(dst.Pix[i]), float64(dst.Pix[i+1]), float64(dst.Pix[i+2]), float64(dst.Pix[i+3])/255
	outA := a + sa*(1-a)
	if outA <= 0 {
		return
	}
	dst.Pix[i+0] = uint8((float64(col.R)*a + sr*sa*(1-a)) / outA)
	dst.Pix[i+1] = uint8((float64(col.G)*a + sg*sa*(1-a)) / outA)
	dst.Pix[i+2] = uint8((float64(col.B)*a + sb*sa*(1-a)) / outA)
	dst.Pix[i+3] = uint8(outA * 255)
}
