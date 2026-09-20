package desktop

import (
	"os/exec"
	"strings"
	"testing"
)

// Replay the actual injected source with only Wails Core, never Call/Window.
// DOM/native boundaries are simulated; trusted hardware gestures still need E2E.
func TestChatDragWithCoreOnly(t *testing.T) {
	node, err := exec.LookPath("node")
	if err != nil {
		t.Skip("node unavailable")
	}
	cmd := exec.Command(node, "--input-type=commonjs", "-e", `
const vm=require("node:vm"), fs=require("node:fs"), assert=require("node:assert/strict");
const source=fs.readFileSync(0,"utf8");
function run(OS) {
 const calls=[], elements=[], listeners=new Map();
 class Element {
  constructor(){this.id="";this.className="";this.dataset={};this.style={setProperty(){},removeProperty(){}};this.classList={add(){},toggle(){}};elements.push(this);}
  addEventListener(type,fn){let key=this;let ls=listeners.get(key)||[];ls.push({type,fn});listeners.set(key,ls);}
  append(...children){for(const c of children)c.parentElement=this;}
  appendChild(c){this.append(c);}
  setAttribute(){}
  querySelector(){return null;}
  closest(selector){if(selector.split(",").some(s=>{s=s.trim();return s===this.tagName || (this.className && s==="."+this.className) || (this.editable && s==="[contenteditable]") || (this.role==="button" && s==="[role=button]");}))return this;return this.parentElement?.closest(selector)||null;}
 }
 const root=new Element();root.id="root";
 const document={head:new Element(),documentElement:new Element(),body:new Element(),getElementById:id=>elements.find(e=>e.id===id)||null,createElement:()=>new Element(),querySelector:selector=>selector.includes(".dsh-desktop-chrome__drag")?elements.find(e=>e.className==="dsh-desktop-chrome__drag")||null:null,addEventListener:Element.prototype.addEventListener};
 const window={wails:{},_wails:{environment:{OS},invoke(message){assert.equal(this,window._wails);calls.push(message);}},addEventListener:Element.prototype.addEventListener,setTimeout(){throw Error("unexpected deferred native action");},open(){}};
 if(OS==="windows") {const webview={postMessage(message){assert.equal(this,webview,"WebView2 native receiver required");calls.push(message);}};window.chrome={webview};window._wails.invoke=webview.postMessage;}
 const context={window,document,Element,URL,location:new URL("http://127.0.0.1:3080/")};
 document.documentElement.clientWidth=1000;document.documentElement.clientHeight=700;
 vm.runInNewContext(source,context);
 vm.runInNewContext(source,context); // repeated injection must not duplicate gestures
 const drag=elements.find(e=>e.className==="dsh-desktop-chrome__drag");assert.ok(drag);
 function dispatch(type,target=drag,options={}) {
  const event={type,target,button:0,buttons:1,detail:1,clientX:200,clientY:20,isTrusted:true,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;},stopPropagation(){},stopImmediatePropagation(){},...options};
  for(const owner of [window,document,target])for(const l of [...(listeners.get(owner)||[])])if(l.type===type)l.fn(event);
  return event;
 }
 dispatch("mousedown");dispatch("mousemove");
 assert.deepEqual(calls,["wails:drag"],OS+" Core-only Chat must start native drag");
 dispatch("mousemove");assert.equal(calls.length,1,"one native message per press");
 function none(label, body) {calls.length=0;dispatch("mouseup");body();assert.deepEqual(calls,[],label);}
 for(const bad of [{button:2,buttons:2},{button:1,buttons:4},{buttons:3},{isTrusted:false},{defaultPrevented:true},{detail:2}]) {
  none("invalid press "+JSON.stringify(bad),()=>{dispatch("mousedown",drag,bad);dispatch("mousemove");});
 }
 for(const bad of [{buttons:0},{isTrusted:false},{defaultPrevented:true}]) {
  none("invalid move "+JSON.stringify(bad),()=>{dispatch("mousedown");dispatch("mousemove",drag,bad);dispatch("mousemove");});
 }
 for(const type of ["mouseup","blur","pointercancel"])none(type+" cancels pending drag",()=>{dispatch("mousedown");dispatch(type);dispatch("mousemove");});
 none("arbitrary content is not draggable",()=>{dispatch("mousedown",root);dispatch("mousemove",root);});
 none("doubleclick never invokes zoom",()=>dispatch("dblclick"));
 const edges=[[0,350,"w"],[999,350,"e"],[500,0,"n"],[500,699,"s"],[0,0,"nw"],[999,0,"ne"],[0,699,"sw"],[999,699,"se"]];
 for(const [clientX,clientY,edge] of edges) {
  calls.length=0;dispatch("mousedown",root,{clientX,clientY});dispatch("mousemove",root,{clientX,clientY});
  assert.deepEqual(calls,["wails:resize:"+edge+"-resize"],edge+" native resize");
  dispatch("mousemove",root);assert.equal(calls.length,1,"resize sends only once");
 }
 for(const [clientX,clientY] of [[5,350],[994,350],[500,5],[500,694],[-1,350],[1000,350],[500,-1],[500,700]])none("bounded edge",()=>{dispatch("mousedown",root,{clientX,clientY});dispatch("mousemove",root);});
 window._wails.setResizable(false);
 none("disabled resize",()=>{dispatch("mousedown",root,{clientX:0});dispatch("mousemove",root);});
 calls.length=0;dispatch("mousedown");dispatch("mousemove");assert.deepEqual(calls,["wails:drag"],"disabled resize preserves drag");
 calls.length=0;window._wails.setResizable(true);dispatch("mousedown",root,{clientX:0});window._wails.setResizable(false);
 window._wails.setResizable(true);dispatch("mousemove",root);assert.deepEqual(calls,[],"disabling cancels armed resize even when re-enabled before move");
 for(const kind of ["button","input","textarea","select","link","contenteditable","controls","role"]) {
  const element=new Element();element.tagName=kind==="link"?"a":kind;element.editable=kind==="contenteditable";element.role=kind==="role"?"button":"";element.className=kind==="controls"?"dsh-desktop-chrome__controls":"";element.parentElement=drag;
  none(kind+" never arms drag/resize",()=>{dispatch("mousedown",element,{clientX:0});dispatch("mousemove",element);});
  none(kind+" cancels pending gesture",()=>{dispatch("mousedown");dispatch("mousemove",element);dispatch("mousemove");});
 }
 none("missing native transport is not deferred",()=>{const invoke=window._wails.invoke,chrome=window.chrome;delete window._wails.invoke;delete window.chrome;dispatch("mousedown");dispatch("mousemove");window._wails.invoke=invoke;window.chrome=chrome;dispatch("mousemove");});
 const setter=window._wails.setResizable;vm.runInNewContext(source,context);assert.equal(window._wails.setResizable,setter,"reinject preserves native setter");
}
for(const OS of ["windows","linux"])run(OS);
`)
	// Explicit append also verifies idempotence when the parent composes this into chrome.
	cmd.Stdin = strings.NewReader(desktopChromeScript(false) + desktopChatDragJS)
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("%v\n%s", err, out)
	}
}

