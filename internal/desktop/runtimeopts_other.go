//go:build wails && !windows

package desktop

func windowsUseVisualHosting() bool { return false }
