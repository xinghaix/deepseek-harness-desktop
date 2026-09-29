package desktop

// The native drag strip remains untouched; only a second press in blank space
// toggles Chat work-area zoom through the authenticated desktop bridge.
const desktopMacTitlebarZoomJS = `
/* DSH_MAC_CHAT_TITLEBAR_ZOOM_BEGIN */
(() => {
  if (document.querySelector("body > .app-shell") || window.__dshMacChatTitlebarZoom) return;
  window.__dshMacChatTitlebarZoom = true;
  document.addEventListener("mousedown", (event) => {
    // Only a real second left press in the empty 36px native titlebar.
    // Leave the first press to Wails' InvisibleTitleBarHeight drag handler.
    if (!event.isTrusted || event.defaultPrevented || event.button !== 0 ||
        event.buttons !== 1 || event.detail !== 2 ||
        event.clientY < 5 || event.clientY >= 36 ||
        event.clientX <= 80 || event.clientX >= document.documentElement.clientWidth - 5 ||
        event.target?.isContentEditable ||
        event.target?.closest?.("button, input, textarea, select, a, [contenteditable], [role=button], [data-wails-no-drag]")) return;
    event.preventDefault(); // Do not select text under the transparent titlebar.
    event.stopPropagation();
    window.__DSH_DESKTOP_REQUEST_WINDOW_ACTION__("maximize");
  }, true);
})();
/* DSH_MAC_CHAT_TITLEBAR_ZOOM_END */
`
