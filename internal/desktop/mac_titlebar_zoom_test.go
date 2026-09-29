//go:build wails

package desktop

import (
	"os/exec"
	"runtime"
	"strings"
	"testing"
)

// Replay the injected macOS Chat listener with a Core-only remote WebView.
func TestMacChatTitlebarDoubleClickZoom(t *testing.T) {
	node, err := exec.LookPath("node")
	if err != nil {
		t.Skip("node unavailable")
	}
	if strings.Contains(desktopChromeScript(true), "DSH_MAC_CHAT_TITLEBAR_ZOOM_BEGIN") {
		t.Fatal("management window must not install Chat titlebar gestures")
	}
	script := ChatWindowOptions("http://127.0.0.1:3080/").JS
	if runtime.GOOS != "darwin" {
		if strings.Contains(script, "DSH_MAC_CHAT_TITLEBAR_ZOOM_BEGIN") {
			t.Fatal("Windows/Linux Chat must not install macOS titlebar gestures")
		}
		return
	}
	start := strings.Index(script, "/* DSH_MAC_CHAT_TITLEBAR_ZOOM_BEGIN */")
	end := strings.Index(script, "/* DSH_MAC_CHAT_TITLEBAR_ZOOM_END */")
	if start < 0 || end <= start {
		t.Fatal("macOS Chat titlebar double-click has no zoom handler; text is selected instead")
	}
	if strings.Contains(desktopChromeScript(false), "DSH_MAC_CHAT_TITLEBAR_ZOOM_BEGIN") {
		t.Fatal("Windows/Linux must not install macOS titlebar gestures")
	}
	cmd := exec.Command(node, "--input-type=commonjs", "-e", `
const vm = require('node:vm');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const source = fs.readFileSync(0, 'utf8');
const listeners = [], actions = [];
const document = {
  querySelector: () => null,
  documentElement: {clientWidth: 1000},
  addEventListener: (type, fn, capture) => {
    assert.equal(type, 'mousedown');
    assert.equal(capture, true);
    listeners.push(fn);
  },
};
const window = {__DSH_DESKTOP_REQUEST_WINDOW_ACTION__: (action) => actions.push(action)};
const context = {window, document};
vm.runInNewContext(source, context);
vm.runInNewContext(source, context);
assert.equal(listeners.length, 1, 'listener must be idempotent');
function fire(extra = {}) {
  let prevented = false;
  const event = {
    isTrusted: true, button: 0, buttons: 1, detail: 2,
    clientX: 200, clientY: 15, target: {closest: () => null},
    preventDefault() { prevented = true; }, stopPropagation() {},
    ...extra,
  };
  for (const fn of listeners) fn(event);
  return prevented;
}
assert.equal(fire({detail: 1}), false, 'first click leaves native drag intact');
assert.equal(actions.length, 0);
assert.equal(fire(), true, 'second click prevents text selection');
assert.deepEqual(actions, ['maximize']);
for (const extra of [
  {isTrusted: false}, {button: 2}, {clientY: 37}, {clientX: 30},
  {clientX: 999}, {target: {closest: () => ({})}},
]) {
  actions.length = 0;
  assert.equal(fire(extra), false, 'non-titlebar gestures are left alone');
  assert.equal(actions.length, 0);
}
`)
	cmd.Stdin = strings.NewReader(script[start:end])
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("macOS Chat titlebar gesture: %v\n%s", err, out)
	}
}
