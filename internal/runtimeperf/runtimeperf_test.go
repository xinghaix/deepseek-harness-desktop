package runtimeperf

import (
	"runtime/debug"
	"testing"
)

func TestPprofAddr(t *testing.T) {
	t.Parallel()
	cases := []struct {
		in   string
		ok   bool
		addr string
	}{
		{"", false, ""},
		{"  ", false, ""},
		{"0", false, ""},
		{"off", false, ""},
		{"1", true, defaultPprofAddr},
		{"true", true, defaultPprofAddr},
		{"127.0.0.1:7070", true, "127.0.0.1:7070"},
	}
	for _, tc := range cases {
		addr, ok := pprofAddr(tc.in)
		if ok != tc.ok || addr != tc.addr {
			t.Fatalf("pprofAddr(%q)=(%q,%v), want (%q,%v)", tc.in, addr, ok, tc.addr, tc.ok)
		}
	}
}

func TestTuneRespectsOperatorEnv(t *testing.T) {
	debug.SetGCPercent(77)
	debug.SetMemoryLimit(64 << 20)
	t.Setenv("GOGC", "off")
	t.Setenv("GOMEMLIMIT", "64MiB")
	Tune()
	got := debug.SetGCPercent(-1)
	debug.SetGCPercent(got)
	if got != 77 {
		t.Fatalf("Tune must not override operator GOGC, got %d", got)
	}
	limit := debug.SetMemoryLimit(-1)
	debug.SetMemoryLimit(limit)
	if limit != 64<<20 {
		t.Fatalf("Tune must not override operator GOMEMLIMIT, got %d", limit)
	}
}

func TestTuneAppliesDesktopDefaults(t *testing.T) {
	t.Setenv("GOGC", "")
	t.Setenv("GOMEMLIMIT", "")
	Tune()
	got := debug.SetGCPercent(-1)
	debug.SetGCPercent(got)
	if got != defaultGOGC {
		t.Fatalf("GOGC=%d, want %d", got, defaultGOGC)
	}
	limit := debug.SetMemoryLimit(-1)
	debug.SetMemoryLimit(limit)
	if limit != defaultMemoryLimit {
		t.Fatalf("GOMEMLIMIT=%d, want %d", limit, defaultMemoryLimit)
	}
}
