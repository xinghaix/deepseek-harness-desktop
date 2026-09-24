package desktop

import (
	"deepseek-harness-desktop/internal/i18n"
	"fmt"
	"strconv"
	"strings"
)

const (
	// InvisibleTitleBarHeight / native drag strip. Keep this for the macOS
	// titlebar hit area; changing it does not move traffic lights, but
	// shrinking it too far makes the drag/hit band feel cramped.
	desktopNativeTopInset = 36
	// Sidebar/logo clearance under UnifiedCompact traffic lights only.
	// Intentionally below desktopNativeTopInset so we do not stack a full
	// drag-strip of empty pixels under the lights. Traffic light x/y stay put.
	desktopNativeContentInset = 22
	desktopCustomTopInset = 48
)

// desktopChromeCSS/JS 为非 macOS 无原生标题栏窗口提供轻量悬浮控制条，
// 并为自绘控制条预留顶部安全区。Wails runtime 会把 --wails-draggable: drag
// 转换为平台原生拖动，按钮本身通过 runtime.Window 调用最小化、最大化和关闭，
// 不依赖操作系统差异。
const desktopChromeCSS = `
.dsh-desktop-chrome {
  --dsh-window-top-inset: 48px;
  --dsh-chrome-text: #202531;
  --dsh-chrome-muted: #6f7785;
  --dsh-chrome-border: rgba(122, 132, 150, .18);
  --dsh-chrome-bg: rgba(255, 255, 255, .76);
  --dsh-chrome-hover: rgba(40, 48, 65, .10);
  --dsh-chrome-close: #dc4d55;
}
@media (prefers-color-scheme: dark) {
  .dsh-desktop-chrome {
    --dsh-chrome-text: #f4f6fb;
    --dsh-chrome-muted: #a7afbd;
    --dsh-chrome-border: rgba(255, 255, 255, .14);
    --dsh-chrome-bg: rgba(25, 29, 37, .76);
    --dsh-chrome-hover: rgba(255, 255, 255, .12);
    --dsh-chrome-close: #ff6b72;
  }
}
.dsh-desktop-chrome {
  position: fixed;
  z-index: 2147483647;
  inset: 0 0 auto;
  height: var(--dsh-window-top-inset);
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
  padding: 9px 12px;
  pointer-events: none;
  user-select: none;
}
.dsh-desktop-chrome__drag {
  position: absolute;
  inset: 0 178px 0 0;
  pointer-events: auto;
  --wails-draggable: drag;
}
.dsh-desktop-chrome__controls {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 3px;
  border: 1px solid var(--dsh-chrome-border);
  border-radius: 13px;
  background: var(--dsh-chrome-bg);
  box-shadow: 0 5px 18px rgba(20, 26, 38, .10);
  backdrop-filter: blur(18px) saturate(1.35);
  -webkit-backdrop-filter: blur(18px) saturate(1.35);
  pointer-events: auto;
  --wails-draggable: no-drag;
}
.dsh-desktop-chrome__button {
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 7px;
  padding: 0;
  color: var(--dsh-chrome-muted);
  background: transparent;
  cursor: pointer;
  transition: background .14s ease, color .14s ease, transform .14s ease;
  --wails-draggable: no-drag;
}
.dsh-desktop-chrome__button:hover {
  color: var(--dsh-chrome-text);
  background: var(--dsh-chrome-hover);
}
.dsh-desktop-chrome__button:active {
  transform: scale(.94);
}
.dsh-desktop-chrome__button[data-action="close"]:hover {
  color: #fff;
  background: var(--dsh-chrome-close);
}
.dsh-desktop-chrome__button svg {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
}
`

const desktopWindowInsetCSS = `
.dsh-window-content {
  box-sizing: border-box !important;
  --dsh-window-top-inset: 36px;
}
.dsh-window-content:not(.dsh-window-management) {
  height: calc(100% - var(--dsh-window-top-inset)) !important;
  margin-top: var(--dsh-window-top-inset) !important;
}
.dsh-window-content.dsh-window-management {
  padding-top: calc(30px + var(--dsh-window-top-inset, 36px)) !important;
}
`

