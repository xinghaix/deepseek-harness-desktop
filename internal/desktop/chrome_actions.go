package desktop

// The embedded management page has Wails runtime.js; remote Chat deliberately
// does not. Do not retry unavailable Wails APIs indefinitely in the Chat page.
const desktopWindowActionJS = `
// Desktop window action transport
(() => {
  const fail = () => {
    const message = window.__DSH_DESKTOP_LOCALE_BUNDLE__?.catalog?.["bridge.err_unreachable"] || "Desktop control plane is temporarily unreachable";
    if (typeof window.alert === "function") window.alert(message);
  };
  window.__DSH_DESKTOP_REQUEST_WINDOW_ACTION__ = (action) => {
    try {
      if (!["minimize", "maximize", "close", "settings", "dismiss-config"].includes(action)) throw new Error("unsupported action");
      if (!document.querySelector("body > .app-shell")) {
        const invoke = window.__DSH_DESKTOP_WINDOW_ACTION__;
        if (typeof invoke !== "function") throw new Error("bridge unavailable");
        Promise.resolve(invoke(action)).catch(fail);
        return;
      }
      const methods = {minimize: "Minimise", maximize: "ToggleMaximise", close: "Close"};
      const method = methods[action];
      if (method) {
        const current = window.wails?.Window;
        if (typeof current?.[method] !== "function") throw new Error("runtime unavailable");
        Promise.resolve(current[method]()).catch(fail);
      } else {
        const call = window.wails?.Call?.ByName;
        if (typeof call !== "function") throw new Error("runtime unavailable");
        Promise.resolve(call(action === "settings" ? "main.DSH.OpenManagement" : "main.DSH.TryDismissConfig")).catch(fail);
      }
    } catch (_) { fail(); }
  };
})();
// End desktop window action transport
`
