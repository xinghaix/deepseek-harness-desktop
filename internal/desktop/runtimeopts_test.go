//go:build wails

package desktop

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/wailsapp/wails/v3/pkg/application"
)

func TestApplicationHostOptionsKeepLastWindowFromQuitting(t *testing.T) {
	win := ApplicationWindowsOptions()
	linux := ApplicationLinuxOptions()
	if !win.DisableQuitOnLastWindowClosed {
		t.Fatal("Windows must not quit when the last window is hidden")
	}
	if !linux.DisableQuitOnLastWindowClosed {
		t.Fatal("Linux must not quit when the last window is hidden")
	}
	if linux.ProgramName != linuxProgramName {
		t.Fatalf("Linux ProgramName=%q, want %q", linux.ProgramName, linuxProgramName)
	}
	if runtime.GOOS != "windows" && win.UseVisualHosting {
		t.Fatal("UseVisualHosting is RDP-only and must stay off on this OS")
	}
}

func TestWindowRuntimeEnablesLinuxGPUAndMoveDebounce(t *testing.T) {
	windows := []application.WebviewWindowOptions{
		ManagementWindowOptions("/"),
		ChatWindowOptions("http://127.0.0.1:1/"),
		ConfigModalWindowOptions("/?manage=1&modal=1", "en"),
	}
	for _, opts := range windows {
		if opts.Linux.WebviewGpuPolicy != application.WebviewGpuPolicyAlways {
			t.Fatalf("%s Linux GPU policy=%v, want Always", opts.Name, opts.Linux.WebviewGpuPolicy)
		}
		if opts.Linux.WindowDidMoveDebounceMS != windowMoveDebounceMS {
			t.Fatalf("%s Linux move debounce=%d", opts.Name, opts.Linux.WindowDidMoveDebounceMS)
		}
		if opts.Windows.WindowDidMoveDebounceMS != windowMoveDebounceMS {
			t.Fatalf("%s Windows move debounce=%d", opts.Name, opts.Windows.WindowDidMoveDebounceMS)
		}
		if !opts.Windows.NonClientRegionSupport {
			t.Fatalf("%s missing WebView2 NonClientRegionSupport", opts.Name)
		}
		if opts.Windows.Theme != application.SystemDefault {
			t.Fatalf("%s Windows theme=%v", opts.Name, opts.Windows.Theme)
		}
	}
}

func TestProductionBuildStripsSymbols(t *testing.T) {
	data, err := os.ReadFile(filepath.Join("..", "..", "scripts", "build.sh"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(data), "-s -w -X deepseek-harness-desktop/internal/version.Version=") {
		t.Fatal("scripts/build.sh must pass -s -w in production ldflags")
	}
}
