//go:build wails

package main

import (
	"fmt"
	"strconv"
	"strings"
)

const (
	desktopNativeTopInset = 40
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
  --dsh-window-top-inset: 40px;
}
.dsh-window-content:not(.dsh-window-management) {
  height: calc(100% - var(--dsh-window-top-inset)) !important;
  margin-top: var(--dsh-window-top-inset) !important;
}
.dsh-window-content.dsh-window-management {
  padding-top: calc(30px + var(--dsh-window-top-inset, 40px)) !important;
}
`

const desktopNativeWindowInsetCSS = `
.dsh-window-content {
  box-sizing: border-box !important;
  --dsh-window-collapsed-rail-width: 84px;
}
.dsh-window-content.dsh-window-management,
body > .app-shell {
  padding-top: calc(30px + var(--dsh-window-top-inset, 40px)) !important;
}
.dsh-window-sidebar,
#root [data-slot="sidebar"] > :first-child {
  box-sizing: border-box !important;
  padding-top: var(--dsh-window-top-inset, 40px) !important;
}
#root [data-sidebar-collapsed][data-details-collapsed],
#root [data-sidebar-collapsed].dsh-window-wide-rail {
  grid-template-columns: var(--dsh-window-collapsed-rail-width, 84px) minmax(0, 1fr) var(--dsh-window-details-width, 0px) !important;
}
#root [data-sidebar-collapsed][data-details-collapsed] {
  grid-template-columns: var(--dsh-window-collapsed-rail-width, 84px) minmax(0, 1fr) 0px !important;
}
#root [data-sidebar-collapsed] [data-slot="sidebar"] > :first-child {
  padding-left: calc((var(--dsh-window-collapsed-rail-width, 84px) - 36px) / 2) !important;
  padding-right: calc((var(--dsh-window-collapsed-rail-width, 84px) - 36px) / 2) !important;
}
.dsh-native-sidebar-cap {
  box-sizing: border-box;
  position: fixed;
  z-index: 2147483646;
  top: 0;
  left: 0;
  width: 84px;
  height: var(--dsh-window-top-inset, 40px);
  background: var(--dsw-specific-sidebar-fill, var(--dsw-alias-bg-base, #f7f8fa));
  pointer-events: none;
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
  const isManagement = %t;
  const topInset = %d;
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
    if (!isManagement) {
      let cap = document.getElementById("dsh-native-sidebar-cap");
      if (!cap && document.body) {
        cap = document.createElement("div");
        cap.id = "dsh-native-sidebar-cap";
        cap.className = "dsh-native-sidebar-cap";
        cap.style.height = topInset + "px";
        document.body.appendChild(cap);
      }
      const sidebarSlot = content.querySelector("[data-slot='sidebar']");
      const sidebar = sidebarSlot?.firstElementChild;
      if (!sidebar) {
        window.setTimeout(applyInset, 25);
        return;
      }
      sidebar.classList.add("dsh-window-sidebar");
      sidebar.style.setProperty("--dsh-window-top-inset", topInset + "px");

      const overlay = content.querySelector("[data-shell-overlay]");
      const frame = overlay ? overlay.parentElement
        : content.querySelector("[data-sidebar-collapsed], [data-details-collapsed]");
      if (frame && frame !== observedFrame) {
        frameObserver?.disconnect();
        observedFrame = frame;
        frameObserver = new MutationObserver(syncCollapsedRail);
        frameObserver.observe(frame, { attributes: true, attributeFilter: ["data-sidebar-collapsed", "style"] });
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
    if (!collapsed) return;
    const columns = frame.style.gridTemplateColumns;
    const detailsWidth = columns.match(/\s(\d+(?:\.\d+)?px)$/)?.[1] || "0px";
    pageContent?.style.setProperty("--dsh-window-details-width", detailsWidth);
  }
  applyInset();
})();
`

const desktopChromeJS = `
(() => {
  const isManagement = %t;
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
  if (!isManagement) addButton("settings", "打开桌面设置");
  addButton("minimize", "最小化");
  addButton("maximize", "最大化 / 还原");
  addButton("close", "关闭");
  chrome.append(drag, controls);
  document.documentElement.appendChild(chrome);

  const callWindow = (method) => {
    const current = window.wails && window.wails.Window;
    if (!current || typeof current[method] !== "function") {
      window.setTimeout(() => callWindow(method), 100);
      return;
    }
    current[method]();
  };
  const openManagement = () => {
    const call = window.wails && window.wails.Call && window.wails.Call.ByName;
    if (typeof call !== "function") {
      window.setTimeout(openManagement, 100);
      return;
    }
    void call("main.DSH.OpenManagement");
  };
  controls.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    switch (button.dataset.action) {
      case "settings": openManagement(); break;
      case "minimize": callWindow("Minimise"); break;
      case "maximize": callWindow("ToggleMaximise"); break;
      case "close": callWindow("Close"); break;
    }
  });
})();
`

func desktopChromeScript(management, nativeMac bool) string {
	if nativeMac {
		// macOS 的 HiddenInset 窗口让 WebView 铺满整个窗口；配置页只给自身
		// 留出顶部空间，Chat 则把 inset 精确施加到左侧 sidebar 内容，不移动主聊天区。
		return fmt.Sprintf(desktopNativeWindowInsetJS, management, desktopNativeTopInset, strconv.Quote(desktopNativeWindowInsetCSS))
	}
	return fmt.Sprintf(desktopChromeJS, management, desktopCustomTopInset, strconv.Quote(desktopChromeCSS+desktopWindowInsetCSS))
}
