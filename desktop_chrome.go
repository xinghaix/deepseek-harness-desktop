//go:build wails

package main

import (
	"fmt"
	"strconv"
	"strings"
)

const (
	// 紧凑统一标题栏比默认 unified 少一段垂直留白；注入层与它共用 36px
	// 安全区，保证交通灯、侧栏品牌和胶囊的定位基准一致。
	desktopNativeTopInset = 36
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

const desktopNativeWindowInsetCSS = `
.dsh-window-content {
  box-sizing: border-box !important;
  --dsh-window-collapsed-rail-width: 84px;
  --dsh-window-collapsed-brand-offset: 16px;
}
.dsh-window-content.dsh-window-management,
body > .app-shell {
  padding-top: calc(30px + var(--dsh-window-top-inset, 36px)) !important;
}
.dsh-window-sidebar,
#root [data-slot="sidebar"] > :first-child {
  box-sizing: border-box !important;
  padding-top: var(--dsh-window-top-inset, 36px) !important;
}
#root [data-sidebar-collapsed][data-details-collapsed],
#root [data-sidebar-collapsed].dsh-window-wide-rail {
  grid-template-columns: var(--dsh-window-collapsed-rail-width, 84px) minmax(0, 1fr) var(--dsh-window-details-width, 0px) !important;
}
#root [data-sidebar-collapsed][data-details-collapsed] {
  grid-template-columns: var(--dsh-window-collapsed-rail-width, 84px) minmax(0, 1fr) 0px !important;
}
#root [data-sidebar-collapsed] [data-slot="sidebar"] > :first-child {
  padding-top: calc(var(--dsh-window-top-inset, 36px) + var(--dsh-window-collapsed-brand-offset, 16px)) !important;
  padding-left: calc((var(--dsh-window-collapsed-rail-width, 84px) - 36px) / 2) !important;
  padding-right: calc((var(--dsh-window-collapsed-rail-width, 84px) - 36px) / 2) !important;
}
`

const desktopActionPillCSS = `
#dsh-desktop-action-pill {
  --dsh-pill-text: var(--dsw-alias-label-primary, #202531);
  --dsh-pill-muted: var(--dsw-alias-label-secondary, #6f7785);
  --dsh-pill-border: var(--dsw-alias-border-l2, rgba(122, 132, 150, .20));
  --dsh-pill-bg: var(--dsw-alias-bg-elevated, rgba(255, 255, 255, .90));
  position: fixed;
  z-index: 2147483646;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  min-height: 40px;
  max-width: calc(100vw - 32px);
  padding: 4px;
  border: 1px solid var(--dsh-pill-border);
  border-radius: 999px;
  background: var(--dsh-pill-bg);
  box-shadow: 0 8px 24px rgba(20, 26, 38, .14);
  backdrop-filter: blur(18px) saturate(1.35);
  -webkit-backdrop-filter: blur(18px) saturate(1.35);
  color: var(--dsh-pill-muted);
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transform: translate(-50%, -6px) scale(.98);
  transition: opacity .16s ease, transform .16s ease, visibility .16s ease;
  user-select: none;
}
#dsh-desktop-action-pill[data-visible="true"] {
  opacity: 1;
  visibility: visible;
  pointer-events: auto;
  transform: translate(-50%, 0) scale(1);
}
#dsh-desktop-action-pill[hidden],
#dsh-desktop-action-pill button[hidden] {
  display: none !important;
}
#dsh-desktop-action-pill button {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 999px;
  padding: 0;
  color: var(--dsh-pill-muted);
  background: transparent;
  cursor: pointer;
  transition: background .14s ease, color .14s ease, transform .14s ease;
}
#dsh-desktop-action-pill button:hover {
  color: var(--dsh-pill-text);
  background: var(--dsw-alias-interactive-bg-hover, rgba(40, 48, 65, .10));
}
#dsh-desktop-action-pill button:active {
  transform: scale(.92);
}
#dsh-desktop-action-pill button svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
}
@media (prefers-color-scheme: dark) {
  #dsh-desktop-action-pill {
    --dsh-pill-border: var(--dsw-alias-border-l2, rgba(255, 255, 255, .16));
    --dsh-pill-bg: var(--dsw-alias-bg-elevated, rgba(29, 34, 45, .92));
    box-shadow: 0 10px 28px rgba(0, 0, 0, .28);
  }
}
@media (prefers-reduced-motion: reduce) {
  #dsh-desktop-action-pill,
  #dsh-desktop-action-pill button {
    transition: none;
  }
}
`

func desktopActionPillCSSForWindow(management bool) string {
	if management {
		return ""
	}
	return desktopActionPillCSS
}

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

// desktopActionPillScript 为 Chat 提供可切换的折叠态快捷操作胶囊。运行时始终以隐藏
// 形态安装轻量控制器，只有显式开启时才显示；这样已有窗口可以通过 ExecJS 切换模式，
// 通过 DSH 已有的可访问名称和稳定的 sidebar 结构转发原生操作，不复制会话或布局状态。
const desktopActionPillScript = `
  if (!isManagement && !window.__dshDesktopActionPillInstalled) {
    window.__dshDesktopActionPillInstalled = true;
    const actionPillId = "dsh-desktop-action-pill";
    const actionPillIcons = {
      toggle: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h10M4 18h16"/></svg>',
      new: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h9A1.5 1.5 0 0 1 16 5.5v8A1.5 1.5 0 0 1 14.5 15h-5L6 18v-3.2a1.5 1.5 0 0 1-2-1.3Z"/><path d="M19 8v6.5A1.5 1.5 0 0 1 17.5 16H16M19 11h-5M16.5 8.5v5"/></svg>',
      search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="5.8"/><path d="m15.2 15.2 4.5 4.5"/></svg>',
      settings: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8.4a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 0 0 0-7.2Z"/><path d="m19.4 13.4 1.1.8-1.8 3.1-1.3-.5a7.5 7.5 0 0 1-1.6.9l-.2 1.4h-3.6l-.2-1.4a7.5 7.5 0 0 1-1.6-.9l-1.3.5-1.8-3.1 1.1-.8a7.5 7.5 0 0 1 0-1.8l-1.1-.8 1.8-3.1 1.3.5a7.5 7.5 0 0 1 1.6-.9l.2-1.4h3.6l.2 1.4a7.5 7.5 0 0 1 1.6.9l1.3-.5 1.8 3.1-1.1.8a7.5 7.5 0 0 1 0 1.8Z"/></svg>'
    };
    const actionPillText = {
      zh: { toolbar: "Chat 快捷操作", toggle: "展开侧边栏", new: "新建会话", search: "搜索会话", settings: "打开桌面设置" },
      en: { toolbar: "Chat quick actions", toggle: "Open sidebar", new: "New session", search: "Search sessions", settings: "Open desktop settings" }
    };
    let actionPill = null;
    let observedContent = null;
    let observedFrame = null;
    let frameObserver = null;
    let contentObserver = null;
    let resizeObserver = null;
    let documentObserver = null;
    let languageObserver = null;
    let syncQueued = false;
    let actionPillEnabled = %t;

    const languageKey = () => String(document.documentElement.lang || "").toLowerCase().startsWith("zh") ? "zh" : "en";
    const text = () => actionPillText[languageKey()];
    const setButtonLabel = (button, label) => {
      button.title = label;
      button.setAttribute("aria-label", label);
    };
    const ensurePill = () => {
      if (actionPill && actionPill.isConnected) return actionPill;
      actionPill = document.getElementById(actionPillId);
      if (actionPill) return actionPill;
      actionPill = document.createElement("div");
      actionPill.id = actionPillId;
      actionPill.setAttribute("role", "toolbar");
      actionPill.hidden = true;
      for (const action of ["toggle", "new", "search", "settings"]) {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.action = action;
        button.innerHTML = actionPillIcons[action];
        actionPill.appendChild(button);
      }
      actionPill.addEventListener("click", (event) => {
        const button = event.target.closest("button[data-action]");
        if (!button) return;
        event.preventDefault();
        event.stopPropagation();
        const action = button.dataset.action;
        if (action === "settings") {
          const call = window.wails && window.wails.Call && window.wails.Call.ByName;
          if (typeof call === "function") void call("main.DSH.OpenManagement");
          return;
        }
        const frame = observedFrame || findFrame(getContent());
        const sidebar = findSidebar(frame);
        const target = action === "toggle"
          ? findToggleButton(sidebar)
          : action === "new" ? findNewSessionButton(sidebar) : findSearchButton(sidebar);
        if (target) {
          target.click();
          scheduleSync();
        }
      });
      (document.body || document.documentElement).appendChild(actionPill);
      return actionPill;
    };
    const updateLabels = () => {
      const pill = ensurePill();
      const labels = text();
      pill.setAttribute("aria-label", labels.toolbar);
      for (const button of pill.querySelectorAll("button[data-action]")) {
        const action = button.dataset.action;
        if (action && labels[action]) setButtonLabel(button, labels[action]);
      }
    };
    const getContent = () => document.getElementById("root");
    const findFrame = (content) => {
      if (!content) return null;
      const overlay = content.querySelector("[data-shell-overlay]");
      return overlay && overlay.parentElement
        ? overlay.parentElement
        : content.querySelector("[data-sidebar-collapsed], [data-details-collapsed]");
    };
    const findDirectChild = (frame, selector) => {
      const match = frame && frame.querySelector(selector);
      if (!match) return null;
      let child = match;
      while (child.parentElement && child.parentElement !== frame) child = child.parentElement;
      return child;
    };
    const findCenter = (frame) => findDirectChild(frame, "[data-slot='conversation']") || (frame && frame.children[1]) || null;
    const findSidebar = (frame) => {
      const slot = frame && frame.querySelector("[data-slot='sidebar']");
      return slot && slot.firstElementChild;
    };
    const labelIncludes = (button, words) => {
      const label = (String(button.getAttribute("aria-label") || "") + " " + String(button.getAttribute("title") || "")).toLowerCase();
      return words.some(word => label.includes(word));
    };
    const findToggleButton = (sidebar) => {
      const logoRow = sidebar && sidebar.firstElementChild;
      const buttons = logoRow ? logoRow.querySelectorAll("button") : [];
      if (buttons.length > 0) return buttons[buttons.length - 1];
      return sidebar && [...sidebar.querySelectorAll("button")].find(button => labelIncludes(button, ["sidebar", "侧边栏", "侧栏"]));
    };
    const findNewSessionButton = (sidebar) => {
      if (!sidebar) return null;
      const buttons = [...sidebar.querySelectorAll("button")];
      const labeled = buttons.find(button => labelIncludes(button, ["new session", "new conversation", "新建会话", "新会话", "新对话"]));
      if (labeled) return labeled;
      const logoRow = sidebar.firstElementChild;
      const logoButtonCount = logoRow ? logoRow.querySelectorAll("button").length : 0;
      return buttons[logoButtonCount] || null;
    };
    const findSearchButton = (sidebar) => {
      if (!sidebar) return null;
      return [...sidebar.querySelectorAll("button")].find(button => labelIncludes(button, ["search", "搜索", "查找", "检索"]));
    };
    const bindFrame = (frame) => {
      if (frame === observedFrame) return;
      frameObserver?.disconnect();
      resizeObserver?.disconnect();
      observedFrame = frame;
      if (!frame) return;
      frameObserver = new MutationObserver(scheduleSync);
      frameObserver.observe(frame, { attributes: true, attributeFilter: ["data-sidebar-collapsed", "style"], childList: true });
      if (typeof ResizeObserver === "function") {
        resizeObserver = new ResizeObserver(scheduleSync);
        resizeObserver.observe(frame);
        const center = findCenter(frame);
        if (center) resizeObserver.observe(center);
      }
    };
    const sync = () => {
      const pill = ensurePill();
      updateLabels();
      const content = getContent();
      if (content !== observedContent) {
        contentObserver?.disconnect();
        observedContent = content;
        if (content) {
          contentObserver = new MutationObserver(scheduleSync);
          contentObserver.observe(content, { childList: true });
        }
      }
      const frame = findFrame(content);
      bindFrame(frame);
      if (!frame) {
        pill.hidden = true;
        pill.dataset.visible = "false";
        pill.setAttribute("aria-hidden", "true");
        return;
      }
      const center = findCenter(frame);
      const centerRect = center && center.getBoundingClientRect();
      const frameRect = frame.getBoundingClientRect();
      const sidebar = findSidebar(frame);
      const visible = actionPillEnabled && frame.hasAttribute("data-sidebar-collapsed") && centerRect && centerRect.width >= 220 && centerRect.height > 0;
      pill.hidden = !visible;
      pill.dataset.visible = visible ? "true" : "false";
      pill.setAttribute("aria-hidden", visible ? "false" : "true");
      if (!visible) return;
      pill.style.left = (centerRect.left + centerRect.width / 2) + "px";
      pill.style.top = Math.max(frameRect.top + 8, topInset + 8) + "px";
      pill.style.maxWidth = Math.max(180, Math.min(360, centerRect.width - 24)) + "px";
      const newButton = pill.querySelector("button[data-action='new']");
      const searchButton = pill.querySelector("button[data-action='search']");
      if (newButton) newButton.hidden = !findNewSessionButton(sidebar);
      if (searchButton) searchButton.hidden = !findSearchButton(sidebar);
    };
    function scheduleSync() {
      if (syncQueued) return;
      syncQueued = true;
      window.requestAnimationFrame(() => {
        syncQueued = false;
        sync();
      });
    }
    updateLabels();
    if (document.body) {
      documentObserver = new MutationObserver(scheduleSync);
      documentObserver.observe(document.body, { childList: true });
    }
    languageObserver = new MutationObserver(updateLabels);
    languageObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
    window.addEventListener("resize", scheduleSync, { passive: true });
    window.__dshDesktopActionPillSetEnabled = (enabled) => {
      actionPillEnabled = enabled === true;
      scheduleSync();
    };
    sync();
  }
`

func desktopActionPillScriptForMode(enabled bool) string {
	return fmt.Sprintf(desktopActionPillScript, enabled)
}

const desktopActionPillModeScript = `
(() => {
  if (typeof window.__dshDesktopActionPillSetEnabled === "function") {
    window.__dshDesktopActionPillSetEnabled(%t);
  }
})();
`

func desktopActionPillModeScriptForMode(enabled bool) string {
	return fmt.Sprintf(desktopActionPillModeScript, enabled)
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
      const sidebarSlot = content.querySelector("[data-slot='sidebar']");
      const sidebar = sidebarSlot?.firstElementChild;
      if (!sidebar) {
        window.setTimeout(applyInset, 25);
        return;
      }
      const frame = findFrame(content);
      sidebar.classList.add("dsh-window-sidebar");
      sidebar.style.setProperty("--dsh-window-top-inset", topInset + "px");
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
  applyInset();
%s
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
%s
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
	return desktopChromeScriptWithMode(management, nativeMac, false)
}

func desktopChromeScriptWithMode(management, nativeMac, useActionPill bool) string {
	actionPillScript := ""
	if !management {
		actionPillScript = desktopActionPillScriptForMode(useActionPill)
	}
	pillCSS := desktopActionPillCSSForWindow(management)
	if nativeMac {
		// macOS 的 HiddenInset 窗口让 WebView 铺满整个窗口；配置页只给自身
		// 留出顶部空间，Chat 则把 inset 精确施加到左侧 sidebar 内容，不移动主聊天区。
		return fmt.Sprintf(desktopNativeWindowInsetJS, management, desktopNativeTopInset, strconv.Quote(desktopNativeWindowInsetCSS+pillCSS), actionPillScript)
	}
	return fmt.Sprintf(desktopChromeJS, management, desktopCustomTopInset, strconv.Quote(desktopChromeCSS+desktopWindowInsetCSS+pillCSS), actionPillScript)
}
