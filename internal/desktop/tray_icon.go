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
	trayBusyFrameCount  = 12
	trayBusyFramePeriod = 100 // ms between frames ≈ 10fps; SetIcon-friendly on macOS
	// Canvas size for tray icons. NSStatusBar scales to ~18–22pt; drawing the
	// badge on a huge 1024px app icon left a ~0.5px pip after downscale.
	trayIconCanvasSize = 64
	// Compact but readable corner badge fraction of the 64px canvas (~22–26%).
	trayBusyBadgeFrac = 0.24
)

// trayIconWithRunningBadge returns base unchanged when running is false.
// When running, it builds a mid-cycle still (for tests / static busy fallback).
func trayIconWithRunningBadge(base []byte, running bool) ([]byte, error) {
	if !running {
		return base, nil
	}
	return trayIconBusyFrame(base, 0)
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

// trayIconBusyFrames builds a looping tech-style activity badge: thin cyan
// ring, short sweep, and a tiny pulse dot (readable at menu-bar size).
func trayIconBusyFrames(base []byte) ([][]byte, error) {
	if len(base) == 0 {
		return nil, nil
	}
	frames := make([][]byte, 0, trayBusyFrameCount)
	for i := 0; i < trayBusyFrameCount; i++ {
		pngBytes, err := trayIconBusyFrame(base, i)
		if err != nil {
			return nil, err
		}
		frames = append(frames, pngBytes)
	}
	return frames, nil
}

func trayIconBusyFrame(base []byte, frame int) ([]byte, error) {
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
	// ~24% of 64px ≈ 15px radius → ~4–5px at menu-bar size; still compact, actually visible.
	outer := float64(minSide) * trayBusyBadgeFrac
	if outer < 6 {
		outer = 6
	}
	if max := float64(minSide) * 0.26; outer > max {
		outer = max
	}
	margin := float64(minSide) * 0.05
	// Top-right, inset so the ring sits in the corner and leaves the logo body clear.
	cx := float64(w) - margin - outer
	cy := margin + outer

	phase := float64(frame%trayBusyFrameCount) / float64(trayBusyFrameCount) // 0..1
	pulse := 0.78 + 0.22*math.Sin(phase*2*math.Pi)

	// Dark well under the badge for contrast on both light and dark menu bars.
	fillCircle(out, cx, cy, outer*1.08, color.NRGBA{R: 6, G: 10, B: 16, A: 235})

	// Thin high-contrast cyan track ring.
	strokeCircle(out, cx, cy, outer*0.86, 1.85, color.NRGBA{R: 34, G: 211, B: 238, A: uint8(170 + 50*pulse)})

	// Short sweep arc + tip spark.
	sweepStart := phase * 2 * math.Pi
	ringR := outer * 0.86
	strokeArc(out, cx, cy, ringR, 2.05, sweepStart, sweepStart+1.15, color.NRGBA{R: 165, G: 243, B: 252, A: 250})
	tipX := cx + math.Cos(sweepStart+1.15)*ringR
	tipY := cy + math.Sin(sweepStart+1.15)*ringR
	fillCircle(out, tipX, tipY, 1.55, color.NRGBA{R: 240, G: 253, B: 255, A: 255})

	// Compact center pulse (tech “alive” cue; not a huge solid disc).
	dotR := 1.55 + 0.45*pulse
	fillCircle(out, cx, cy, dotR, color.NRGBA{R: 56, G: 189, B: 248, A: uint8(210 + 45*pulse)})

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
	// Already small enough (and square-ish): keep pixels, just copy.
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

func strokeCircle(dst *image.RGBA, cx, cy, radius, thickness float64, col color.NRGBA) {
	if radius <= 0 || thickness <= 0 {
		return
	}
	inner := radius - thickness*0.5
	outer := radius + thickness*0.5
	if inner < 0 {
		inner = 0
	}
	minX := int(math.Floor(cx - outer - 1))
	maxX := int(math.Ceil(cx + outer + 1))
	minY := int(math.Floor(cy - outer - 1))
	maxY := int(math.Ceil(cy + outer + 1))
	bounds := dst.Bounds()
	inner2, outer2 := inner*inner, outer*outer
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
			if d2 < inner2 || d2 > outer2 {
				continue
			}
			d := math.Sqrt(d2)
			cover := 1.0
			if d < inner+1 {
				cover = d - inner
			} else if d > outer-1 {
				cover = outer - d
			}
			if cover <= 0 {
				continue
			}
			if cover > 1 {
				cover = 1
			}
			blendOver(dst, x, y, col, cover)
		}
	}
}

func strokeArc(dst *image.RGBA, cx, cy, radius, thickness, start, end float64, col color.NRGBA) {
	if radius <= 0 || thickness <= 0 {
		return
	}
	for end < start {
		end += 2 * math.Pi
	}
	steps := int(radius*2*(end-start)) + 12
	if steps < 16 {
		steps = 16
	}
	for i := 0; i <= steps; i++ {
		t := float64(i) / float64(steps)
		ang := start + (end-start)*t
		fade := 0.35 + 0.65*t
		c := col
		c.A = uint8(float64(col.A) * fade)
		px := cx + math.Cos(ang)*radius
		py := cy + math.Sin(ang)*radius
		fillCircle(dst, px, py, thickness*0.55, c)
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
