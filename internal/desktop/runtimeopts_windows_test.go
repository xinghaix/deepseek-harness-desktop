//go:build wails && windows

package desktop

import "testing"

func TestWindowsUseVisualHostingFromSessionName(t *testing.T) {
	t.Setenv("SESSIONNAME", "RDP-Tcp#3")
	if !windowsUseVisualHosting() {
		t.Fatal("RDP SESSIONNAME must enable WebView2 visual hosting")
	}
	t.Setenv("SESSIONNAME", "Console")
	// Console sessions may still be remote via GetSystemMetrics; only assert the RDP env path above.
}