func TestChatDragWaitsForCore(t *testing.T) {
	node, err := exec.LookPath("node")
	if err != nil {
		t.Skip("node unavailable")
	}
	cmd := exec.Command(node, "--input-type=commonjs", "-e", `
const vm=require("node:vm"),fs=require("node:fs"),assert=require("node:assert/strict");
const source=fs.readFileSync(0,"utf8");
for(const mode of ["event","timer","exhausted","existing-setter"]) {
 const timers=new Map(),listeners=new Map();let serial=0;
 const drag={};const document={querySelector:s=>s.includes("__drag")?drag:null};
 const window={setTimeout(fn){timers.set(++serial,fn);return serial;},clearTimeout(id){timers.delete(id);},addEventListener(type,fn){const ls=listeners.get(type)||[];ls.push(fn);listeners.set(type,ls);},removeEventListener(type,fn){listeners.set(type,(listeners.get(type)||[]).filter(f=>f!==fn));}};
 const context={window,document};
 const fire=type=>{for(const fn of [...(listeners.get(type)||[])])fn({type});};
 const tick=()=>{const [id,fn]=timers.entries().next().value;timers.delete(id);fn();};
 vm.runInNewContext(source,context);vm.runInNewContext(source,context);
 assert.equal(timers.size,1,"one bounded retry loop while Core is absent");
 if(mode==="exhausted") {let count=0;while(timers.size){assert.ok(++count<=40,"installer retry must terminate");tick();}}
 const setter=()=>{};window._wails={environment:{OS:"windows"}};
 if(mode==="existing-setter")window._wails.setResizable=setter;
 if(mode==="timer")tick();else fire("wails:runtime-config-ready");
 assert.equal(typeof window._wails.setResizable,"function","late Core must install resize callback before ready");
 assert.equal(timers.size,0,"ready event must cancel pending retries");
 if(mode==="existing-setter") {assert.equal(window._wails.setResizable,setter);assert.equal((listeners.get("mousedown")||[]).length,0);}
 else assert.equal((listeners.get("mousedown")||[]).length,1,"exactly one gesture listener");
}
`)
	cmd.Stdin = strings.NewReader(desktopChatDragJS)
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("%v\n%s", err, out)
	}
}