// desktopSidebarTransitionCSS 恢复 DSH AppFrame 的列宽过渡。dsh-better-sidebar
// 的 layout.css 为兼容旧版 DOM 使用相同的兜底选择器，但 transition 简写只保留了
// padding-right，从而覆盖了 ui-layout 原本的 grid-template-columns 过渡；外层侧栏
// 会瞬间收起，而 SidebarRoot 内部的文字淡出与图标进入仍按 150ms + 150ms 执行。
const desktopSidebarTransitionCSS = `
#root [data-dsh-frame],
#root > [data-slot="root"] > div {
  transition:
    grid-template-columns var(--ds-transition-duration-slow) var(--ds-ease-in-out),
    padding-right var(--ds-transition-duration-slow) var(--ds-ease-in-out) !important;
}

body[data-dsh-sidebar-dragging] #root [data-dsh-frame],
body[data-dsh-sidebar-dragging] #root > [data-slot="root"] > div,
#root [data-dsh-frame][data-dragging],
#root > [data-slot="root"] > div[data-dragging] {
  transition: none !important;
}

@media (prefers-reduced-motion: reduce) {
  #root [data-dsh-frame],
  #root > [data-slot="root"] > div {
    transition: none !important;
  }
}
`

const desktopNativeWindowInsetCSS = `
.dsh-window-content {
  box-sizing: border-box !important;
  --dsh-window-collapsed-rail-width: 84px;
}
.dsh-window-content.dsh-window-management,
body > .app-shell {
  padding-top: calc(30px + var(--dsh-window-top-inset, 36px)) !important;
}
.dsh-window-sidebar,
#root [data-slot="sidebar"] > :first-child {
  box-sizing: border-box !important;
  /* DSH SidebarRoot 展开态原生 top padding 是 6px；只叠加紧凑交通灯净空，
     不用 InvisibleTitleBarHeight(36) 整段拖条高度，避免灯下再堆空带。 */
  padding-top: calc(var(--dsh-window-content-inset, 22px) + 6px) !important;
}
#root [data-sidebar-collapsed][data-details-collapsed],
#root [data-sidebar-collapsed].dsh-window-wide-rail {
  grid-template-columns: var(--dsh-window-collapsed-rail-width, 84px) minmax(0, 1fr) var(--dsh-window-details-width, 0px) !important;
}
#root [data-sidebar-collapsed][data-details-collapsed] {
  grid-template-columns: var(--dsh-window-collapsed-rail-width, 84px) minmax(0, 1fr) 0px !important;
}
#root [data-sidebar-collapsed] [data-slot="sidebar"] > :first-child {
  /* 折叠态原生 top padding 是 18px，保留与展开态相同的首元素基线。 */
  padding-top: calc(var(--dsh-window-content-inset, 22px) + 18px) !important;
  padding-left: calc((var(--dsh-window-collapsed-rail-width, 84px) - 36px) / 2) !important;
  padding-right: calc((var(--dsh-window-collapsed-rail-width, 84px) - 36px) / 2) !important;
}

`

// escapeWailsCSS 为 Wails beta.16 macOS 的 windowInjectCSS 转义 CSS。
// 该版本会把 CSS 放进单引号 JavaScript 字符串，换行、反斜杠和单引号
// 若不先转义，会导致整段 CSS 注入脚本解析失败。
func escapeWailsCSS(css string) string {
	return strings.NewReplacer(
		`\`, `\\`,
		`'`, `\'`,
		"\r", `\r`,
		"\n", `\n`,
	).Replace(css)
}

