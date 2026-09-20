package desktop

// desktopChatDragJS restores only the native gestures missing from remote Chat
// (Wails Core has invoke but not the full runtime drag.ts listeners). Append after
// chrome markup and BEFORE the readiness signal: Windows calls setResizable on
// runtime-ready. Management pages keep the full runtime implementation.
const desktopChatDragJS = `
(() => {
  if (document.querySelector("body > .app-shell")) return;
  if (window.__dshChatGestureInstaller) return;
  window.__dshChatGestureInstaller = true;
  const install = () => {
    const core = window._wails;
    if (!core) return false;
    if (core.__dshChatGestures || typeof core.setResizable === "function") return true;
    const drag = document.querySelector("#dsh-desktop-chrome > .dsh-desktop-chrome__drag");
    if (!drag) return false;
    core.__dshChatGestures = true;
    let pending = "";
    const cancel = () => { pending = ""; };
    // ChatWindowOptions is resizable by default. Native SetResizable updates this
    // state after runtime-ready and whenever the host changes window policy.
    let resizable = true;
    core.setResizable = (value) => {
      resizable = Boolean(value);
      if (!resizable && pending !== "wails:drag") cancel();
    };
    const interactive = (target) => !target || target.isContentEditable ||
      target.closest("button, input, textarea, select, a, [contenteditable], [role=button], .dsh-desktop-chrome__controls");
    const edgeAt = (event) => {
      if (!resizable) return "";
      // Like Wails drag.ts, keep resize hit testing inside the content viewport,
      // before scrollbars. No overlay and no extended corner area over controls.
      const width = document.documentElement.clientWidth;
      const height = document.documentElement.clientHeight;
      const x = event.clientX, y = event.clientY;
      if (x < 0 || y < 0 || x >= width || y >= height) return "";
      const horizontal = x < 5 ? "w" : x >= width - 5 ? "e" : "";
      const vertical = y < 5 ? "n" : y >= height - 5 ? "s" : "";
      return vertical || horizontal ? vertical + horizontal + "-resize" : "";
    };
    window.addEventListener("mousedown", (event) => {
      cancel();
      const os = core.environment && core.environment.OS;
      if ((os !== "windows" && os !== "linux") || !event.isTrusted ||
          event.defaultPrevented || event.button !== 0 || event.buttons !== 1 ||
          event.detail !== 1 || interactive(event.target)) return;
      const edge = edgeAt(event);
      if (edge) pending = "wails:resize:" + edge;
      else if (event.target === drag) pending = "wails:drag";
    });
    window.addEventListener("mousemove", (event) => {
      if (!pending) return;
      if (!event.isTrusted || event.defaultPrevented || event.buttons !== 1 ||
          interactive(event.target)) { cancel(); return; }
      const message = pending;
      cancel();
      // Native GTK has recorded the preceding mouse press by now. Start while
      // the hardware button is still down, never after an asynchronous RPC.
      const webview = window.chrome && window.chrome.webview;
      if (core.environment && core.environment.OS === "windows") {
        // Core stores a bare postMessage; WebView2 requires its own receiver,
        // just like the bound channel in the official full runtime system.ts.
        if (!webview || typeof webview.postMessage !== "function") return;
        webview.postMessage.call(webview, message);
      } else {
        if (typeof core.invoke !== "function") return;
        core.invoke(message);
      }
      event.preventDefault();
    });
    window.addEventListener("mouseup", cancel);
    window.addEventListener("blur", cancel);
    window.addEventListener("pointercancel", cancel);
    return true;
  };
  // Native Core can arrive after options.JS. Retry only installation, never a
  // user gesture. The config-ready event also handles Core arriving after the
  // bounded polling window, without creating a permanent timer.
  let attempts = 0, timer = 0;
  const retry = () => {
    if (timer) window.clearTimeout(timer);
    timer = 0;
    if (install()) {
      window.removeEventListener?.("wails:runtime-config-ready", retry);
      return;
    }
    if (++attempts < 40) timer = window.setTimeout(retry, 25);
  };
  window.addEventListener("wails:runtime-config-ready", retry);
  retry();
})();
`
