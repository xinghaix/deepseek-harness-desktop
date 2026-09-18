package desktop

import (
	"testing"

	"deepseek-harness-desktop/internal/desktopstate"
)

// The floating prompt card caps its text lines. Prefs are stored as plain ints, so the
// clamp is the only thing keeping a hand-edited desktop-state.json (or a stale renderer)
// from producing an unusable card.
func TestPromptOverlayMaxLinesClamps(t *testing.T) {
	cases := []struct {
		name string
		in   int
		want int
	}{
		{"well below the floor", -40, minPromptOverlayMaxLines},
		{"just below the floor", 1, minPromptOverlayMaxLines},
		{"floor", minPromptOverlayMaxLines, minPromptOverlayMaxLines},
		{"middle", 9, 9},
		{"ceiling", maxPromptOverlayMaxLines, maxPromptOverlayMaxLines},
		{"just above the ceiling", 22, maxPromptOverlayMaxLines},
		{"far above the ceiling", 100000, maxPromptOverlayMaxLines},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := clampPromptOverlayMaxLines(tc.in); got != tc.want {
				t.Fatalf("clampPromptOverlayMaxLines(%d) = %d, want %d", tc.in, got, tc.want)
			}
		})
	}
}

func TestPromptOverlayMaxLinesDefaultsAndPersists(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("DSH_DESKTOP_STATE_DIR", dir)
	desktopstate.ResetCacheForTest()
	var p desktopPrefs
	p.load()
	if got := int(p.promptOverlayMaxLines.Load()); got != defaultPromptOverlayMaxLines {
		t.Fatalf("default max lines = %d, want %d", got, defaultPromptOverlayMaxLines)
	}
	// The default must sit inside the advertised range.
	if defaultPromptOverlayMaxLines < minPromptOverlayMaxLines || defaultPromptOverlayMaxLines > maxPromptOverlayMaxLines {
		t.Fatalf("default %d is outside [%d, %d]", defaultPromptOverlayMaxLines, minPromptOverlayMaxLines, maxPromptOverlayMaxLines)
	}

	if got := clampPromptOverlayMaxLines(8); got != 8 {
		t.Fatalf("sanity clamp = %d", got)
	}
	p.promptOverlayMaxLines.Store(int32(clampPromptOverlayMaxLines(8)))
	if err := p.save(); err != nil {
		t.Fatal(err)
	}

	file, err := desktopstate.Load()
	if err != nil {
		t.Fatal(err)
	}
	if file.Prefs.PromptOverlayMaxLines == nil || *file.Prefs.PromptOverlayMaxLines != 8 {
		t.Fatalf("persisted max lines = %v", file.Prefs.PromptOverlayMaxLines)
	}

	desktopstate.ResetCacheForTest()
	var p2 desktopPrefs
	p2.load()
	if got := int(p2.promptOverlayMaxLines.Load()); got != 8 {
		t.Fatalf("reloaded max lines = %d, want 8", got)
	}
}

// An out-of-range value already on disk must be clamped on load rather than trusted.
func TestPromptOverlayMaxLinesClampsOnLoad(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("DSH_DESKTOP_STATE_DIR", dir)
	desktopstate.ResetCacheForTest()
	tooBig := 999
	if err := desktopstate.Update(func(f *desktopstate.File) {
		f.Prefs.PromptOverlayMaxLines = &tooBig
	}); err != nil {
		t.Fatal(err)
	}
	desktopstate.ResetCacheForTest()
	var p desktopPrefs
	p.load()
	if got := int(p.promptOverlayMaxLines.Load()); got != maxPromptOverlayMaxLines {
		t.Fatalf("loaded max lines = %d, want the ceiling %d", got, maxPromptOverlayMaxLines)
	}
}
