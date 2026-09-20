// Browser-engine regression fixture. Native Wails calls are deliberately mocked.
// The Go source is supplied by the runner; never duplicate the injected policy.
globalThis.runDesktopNavigationDOMTest = function(source) {
  const results = [];
  for (const custom of [false, true]) {
    const frame = document.createElement("iframe");
    document.body.appendChild(frame);
    const w = frame.contentWindow, d = w.document;
    try {
      d.body.innerHTML = '<div id="root"><a id="web" href="https://example.com/"><svg><path></path></svg><span>link</span></a><button id="resource">resource</button><input id="editable"></div>';
      const calls = [], nativeOpens = [], menus = [];
      w.wails = {}; // Actual remote Chat shape; no synthetic Wails runtime.
      w.__DSH_DESKTOP_OPEN_EXTERNAL_URL__ = url => {calls.push(url); return Promise.resolve();};
      w.__DSH_DESKTOP_CONTEXT_MENU__ = payload => {menus.push(payload); return Promise.resolve();};
      w.open = (...args) => {nativeOpens.push(args); return null;};
      new w.Function("location", source.replace("@@USE_CUSTOM_MENU@@", String(custom)))(new URL("http://127.0.0.1:3080/"));
      function check(name, condition) {
        if (!condition) throw new Error(name + " custom=" + custom);
        results.push({name, custom, passed: true});
      }
      let previews = 0;
      d.getElementById("root").addEventListener("click", event => {
        const target = event.target.nodeType === 3 ? event.target.parentElement : event.target;
        if (target.closest("a") && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
          event.preventDefault(); previews++;
        }
      });
      const a = d.getElementById("web");
      const dispatch = (target, type = "click", options = {}) => target.dispatchEvent(new w.MouseEvent(type, {bubbles:true, cancelable:true, button:0, ...options}));
      dispatch(a.querySelector("path"));
      check("nested SVG preview uses delegated DSH handler", previews === 1 && calls.length === 0);
      dispatch(a.querySelector("span").firstChild);
      check("text-node preview uses delegated DSH handler", previews === 2 && calls.length === 0);
      for (const key of ["ctrlKey", "metaKey", "shiftKey", "altKey"]) {
        calls.length = 0;
        check(key + " cancels WebView navigation", dispatch(a, "click", {[key]:true}) === false);
        check(key + " launches one native open", calls.length === 1);
      }
      calls.length = 0;
      check("middle-click cancels native popup", dispatch(a, "auxclick", {button:1}) === false);
      check("middle-click launches one native open", calls.length === 1);
      calls.length = 0;
      check("right-click is not consumed", dispatch(a, "auxclick", {button:2}) === true && calls.length === 0);
      let resources = 0;
      d.getElementById("resource").onclick = () => resources++;
      d.getElementById("resource").click();
      check("resource/file/image/session button remains owned by DSH", resources === 1 && calls.length === 0);
      w.open("https://example.com/", "_blank", "noopener,noreferrer");
      check("toolbar external open uses OS bridge", calls.length === 1 && nativeOpens.length === 0);
      calls.length = 0;
      const deferred = w.open();
      deferred.opener = null;
      deferred.location.href = "https://example.com/terminal";
      check("xterm deferred open uses OS bridge", calls.length === 1 && nativeOpens.length === 0);
      calls.length = 0;
      const cancelled = w.open(); cancelled.close(); cancelled.location.href = "https://example.com/";
      check("closed terminal opener stays closed", calls.length === 0);
      w.open("file:///tmp/example"); w.open("javascript:alert(1)");
      check("unsafe schemes never reach native opener", calls.length === 0 && nativeOpens.length === 0);
      w.open("http://127.0.0.1:3080/?token=fixture");
      check("same-origin auth address never reaches OS", calls.length === 0 && nativeOpens.length === 1);
      const menu = new w.MouseEvent("contextmenu", {bubbles:true, cancelable:true});
      a.dispatchEvent(menu);
      check("context menu retains external link", w.__DSH_CTX__.href === "https://example.com/");
      check("platform menu mode is preserved", custom ? a.style.getPropertyValue("--custom-contextmenu") === "dsh-link" : !a.style.getPropertyValue("--custom-contextmenu"));
      check("remote custom menu reaches native transport", menus.length === (custom ? 1 : 0));
      check("only custom mode prevents native default menu", menu.defaultPrevented === custom);
      d.getElementById("editable").dispatchEvent(new w.MouseEvent("contextmenu", {bubbles:true,cancelable:true}));
      check("editable native menu is preserved", menus.length === (custom ? 1 : 0));
      a.addEventListener("contextmenu", e => e.preventDefault());
      a.dispatchEvent(new w.MouseEvent("contextmenu", {bubbles:true,cancelable:true}));
      check("DSH-owned context menu is not opened twice", menus.length === (custom ? 1 : 0));
      const menuContainer = d.createElement("div");
      menuContainer.setAttribute("role", "menu");
      const menuBtn = d.createElement("button");
      menuContainer.appendChild(menuBtn);
      d.body.appendChild(menuContainer);
      let outerFocusoutReceived = false;
      d.body.addEventListener("focusout", () => { outerFocusoutReceived = true; });
      const foEvent = new w.FocusEvent("focusout", {bubbles:true, cancelable:true, relatedTarget: null});
      menuBtn.dispatchEvent(foEvent);
      check("menu button focusout with null relatedTarget is intercepted", outerFocusoutReceived === false);
    } finally { frame.remove(); }
  }
  return {engine: navigator.userAgent, results};
};
