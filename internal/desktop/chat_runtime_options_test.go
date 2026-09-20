//go:build wails

package desktop

import (
	"strings"
	"testing"
)

func TestChatWindowRuntimeBootstrapIsScopedAndOrdered(t *testing.T) {
	chat := ChatWindowOptions("http://127.0.0.1:12345/?token=fixture-secret")
	action := strings.Index(chat.JS, "// Desktop window action transport")
	gesture := strings.Index(chat.JS, "__dshChatGestureInstaller")
	ready := strings.Index(chat.JS, "DSH_CHAT_RUNTIME_BEGIN")
	if action < 0 || gesture < action || ready < gesture {
		t.Fatal("Chat actions/gesture callbacks must precede native readiness")
	}
	if strings.Contains(chat.JS, "fixture-secret") || !strings.Contains(chat.JS, `expectedOrigin = "http://127.0.0.1:12345"`) {
		t.Fatal("bootstrap must pin exact origin without credentials")
	}
	for _, script := range []string{ManagementWindowOptions("/").JS, ConfigModalWindowOptions("/?modal=1", "en").JS} {
		if strings.Contains(script, "DSH_CHAT_RUNTIME_BEGIN") || strings.Contains(script, "__dshChatGestureInstaller") {
			t.Fatal("embedded pages must keep their official Wails runtime")
		}
	}
	if strings.Contains(dimChatJS, "wails.Call") || !strings.Contains(dimChatJS, "__DSH_DESKTOP_REQUEST_WINDOW_ACTION__('dismiss-config')") {
		t.Fatal("Chat backdrop must use authenticated action bridge")
	}
}