const desktopNativeWindowInsetJS = `
(() => {
  const isManagement = Boolean(document.querySelector("body > .app-shell"));
  const topInset = %d;
  const contentInset = %d;
  const chromeStyleId = "dsh-window-inset-style";
  let pageContent = null;
  let observedFrame = null;
  let frameObserver = null;
  if (!document.getElementById(chromeStyleId)) {
    const style = document.createElement("style");
    style.id = chromeStyleId;
    style.textContent = %s;
    (document.head || document.documentElement).appendChild(style);
  }
  const applyInset = () => {
    const content = isManagement ? document.querySelector("body > .app-shell") : document.getElementById("root");
    if (!content) {
      window.setTimeout(applyInset, 25);
      return;
    }
    pageContent = content;
    content.classList.add("dsh-window-content");
    if (isManagement) content.classList.add("dsh-window-management");
    content.style.setProperty("--dsh-window-top-inset", topInset + "px");
    content.style.setProperty("--dsh-window-content-inset", contentInset + "px");
    if (!isManagement) {
      const sidebarSlot = content.querySelector("[data-slot='sidebar']");
      const sidebar = sidebarSlot?.firstElementChild;
      if (!sidebar) {
        window.setTimeout(applyInset, 25);
        return;
      }
      const frame = findFrame(content);
      sidebar.classList.add("dsh-window-sidebar");
      sidebar.style.setProperty("--dsh-window-top-inset", topInset + "px");
      sidebar.style.setProperty("--dsh-window-content-inset", contentInset + "px");
      if (frame && frame !== observedFrame) {
        frameObserver?.disconnect();
        observedFrame = frame;
        frameObserver = new MutationObserver(syncCollapsedRail);
        frameObserver.observe(frame, { attributes: true, attributeFilter: ["data-sidebar-collapsed", "data-details-collapsed", "style"] });
      }
      syncCollapsedRail();
    }
  };

  function syncCollapsedRail() {
    if (isManagement) return;
    const frame = observedFrame;
    if (!frame) return;
    const collapsed = frame.hasAttribute("data-sidebar-collapsed");
    frame.classList.toggle("dsh-window-wide-rail", collapsed);
    if (!collapsed) {
      pageContent?.style.removeProperty("--dsh-window-details-width");
      return;
    }
    const columns = frame.style.gridTemplateColumns || window.getComputedStyle(frame).gridTemplateColumns;
    const detailsWidth = columns.match(/(?:^|\s)(\d+(?:\.\d+)?px)$/)?.[1] || "0px";
    pageContent?.style.setProperty("--dsh-window-details-width", detailsWidth);
  }

  function findFrame(content) {
    if (!content) return null;
    const overlay = content.querySelector("[data-shell-overlay]");
    return overlay?.parentElement || null;
  }

  // Chat drag: InvisibleTitleBarHeight (>0) supplies native drag (Wails #5900).
  // Title-band double-click zoom removed — hit-band fought native drag and blocked
  // toolbar clicks. Do not reinject a full-width pointer-events overlay.

  applyInset();
})();
`

const desktopChromeJS = `
(() => {
  const isManagement = Boolean(document.querySelector("body > .app-shell"));
  const topInset = %d;
  const chromeStyleId = "dsh-desktop-chrome-style";
  if (!document.getElementById(chromeStyleId)) {
    const style = document.createElement("style");
    style.id = chromeStyleId;
    style.textContent = %s;
    (document.head || document.documentElement).appendChild(style);
  }
  const applyInset = () => {
    const content = isManagement
      ? document.querySelector("body > .app-shell")
      : document.getElementById("root");
    if (!content) {
      window.setTimeout(applyInset, 25);
      return;
    }
    content.classList.add("dsh-window-content");
    if (isManagement) content.classList.add("dsh-window-management");
    content.style.setProperty("--dsh-window-top-inset", topInset + "px");
  };
  applyInset();
  const root = document.documentElement;
  root.classList.toggle("dsh-desktop-config", isManagement);
  if (document.getElementById("dsh-desktop-chrome")) return;

  const chrome = document.createElement("div");
  chrome.id = "dsh-desktop-chrome";
  chrome.className = "dsh-desktop-chrome";
  const drag = document.createElement("div");
  drag.className = "dsh-desktop-chrome__drag";
  const controls = document.createElement("div");
  controls.className = "dsh-desktop-chrome__controls";

  const icons = {
    settings: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8.4a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 0 0 0-7.2Z"/><path d="m19.4 13.4 1.1.8-1.8 3.1-1.3-.5a7.5 7.5 0 0 1-1.6.9l-.2 1.4h-3.6l-.2-1.4a7.5 7.5 0 0 1-1.6-.9l-1.3.5-1.8-3.1 1.1-.8a7.5 7.5 0 0 1 0-1.8l-1.1-.8 1.8-3.1 1.3.5a7.5 7.5 0 0 1 1.6-.9l.2-1.4h3.6l.2 1.4a7.5 7.5 0 0 1 1.6.9l1.3-.5 1.8 3.1-1.1.8a7.5 7.5 0 0 1 0 1.8Z"/></svg>',
    minimize: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg>',
    maximize: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="1.4"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>'
  };
  const addButton = (action, label) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "dsh-desktop-chrome__button";
    button.dataset.action = action;
    button.title = label;
    button.setAttribute("aria-label", label);
    button.innerHTML = icons[action];
    controls.appendChild(button);
    return button;
  };
  if (!isManagement) addButton("settings", %s);
  addButton("minimize", %s);
  addButton("maximize", %s);
  addButton("close", %s);
  chrome.append(drag, controls);
  document.documentElement.appendChild(chrome);

  const runWindowAction = (action) => window.__DSH_DESKTOP_REQUEST_WINDOW_ACTION__(action);
  controls.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    switch (button.dataset.action) {
      case "settings": runWindowAction("settings"); break;
      case "minimize": runWindowAction("minimize"); break;
      case "maximize": runWindowAction("maximize"); break;
      case "close": runWindowAction("close"); break;
    }
  });
})();
`

