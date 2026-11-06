//go:build darwin

package dsh

import (
	"os"
	"testing"
)

func TestDarwinProcInfoSyscalls(t *testing.T) {
	self := os.Getpid()
	pids := darwinListAllPIDs()
	if len(pids) == 0 {
		t.Fatal("expected non-empty PID list from darwinListAllPIDs")
	}
	ppid, pgid, ok := darwinProcBSDInfo(self)
	if !ok || ppid <= 0 || pgid <= 0 {
		t.Fatalf("unexpected darwinProcBSDInfo(%d): ppid=%d pgid=%d ok=%v", self, ppid, pgid, ok)
	}
	resCoal, jetCoal, ok := darwinProcCoalition(self)
	if !ok || resCoal == 0 {
		t.Fatalf("unexpected darwinProcCoalition(%d): resource=%d jetsam=%d ok=%v", self, resCoal, jetCoal, ok)
	}
	path := darwinProcPath(self)
	if path == "" {
		t.Fatalf("expected non-empty process path for self pid %d", self)
	}
}

func TestIsProtectedDesktopOrXPCPath(t *testing.T) {
	protected := []string{
		"/Applications/Deepseek Harness.app/Contents/MacOS/Deepseek Harness",
		"/Users/u/dist/Deepseek Harness.app/Contents/MacOS/Deepseek Harness",
		"/System/Library/Frameworks/WebKit.framework/Versions/A/XPCServices/com.apple.WebKit.WebContent.xpc/Contents/MacOS/com.apple.WebKit.WebContent",
		"/Library/Apple/System/Library/PrivateFrameworks/Foo.xpc/Contents/MacOS/Foo",
	}
	for _, p := range protected {
		if !isProtectedDesktopOrXPCPath(p) {
			t.Fatalf("expected path %q to be protected", p)
		}
	}
	unprotected := []string{
		"/opt/homebrew/Cellar/node/26.8.2/bin/node",
		"/usr/bin/ssh",
		"/Users/u/.cache/uv/builds-v0/bin/python",
	}
	for _, p := range unprotected {
		if isProtectedDesktopOrXPCPath(p) {
			t.Fatalf("expected worker path %q not to be protected", p)
		}
	}
}
