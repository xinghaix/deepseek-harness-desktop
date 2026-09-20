//go:build wails

package desktop

import (
	"deepseek-harness-desktop/internal/i18n"
	"testing"
)

func TestChatWindowActionAdapterMissingService(t *testing.T) {
	for _, action := range []string{"minimize", "maximize", "close", "settings", "dismiss-config"} {
		err := (bridgeHostAdapter{}).ChatWindowAction(action)
		if err == nil || err.Error() != i18n.TActive("err.app_not_ready") {
			t.Fatalf("%s missing app error=%v", action, err)
		}
	}
}
func TestChatWindowActionAdapterValidatesBeforeApp(t *testing.T) {
	err := (bridgeHostAdapter{}).ChatWindowAction("quit")
	if err == nil || err.Error() != i18n.TActive("bridge.err_not_allowed") {
		t.Fatalf("invalid action error=%v", err)
	}
}
