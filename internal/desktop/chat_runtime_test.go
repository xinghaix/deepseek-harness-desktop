package desktop

import (
	"os/exec"
	"strings"
	"testing"
)

func TestChatRuntimeRejectsInvalidOrigins(t *testing.T) {
	for _, raw := range []string{"", "https://127.0.0.1:3080/", "http://localhost:3080/", "http://127.0.0.1/", "http://127.0.0.1:3080.evil/", "wails://localhost/", "http://user:pass@127.0.0.1:3080/"} {
		if desktopChatRuntimeScript(raw) != "" {
			t.Errorf("accepted %q", raw)
		}
	}
	script := desktopChatRuntimeScript("http://127.0.0.1:3080/?token=secret")
	if script == "" || strings.Contains(script, "secret") {
		t.Fatal("must embed only validated origin, never token")
	}
}

func TestChatRuntimeCanonicalOrigin(t *testing.T) {
	for _, item := range []struct{ url, origin string }{
		{"http://127.0.0.1:80/?token=secret", "http://127.0.0.1"},
		{"http://127.0.0.1:03080/?token=secret", "http://127.0.0.1:3080"},
	} {
		script := desktopChatRuntimeScript(item.url)
		if !strings.Contains(script, `const expectedOrigin = "`+item.origin+`";`) || strings.Contains(script, "secret") {
			t.Errorf("origin normalization failed: %q", item.url)
		}
	}
}

func TestChatRuntimeBootstrap(t *testing.T) {
	node, err := exec.LookPath("node")
	if err != nil {
		t.Skip("node unavailable")
	}
	cmd := exec.Command(node, "--input-type=commonjs", "-e", chatRuntimeReplay)
	cmd.Stdin = strings.NewReader(desktopChatRuntimeScript("http://127.0.0.1:3080/?token=secret"))
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("runtime bootstrap replay: %v\n%s", err, out)
	}
}

const chatRuntimeReplay = `
const vm = require('node:vm'), assert = require('node:assert/strict');
const script = require('node:fs').readFileSync(0, 'utf8');
function page(opts={}) {
 const calls=[], timers=new Map(), listeners=new Map(); let next=0;
 const window={wails:{}, _wails:{environment:{OS:opts.os || 'darwin'}, invoke(msg){calls.push(msg);}}};
 window.top=opts.frame ? {} : window;
 if(opts.full) window.wails.Call={ByName(){}};
 if(opts.noInvoke) delete window._wails.invoke;
 const document={querySelector(){return opts.management ? {} : null;}};
 window.addEventListener=(n,f)=>{if(!listeners.has(n))listeners.set(n,new Set());listeners.get(n).add(f);};
 window.removeEventListener=(n,f)=>listeners.get(n)?.delete(f);
 const ctx=vm.createContext({window,document,location:new URL(opts.url || 'http://127.0.0.1:3080/'),setTimeout(f){const id=++next;timers.set(id,f);return id;},clearTimeout(id){timers.delete(id);}});
 function run(){vm.runInContext(script,ctx);}
 function event(){for(const f of [...(listeners.get('wails:runtime-config-ready')||[])])f();}
 function drain(){let count=0;while(timers.size){assert.ok(++count<200,'unbounded retry');const [id,fn]=timers.entries().next().value;timers.delete(id);fn();}return count;}
 return {window,calls,timers,listeners,run,event,drain};
}
let p=page();p.run();assert.deepEqual(p.calls,['wails:runtime:ready']);p.run();p.event();p.drain();assert.equal(p.calls.length,1);
for(const name of ['dispatchWailsEvent','handleDragEnter','handleDragLeave','handleDragOver','handlePlatformFileDrop','setResizable']) assert.equal(typeof p.window._wails[name],'function',name);
assert.equal(p.window.wails.Call,undefined);
assert.equal(p.listeners.get('wails:runtime-config-ready').size,0);
// A new document has a new window: signal once again, not once per application.
const fresh=page();fresh.run();assert.equal(fresh.calls.length,1);
for(const opts of [{frame:true},{management:true},{full:true},{url:'wails://localhost/'},{url:'http://127.0.0.1:3081/'},{url:'http://localhost:3080/'},{url:'https://127.0.0.1:3080/'},{url:'http://evil.example:3080/'}]) {
 const p=page(opts);p.run();p.drain();assert.equal(p.calls.length,0,JSON.stringify(opts));
}
p=page({noInvoke:true});p.run();assert.equal(p.calls.length,0);p.window._wails.invoke=msg=>p.calls.push(msg);p.event();p.drain();assert.equal(p.calls.length,1);
p=page({noInvoke:true});p.run();assert.ok(p.drain()<=100);p.window._wails.invoke=msg=>p.calls.push(msg);p.event();assert.equal(p.calls.length,0,'expired retries must clean event listener');
p=page({noInvoke:true});p.run();p.window.wails.Call={ByName(){}};p.window._wails.invoke=msg=>p.calls.push(msg);p.event();p.drain();assert.equal(p.calls.length,0,'full runtime takeover owns readiness');
for(const os of ['windows','linux']) {
 p=page({os});p.run();assert.equal(p.calls.length,0,'wait for real drag setter');const setter=()=>{};p.window._wails.setResizable=setter;p.event();p.drain();assert.equal(p.calls.length,1);assert.equal(p.window._wails.setResizable,setter);
}
p=page();const sentinel=()=>{};for(const name of ['dispatchWailsEvent','handleDragEnter','handleDragLeave','handleDragOver','handlePlatformFileDrop','setResizable'])p.window._wails[name]=sentinel;p.run();for(const name of ['dispatchWailsEvent','handleDragEnter','handleDragLeave','handleDragOver','handlePlatformFileDrop','setResizable'])assert.equal(p.window._wails[name],sentinel);
p=page({os:'windows'});p.window._wails.setResizable=()=>{};const webview={postMessage(msg){assert.equal(this,webview,'WebView2 requires native receiver');p.calls.push(msg);}};p.window.chrome={webview};p.window._wails.invoke=webview.postMessage;p.run();assert.deepEqual(p.calls,['wails:runtime:ready']);assert.equal(p.window.__DSH_DESKTOP_CHAT_RUNTIME__.status,'ready');
p=page();p.window._wails.invoke=()=>{throw new Error('bridge failure');};p.run();p.event();p.drain();assert.equal(p.window.__DSH_DESKTOP_CHAT_RUNTIME__.status,'failed');
console.log('PASS: origin/frame/full-runtime guards; callback preservation; bounded delayed ready; once per document; WebView2 receiver');
`
