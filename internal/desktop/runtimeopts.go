//go:build wails

package desktop

import "github.com/wailsapp/wails/v3/pkg/application"

const (
	windowMoveDebounceMS = 50
	linuxProgramName     = "deepseek-harness-desktop"
)

// StatusChangedEvent is a lightweight notify-pull signal. The payload is empty;
// listeners must call Status() rather than receiving logs through eval/events.
const StatusChangedEvent = "dsh:status"

// ApplicationWindowsOptions is the process-wide WebView2 host config.
// UseVisualHosting is RDP-only: it avoids multi-second DComp remarsals over
// remote sessions, but disables display-scale detection that mixed-DPI
// local setups need.
func ApplicationWindowsOptions() application.WindowsOptions {
	return application.WindowsOptions{
		DisableQuitOnLastWindowClosed: true,
		UseVisualHosting:              windowsUseVisualHosting(),
	}
}

// ApplicationLinuxOptions keeps Hide/close-to-tray from quitting when the last
// window is gone, matching macOS ApplicationShouldTerminateAfterLastWindowClosed.
func ApplicationLinuxOptions() application.LinuxOptions {
	return application.LinuxOptions{
		DisableQuitOnLastWindowClosed: true,
		ProgramName:                   linuxProgramName,
	}
}

func applyPlatformWindowRuntime(options application.WebviewWindowOptions) application.WebviewWindowOptions {
	options.Windows.Theme = application.SystemDefault
	options.Windows.NonClientRegionSupport = true
	options.Windows.WindowDidMoveDebounceMS = windowMoveDebounceMS
	// WebKitGTK 6 only honors ALWAYS / NEVER. Explicit Always counters the
	// historical v2 default of Never when Linux options were left unset.
	options.Linux.WebviewGpuPolicy = application.WebviewGpuPolicyAlways
	options.Linux.WindowDidMoveDebounceMS = windowMoveDebounceMS
	return options
}
