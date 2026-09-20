package desktop

import (
	"os/exec"
	"strings"
	"testing"
)

func TestChromeWindowActionsWithoutWailsRuntime(t *testing.T) {
	node, err := exec.LookPath("node")
	if err != nil {
		t.Skip("node unavailable")
	}
	// Run the action installer extracted from the actual composed chrome script.
	script := desktopChromeScript(false)
	start := strings.Index(script, "// Desktop window action transport")
	if start < 0 {
		t.Fatal("remote Chat action transport is missing")
	}
	end := strings.Index(script[start:], "// End desktop window action transport")
	if end < 0 {
		t.Fatal("action transport terminator missing")
	}
	cmd := exec.Command(node, "--input-type=commonjs", "-e", `
const fs = require("node:fs"), vm = require("node:vm"), assert = require("node:assert/strict");
const source = fs.readFileSync(0,"utf8");
(async () => {
 for (const management of [false,true]) {
  const called=[],alerts=[];
  const window={wails:{},alert:msg=>alerts.push(msg)};
  if (management) window.wails.Window={Minimise:()=>called.push("minimize"),ToggleMaximise:()=>called.push("maximize"),Close:()=>called.push("close")};
  else window.__DSH_DESKTOP_WINDOW_ACTION__=action=>{called.push(action);return Promise.resolve();};
  const document={querySelector:()=>management?{}:null};
  vm.runInNewContext(source,{window,document});
  for(const action of ["minimize","maximize","close"]) window.__DSH_DESKTOP_REQUEST_WINDOW_ACTION__(action);
  if(!management) {window.__DSH_DESKTOP_REQUEST_WINDOW_ACTION__("settings");window.__DSH_DESKTOP_REQUEST_WINDOW_ACTION__("dismiss-config");}
  await Promise.resolve();await Promise.resolve();
  assert.deepEqual(called,management?["minimize","maximize","close"]:["minimize","maximize","close","settings","dismiss-config"]);
  assert.equal(alerts.length,0);
  if(!management) {delete window.__DSH_DESKTOP_WINDOW_ACTION__;window.__DSH_DESKTOP_REQUEST_WINDOW_ACTION__("close");await Promise.resolve();assert.equal(alerts.length,1,"missing transport must be visible, never poll forever");}
 }
})().catch(err=>{console.error(err);process.exitCode=1;});
`)
	cmd.Stdin = strings.NewReader(script[start : start+end])
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("%v\n%s", err, out)
	}
}
