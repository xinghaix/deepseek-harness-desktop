package desktop

import (
	"bytes"
	"image/png"
	"testing"
)

func TestTraySessionPipPNGIsMenuSized(t *testing.T) {
	for name, data := range map[string][]byte{
		"running": traySessionRunningPipPNG(),
		"error":   traySessionErrorPipPNG(),
	} {
		if len(data) == 0 {
			t.Fatalf("%s pip empty", name)
		}
		img, err := png.Decode(bytes.NewReader(data))
		if err != nil {
			t.Fatalf("%s decode: %v", name, err)
		}
		b := img.Bounds()
		if b.Dx() != traySessionPipSize || b.Dy() != traySessionPipSize {
			t.Fatalf("%s size = %dx%d, want %dx%d (NSMenuItem pt; Wails does not setSize)",
				name, b.Dx(), b.Dy(), traySessionPipSize, traySessionPipSize)
		}
	}
}
