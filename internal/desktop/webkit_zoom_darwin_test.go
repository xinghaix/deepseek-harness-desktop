//go:build wails && darwin

package desktop

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

// Exercise the actual Objective-C hook without opening a window. The fake window
// has no WebView, but exposes the same KVC duration property as Wails.
func TestNativeZoomPreservesAnimationDuration(t *testing.T) {
	clang, err := exec.LookPath("clang")
	if err != nil {
		t.Skip("clang unavailable")
	}
	source, err := os.ReadFile(repoFile(t, "internal", "desktop", "webkit_fps_darwin.go"))
	if err != nil {
		t.Fatal(err)
	}
	start := strings.Index(string(source), "#import <Cocoa/Cocoa.h>")
	end := strings.Index(string(source), "*/")
	if start < 0 || end <= start {
		t.Fatal("missing native WebView hooks")
	}
	harness := string(source[start:end]) + `
#include <stdio.h>

@interface DSHZoomTimingProbe : NSObject
@property NSTimeInterval zoomAnimationDuration;
@property NSUInteger driverCalls;
- (NSView *)contentView;
@end
@implementation DSHZoomTimingProbe
- (NSView *)contentView { return nil; }
@end

static void dshProbeStartDriver(id self, SEL cmd) {
	DSHZoomTimingProbe *probe = (DSHZoomTimingProbe *)self;
	probe.driverCalls++;
}

int main(void) {
	@autoreleasepool {
		DSHZoomTimingProbe *probe = [DSHZoomTimingProbe new];
		dshOrigStartZoomAnimationDriverIMP = (IMP)dshProbeStartDriver;
		// Include a normal duration, a longer system duration and one below the
		// former 0.18s cap. Repeated zoom/restore must preserve every value.
		double durations[] = {0.30, 0.50, 0.12, 0.30};
		for (NSUInteger i = 0; i < sizeof(durations) / sizeof(durations[0]); i++) {
			probe.zoomAnimationDuration = durations[i];
			dshSwizzledStartZoomAnimationDriver(probe, @selector(startZoomAnimationDriver));
			if (probe.zoomAnimationDuration != durations[i] || probe.driverCalls != i + 1) {
				fprintf(stderr, "zoom duration %.3f became %.3f; driver calls %lu\n",
				        durations[i], probe.zoomAnimationDuration, (unsigned long)probe.driverCalls);
				return 1;
			}
		}
	}
	return 0;
}
`
	binary := filepath.Join(t.TempDir(), "zoom-timing")
	cmd := exec.Command(clang, "-x", "objective-c", "-framework", "Cocoa", "-framework", "WebKit", "-o", binary, "-")
	cmd.Stdin = strings.NewReader(harness)
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("compile native zoom timing probe: %v\n%s", err, out)
	}
	if out, err := exec.Command(binary).CombinedOutput(); err != nil {
		t.Fatalf("native zoom timing: %v\n%s", err, out)
	}
}
