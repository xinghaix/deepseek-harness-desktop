package desktop

import (
	"os/exec"
	"strings"
	"testing"
)

func TestMacContextCaptureUsesPublicMessage(t *testing.T) {
	node, err := exec.LookPath("node")
	if err != nil {
		t.Skip("node unavailable")
	}
	cmd := exec.Command(node, "--input-type=commonjs", "-e", `
const vm=require("node:vm"),fs=require("node:fs"),assert=require("node:assert/strict");
const handlers=[],payloads=[];
const native={postMessage(payload){assert.equal(this,native);payloads.push(payload);}};
const window={webkit:{messageHandlers:{dshContextMenu:native}},getSelection:()=>({toString:()=>"selected text"})};
const document={querySelector:()=>null,addEventListener(type,handler,capture){if(type==="contextmenu"&&capture)handlers.push(handler);}};
class Element {constructor(){this.style={removeProperty(){}};} closest(selector){return selector==="a[href]"?this:null;} getAttribute(){return "https://example.com/release";}}
vm.runInNewContext(fs.readFileSync(0,"utf8"),{window,document,Element,URL,location:new URL("http://127.0.0.1:3080/")});
let prevented=false;const event={target:new Element(),preventDefault(){prevented=true;}};
handlers[0](event);
assert.equal(payloads.length,1,"macOS must send menu data without private synchronous JavaScript");
assert.equal(payloads[0].text,"selected text");assert.equal(payloads[0].href,"https://example.com/release");
assert.equal(prevented,false,"native menu must not be cancelled");
window.getSelection=()=>({toString:()=>""});event.target.getAttribute=()=>"#local";handlers[0](event);
assert.equal(payloads.length,2);assert.equal(payloads[1].text,"");assert.equal(payloads[1].href,"","blank context must clear previous link");
`)
	cmd.Stdin = strings.NewReader(desktopExternalJS(false))
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("%v\n%s", err, out)
	}
}
