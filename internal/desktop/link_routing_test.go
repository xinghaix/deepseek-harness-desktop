package desktop

import (
	"os/exec"
	"strings"
	"testing"
)

// Replay DOM capture/target/bubble ordering against the actual injected script.
func TestDesktopLinkRouting(t *testing.T) {
	node, err := exec.LookPath("node")
	if err != nil {
		t.Skip("node unavailable")
	}
	for _, custom := range []bool{false, true} {
		cmd := exec.Command(node, "--input-type=commonjs", "-e", `
const vm = require("node:vm");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const listeners = [], calls = [];
const document = { querySelector: () => null, addEventListener(type, fn, capture) { if(type === "click" || type === "auxclick") listeners.push({type, fn, capture: !!capture}); } };
const window = { wails: { Call: { ByName: (...args) => calls.push(args) } }, open: () => "internal" };
vm.runInNewContext(fs.readFileSync(0, "utf8"), {document, window, URL, location: new URL("http://127.0.0.1:3080/")});
function click(href, handler, options = {}) {
 calls.length = 0;
 const link = href === null ? null : {getAttribute: () => href};
 const event = { type: "click", button: 0, target: {closest: () => link}, defaultPrevented: false, stopped: false, preventDefault() {this.defaultPrevented = true}, stopPropagation() {this.stopped = true}, ...options };
 for (const l of listeners.filter(l => l.type === event.type && l.capture)) l.fn(event);
 if (!event.stopped && handler) handler(event);
 if (!event.stopped) for (const l of listeners.filter(l => l.type === event.type && !l.capture)) l.fn(event);
 return event;
}
let sidebar = false;
click("https://github.com/xinghaix/deepseek-harness-desktop/releases/tag/v0.1.5", e => {e.preventDefault(); sidebar = true;});
assert.equal(sidebar, true, "DSH sidebar handler must receive link clicks");
assert.equal(calls.length, 0, "handled preview must not also launch browser");
let event = click("https://example.com/");
assert.equal(event.defaultPrevented, true, "unhandled external navigation must be blocked");
assert.deepEqual(calls, [["main.DSH.OpenExternalURL", "https://example.com/"]]);
event = click("/api/files/example");
assert.equal(event.defaultPrevented, false);
assert.equal(calls.length, 0, "same-origin files must stay in DSH");
event = click("file:///tmp/example");
assert.equal(event.defaultPrevented, true);
assert.equal(calls.length, 0, "unsupported schemes must not launch externally");
event = click("http://127.0.0.1:3080/?token=test");
assert.equal(calls.length, 0, "Chat token must not leave the WebView");
// File/resource/session/settings buttons must remain entirely owned by DSH.
for (const action of ["file#L24", "directory", "attachment", "image-preview", "session", "settings"]) {
 let invoked = false;
 event = click(null, () => {invoked = true;});
 assert.equal(invoked, true, action);
 assert.equal(event.defaultPrevented, false, action);
 assert.equal(calls.length, 0, action);
}
for (const modifier of ["ctrlKey", "metaKey", "shiftKey", "altKey"]) {
 event = click("https://example.com/", undefined, {[modifier]: true});
 assert.equal(event.defaultPrevented, true, modifier);
 assert.deepEqual(calls, [["main.DSH.OpenExternalURL", "https://example.com/"]]);
}
event = click("https://example.com/", undefined, {type: "auxclick", button: 1});
assert.equal(event.defaultPrevented, true, "middle-click must not fall through to WebView popup");
assert.deepEqual(calls, [["main.DSH.OpenExternalURL", "https://example.com/"]]);
event = click("https://example.com/", undefined, {type: "auxclick", button: 2});
assert.equal(event.defaultPrevented, false, "right-click must preserve context menu");
assert.equal(calls.length, 0);
// The sidebar toolbar uses window.open, not an anchor click.
calls.length = 0;
const releaseURL = "https://github.com/xinghaix/deepseek-harness-desktop/releases/tag/v0.1.5";
assert.equal(window.open(releaseURL, "_blank", "noopener,noreferrer"), null);
assert.deepEqual(calls, [["main.DSH.OpenExternalURL", releaseURL]], "sidebar open-in-system-browser must reach native bridge exactly once");
for (const blocked of ["javascript:alert(1)", "file:///tmp/example", "data:text/html,hello", "dsh-resource://file/session/test/path", "http://["]) {
 calls.length = 0;
 assert.equal(window.open(blocked, "_blank"), null);
 assert.equal(calls.length, 0, "unsupported URL must not reach native browser: " + blocked);
}
calls.length = 0;
assert.equal(window.open("/internal"), "internal");
assert.equal(window.open("http://127.0.0.1:3080/?token=test"), "internal");
assert.equal(calls.length, 0, "same-origin window.open must not leak Chat credentials");
// xterm OSC8 reserves a blank opener, clears opener, then assigns location.href.
const terminalWindow = window.open();
assert.equal(typeof terminalWindow, "object", "terminal must receive a deferred opener");
terminalWindow.opener = null;
terminalWindow.location.href = releaseURL;
assert.deepEqual(calls, [["main.DSH.OpenExternalURL", releaseURL]], "terminal OSC8 must route through native browser");
calls.length = 0;
const cancelledWindow = window.open();
cancelledWindow.close();
cancelledWindow.location.href = releaseURL;
assert.equal(calls.length, 0, "closed deferred opener must not navigate");
const unsafeWindow = window.open();
unsafeWindow.location.href = "file:///tmp/example";
assert.equal(calls.length, 0, "deferred opener must validate assigned URLs too");
// Actual remote Wails Chat exposes only an empty wails object, not Call.ByName.
window.wails = {};
const bridgeCalls = [];
window.__DSH_DESKTOP_OPEN_EXTERNAL_URL__ = url => {bridgeCalls.push(url); return Promise.resolve();};
window.open(releaseURL, "_blank", "noopener,noreferrer");
assert.deepEqual(bridgeCalls, [releaseURL], "remote Chat must use authenticated bridge without Wails Call runtime");
const alerts = [];
window.alert = message => alerts.push(message);
delete window.__DSH_DESKTOP_OPEN_EXTERNAL_URL__;
window.open(releaseURL);
assert.equal(alerts.length, 1, "missing transport must show failure instead of silently dropping click");
`)
		cmd.Stdin = strings.NewReader(desktopExternalJS(custom))
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("custom=%v: %v\n%s", custom, err, out)
		}
	}
}