const desktopExternalJSTemplate = `
(() => {
  if (document.querySelector("body > .app-shell")) return;
  const useCustomMenu = @@USE_CUSTOM_MENU@@;
  const allowed = (value) => {
    try {
      const url = new URL(value, location.href);
      return url.protocol === "http:" && url.hostname === "127.0.0.1" && url.port === location.port;
    } catch (err) {
      return false;
    }
  };
  const resolveExternal = (value) => {
    try {
      const url = new URL(value, location.href);
      if (url.protocol !== "http:" && url.protocol !== "https:") return "";
      if (allowed(url.href)) return "";
      return url.href;
    } catch (err) {
      return "";
    }
  };
  const reportOpenFailure = () => {
    const catalog = window.__DSH_DESKTOP_LOCALE_BUNDLE__?.catalog;
    const message = catalog?.["bridge.err_unreachable"] || "Desktop control plane is temporarily unreachable";
    if (typeof window.alert === "function") window.alert(message);
  };
  const callDesktop = (method, arg) => {
    // Remote Chat loads DSH HTTP, not the Wails asset server. Wails Core only
    // installs an empty window.wails; Call.ByName is NOT available there.
    const open = window.__DSH_DESKTOP_OPEN_EXTERNAL_URL__;
    try {
      if (method === "OpenExternalURL" && typeof open === "function") {
        Promise.resolve(open(arg)).catch(reportOpenFailure);
        return;
      }
      const call = window.wails && window.wails.Call && window.wails.Call.ByName;
      if (typeof call === "function") {
        Promise.resolve(call("main.DSH." + method, arg)).catch(reportOpenFailure);
        return;
      }
    } catch (_) { /* a synchronous bridge failure must be visible too */ }
    reportOpenFailure();
  };
  const contextPayload = (event) => {
    const sel = ((window.getSelection() && window.getSelection().toString()) || "").trim();
    let href = "";
    const node = event.target && event.target.closest && event.target.closest("a[href]");
    if (node) {
      const raw = node.getAttribute("href") || "";
      if (raw && raw.charAt(0) !== "#" && raw.indexOf("javascript:") !== 0) {
        href = resolveExternal(raw);
      }
    }
    return { text: sel.slice(0, 2048), href: href };
  };
  const isEditable = (el) => {
    if (!el) return false;
    if (el.isContentEditable) return true;
    return Boolean(el.closest && el.closest("input, textarea, select, [contenteditable='true']"));
  };
  const originalOpen = window.open;
  window.open = function(url, target, features) {
    if (url == null || url === "" || url === "about:blank") {
      // xterm OSC8 calls open(), clears opener, then assigns location.href.
      // Reserve a one-shot navigation handle, not an unmanaged native WebView.
      // This is intentionally not a full Window (no document.write/postMessage).
      let closed = false;
      let href = "about:blank";
      const navigate = (value) => {
        if (closed) return;
        const external = resolveExternal(value);
        if (!external && !allowed(value)) return;
        href = new URL(value, location.href).href;
        closed = true;
        if (external) callDesktop("OpenExternalURL", external);
        else if (typeof originalOpen === "function") originalOpen.call(window, href, target, features);
      };
      const deferredLocation = {
        get href() { return href; },
        set href(value) { navigate(value); },
        assign: navigate,
        replace: navigate,
      };
      return {
        opener: null,
        get closed() { return closed; },
        get location() { return deferredLocation; },
        set location(value) { navigate(value); },
        close() { closed = true; },
        focus() {},
      };
    }
    if (url && !allowed(url)) {
      // DSH sidebar toolbar and no-sidebar fallback use window.open.
      // Open validated web URLs via the OS, never navigate the Chat WebView.
      const external = resolveExternal(url);
      if (external) callDesktop("OpenExternalURL", external);
      return null;
    }
    if (typeof originalOpen === "function") return originalOpen.apply(this, arguments);
    return null;
  };
  // Let DSH handle preview/sidebar links before applying the navigation fallback.
  // Capture + stopPropagation would prevent React MarkdownAnchor from opening tabs.
  const routeLinkClick = (event) => {
    if (event.defaultPrevented) return;
    if (event.type === "auxclick" && event.button !== 1) return;
    const target = event.target && (event.target.closest ? event.target : event.target.parentElement);
    const link = target && target.closest && target.closest("a[href]");
    if (!link) return;
    const href = link.getAttribute("href");
    if (!href || href.charAt(0) === "#" || href.indexOf("javascript:") === 0) return;
    if (allowed(href)) return;
    event.preventDefault();
    event.stopPropagation();
    const external = resolveExternal(href);
    if (external) callDesktop("OpenExternalURL", external);
  };
  const installClipboardFallback = () => {
    if (typeof navigator === "undefined" || window.__DSH_CLIPBOARD_FALLBACK_INSTALLED__) return;
    window.__DSH_CLIPBOARD_FALLBACK_INSTALLED__ = true;
    const nav = navigator;
    const originalWriteText = nav.clipboard && typeof nav.clipboard.writeText === "function"
      ? nav.clipboard.writeText.bind(nav.clipboard)
      : null;

    const execCopy = (text) => {
      if (typeof document === "undefined" || typeof document.createElement !== "function" || typeof document.execCommand !== "function") return false;
      const str = text == null ? "" : String(text);
      let success = false;
      const selection = typeof window !== "undefined" && typeof window.getSelection === "function" ? window.getSelection() : null;
      const selectedRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
      try {
        const area = document.createElement("textarea");
        area.value = str;
        area.setAttribute("readonly", "");
        area.style.position = "fixed";
        area.style.left = "-9999px";
        area.style.top = "0";
        area.style.opacity = "0";
        (document.body || document.documentElement).appendChild(area);
        area.focus({ preventScroll: true });
        area.select();
        area.setSelectionRange(0, area.value.length);
        success = document.execCommand("copy");
        area.remove();
      } catch (_) {
        success = false;
      }
      if (selectedRange && selection) {
        try {
          selection.removeAllRanges();
          selection.addRange(selectedRange);
        } catch (_) {}
      }
      return success;
    };

    const robustWriteText = async (text) => {
      const str = text == null ? "" : String(text);
      if (execCopy(str)) {
        return;
      }
      if (originalWriteText) {
        try {
          await originalWriteText(str);
          return;
        } catch (_) {}
      }
      const nativeCopy = window.__DSH_DESKTOP_COPY_TEXT__;
      if (typeof nativeCopy === "function") {
        try {
          await nativeCopy(str);
          return;
        } catch (_) {}
      }
      if (execCopy(str)) {
        return;
      }
      throw new DOMException("Failed to copy text to clipboard", "NotAllowedError");
    };

    if (typeof Clipboard !== "undefined" && Clipboard.prototype) {
      try { Clipboard.prototype.writeText = robustWriteText; } catch (_) {}
    }
    if (nav.clipboard) {
      try { nav.clipboard.writeText = robustWriteText; } catch (_) {
        try {
          Object.defineProperty(nav.clipboard, "writeText", {
            value: robustWriteText,
            configurable: true,
            writable: true,
          });
        } catch (_) {}
      }
    } else {
      try {
        Object.defineProperty(nav, "clipboard", {
          value: { writeText: robustWriteText },
          configurable: true,
          writable: true,
        });
      } catch (_) {
        try { nav.clipboard = { writeText: robustWriteText }; } catch (_) {}
      }
    }
  };
  installClipboardFallback();
  document.addEventListener("click", routeLinkClick);
  document.addEventListener("auxclick", routeLinkClick);
  // On macOS WebKit, mouse clicks on <button> inside a popup menu do not transfer
  // focus. When a menu item is focused (e.g. DSH ModelSelect drill-down focusing the
  // checked radio), clicking another item causes focusout with relatedTarget=null.
  // ModelSelect's onBlur misinterprets this as focus leaving the menu, unmounting it
  // on mousedown before the click event can fire.
  // Intercepting focusout with relatedTarget=null originating from within [role="menu"]
  // prevents the false blur while preserving normal closeOutside on document mousedown.
  document.addEventListener("focusout", (event) => {
    const target = event.target && (event.target.closest ? event.target : event.target.parentElement);
    if (target && target.closest && target.closest('[role="menu"]') && event.relatedTarget === null) {
      event.stopImmediatePropagation();
    }
  }, true);
  document.addEventListener("contextmenu", (event) => {
    const payload = contextPayload(event);
    window.__DSH_CTX__ = payload;
    // WKWebView no longer provides the old private synchronous JS reader.
    // Send the current event context before WebKit constructs its native menu.
    if (!useCustomMenu) {
      const native = window.webkit?.messageHandlers?.dshContextMenu;
      if (typeof native?.postMessage === "function") {
        try { native.postMessage(payload); } catch (_) { /* preserve the system menu */ }
      }
    }
    const el = event.target instanceof Element ? event.target : (event.target && event.target.parentElement) || document.body;
    if (!el || !el.style) return;
    el.style.removeProperty("--custom-contextmenu");
    el.style.removeProperty("--custom-contextmenu-data");
    if (!useCustomMenu || isEditable(el)) return;
    if (!payload.text && !payload.href) return;
    const id = payload.text && payload.href ? "dsh-both" : payload.href ? "dsh-link" : "dsh-search";
    el.style.setProperty("--custom-contextmenu", id);
    el.style.setProperty("--custom-contextmenu-data", JSON.stringify(payload));
  }, true);
  // Core-only Chat has no Wails contextmenu.ts listener. Let DSH handlers win,
  // then ask the authenticated bridge to show only our fixed native menu.
  document.addEventListener("contextmenu", (event) => {
    if (!useCustomMenu || event.defaultPrevented) return;
    const el = event.target?.nodeType === 3 ? event.target.parentElement : event.target;
    if (!el || isEditable(el)) return;
    const payload = contextPayload(event);
    if (!payload.text && !payload.href) return;
    const show = window.__DSH_DESKTOP_CONTEXT_MENU__;
    if (typeof show !== "function") { reportOpenFailure(); return; }
    event.preventDefault();
    event.stopPropagation();
    try {
      Promise.resolve(show({
        x: Math.max(0, Math.round(event.clientX || 0)),
        y: Math.max(0, Math.round(event.clientY || 0)),
        text: payload.text, href: payload.href,
      })).catch(reportOpenFailure);
    } catch (_) { reportOpenFailure(); }
  });
})();
`

func desktopExternalJS(useCustomMenu bool) string {
	flag := "false"
	if useCustomMenu {
		flag = "true"
	}
	return strings.Replace(desktopExternalJSTemplate, "@@USE_CUSTOM_MENU@@", flag, 1)
}

func desktopChromeScript(nativeMac bool) string {
	return desktopWindowActionJS + desktopChromeBodyScript(nativeMac)
}

func desktopChromeBodyScript(nativeMac bool) string {
	external := desktopExternalJS(!nativeMac)
	if nativeMac {
		return fmt.Sprintf(desktopNativeWindowInsetJS, desktopNativeTopInset, desktopNativeContentInset, strconv.Quote(desktopSidebarTransitionCSS+desktopNativeWindowInsetCSS)) + external
	}
	return fmt.Sprintf(
		desktopChromeJS,
		desktopCustomTopInset,
		strconv.Quote(desktopChromeCSS+desktopSidebarTransitionCSS+desktopWindowInsetCSS),
		strconv.Quote(i18n.TActive("chrome.open_settings")),
		strconv.Quote(i18n.TActive("chrome.minimize")),
		strconv.Quote(i18n.TActive("chrome.maximize")),
		strconv.Quote(i18n.TActive("chrome.close")),
	) + external
}
