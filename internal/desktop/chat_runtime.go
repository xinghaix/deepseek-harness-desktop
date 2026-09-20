package desktop

import (
	"net/url"
	"strconv"
	"strings"
)

// desktopChatRuntimeScript is only for the remote Chat window. It enables native
// ExecJS delivery and WindowRuntimeReady hooks without importing Wails Call or
// installing a second RPC transport. It must follow desktopChatDragJS.
func desktopChatRuntimeScript(rawURL string) string {
	parsed, err := url.Parse(rawURL)
	if err != nil || parsed.Scheme != "http" || parsed.Hostname() != "127.0.0.1" || parsed.User != nil {
		return ""
	}
	port, err := strconv.Atoi(parsed.Port())
	if err != nil || port < 1 || port > 65535 {
		return ""
	}
	origin := "http://127.0.0.1"
	if port != 80 {
		origin += ":" + strconv.Itoa(port)
	}
	return strings.Replace(desktopChatRuntimeJS, "@@EXPECTED_ORIGIN@@", strconv.Quote(origin), 1)
}

const desktopChatRuntimeJS = `
/* DSH_CHAT_RUNTIME_BEGIN */
;(() => {
  const expectedOrigin = @@EXPECTED_ORIGIN@@;
  if (window.top !== window || location.origin !== expectedOrigin || document.querySelector("body > .app-shell")) return;
  if (window.__DSH_DESKTOP_CHAT_RUNTIME__) return;
  const state = window.__DSH_DESKTOP_CHAT_RUNTIME__ = {status: "waiting"};
  let timer = null;
  let attempts = 0;
  const finish = (status) => {
    state.status = status;
    if (timer !== null) clearTimeout(timer);
    timer = null;
    window.removeEventListener("wails:runtime-config-ready", attempt);
  };
  const attempt = () => {
    if (state.status !== "waiting") return;
    if (timer !== null) clearTimeout(timer);
    timer = null;
    if (location.origin !== expectedOrigin || window.top !== window || document.querySelector("body > .app-shell") || typeof window.wails?.Call?.ByName === "function") {
      finish("skipped");
      return;
    }
    const w = window._wails;
    const os = w?.environment?.OS;
    // The real Win/Linux drag/resize adapter must precede this script. On macOS
    // resizing is native and no renderer resize implementation is needed.
    const hasResize = typeof w?.setResizable === "function" || os === "darwin";
    if (typeof w?.invoke !== "function" || !hasResize) {
      if (++attempts >= 100) {
        finish("timeout");
        console.warn("Desktop Chat native readiness timed out");
      } else {
        timer = setTimeout(attempt, 30);
      }
      return;
    }
    // Chat uses authenticated desktop-bridge RPC, not Wails subscriptions or
    // file-drop. Native beta.22 still dispatches these callbacks after ready.
    // Preserve any existing implementations, including a later full runtime.
    for (const name of ["dispatchWailsEvent", "handleDragEnter", "handleDragLeave", "handleDragOver", "handlePlatformFileDrop"]) {
      if (typeof w[name] !== "function") w[name] = () => {};
    }
    if (typeof w.setResizable !== "function") w.setResizable = () => {};
    // Set the marker before invoke: reentrant config-ready must not send twice.
    finish("ready");
    try {
      const webview = window.chrome?.webview;
      // Core on WebView2 stores an unbound postMessage; match System.invoke
      // from the full runtime by preserving its required native receiver.
      if (os === "windows" && typeof webview?.postMessage === "function") {
        webview.postMessage.call(webview, "wails:runtime:ready");
      } else {
        w.invoke("wails:runtime:ready");
      }
    }
    catch (_) {
      state.status = "failed";
      console.warn("Desktop Chat native readiness failed");
    }
  };
  window.addEventListener("wails:runtime-config-ready", attempt);
  attempt();
})();
/* DSH_CHAT_RUNTIME_END */
`
