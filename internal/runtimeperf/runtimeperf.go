package runtimeperf

import (
	"net/http"
	_ "net/http/pprof"
	"os"
	"runtime/debug"
	"strings"
)

const (
	// defaultGOGC is below Go's 100 so a desktop shell GCs more often and
	// keeps pause times short. WebView memory is outside the Go heap.
	defaultGOGC = 60
	// defaultMemoryLimit is a soft Go-heap cap. It is not a process RSS
	// limit; WKWebView/WebView2/WebKitGTK stay independent.
	defaultMemoryLimit = 512 << 20
	defaultPprofAddr   = "127.0.0.1:6060"
)

// Tune applies desktop-oriented GC defaults unless the operator already set
// GOGC / GOMEMLIMIT. Safe to call more than once.
func Tune() {
	if strings.TrimSpace(os.Getenv("GOGC")) == "" {
		debug.SetGCPercent(defaultGOGC)
	}
	if strings.TrimSpace(os.Getenv("GOMEMLIMIT")) == "" {
		debug.SetMemoryLimit(defaultMemoryLimit)
	}
}

// MaybeStartPprof starts a loopback pprof endpoint when DSH_DESKTOP_PPROF is
// set. Empty / 0 / false / off stay disabled. "1" / true / on use
// 127.0.0.1:6060; any other value is treated as the listen address.
func MaybeStartPprof() {
	addr, ok := pprofAddr(os.Getenv("DSH_DESKTOP_PPROF"))
	if !ok {
		return
	}
	go func() { _ = http.ListenAndServe(addr, nil) }()
}

func pprofAddr(raw string) (string, bool) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", false
	}
	switch strings.ToLower(raw) {
	case "0", "false", "off", "no":
		return "", false
	case "1", "true", "on", "yes":
		return defaultPprofAddr, true
	default:
		return raw, true
	}
}
