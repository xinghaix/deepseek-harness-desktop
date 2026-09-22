import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("./lib/client.js", import.meta.url), "utf8");
assert.match(source, /installHoverMessageActions/);
assert.match(source, /pickStickyPrompt/);
assert.match(source, /data-dsh-desktop-prompt-overlay/);
assert.match(source, /PROMPT_OVERLAY_MAX_WIDTH_PX/);
assert.match(source, /markPromptActionDone/);
assert.doesNotMatch(source, /syncStickyColumnWidth/);
assert.doesNotMatch(source, /STICKY_PROMPT_FLOAT_ATTR/);
// The overlay and the settings section both take their label from the shared catalog.
assert.match(source, /t\("bridge\.enhanced_hover_title"\)/);
assert.match(source, /t\("bridge\.overlay_label"\)/);
assert.doesNotMatch(source, /data-actions-reveal="always"/);
assert.doesNotMatch(source, /navigator\.clipboard\.writeText\(messageText\)/);
// Unloaded historical prompts must use DSH's official full-log outline and jump loader rather
// than relying only on currently mounted DOM nodes.
assert.match(source, /turnOutline/);
assert.match(source, /loadThrough/);

const observers = new Set();
const windowListeners = new Map();

class FakeElement {
  constructor(tagName) {
    this.tagName = String(tagName || "div").toUpperCase();
    this.attributes = new Map();
    this.childNodes = [];
    this.parentNode = null;
    this.parentElement = null;
    this._textContent = "";
    this.rect = { top: 0, bottom: 0, left: 0, right: 0 };
    this.overflowY = "visible";
    this.style = {
      _props: Object.create(null),
      setProperty(k, v, _priority) {
        const key = String(k);
        const val = String(v);
        this._props[key] = val;
        this[key] = val;
        const camel = key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        this[camel] = val;
      },
      removeProperty(k) { delete this._props[k]; delete this[k]; },
    };
    const attrs = this.attributes;
    this.dataset = new Proxy({}, {
      set(_target, key, value) {
        const attr = "data-" + String(key).replace(/[A-Z]/g, (ch) => "-" + ch.toLowerCase());
        attrs.set(attr, String(value));
        return true;
      },
      get(_target, key) {
        const attr = "data-" + String(key).replace(/[A-Z]/g, (ch) => "-" + ch.toLowerCase());
        return attrs.get(attr);
      },
    });
  }
  get textContent() {
    return this._textContent + this.childNodes.map((child) => child.textContent || "").join("");
  }
  set textContent(value) { this._textContent = String(value ?? ""); }
  setAttribute(name, value) { this.attributes.set(name, String(value ?? "")); }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  hasAttribute(name) { return this.attributes.has(name); }
  removeAttribute(name) { this.attributes.delete(name); }
  getBoundingClientRect() { return this.rect; }
  get clientWidth() { return Math.max(0, (this.rect.right || 0) - (this.rect.left || 0)); }
  get firstChild() { return this.childNodes[0] || null; }
  get children() { return this.childNodes; }
  get innerText() { return this.textContent; }
  set innerText(value) { this._textContent = String(value ?? ""); }
  contains(node) {
    let cur = node;
    while (cur) {
      if (cur === this) return true;
      cur = cur.parentElement;
    }
    return false;
  }
  addEventListener(type, listener) {
    const list = this._listeners?.get(type) || [];
    list.push(listener);
    if (!this._listeners) this._listeners = new Map();
    this._listeners.set(type, list);
  }
  removeEventListener(type, listener) {
    const list = (this._listeners?.get(type) || []).filter((item) => item !== listener);
    if (!this._listeners) this._listeners = new Map();
    this._listeners.set(type, list);
  }
  dispatchEvent(event) {
    const value = event || {};
    if (!value.type) throw new Error("event type required");
    if (!value.target) value.target = this;
    value.currentTarget = this;
    value.preventDefault ||= () => { value.defaultPrevented = true; };
    value.stopPropagation ||= () => { value.propagationStopped = true; };
    for (const listener of this._listeners?.get(value.type) || []) listener(value);
    return !value.defaultPrevented;
  }
  click() {
    this.clicked = (this.clicked || 0) + 1;
    this.dispatchEvent({ type: "click" });
  }
  cloneNode(deep) {
    const clone = new FakeElement(this.tagName);
    for (const [k, v] of this.attributes) clone.attributes.set(k, v);
    clone._textContent = this._textContent;
    if (deep) {
      for (const child of this.childNodes) clone.appendChild(child.cloneNode(true));
    }
    return clone;
  }
  insertBefore(child, ref) {
    child.parentNode = this;
    child.parentElement = this;
    const idx = ref ? this.childNodes.indexOf(ref) : -1;
    if (idx >= 0) this.childNodes.splice(idx, 0, child);
    else this.childNodes.push(child);
    for (const observer of observers) observer.callback([{ target: this, type: "childList" }]);
    return child;
  }
  appendChild(child) {
    child.parentNode = this;
    child.parentElement = this;
    this.childNodes.push(child);
    for (const observer of observers) observer.callback([{ target: this, type: "childList" }]);
    return child;
  }
  removeChild(child) {
    this.childNodes = this.childNodes.filter((node) => node !== child);
    child.parentNode = null;
    child.parentElement = null;
    return child;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  closest(selector) {
    let cur = this;
    while (cur) {
      if (matches(cur, selector)) return cur;
      cur = cur.parentElement;
    }
    return null;
  }
  querySelectorAll(selector) {
    const out = [];
    const visit = (node) => {
      if (matches(node, selector)) out.push(node);
      for (const child of node.childNodes || []) visit(child);
    };
    for (const child of this.childNodes) visit(child);
    return out;
  }
}

function matches(node, selector) {
  if (!node || !node.tagName) return false;
  const parts = String(selector).split(",").map((part) => part.trim());
  return parts.some((part) => matchOne(node, part));
}

function matchOne(node, part) {
  if (part === "style") return node.tagName === "STYLE";
  if (part === "img") return node.tagName === "IMG";
  if (/^[a-z][a-z0-9]*$/i.test(part)) return node.tagName === part.toUpperCase();
  const pluginCss = part.match(/^style\[data-plugin-css="([^"]+)"\]$/);
  if (pluginCss) return node.tagName === "STYLE" && node.getAttribute("data-plugin-css") === pluginCss[1];
  const attrEq = part.match(/^\[([^=\]]+)=["']?([^\]"']+)["']?\]$/);
  if (attrEq) return node.getAttribute(attrEq[1]) === attrEq[2];
  const attrOnly = part.match(/^\[([^\]=]+)\]$/);
  if (attrOnly) return node.hasAttribute(attrOnly[1]);
  if (part.includes("[data-chat-flow-key]")) return node.hasAttribute("data-chat-flow-key") || node.hasAttribute("data-chat-flow-kind");
  return false;
}

const documentElement = new FakeElement("html");
const head = new FakeElement("head");
const body = new FakeElement("body");
const scroll = new FakeElement("div");
scroll.overflowY = "auto";
scroll.rect = { top: 80, bottom: 800, left: 0, right: 800 };
documentElement.appendChild(head);
documentElement.appendChild(body);
body.appendChild(scroll);
// Official DSH renders this control at the top of the conversation when older history exists.
const olderSlot = new FakeElement("div");
olderSlot.setAttribute("class", "OfficialHash_older");
const olderButton = new FakeElement("button");
olderButton.setAttribute("type", "button");
olderButton.innerText = "加载更早";
olderButton.rect = { top: 80, bottom: 116, left: 240, right: 320 };
olderSlot.appendChild(olderButton);
scroll.appendChild(olderSlot);

function addFlow(kind, top, bottom) {
  const el = new FakeElement("div");
  el.setAttribute("data-chat-flow-kind", kind);
  el.setAttribute("data-chat-flow-key", kind + "-" + top);
  el.rect = { top, bottom, left: 0, right: 400 };
  scroll.appendChild(el);
  return el;
}

const u1 = addFlow("user", -200, -120);
u1.setAttribute("data-chat-turn", "1");
u1.innerText = "first prompt";
const a1 = addFlow("assistant", -110, 40);
const u2 = addFlow("user", 50, 110);
u2.setAttribute("data-chat-turn", "2");
u2.innerText = "second prompt with context...";
u2.setAttribute("id", "prompt-u2");
const mediaWrap = new FakeElement("div");
mediaWrap.setAttribute("data-attachment", "images");
const img = new FakeElement("img");
img.setAttribute("src", "https://example.test/shot.png");
let nativeImageClicks = 0;
img.click = () => { nativeImageClicks += 1; };
const img2 = new FakeElement("img");
img2.setAttribute("src", "https://example.test/shot-2.png");
mediaWrap.appendChild(img);
mediaWrap.appendChild(img2);
u2.appendChild(mediaWrap);
const textWrap = new FakeElement("div");
const md = new FakeElement("div");
md.setAttribute("data-markdown-body", "");
md.innerText = "second prompt with context...";
textWrap.appendChild(md);
u2.appendChild(textWrap);
// DSH image attachments expose a filename AND the <img>; the thumbnail must win.
const namedImageWrap = new FakeElement("div");
namedImageWrap.setAttribute("data-attachment", "image");
namedImageWrap.setAttribute("data-filename", "image.png");
const img3 = new FakeElement("img");
img3.setAttribute("src", "https://example.test/shot-3.png");
namedImageWrap.appendChild(img3);
u2.appendChild(namedImageWrap);
const fileCard = new FakeElement("button");
fileCard.setAttribute("data-attachment", "file");
fileCard.innerText = "report.csv";
u2.appendChild(fileCard);
// --- The shapes that actually appear in DSH Chat ---------------------------------------
// An image attachment is a CLICKABLE element carrying a native filename tooltip. It must
// render as a thumbnail and must never be proxied into the action strip; treating it as an
// operation is exactly what produced a row of "..." buttons and no attachment at all.
const imageAttachment = new FakeElement("button");
imageAttachment.setAttribute("role", "button");
imageAttachment.setAttribute("title", "image.png，点击查看原图");
let attachmentButtonClicks = 0;
imageAttachment.click = () => { attachmentButtonClicks += 1; };
const attachedImage = new FakeElement("img");
attachedImage.setAttribute("src", "https://example.test/shot-4.png");
let attachedImageClicks = 0;
attachedImage.click = () => { attachedImageClicks += 1; };
imageAttachment.appendChild(attachedImage);
u2.appendChild(imageAttachment);
// A file attachment that draws a file-type icon inside a clickable card: the name wins, so
// it is a file chip — its icon must not leak into the thumbnail row.
const fileAttachment = new FakeElement("button");
fileAttachment.setAttribute("title", "quarterly.xlsx");
fileAttachment.setAttribute("data-file-name", "quarterly.xlsx");
const fileTypeIcon = new FakeElement("img");
fileTypeIcon.setAttribute("src", "https://example.test/icons/xlsx.svg");
fileAttachment.appendChild(fileTypeIcon);
u2.appendChild(fileAttachment);
const opsRow = new FakeElement("div");
const copyBtn = new FakeElement("button");
copyBtn.setAttribute("aria-label", "复制");
let copyClicks = 0;
copyBtn.click = () => { copyClicks += 1; };
const futureAction = new FakeElement("div");
futureAction.setAttribute("role", "button");
futureAction.setAttribute("data-official-action", "future-shape");
futureAction.innerText = "官方新操作";
let futureClicks = 0;
futureAction.click = () => { futureClicks += 1; };
const timestamp = new FakeElement("time");
timestamp.innerText = "9月17日 17:57";
opsRow.appendChild(timestamp);
opsRow.appendChild(copyBtn);
opsRow.appendChild(futureAction);
u2.appendChild(opsRow);
// Reverse guard: a genuine message action that carries an icon image must stay an action.
const iconAction = new FakeElement("button");
iconAction.setAttribute("aria-label", "删除");
const iconActionIcon = new FakeElement("img");
iconActionIcon.setAttribute("src", "https://example.test/icons/trash.svg");
iconAction.appendChild(iconActionIcon);
u2.appendChild(iconAction);
const plainBubble = new FakeElement("div");
plainBubble.innerText = "plain prompt body";
const plainCopy = new FakeElement("button");
plainCopy.setAttribute("aria-label", "复制");
plainBubble.appendChild(plainCopy);
u2.appendChild(plainBubble);
// An attachment-only prompt: an image and a file, no text at all. Official Chat offers no copy
// there — there is nothing to copy — and the card must not re-introduce one just because the
// native strip happens to render a control while it is being mirrored.
const u3 = addFlow("user", 60, 120);
u3.setAttribute("data-chat-turn", "3");
// Inert until this prompt is selected below: a zero-size node is not renderable, so it stays
// invisible to prompt selection and cannot perturb the assertions above.
u3.rect = { top: 0, bottom: 0, left: 0, right: 0 };
const u3Attachment = new FakeElement("button");
u3Attachment.setAttribute("role", "button");
u3Attachment.setAttribute("title", "photo.png，点击查看原图");
const u3Image = new FakeElement("img");
u3Image.setAttribute("src", "https://example.test/only-photo.png");
u3Attachment.appendChild(u3Image);
u3.appendChild(u3Attachment);
const u3File = new FakeElement("button");
u3File.setAttribute("title", "notes.pdf");
u3File.setAttribute("data-filename", "notes.pdf");
u3.appendChild(u3File);
const u3Ops = new FakeElement("div");
const u3Copy = new FakeElement("button");
u3Copy.setAttribute("aria-label", "复制");
let u3CopyClicks = 0;
u3Copy.click = () => { u3CopyClicks += 1; };
const u3Time = new FakeElement("time");
u3Time.innerText = "9月18日 08:15";
u3Ops.appendChild(u3Time);
u3Ops.appendChild(u3Copy);
u3.appendChild(u3Ops);
const a3 = addFlow("assistant", 0, 0);
a3.rect = { top: 0, bottom: 0, left: 0, right: 0 };
const a2 = addFlow("assistant", 120, 900);
const composer = new FakeElement("div");
// Realistic: the official input box is INSET from the pane, not pane-width. The card is
// expected to match this box, so the fixture must not be pane-wide or the "reject the
// pane-level ancestor" rule would discard the composer itself.
composer.rect = { top: 720, bottom: 800, left: 40, right: 760 };
const textarea = new FakeElement("textarea");
textarea.rect = { top: 730, bottom: 770, left: 56, right: 744 };
composer.appendChild(textarea);
body.appendChild(composer);

const document = {
  documentElement,
  head,
  body,
  scrollingElement: documentElement,
  createElement(tag) { return new FakeElement(tag); },
  // The action glyphs are inline SVG built with createElementNS, because an innerHTML
  // assignment would throw on a page that enforces Trusted Types.
  createElementNS(namespace, tag) {
    const el = new FakeElement(tag);
    el.namespaceURI = namespace;
    return el;
  },
  querySelector(selector) {
    if (matches(documentElement, selector)) return documentElement;
    return documentElement.querySelector(selector);
  },
  querySelectorAll(selector) {
    const out = [];
    if (matches(documentElement, selector)) out.push(documentElement);
    return out.concat(documentElement.querySelectorAll(selector));
  },
};

const window = {
  innerHeight: 800,
  addEventListener(name, fn, _opts) {
    const list = windowListeners.get(name) || [];
    list.push(fn);
    windowListeners.set(name, list);
  },
  removeEventListener(name, fn) {
    const list = (windowListeners.get(name) || []).filter((item) => item !== fn);
    windowListeners.set(name, list);
  },
  dispatchEvent(event) {
    for (const fn of windowListeners.get(event.type) || []) fn(event);
    return true;
  },
  __ModuleLoader__: { load(value) { window.__registration = value; } },
};

class MutationObserver {
  constructor(callback) { this.callback = callback; }
  observe() { observers.add(this); }
  disconnect() { observers.delete(this); }
}

class CustomEvent {
  constructor(type, init = {}) { this.type = type; this.detail = init.detail; }
}

function getComputedStyle(el) {
  return {
    overflowY: el && el.overflowY || "visible",
    marginLeft: (el && el.style && el.style.marginLeft) || "0px",
    // The action strip is centred on the last LINE box, which needs the used line height. The
    // overlay renders .86rem text at 1.45; a fixture can override either per element.
    fontSize: (el && el.fontSize) || "13.76px",
    lineHeight: (el && el.lineHeight) || "1.45",
  };
}

class ResizeObserver {
  static instances = [];
  constructor(cb) { this.cb = cb; this.targets = new Set(); this.observeCalls = 0; this.disconnectCalls = 0; ResizeObserver.instances.push(this); }
  observe(el) { if (el) { this.targets.add(el); this.observeCalls++; } }
  unobserve(el) { this.targets.delete(el); }
  disconnect() { this.targets.clear(); this.disconnectCalls++; }
  trigger(target) { if (!target || this.targets.has(target)) this.cb(target ? [{ target }] : []); }
}
vm.runInNewContext(source, {
  window,
  document,
  MutationObserver,
  ResizeObserver,
  CustomEvent,
  getComputedStyle,
  // The settings panel branches on the host platform for shortcut labels.
  navigator: { platform: "MacIntel", userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" },
  requestAnimationFrame: (fn) => { fn(); return 0; },
  cancelAnimationFrame: () => {},
  setTimeout: () => 0,
  clearTimeout: () => {},
  console,
}, { filename: "desktop-bridge-sticky-prompt.js" });

const registration = window.__registration;
assert.ok(registration, "client registration missing");
const react = {
  useState: (value) => [value, () => {}],
  useRef: (value) => ({ current: value }),
  useCallback: (fn) => fn,
  // Effects are skipped: this harness inspects static structure, not data flow.
  useEffect: () => {},
};
const client = registration.factory((name) => {
  if (name === "react") return react;
  if (name === "react/jsx-runtime") {
    // Record elements so the settings tab can be rendered and inspected structurally.
    return {
      jsx: (type, props) => ({ type, props }),
      jsxs: (type, props) => ({ type, props }),
      Fragment: Symbol("Fragment"),
    };
  }
  throw new Error("unexpected require " + name);
});

let navRegistrations = 0;
let lastNavConfig = null;
let lastNavRender = null;
const cleanups = [];
const historyLoadCalls = [];
const historyOutline = [{ turn: 0, seq: 42, prompt: "archived prompt with attachment", response: "" }];
let historyNodeMounted = false;
let historyNode = null;
const historyOutlineFace = {
  getSnapshot() { return historyOutline; },
  subscribe() { return () => {}; }
};
const historySession = {
  projections: { faceOf(key) { return key === "turnOutline" ? historyOutlineFace : null; } },
  subscribe() { return () => {}; },
  loadThrough(seq) {
    historyLoadCalls.push(seq);
    if (seq === 42 && !historyNodeMounted) {
      historyNodeMounted = true;
      const oldPrompt = new FakeElement("div");
      historyNode = oldPrompt;
      oldPrompt.setAttribute("data-chat-flow-kind", "user");
      oldPrompt.setAttribute("data-chat-flow-key", "history-u0");
      oldPrompt.setAttribute("data-chat-turn", "0");
      oldPrompt.rect = { top: -260, bottom: -120, left: 0, right: 400 };
      oldPrompt.innerText = "archived prompt with attachment";
      const oldImage = new FakeElement("img");
      oldImage.setAttribute("src", "https://example.test/archived.png");
      const oldMedia = new FakeElement("div");
      oldMedia.setAttribute("data-attachment", "image");
      oldMedia.appendChild(oldImage);
      oldPrompt.appendChild(oldMedia);
      const oldFile = new FakeElement("div");
      oldFile.setAttribute("data-attachment", "file");
      oldFile.setAttribute("data-filename", "archived.pdf");
      oldFile.innerText = "archived.pdf";
      oldPrompt.appendChild(oldFile);
      scroll.appendChild(oldPrompt);
    }
    return Promise.resolve();
  }
};
const historySessions = {
  list: {
    getSnapshot() { return { current: "session-current", byId: { "session-current": { id: "session-current" } } }; },
    subscribe() { return () => {}; }
  },
  binding(id) { return id === "session-current" ? { session: historySession } : null; }
};
window.__DSH_DESKTOP_ACTIVE_SESSION_ID__ = "session-current";
client.apply({
  // Mirrors ctx.slots.inject(slotName, callback) -> disposer.
  slots: {
    inject(_name, callback) { navRegistrations += 1; return callback(); },
    register(config, render) { lastNavConfig = config; lastNavRender = render; return () => {}; },
  },
  effect(fn) {
    const cleanup = fn();
    if (typeof cleanup === "function") cleanups.push(cleanup);
  },
  connection: {
    rpc: {
      call(_channel, method) {
        if (method === "prefs") {
          return Promise.resolve({ ok: true, value: { hoverMessageActions: true, showCopySessionId: true, resolvedLocale: "zh-CN" } });
        }
        // Mirrors GET /v1/locale-bundle: the shared embedded catalog.
        if (method === "localeBundle") {
          return Promise.resolve({
            ok: true,
            value: {
              locale: "zh-CN",
              catalog: {
                "bridge.overlay_label": "悬浮我方提示词",
                "bridge.overlay_toolbar": "提示词操作",
                "bridge.overlay_hidden": "（提示词内容不可见）",
                "bridge.overlay_action": "操作",
                "bridge.overlay_attachment": "附件",
                "bridge.overlay_copied": "已复制",
                "bridge.overlay_more": "还有 {0} 个附件",
                // The settings nav label: resolved once by its owner, so it must be present
                // in the catalog before that first render (this is the raw-key regression).
                "tray.open_settings": "桌面设置",
                // Keys the settings panel itself renders.
                "bridge.enhanced_hover_title": "悬浮我方提示词",
                "bridge.overlay_max_lines": "文案最大显示行数",
                "bridge.overlay_max_lines_hint": "悬浮卡片最多显示的文案行数，超出后可上下滑动查看。卡片同时会收窄以适配 Chat 输入框上方的空间，不会遮挡输入框。",
              },
            },
          });
        }
        return Promise.resolve({ ok: true, value: {} });
      },
    },
  },
  sessions: historySessions,
  remote: null,
});

const overlays = () => document.querySelectorAll("[data-dsh-desktop-prompt-overlay]");
const hoverStyle = document.querySelector('style[data-plugin-css="deepseek-harness-desktop-hover-message-actions"]');
assert.ok(hoverStyle, "overlay CSS tag missing");
assert.match(hoverStyle.textContent, /data-dsh-desktop-prompt-overlay/);
// The strip is absolutely positioned ON the last line of the card, which JS centres it on.
// As a flow row BELOW the text it read as offset down for a single-line prompt, and on an
// attachment-only card it drifted a whole row lower, because a "last line" of attachments is
// a tall row rather than a line.
assert.match(hoverStyle.textContent, /\[data-dsh-desktop-prompt-overlay\] \{ position: fixed[^}]*display: flex !important; flex-direction: column/);
assert.match(hoverStyle.textContent, /\[data-dsh-desktop-prompt-overlay\] \[data-dsh-desktop-prompt-overlay-toolbar\] \{ position: absolute !important[^}]*right: 12px !important/);
// It must be out of flow — no flex row of its own, no margin reserving space under the text.
assert.doesNotMatch(hoverStyle.textContent, /data-dsh-desktop-prompt-overlay-toolbar\] \{ position: absolute[^}]*align-self: flex-end/, "the strip does not reserve a flex row");
assert.doesNotMatch(hoverStyle.textContent, /data-dsh-desktop-prompt-overlay-toolbar\] \{ position: absolute[^}]*margin: 8px 12px 12px/, "the strip keeps no flow margins");
// The strip must leave the layout entirely while hidden. It used to be hidden with opacity
// only, which kept its row (26px + 8/12px margins) reserved inside the card — a permanent
// blank band under the text, which is the defect these assertions pin down.
assert.match(hoverStyle.textContent, /data-dsh-desktop-prompt-overlay-toolbar\] \{ position: absolute !important[^}]*display: none !important/);
assert.doesNotMatch(hoverStyle.textContent, /data-dsh-desktop-prompt-overlay-toolbar\] \{ position: absolute[^}]*opacity: 0 !important/, "the strip is not hidden by opacity alone");
// ...and it is restored, with a soft entrance, on hover/focus.
assert.match(hoverStyle.textContent, /data-dsh-desktop-hover-message-actions\] \[data-dsh-desktop-prompt-overlay\]:hover \[data-dsh-desktop-prompt-overlay-toolbar\][^}]*display: flex !important/);
assert.match(hoverStyle.textContent, /@keyframes dsh-desktop-prompt-overlay-strip-in \{ from \{ opacity: 0; \} to \{ opacity: 1; \} \}/);
for (const trigger of [":focus", ":focus-within"]) {
  assert.ok(hoverStyle.textContent.includes("data-dsh-desktop-prompt-overlay\]" + trigger + " [data-dsh-desktop-prompt-overlay-toolbar\]"), "the strip is reachable via " + trigger);
}
// The action button is BARE while idle. A permanently drawn hairline circle put TWO nested
// outlines inside the pill; official Chat only paints a disc while the control is hovered or
// pressed, which is the reference the design was matched against.
assert.match(hoverStyle.textContent, /prompt-overlay-action\] \{ position: relative !important[^}]*padding: 0 !important; border: 0 !important; border-radius: 50% !important; background: transparent !important/);
assert.doesNotMatch(hoverStyle.textContent, /prompt-overlay-action\] \{ position: relative !important[^}]*border: \.5px solid/, "the idle action button draws no ring");
assert.match(hoverStyle.textContent, /prompt-overlay-action\]:hover \{ background: color-mix\(in srgb, var\(--dsw-alias-text-secondary, #6b6b70\) 14%/);
assert.match(hoverStyle.textContent, /prompt-overlay-action\]:active \{ background: color-mix\(in srgb, var\(--dsw-alias-text-secondary, #6b6b70\) 22%[^}]*transform: scale\(\.94\)/);
// Keyboard focus stays visible even with the disc gone, and is never suppressed.
assert.match(hoverStyle.textContent, /prompt-overlay-action\]:focus-visible \{[^}]*outline: 2px solid/);
assert.match(hoverStyle.textContent, /prompt-overlay-action\]:focus-visible \{[^}]*outline-offset: 1px/);
// The card host suppresses its own outline (its reveal of the strip IS its focus cue), but an
// ACTION button must never hide focus, or Tab would move invisibly through the controls.
assert.doesNotMatch(hoverStyle.textContent, /prompt-overlay-action\][^{]*\{[^}]*outline:\s*none/, "the action button never hides its focus ring");
// The confirmed copy is the quiet treatment: the glyph turns green and NOTHING else appears,
// not even on hover — otherwise it would read as a green check inside a grey disc.
assert.match(hoverStyle.textContent, /prompt-overlay-action\]\[data-dsh-desktop-prompt-overlay-action-done\] \{ color: var\(--dsw-alias-text-success/);
assert.match(hoverStyle.textContent, /action-done\]:hover, [^}]*action-done\]:focus-visible \{ background: transparent !important; \}/);
// The glyph is the official drawing scaled to sit inside the 22px control, in currentColor so
// the button's own colour rules still drive it.
assert.match(hoverStyle.textContent, /prompt-overlay-glyph\] \{ display: block !important; width: 13px !important; height: 13px !important; pointer-events: none !important; \}/);
// The strip's own box is fixed: the centring math positions against exactly this height, so the
// stylesheet and the constant have to agree.
assert.match(hoverStyle.textContent, /prompt-overlay-toolbar\] \{ position: absolute !important[^}]*box-sizing: content-box !important/);
// Compact on purpose: 22px control, 1px vertical padding, 2px gap. At 26px with 16px glyphs the
// pill crowded the very line it hangs on and read as a second toolbar.
assert.match(hoverStyle.textContent, /prompt-overlay-toolbar\] \{ position: absolute !important[^}]*gap: 2px !important; min-height: 22px !important; padding: 1px 3px 1px 7px !important/);
assert.doesNotMatch(hoverStyle.textContent, /prompt-overlay-toolbar\] \{ position: absolute[^}]*min-height: 26px/, "the strip is not the old 26px pill");
assert.doesNotMatch(hoverStyle.textContent, /position:\s*sticky/);
// The strip is absolutely positioned on purpose (see above); it is the only overlay element that
// is. Pin that so a future "let it flow again" refactor trips this test rather than the user.
assert.match(hoverStyle.textContent, /data-dsh-desktop-prompt-overlay-toolbar\] \{ position: absolute !important; z-index: 3 !important; right: 12px !important; box-sizing: content-box !important;/);
// One tooltip for the whole strip, shown in the empty lane beside it, so it lands on
// One tooltip per strip, in the empty lane beside it, so it never lands on the card's
// text (above) or on the composer clamp (below).
assert.match(hoverStyle.textContent, /\[data-dsh-desktop-prompt-overlay-hint\]:not\(\[data-dsh-desktop-prompt-overlay-hint=''\]\)::after \{ content: attr\(data-dsh-desktop-prompt-overlay-hint\)/);
assert.match(hoverStyle.textContent, /right: calc\(100% \+ 8px\) !important; top: 50% !important; transform: translateY\(-50%\)/);
assert.doesNotMatch(hoverStyle.textContent, /top: calc\(100% \+ 6px\)/, "no per-button tooltip above or below the strip");
assert.doesNotMatch(hoverStyle.textContent, /:last-child::after/);
// The body's inset must be symmetric, or a text-only card looks top-heavy beside an
// attachments+text card. One constant drives both the padding and the height budget.
assert.match(hoverStyle.textContent, /data-dsh-desktop-prompt-overlay-content\] \{[^}]*padding: 12px 0px 12px 12px !important/);
assert.doesNotMatch(hoverStyle.textContent, /padding: 10px 12px 14px/, "the old asymmetric inset is gone");
// The CARD must not scroll; the inner body must. A scroll container's own padding-bottom
// scrolls out of view, which clipped the last line flush against the card's bottom border
// while the top padding stayed — the asymmetric inset this asserts against.
assert.match(hoverStyle.textContent, /data-dsh-desktop-prompt-overlay-content\] \{[^}]*overflow: hidden !important/);
assert.doesNotMatch(hoverStyle.textContent, /data-dsh-desktop-prompt-overlay-content\] \{[^}]*overflow-y: auto/);
assert.match(hoverStyle.textContent, /data-dsh-desktop-prompt-overlay-body\] \{[^}]*flex: 1 1 auto !important; min-height: 0 !important; overflow-x: hidden !important; overflow-y: auto !important/);

// The clipped last line fades out so it reads as "more below" rather than a hard cut. This is
// a mask on the scroller, so the text fades to transparent and the card's own translucent
// surface shows through — no background colour to keep in sync.
assert.match(hoverStyle.textContent, /data-dsh-desktop-prompt-overlay-body\]\[data-dsh-desktop-prompt-overlay-more-below\] \{ -webkit-mask-image: linear-gradient\(to bottom, #000 calc\(100% - 20px\), transparent\)/);
assert.match(hoverStyle.textContent, /mask-image: linear-gradient\(to bottom, #000 calc\(100% - 20px\), transparent\)/);
// The ramp must reach transparency AT the bottom edge, not above it. A ramp ending early left a
// band where content was invisible — an empty gap below a washed-out line — which read as broken.
assert.match(hoverStyle.textContent, /linear-gradient\(to bottom, #000 calc\(100% - 20px\), transparent\) !important/);
assert.doesNotMatch(hoverStyle.textContent, /transparent calc\(100% - \d+px\)\) !important/, "the ramp leaves no invisible dead band above the bottom edge");

assert.match(hoverStyle.textContent, /data-dsh-desktop-prompt-overlay-body\] > :first-child \{ margin-top: 0 !important; \}/);
assert.match(hoverStyle.textContent, /data-dsh-desktop-prompt-overlay-body\] > :last-child \{ margin-bottom: 0 !important; \}/);

// Height is the configured prompt-line budget, hard-capped by the composer-aware var.
// The text body honours the line budget; the card adds room for the action strip.
assert.match(hoverStyle.textContent, /data-dsh-desktop-prompt-overlay-content\] \{[^}]*max-height: min\(var\(--dsh-desktop-prompt-overlay-avail, 100vh\), calc\(var\(--dsh-desktop-prompt-overlay-lines, 5\) \* 1\.247rem \+ var\(--dsh-desktop-prompt-overlay-extra, 0px\) \+ 20px\)\)/);
assert.match(hoverStyle.textContent, /data-dsh-desktop-prompt-overlay\] \{[^}]*max-height: min\(var\(--dsh-desktop-prompt-overlay-avail, 100vh\), calc\(var\(--dsh-desktop-prompt-overlay-lines, 5\) \* 1\.247rem \+ var\(--dsh-desktop-prompt-overlay-extra, 0px\) \+ 44px\)\)/);
// The fade band is chrome, not budget: whatever the card spends beyond its padding and the
// strip is exactly the band, so the body receives budget + attachments + band and the
// configured lines stay fully readable instead of being faded away.
// The strip is NOT part of the chrome any more: it floats over the last line, so its own box
// no longer comes out of the line budget. Chrome is now the body padding plus the fade band.
const cardChrome = 44;
const bodyPadding = 12 * 2;
assert.equal(cardChrome - bodyPadding, 20, "card chrome beyond padding equals the fade band");
assert.doesNotMatch(hoverStyle.textContent, /\+ 90px\)\) !important/, "the old strip row is no longer reserved in the height budget");

// Images and files occupy one bounded grid, rather than independent wrapping strips.
assert.match(hoverStyle.textContent, /data-dsh-desktop-prompt-overlay-attachments\] \{ display: grid !important; flex: 0 0 auto !important; grid-template-columns: repeat/);
assert.match(hoverStyle.textContent, /overflow-y:\s*auto/);
assert.match(hoverStyle.textContent, /minmax\(0, 1fr\)/);
assert.match(hoverStyle.textContent, /data-dsh-desktop-prompt-overlay-media/);
assert.match(hoverStyle.textContent, /data-dsh-desktop-prompt-overlay-files/);
assert.match(hoverStyle.textContent, /data-dsh-desktop-prompt-overlay-text/);
assert.match(hoverStyle.textContent, /data-dsh-desktop-prompt-overlay-toolbar/);
assert.match(hoverStyle.textContent, /data-dsh-desktop-prompt-overlay-time/);
assert.match(hoverStyle.textContent, /data-dsh-desktop-prompt-overlay-action/);
// The control is 22px square and its glyph 13px; the two must stay in step with each other.
assert.match(hoverStyle.textContent, /prompt-overlay-action\] \{ position: relative !important[^}]*width: 22px !important; height: 22px !important/);
assert.match(hoverStyle.textContent, /prompt-overlay-time\] \{ margin-right: 3px[^}]*font-size: \.68rem !important/);
assert.match(hoverStyle.textContent, /border-radius:\s*0 0 16px 16px/);
// The scrollbar thumb has lower contrast (15%) when idle/unfocused, restoring to 30% on hover/focus-within.
assert.match(hoverStyle.textContent, /scrollbar-color: color-mix\(in srgb, var\(--dsw-alias-text-tertiary, #8a8a8a\) 15%, transparent\) transparent !important;/);
assert.match(hoverStyle.textContent, /:hover [^}]*scrollbar-color: color-mix\(in srgb, var\(--dsw-alias-text-tertiary, #8a8a8a\) 32%, transparent\) transparent !important;/);
assert.match(hoverStyle.textContent, /::-webkit-scrollbar-thumb \{[^}]*15%, transparent\)/);
assert.match(hoverStyle.textContent, /:hover [^}]*::-webkit-scrollbar-thumb, [^}]*::-webkit-scrollbar-thumb \{ background: color-mix\(in srgb, var\(--dsw-alias-text-tertiary, #8a8a8a\) 30%, transparent\)/);
// The tooltip text is attribute-driven, so no locale string is baked into the CSS.
// The confirmation tooltip is attribute-driven so no locale string lives in CSS.
assert.match(hoverStyle.textContent, /content: attr\(data-dsh-desktop-prompt-overlay-hint\)/);
assert.doesNotMatch(hoverStyle.textContent, /已复制/);
// Every overlay string comes from the shared catalog; the private per-locale table is gone.
assert.doesNotMatch(source, /PROMPT_OVERLAY_COPY/);
for (const key of ["overlay_label", "overlay_toolbar", "overlay_hidden", "overlay_action", "overlay_attachment", "overlay_copied"]) {
  assert.ok(source.includes('t("bridge.' + key + '")'), "overlay uses catalog key bridge." + key);
}
assert.match(source, /t\("bridge\.overlay_more", count\)/);
// The catalog is fetched from the desktop control plane, exactly like the config page.
assert.match(source, /function t\(key, \.\.\.vars\)/);
assert.match(source, /callDesktopRPC\(localeConnection, "localeBundle"/);
assert.match(source, /function setLocaleBundle\(/);
assert.match(source, /LOCALE_BUNDLE_GLOBAL/);
// Placeholders are substituted, so a catalog string is never rendered with a raw {0}.
assert.match(source, /text\.split\("\{" \+ index \+ "\}"\)\.join\(/);
assert.equal((source.match(/publishPromptOverlayLanguage\(/g) || []).length, 4, "language is published at all four prefs sync points");
// The strip reserves its own row, so the card always grows to fit it.
assert.match(hoverStyle.textContent, /--dsh-desktop-prompt-overlay-lines, 5\)/);
// The hover rule must re-anchor on descendants of the hovered overlay, not nest a second overlay.
assert.match(hoverStyle.textContent, /\[data-dsh-desktop-prompt-overlay\]:hover \[data-dsh-desktop-prompt-overlay-toolbar\]/);
assert.doesNotMatch(hoverStyle.textContent, /:hover \[data-dsh-desktop-prompt-overlay\] /);
assert.doesNotMatch(hoverStyle.textContent, /data-dsh-desktop-prompt-overlay-native-ops/);
assert.doesNotMatch(hoverStyle.textContent, /-webkit-line-clamp/);

// U2 is still peeking through the scrollport top, so no overlay is shown.
assert.equal(overlays().length, 0, "do not cover a prompt peeking at the top");

// Scroll U2 fully above the scrollport. A detached, body-mounted overlay mirrors it.
u1.rect = { top: -400, bottom: -300, left: 0, right: 400 };
u2.rect = { top: -40, bottom: 20, left: 0, right: 400 };
a2.rect = { top: 30, bottom: 900, left: 0, right: 400 };
// Let the mocked locale-bundle fetch settle before rendering: the overlay mounts on
// scroll and reads whatever catalog is loaded at that moment.
await new Promise((resolve) => setTimeout(resolve, 0));
window.dispatchEvent(new CustomEvent("scroll"));

assert.equal(overlays().length, 1, "create exactly one prompt overlay");
const overlay = overlays()[0];
assert.equal(overlay.parentNode, body, "mount overlay directly under document.body");
assert.equal(overlay.style._props.top, "80px", "dock flush to conversation top under tabs");
assert.equal(overlay.getAttribute("data-dsh-desktop-prompt-overlay-encounter-older"), "", "encounter-older attribute is set on overlay when at top");
assert.match(overlay.textContent, /second prompt with context/, "mirror selected prompt content");
assert.match(overlay.textContent, /report\.csv/, "preserve file attachment previews");
assert.match(overlay.textContent, /plain prompt body/, "preserve plain prompt content beside native controls");
const previewContent = overlay.querySelector("[data-dsh-desktop-prompt-overlay-content]");
assert.ok(previewContent, "detached preview content exists");
assert.match(previewContent.textContent, /plain prompt body/, "preserve plain prompt content beside controls");
assert.doesNotMatch([...overlay.querySelectorAll("[data-dsh-desktop-prompt-overlay-text]")].map((node) => node.textContent).join("\n"), /9月17日 17:57/, "hide the native timestamp from the text body");
const toolbar = overlay.querySelector("[data-dsh-desktop-prompt-overlay-toolbar]");
assert.ok(toolbar, "render compact timestamp/action toolbar");
const nativeTime = toolbar.querySelector("[data-dsh-desktop-prompt-overlay-time]");
assert.ok(nativeTime, "render native timestamp in toolbar");
assert.equal(nativeTime.textContent, "9月17日 17:57");
const toolbarActions = toolbar.querySelectorAll("[data-dsh-desktop-prompt-overlay-action]");
assert.equal(toolbarActions.length, 4, "render all semantic native actions in the compact toolbar, including an icon-bearing one");
const embeddedLoadOlder = toolbar.querySelector("[data-dsh-desktop-prompt-overlay-load-older]");
assert.ok(embeddedLoadOlder, "load-older action is embedded in the overlay toolbar");
assert.match(embeddedLoadOlder.textContent, /加载更早|Load older/);
// Verify ordering: metadata time on the left, then load-older at the far left of the action controls, then copy
assert.equal(toolbar.childNodes[0], nativeTime, "timestamp is on the left");
assert.equal(toolbar.childNodes[1], embeddedLoadOlder, "load-older is placed at the far left of the action controls");
assert.equal(toolbar.childNodes[2], toolbarActions[0], "copy action follows load-older");
embeddedLoadOlder.click();
assert.equal(olderButton.clicked, 1, "clicking embedded load-older triggers native load-older button");
// Pointer movement inside our own card must not reselect the official active turn and rebuild the
// toolbar under the pointer. That rebuild restarts the strip animation and causes first-hover flicker.
const activeTurnForHoverRegression = new FakeElement("button");
body.appendChild(activeTurnForHoverRegression);
activeTurnForHoverRegression.setAttribute("aria-current", "true");
activeTurnForHoverRegression.setAttribute("aria-label", "跳转并加载第 0 轮");
window.dispatchEvent({ type: "pointermove", target: overlay });
assert.equal(overlays()[0], overlay, "hovering the plugin overlay must preserve its host");
assert.equal(overlays()[0].querySelector("[data-dsh-desktop-prompt-overlay-toolbar]"), toolbar, "hovering the plugin overlay must preserve its toolbar");
body.removeChild(activeTurnForHoverRegression);
window.dispatchEvent(new CustomEvent("scroll"));
// Sibling of the body, mounted on the overlay host so it never scrolls with the text.
assert.equal(toolbar.parentNode, overlay, "action strip mounts on the overlay, outside the scrolling body");
assert.notEqual(toolbar.parentNode, previewContent, "action strip is not inside the scroll body");
const copyProxy = [...toolbarActions].find((button) => button.getAttribute("aria-label") === "复制");
assert.ok(copyProxy, "render compact copy action");
const officialGlyph = (button) => button.querySelector("[data-dsh-desktop-prompt-overlay-glyph]");
const officialGlyphPath = (button) => {
  const node = officialGlyph(button);
  const shape = node && node.querySelector("path");
  return shape ? shape.getAttribute("d") : null;
};
// Verbatim from the installed DSH bundle (IconCopyOutline16 / IconCheckOutline16): the overlay
// must draw Chat's own glyphs, not a lookalike. The previous hand-drawn pair was also MIRRORED,
// which is what made it read as wrong beside the real control.
const officialCopyPath = /const PROMPT_OVERLAY_ICON_COPY = "([^"]+)"/.exec(source)[1];
const officialCheckPath = /const PROMPT_OVERLAY_ICON_CHECK = "([^"]+)"/.exec(source)[1];
assert.ok(officialCopyPath && officialCopyPath.startsWith("M") && officialCopyPath.length > 500, "the official copy path is embedded");
assert.ok(officialCheckPath && officialCheckPath.startsWith("M") && officialCheckPath.length > 300, "the official check path is embedded");
assert.equal(officialGlyphPath(copyProxy), officialCopyPath, "the copy button draws the official Chat glyph, not a stand-in");
assert.notEqual(officialGlyphPath(copyProxy), officialCheckPath, "the idle copy button is not already showing its confirmation");
copyProxy.dispatchEvent({ type: "click" });
assert.equal(copyClicks, 1, "copy proxy forwards to the current official copy control");
assert.equal(copyProxy.getAttribute("data-dsh-desktop-prompt-overlay-action-done"), "已复制", "copy proxy confirms with the catalog's copied string");
assert.equal(overlay.getAttribute("aria-label"), "悬浮我方提示词", "overlay host label comes from the catalog");
assert.equal(toolbar.getAttribute("aria-label"), "提示词操作", "toolbar label comes from the catalog");
// The English fallback must NOT be what renders once the bundle has loaded.
assert.notEqual(overlay.getAttribute("aria-label"), "Floating prompt", "catalog overrides the early English fallback");
assert.equal(officialGlyphPath(copyProxy), officialCheckPath, "copy proxy swaps to the official check glyph while confirming");
assert.equal(officialGlyph(copyProxy).textContent, "", "the glyph is drawn as SVG, not typed as a character");
const futureProxy = [...toolbarActions].find((button) => button.getAttribute("aria-label") === "官方新操作");
assert.ok(futureProxy, "render future semantic action without a code-specific label");
futureProxy.dispatchEvent({ type: "click" });
assert.equal(futureClicks, 1, "future action proxy forwards to the official control");
const mediaRow = overlay.querySelector("[data-dsh-desktop-prompt-overlay-media]");
assert.ok(mediaRow, "render compact image media row");
assert.equal(mediaRow.querySelectorAll("img").length, 4, "render every image attachment: group, named wrapper, and clickable attachment button");
// ...while an icon-bearing ACTION still stays out of the attachment row.
assert.doesNotMatch(mediaRow.textContent + [...mediaRow.querySelectorAll("img")].map((n) => n.getAttribute("src")).join(" "), /trash/, "an action icon is not rendered as an attachment");
assert.equal(mediaRow.querySelector("[data-dsh-desktop-prompt-overlay-more]"), null, "do not show overflow marker when all images fit");
const filesRow = overlay.querySelector("[data-dsh-desktop-prompt-overlay-files]");
assert.ok(filesRow, "render compact file row");
// A wrapper holding media is a thumbnail group, never a file chip — even when it has a filename.
assert.doesNotMatch(filesRow.textContent, /image\.png/, "an image wrapper is not demoted to a file chip");
assert.match(filesRow.textContent, /report\.csv/, "a real file card still renders as a file chip");
assert.match(filesRow.textContent, /quarterly\.xlsx/, "a clickable file card renders as a file chip");
assert.doesNotMatch([...mediaRow.querySelectorAll("img")].map((node) => node.getAttribute("src")).join(" "), /xlsx/, "a file card's type icon is not rendered as a thumbnail");
// The decisive regression: attachments must never be proxied as message actions.
const attachmentTitles = [...toolbar.querySelectorAll("[data-dsh-desktop-prompt-overlay-action]")]
    .map((button) => (button.getAttribute("title") || "") + (button.getAttribute("aria-label") || ""));
assert.equal(attachmentTitles.filter((label) => /image\.png|quarterly\.xlsx|点击查看原图/.test(label)).length, 0,
    "an attachment is never proxied into the action strip");
assert.ok(overlay.querySelector("[data-dsh-desktop-prompt-overlay-text]"), "render text row");
assert.equal(overlay.querySelector("[data-dsh-desktop-prompt-overlay-native-ops]"), null, "do not mirror DSH native operation bars");
assert.equal(toolbar.querySelectorAll("[data-dsh-desktop-prompt-overlay-action]").length, 4, "owned toolbar contains only compact proxy controls");
assert.ok(toolbar.querySelector("[data-dsh-desktop-prompt-overlay-load-older]"), "toolbar contains embedded load-older action");
assert.equal(overlay.querySelectorAll("button").length, 5, "overlay contains 4 proxy controls and 1 load-older action");
assert.equal(u2.querySelectorAll("time").length, 1, "original timestamp remains in the source bubble");
// copyBtn, plainCopy, fileCard, imageAttachment, fileAttachment, iconAction — overlay adds none.
assert.equal(u2.querySelectorAll("button").length, 6, "source attachment and operation controls remain untouched");
assert.equal(u2.hasAttribute("data-dsh-desktop-sticky-prompt"), false, "original prompt is not marked sticky");
assert.equal(u2.style.width, undefined, "original prompt width remains unchanged");
assert.equal(u2.style.marginLeft, undefined, "original prompt left margin remains unchanged");
assert.equal(u2.style.marginRight, undefined, "original prompt right margin remains unchanged");
assert.equal(overlay.querySelectorAll("[id]").length, 0, "owned preview does not copy source ids");
// ---------------------------------------------------------------------------
// Four fixes: composer clamp, line budget, tooltip side, and a copy confirmation
// that survives the upstream re-render its own click triggers.
// ---------------------------------------------------------------------------

// The card must never cover the Chat composer: its height stops at the composer's top edge.
// The height cap must NOT be set inline. An inline declaration with !important outranks the
// stylesheet's !important clamp, which silently disabled the line budget and left the card
// capped only by the composer gap — exactly the reported "I set 2 lines but it shows many".
assert.equal(overlay.style._props["max-height"], undefined, "the height cap is not set inline");
assert.equal(overlay.style._props["--dsh-desktop-prompt-overlay-avail"], "632px", "avail cap matches the composer gap with top-flush docking");
// The stylesheet owns it, and must combine BOTH bounds: composer gap and line budget.
assert.match(hoverStyle.textContent, /data-dsh-desktop-prompt-overlay\] \{[^}]*max-height: min\(var\(--dsh-desktop-prompt-overlay-avail[^)]*\), calc\(var\(--dsh-desktop-prompt-overlay-lines[^)]*\) \* [\d.]+rem \+ var\(--dsh-desktop-prompt-overlay-extra/);

// Which bound wins must follow the space available: with a roomy composer gap the line budget
// caps the card, and with a tight one the composer gap takes over so the card can never cover
// the input box. Both are the same min() in the stylesheet, so assert the inputs it sees.
const roomyAvail = Number.parseFloat(overlay.style._props["--dsh-desktop-prompt-overlay-avail"]);
const bigBudget = 21 * (0.86 * 1.45 * 16) + 70;
assert.ok(roomyAvail > bigBudget, "with room to spare the line budget is the tighter bound");
const savedComposer = { ...composer.rect };
composer.rect = { ...composer.rect, top: 400 };
window.__DSH_DESKTOP_PROMPT_OVERLAY_MAX_LINES__ = 21;
window.dispatchEvent(new CustomEvent("resize"));
const tightAvail = Number.parseFloat(overlay.style._props["--dsh-desktop-prompt-overlay-avail"]);
assert.ok(tightAvail < bigBudget, "a tight composer gap becomes the tighter bound (gap " + tightAvail + " < budget " + bigBudget.toFixed(0) + ")");
assert.ok(tightAvail > 0, "the available height stays positive");
composer.rect = savedComposer;
// Restore the global to its pre-test state (unset), so the later "default line budget"
// assertion still sees the default rather than a value this block happened to leave behind.
delete window.__DSH_DESKTOP_PROMPT_OVERLAY_MAX_LINES__;
window.dispatchEvent(new CustomEvent("resize"));
// Shared grid: two 48px rows + 6px row gap + 8px separation from the body = 110px.
assert.equal(overlay.style._props["--dsh-desktop-prompt-overlay-extra"], "110px", "the combined attachment block gets one height budget");
assert.equal(overlay.style._props["--dsh-desktop-prompt-overlay-lines"], "5", "the default line budget is applied");

// A single click confirms immediately (no second click needed) and stays confirmed.
assert.equal(officialGlyphPath(copyProxy), officialCheckPath, "one click is enough to confirm a copy");
assert.equal(copyProxy.getAttribute("data-dsh-desktop-prompt-overlay-action-done"), "已复制", "confirmation carries the localized label");

// Proxying the official control makes DSH re-render the message, which rebuilds the card.
// Force that rebuild and prove the confirmation is not lost with the old button node.
const confirmedSignature = copyProxy.getAttribute("aria-label");
window.__DSH_DESKTOP_PROMPT_OVERLAY_MAX_LINES__ = 8;
window.dispatchEvent(new CustomEvent("scroll"));
const rebuiltToolbar = overlay.querySelector("[data-dsh-desktop-prompt-overlay-toolbar]");
const rebuiltCopy = [...rebuiltToolbar.querySelectorAll("[data-dsh-desktop-prompt-overlay-action]")].find((button) => button.getAttribute("aria-label") === confirmedSignature);
assert.ok(rebuiltCopy, "rebuild re-creates the copy proxy");
assert.notEqual(rebuiltCopy, copyProxy, "the rebuild really replaced the button node");
assert.equal(officialGlyphPath(rebuiltCopy), officialCheckPath, "the copy confirmation survives the rebuild");
assert.equal(rebuiltCopy.getAttribute("data-dsh-desktop-prompt-overlay-action-done"), "已复制", "the rebuilt button keeps its confirmation label");

// Re-query: the forced rebuild above replaced these nodes, which is itself the point.
const liveToolbar = overlay.querySelector("[data-dsh-desktop-prompt-overlay-toolbar]");
const liveMediaRow = overlay.querySelector("[data-dsh-desktop-prompt-overlay-media]");
// The strip is the card's own last row, so with a single line it sits at the real bottom
// rather than at the top edge of a short card.
assert.equal(liveToolbar.parentNode, overlay, "the strip is a direct child of the card");
assert.equal(overlay.childNodes[overlay.childNodes.length - 1], liveToolbar, "the strip is the card's last row");

// Clicking a thumbnail must open the official viewer, exactly like native DSH does. The
// overlay only forwards the click; it never reimplements the viewer.
const clickableThumbs = [...liveMediaRow.querySelectorAll("img")].filter((node) => node.getAttribute("role") === "button");
assert.ok(clickableThumbs.length > 0, "thumbnails are exposed as clickable controls");
const shotThumb = clickableThumbs.find((node) => node.getAttribute("src") === "https://example.test/shot.png");
assert.ok(shotThumb, "the mirrored thumbnail is present");
shotThumb.dispatchEvent({ type: "click" });
assert.equal(nativeImageClicks, 1, "clicking a thumbnail forwards to the native image");
const clickedAttached = clickableThumbs.find((node) => node.getAttribute("src") === "https://example.test/shot-4.png");
assert.ok(clickedAttached, "a clickable attachment renders as a clickable thumbnail");
clickedAttached.dispatchEvent({ type: "click" });
// DSH opens its viewer from the wrapping control, so that is what must be clicked.
assert.equal(attachmentButtonClicks, 1, "clicking an attachment thumbnail activates the native wrapper");
assert.equal(attachedImageClicks, 0, "the bare image is not clicked when a wrapper owns the viewer");

// The settings nav caches its label from the first render, which can race the async
// catalog. The label must therefore (a) never be a raw key, and (b) localize once the
// catalog lands — the reported bug was the literal text "tray.open_setti...".
assert.ok(lastNavConfig && typeof lastNavConfig.label === "function", "the settings section registers a label");
assert.equal(lastNavConfig.label(), "桌面设置", "the nav label localizes once the catalog has loaded");
assert.doesNotMatch(lastNavConfig.label(), /^tray\./, "the nav label is never a raw catalog key");
assert.ok(navRegistrations >= 2, "the nav re-registers when the catalog arrives, so a cached label updates");
// Even before the catalog exists the label must fall back to readable English, not a key.
assert.match(source, /"tray\.open_settings": "Desktop settings"/);

// The strip-level tooltip reads the hovered button's label into the hint attribute, which
// is what the CSS ::after renders. Nothing may set a native title, or the browser would
// pop its own tooltip on top of ours.
const liveStrip = overlay.querySelector("[data-dsh-desktop-prompt-overlay-toolbar]");
const actionButtons = [...liveStrip.querySelectorAll("[data-dsh-desktop-prompt-overlay-action]")];
assert.ok(actionButtons.length > 0, "the strip exposes action buttons");
assert.equal(liveStrip.getAttribute("data-dsh-desktop-prompt-overlay-hint"), null, "no tooltip before hover");
for (const button of actionButtons) {
  assert.equal(button.getAttribute("title"), null, "actions carry no native title tooltip");
  assert.ok(button.getAttribute("aria-label"), "actions keep an accessible name");
}
const hintOf = (button) => liveStrip.getAttribute("data-dsh-desktop-prompt-overlay-hint");
const plainButton = actionButtons.find((b) => !b.getAttribute("data-dsh-desktop-prompt-overlay-action-done"));
assert.ok(plainButton, "at least one action is not in its confirmed state");
plainButton.dispatchEvent({ type: "mouseenter" });
assert.equal(hintOf(plainButton), plainButton.getAttribute("aria-label"), "hovering publishes the action label");
plainButton.dispatchEvent({ type: "mouseleave" });
assert.equal(hintOf(plainButton), null, "leaving the action clears the tooltip");
// A confirmed copy advertises the confirmation, not the bare action name.
const doneButton = actionButtons.find((b) => b.getAttribute("data-dsh-desktop-prompt-overlay-action-done"));
assert.ok(doneButton, "the copy action is still showing its confirmation");
doneButton.dispatchEvent({ type: "mouseenter" });
assert.equal(hintOf(doneButton), doneButton.getAttribute("data-dsh-desktop-prompt-overlay-action-done"), "a confirmed action advertises its confirmation");
doneButton.dispatchEvent({ type: "mouseleave" });
assert.equal(hintOf(doneButton), null, "leaving the confirmed action clears the tooltip");

// The fade is state, not decoration: it must appear only while the body can still scroll
// down, and disappear at the bottom so it never advertises content that is already visible.
const fadeBody = overlay.querySelector("[data-dsh-desktop-prompt-overlay-body]");
assert.ok(fadeBody, "the card exposes its scrolling body");
const hasFade = () => fadeBody.hasAttribute("data-dsh-desktop-prompt-overlay-more-below");
// Drive it the way the browser does: the body's own scroll listener re-evaluates the fade.
const syncFade = () => fadeBody.dispatchEvent({ type: "scroll" });
fadeBody.scrollHeight = 400;
fadeBody.clientHeight = 200;
fadeBody.scrollTop = 0;
syncFade();
assert.equal(hasFade(), true, "scrolled to the top with overflow: the fade is on");
fadeBody.scrollTop = 100;
syncFade();
assert.equal(hasFade(), true, "mid-scroll: the fade stays on");
fadeBody.scrollTop = 200;
syncFade();
assert.equal(hasFade(), false, "at the bottom: the fade turns off");
fadeBody.scrollTop = 0;
syncFade();
assert.equal(hasFade(), true, "scrolling back up restores the fade");
// Content that fits must never fade.
fadeBody.scrollHeight = 200;
syncFade();
assert.equal(hasFade(), false, "no overflow: no fade");

// A settings change must repaint the card immediately, not on the next scroll.
const registrationsBefore = navRegistrations;
assert.ok(registrationsBefore >= 1, "the settings nav registers during apply");

// The line budget is a live pref: the rebuilt card reports the new value.
assert.equal(overlay.style._props["--dsh-desktop-prompt-overlay-lines"], "8", "line budget follows the published pref");

// The card matches the official composer box (fixture: pane 0..800, composer 40..760) so it
// lines up with the input the user reads it beside, and never exceeds the pane.
const paneWidth = 800;
const paneInset = 8;
const composerLeft = 40;
const composerWidth = 720;
const cardWidth = Number.parseFloat(overlay.style.width);
const cardLeft = Number.parseFloat(overlay.style.left);
assert.equal(cardLeft, composerLeft, "the card's left edge matches the composer");
assert.equal(cardWidth, composerWidth, "the card's width matches the composer");
assert.ok(cardWidth <= paneWidth - paneInset * 2, "the card still stays inside the pane");

// The grid must measure the CARD, not the native bubble it mirrors. A narrow bubble inside a
// wide card must still fill its row, or the +N cell would appear while space is available.
const bubbleRect = { ...u2.rect };
u2.rect = { ...u2.rect, left: 0, right: 140 };
window.__DSH_DESKTOP_PROMPT_OVERLAY_MAX_LINES__ = 10;
window.dispatchEvent(new CustomEvent("scroll"));
const wideRow = overlay.querySelector("[data-dsh-desktop-prompt-overlay-media]");
assert.ok(wideRow, "the media row survives a narrow native bubble");
assert.equal([...wideRow.querySelectorAll("img")].length, 4, "a wide card fills its row even when the native bubble is narrow");
assert.equal(wideRow.querySelector("[data-dsh-desktop-prompt-overlay-more]"), null, "no overflow while the card has room");
u2.rect = bubbleRect;
window.__DSH_DESKTOP_PROMPT_OVERLAY_MAX_LINES__ = 8;
window.dispatchEvent(new CustomEvent("scroll"));

// A cramped pane can only fit one thumbnail per row, so a 4-image prompt must cap at 2 rows:
// one visible tile plus a +N cell occupying the second row's cell. Width now comes from the
// assistant column, so the pane AND every assistant peer must narrow together.
const wideRects = { scroll: { ...scroll.rect }, a1: { ...a1.rect }, a2: { ...a2.rect }, composer: { ...composer.rect } };
scroll.rect = { top: 80, bottom: 800, left: 0, right: 100 };
a1.rect = { ...a1.rect, left: 0, right: 84 };
a2.rect = { ...a2.rect, left: 0, right: 84 };
composer.rect = { ...composer.rect, left: 4, right: 96 };
window.__DSH_DESKTOP_PROMPT_OVERLAY_MAX_LINES__ = 9;
window.dispatchEvent(new CustomEvent("scroll"));
const narrowRow = overlay.querySelector("[data-dsh-desktop-prompt-overlay-media]");
assert.ok(narrowRow, "narrow card still renders the media row");
assert.equal(narrowRow.querySelectorAll("img").length, 1, "a narrow card shows one thumbnail per row");
const overflowChip = narrowRow.querySelector("[data-dsh-desktop-prompt-overlay-more]");
assert.ok(overflowChip, "overflowing attachments get a +N cell");
assert.equal(overflowChip.textContent, "+5", "shared overflow includes three hidden images and two hidden files");
assert.match(overflowChip.getAttribute("aria-label"), /5/, "combined hidden count is accessible");
assert.ok(overflowChip.querySelector("svg"), "more attachments are signalled by a real SVG icon");
assert.equal(overflowChip.getAttribute("title"), overflowChip.getAttribute("aria-label"));
assert.equal(narrowRow, overlay.querySelector("[data-dsh-desktop-prompt-overlay-files]"), "images and files share one grid");
assert.equal(narrowRow.childNodes.length, 2, "one-column mixed grid has only two rows including the more tile");
// Restore the fixture so later geometry assertions see the original layout. The wide-card
// media rendering is already covered by the assertions above.
scroll.rect = wideRects.scroll;
a1.rect = wideRects.a1;
a2.rect = wideRects.a2;
composer.rect = wideRects.composer;
window.__DSH_DESKTOP_PROMPT_OVERLAY_MAX_LINES__ = 8;
window.dispatchEvent(new CustomEvent("scroll"));

const originalChildren = [...u2.childNodes];
const originalAttrs = [...u2.attributes.entries()];
assert.deepEqual([...u2.childNodes], originalChildren, "source child order is untouched");
assert.deepEqual([...u2.attributes.entries()], originalAttrs, "source attributes are untouched");


const initialLeft = overlay.style.left;
const initialWidth = overlay.style.width;
scroll.rect = { top: 100, bottom: 800, left: 40, right: 540 };
a1.rect = { top: -110, bottom: 40, left: 100, right: 460 };
a2.rect = { top: 30, bottom: 900, left: 100, right: 460 };
composer.rect = { top: 720, bottom: 800, left: 80, right: 500 };
window.dispatchEvent(new CustomEvent("resize"));
assert.notEqual(overlay.style.left, initialLeft, "resize updates overlay left position");
assert.notEqual(overlay.style.width, initialWidth, "resize updates overlay width");

// This fixture models the real DSH geometry: the assistant column is NOT centred in the pane
// (pane 40..540, column 100..460), so the left gutter is narrower than the right one.
// The card must stay wider than the column but must never cross the column's LEFT edge —
// a symmetric expansion used to do exactly that and spilled into the official left rail.
const asyPaneRight = 540;
const asyComposerLeft = 80;
const asyComposerRight = 500;
const asyCardLeft = Number.parseFloat(overlay.style.left);
const asyCardWidth = Number.parseFloat(overlay.style.width);
assert.equal(asyCardLeft, asyComposerLeft, "in an asymmetric pane the card still tracks the composer's left edge");
assert.equal(asyCardLeft + asyCardWidth, asyComposerRight, "and its right edge");
assert.ok(asyCardLeft + asyCardWidth <= asyPaneRight, "the card stays inside the pane on the right");

u2.rect = { top: 200, bottom: 260, left: 0, right: 400 };
a2.rect = { top: 270, bottom: 900, left: 0, right: 400 };
window.dispatchEvent(new CustomEvent("scroll"));
assert.equal(overlays().length, 1, "reuse the single overlay when prompt selection changes");
assert.equal(overlays()[0], overlay, "overlay host identity remains stable");
assert.match(overlay.textContent, /first prompt/, "overlay content follows prompt switching");
// Even if the prompt is short / not truncated (like u1: 'first prompt'), encountering DSH Web's older
// button at the top must still show load-older in the long-display state so native functionality isn't blocked:
assert.ok(overlay.querySelector("[data-dsh-desktop-prompt-overlay-load-older]"), "short complete prompt shows load-older when encountering older button at top");
assert.equal(overlay.hasAttribute("data-dsh-desktop-prompt-overlay-encounter-older"), true, "encounter-older is active for short complete prompt at top");

// Mutual exclusion: when olderButton scrolls away (midway down the conversation), a complete prompt must NOT show load-older:
const savedOlderRect = { ...olderButton.rect };
olderButton.rect = { top: -200, bottom: -160, left: 700, right: 780 };
window.dispatchEvent(new CustomEvent("scroll"));
assert.equal(overlay.querySelector("[data-dsh-desktop-prompt-overlay-load-older]"), null, "a complete prompt without truncation does not show load-older when away from older boundary");
assert.equal(overlay.hasAttribute("data-dsh-desktop-prompt-overlay-encounter-older"), false, "encounter-older is not active when scrolled away");
olderButton.rect = savedOlderRect;
window.dispatchEvent(new CustomEvent("scroll"));

// ---------------------------------------------------------------------------
// The strip hangs on the LAST LINE BOX of the card. As a flow row below the text it read as
// offset down for a single-line prompt; on an attachment-only card it drifted a whole row
// lower, because the "last line" there is a tall row rather than a line.
// ---------------------------------------------------------------------------
// The prompt under test must be one that HAS a strip: u1 is a bare prompt with no native
// timestamp or actions, so mirror it first (u3 is still inert, so the walk stops at u2).
const stripGeometry = { overlay: { ...overlay.rect } };
u1.rect = { top: -400, bottom: -300, left: 0, right: 400 };
u2.rect = { top: -40, bottom: 20, left: 0, right: 400 };
a2.rect = { top: 30, bottom: 900, left: 0, right: 400 };
window.dispatchEvent(new CustomEvent("scroll"));
assert.match(overlay.textContent, /second prompt with context/, "the strip-bearing prompt is mirrored");
const centredBody = overlay.querySelector("[data-dsh-desktop-prompt-overlay-body]");
const centredStrip = overlay.querySelector("[data-dsh-desktop-prompt-overlay-toolbar]");
assert.ok(centredBody && centredStrip, "the mirrored card exposes its body and its strip");
overlay.rect = { top: 200, bottom: 320, left: 100, right: 500 };
const centredTexts = [...centredBody.querySelectorAll("[data-dsh-desktop-prompt-overlay-text]")];
const lastTextBlock = centredTexts[centredTexts.length - 1];
const textRects = { body: { ...centredBody.rect }, text: { ...lastTextBlock.rect } };
centredBody.rect = { top: 212, bottom: 308, left: 112, right: 488 };
// Two lines of .86rem at 1.45 (19.95px each): the last line box is the bottom 19.95px.
lastTextBlock.rect = { top: 212, bottom: 251.9, left: 112, right: 480 };
window.dispatchEvent(new CustomEvent("scroll"));
// centre = 251.9 - 19.95/2 = 241.92; the strip is 24px tall (22px control + 1px padding each
// side), so top = 241.92 - 200 - 12 = 29.92 → 30px.
assert.equal(centredStrip.style._props.top, "30px", "the strip is centred on the last line box, not under it");
// At the bottom edge the strip itself must stay inside the body box, so it can never hang out of
// the card: 30 + 24 = 54 ≤ body height 96.
assert.ok(Number.parseFloat(centredStrip.style._props.top) + 24 <= 108, "the strip stays inside the card");
// A last line scrolled out of sight pins the strip to the bottom edge instead of floating it away.
lastTextBlock.rect = { top: 400, bottom: 440, left: 112, right: 480 };
window.dispatchEvent(new CustomEvent("scroll"));
assert.equal(centredStrip.style._props.top, "84px", "a scrolled-away last line pins the strip to the body's bottom edge");
// With nothing measurable there is no correct place to put it: keep the static position rather
// than guessing, which is what a card whose geometry is not laid out yet looks like.
overlay.rect = { top: 0, bottom: 0, left: 0, right: 0 };
window.dispatchEvent(new CustomEvent("scroll"));
assert.equal(centredStrip.style._props.top, undefined, "an unmeasurable card leaves the strip at its static position");
overlay.rect = stripGeometry.overlay;
centredBody.rect = textRects.body;
lastTextBlock.rect = textRects.text;
window.dispatchEvent(new CustomEvent("scroll"));

// ---------------------------------------------------------------------------
// An attachment-only prompt carries no text, therefore no copy — even though the native strip
// renders a copy control while the card is being mirrored.
// ---------------------------------------------------------------------------
const flowRects = { u1: { ...u1.rect }, u2: { ...u2.rect }, u3: { ...u3.rect }, a1: { ...a1.rect }, a2: { ...a2.rect }, a3: { ...a3.rect } };
const savedOlderRectForFlow = { ...olderButton.rect };
olderButton.rect = { top: -620, bottom: -584, left: 240, right: 320 }; // scrolled away above top
u1.rect = { top: -900, bottom: -800, left: 0, right: 400 };
u2.rect = { top: -140, bottom: -80, left: 0, right: 400 };
a2.rect = { top: -70, bottom: 20, left: 0, right: 400 };
u3.rect = { top: -60, bottom: 30, left: 100, right: 460 };
a3.rect = { top: 40, bottom: 900, left: 100, right: 460 };
window.dispatchEvent(new CustomEvent("scroll"));
assert.equal(overlays().length, 1, "the attachment-only prompt is selected");
const onlyStrip = overlay.querySelector("[data-dsh-desktop-prompt-overlay-toolbar]");
assert.ok(onlyStrip, "an attachment-only card still shows its timestamp strip");
assert.equal(onlyStrip.querySelectorAll("[data-dsh-desktop-prompt-overlay-action]").length, 0,
  "no copy action while the card mirrors no text");
assert.equal(onlyStrip.querySelector("[data-dsh-desktop-prompt-overlay-load-older]"), null,
  "no load-older action when prompt is not truncated and not encountering older boundary");
assert.equal(onlyStrip.querySelector("[data-dsh-desktop-prompt-overlay-time]").textContent, "9月18日 08:15",
  "the timestamp still renders without any action");
assert.equal(u3CopyClicks, 0, "the native copy control is never forwarded to");
// The card really is text-free: attachments only.
assert.equal(overlay.querySelectorAll("[data-dsh-desktop-prompt-overlay-text]").length, 0,
  "an attachment-only prompt renders no text block");
const onlyMedia = overlay.querySelector("[data-dsh-desktop-prompt-overlay-media]");
assert.ok(onlyMedia && onlyMedia.querySelectorAll("img").length === 1, "the image attachment is mirrored");
assert.match(overlay.textContent, /notes\.pdf/, "the file attachment is mirrored");
// Its strip centres on the last ROW (a row is not a line): centre 255 → top = 255 - 200 - 12.
const onlyBody = overlay.querySelector("[data-dsh-desktop-prompt-overlay-body]");
const onlyBlocks = [...onlyBody.childNodes];
const lastBlock = onlyBlocks[onlyBlocks.length - 1];
assert.ok(lastBlock.hasAttribute("data-dsh-desktop-prompt-overlay-files"), "the file row is the card's last block");
overlay.rect = { top: 200, bottom: 320, left: 100, right: 500 };
onlyBody.rect = { top: 212, bottom: 308, left: 112, right: 488 };
lastBlock.rect = { top: 240, bottom: 270, left: 112, right: 480 };
window.dispatchEvent(new CustomEvent("scroll"));
assert.equal(onlyStrip.style._props.top, "43px", "the strip centres on the attachment row, not under it");
// A unified two-row grid must anchor the toolbar to its LAST cell, not the whole grid centre.
overlay.rect = { top: 200, bottom: 450, left: 100, right: 500 };
onlyBody.rect = { top: 212, bottom: 430, left: 112, right: 488 };
lastBlock.rect = { top: 240, bottom: 342, left: 112, right: 480 };
lastBlock.childNodes[lastBlock.childNodes.length - 1].rect = { top: 294, bottom: 342, left: 112, right: 240 };
window.dispatchEvent(new CustomEvent("scroll"));
assert.equal(onlyStrip.style._props.top, "106px", "two-row attachment-only toolbar aligns with the last row");
assert.notEqual(overlay.querySelector("[data-dsh-desktop-prompt-overlay-content]").getAttribute("aria-hidden"), "true", "overflow labels and focusable previews are exposed to assistive technology");

for (const [key, key3] of [["u1", u1], ["u2", u2], ["u3", u3], ["a1", a1], ["a2", a2], ["a3", a3]]) {
  key3.rect = flowRects[key];
}
olderButton.rect = savedOlderRectForFlow;
window.dispatchEvent(new CustomEvent("scroll"));

// Regression replay through the actual overlay entry point.
function replayAttachments(nodes) {
  window.dispatchEvent(new CustomEvent("dsh-desktop-hover-message-actions", { detail: false }));
  while (u2.firstChild) u2.removeChild(u2.firstChild);
  u2.textContent = "";
  for (const node of nodes) u2.appendChild(node);
  window.dispatchEvent(new CustomEvent("dsh-desktop-hover-message-actions", { detail: true }));
  window.dispatchEvent(new CustomEvent("scroll"));
  assert.equal(overlays().length, 1);
  return overlays()[0];
}
function fixtureFile(name, path) {
  const node = new FakeElement("div");
  node.setAttribute("data-filename", name);
  if (path) node.setAttribute("data-file-path", path);
  return node;
}
const fileItems = (card) => card.querySelector("[data-dsh-desktop-prompt-overlay-files]")?.querySelectorAll("[data-dsh-desktop-prompt-overlay-item]") || [];
for (const text of ["请修改 src/main.go 实现批量创建", "README.md", "请参考 image.png 和 report.pdf"]) {
  const prose = new FakeElement("div");
  prose.textContent = text;
  const card = replayAttachments([prose]);
  assert.equal(fileItems(card).length, 0, "ordinary prose and path mentions are not attachments");
  assert.equal(card.querySelector("[data-dsh-desktop-prompt-overlay-text]").textContent, text);
}
// Same-name/content image attachments stay separate and route to their own native viewer.
const twins = [0, 1].map(() => {
  const button = new FakeElement("button");
  button.setAttribute("title", "image.png，点击查看原图");
  const image = new FakeElement("img");
  image.setAttribute("src", "https://example.test/same-content.png");
  image.setAttribute("alt", "image.png");
  button.appendChild(image);
  return button;
});
const twinCard = replayAttachments(twins);
const twinImages = twinCard.querySelector("[data-dsh-desktop-prompt-overlay-media]").querySelectorAll("img");
assert.equal(twinImages.length, 2, "distinct images may share the same normalized source URL");
twinImages[1].dispatchEvent({ type: "click" });
assert.equal(twins[1].clicked, 1);
assert.equal(twins[0].clicked || 0, 0);
u2.removeChild(twins[1]);
twinImages[1].dispatchEvent({ type: "click" });
assert.equal(twins[0].clicked || 0, 0, "stale thumbnail must never fall back to a different attachment");

// Current DSH: attachment rows contain inert SPAN file cards, including extensionless names.
const nativeRow = new FakeElement("div");
nativeRow.setAttribute("data-message-attachments", "true");
nativeRow.setAttribute("class", "FreshHash_attachmentRow");
for (const name of ["README", "report.csv", "report.csv"]) {
  const card = new FakeElement("span");
  card.setAttribute("class", "FreshHash_fileCard");
  card.setAttribute("title", name);
  const label = new FakeElement("span");
  label.setAttribute("class", "FreshHash_fileName");
  label.textContent = name;
  const meta = new FakeElement("span");
  meta.textContent = "CSV 1024 B";
  card.appendChild(label);
  card.appendChild(meta);
  nativeRow.appendChild(card);
}
let nativeCard = replayAttachments([nativeRow]);
assert.equal(fileItems(nativeCard).length, 3, "extract individual native cards, not their container or metadata");
assert.equal(fileItems(nativeCard)[0].textContent, "README");
assert.deepEqual([...fileItems(nativeCard)].map((node) => node.getAttribute("title")), ["README", "report.csv", "report.csv"]);
assert.notEqual(fileItems(nativeCard)[1].textContent, fileItems(nativeCard)[2].textContent);
// Generic classes/tooltips and action labels never count as file metadata.
for (const className of ["document", "filename", "upload", "FreshHash_fileCard"]) {
  const prose = new FakeElement("div");
  prose.setAttribute("class", className);
  prose.setAttribute("title", "请修改 src/main.go");
  prose.textContent = "请修改 src/main.go";
  assert.equal(fileItems(replayAttachments([prose])).length, 0);
}
const paths = ["a/report.csv", "b/report.csv", "C:/work/report.csv"];

let edgeCard = replayAttachments(paths.map((path) => fixtureFile("report.csv", path)));
assert.equal(fileItems(edgeCard).length, 3, "same basename from different paths must not be deduplicated");
assert.deepEqual([...fileItems(edgeCard)].map((node) => node.getAttribute("title")), paths);
edgeCard = replayAttachments([fixtureFile("report.csv"), fixtureFile("report.csv")]);
assert.equal(fileItems(edgeCard).length, 2, "distinct nodes remain distinct even without paths");
assert.notEqual(fileItems(edgeCard)[0].textContent, fileItems(edgeCard)[1].textContent);
const longName = "很长的附件名😀".repeat(300) + ".csv";
const hostileName = '<img src=x onerror="alert(1)">.txt';
edgeCard = replayAttachments([fixtureFile(longName), fixtureFile(hostileName), fixtureFile("README")]);
assert.equal(fileItems(edgeCard).length, 3);
assert.equal(fileItems(edgeCard)[0].getAttribute("title"), longName);
assert.equal(fileItems(edgeCard)[1].textContent, hostileName);
assert.equal(fileItems(edgeCard)[1].querySelector("img"), null);
for (const item of fileItems(edgeCard)) {
  assert.equal(item.getAttribute("href"), null);
  assert.equal(item.getAttribute("onclick"), null);
}
const spoofName = "report" + String.fromCharCode(0x202e) + "fdp.exe";
edgeCard = replayAttachments([fixtureFile(spoofName), fixtureFile("line" + String.fromCharCode(10) + "break.csv")]);
assert.equal(fileItems(edgeCard)[0].getAttribute("title"), "report\\u202efdp.exe");
assert.equal(fileItems(edgeCard)[1].getAttribute("title"), "line\\u000abreak.csv");
assert.equal(fileItems(edgeCard)[0].textContent.includes(String.fromCharCode(0x202e)), false);
assert.match(hoverStyle.textContent, /text-overflow: ellipsis/);
assert.match(hoverStyle.textContent, /grid-template-columns: repeat/);
edgeCard = replayAttachments(Array.from({ length: 30 }, () => fixtureFile(longName)));
const renderedFiles = fileItems(edgeCard).length;
assert.ok(renderedFiles > 0 && renderedFiles < 30);
assert.equal(edgeCard.querySelector("[data-dsh-desktop-prompt-overlay-files]").querySelector("[data-dsh-desktop-prompt-overlay-more]").textContent, "+" + (30 - renderedFiles));
// Exact capacity and one over it: the single overflow tile also consumes one cell.
function fixtureImage(index) {
  const image = new FakeElement("img");
  image.setAttribute("src", "https://example.test/mixed-" + index + ".png");
  return image;
}
for (const [imageCount, fileCount] of [[0, 0], [20, 0], [0, 20], [2, 8], [2, 9], [30, 20]]) {
  const nodes = [...Array.from({ length: imageCount }, (_, i) => fixtureImage(i)), ...Array.from({ length: fileCount }, () => fixtureFile(longName))];
  const card = replayAttachments(nodes);
  const grid = card.querySelector("[data-dsh-desktop-prompt-overlay-attachments]");
  const total = imageCount + fileCount;
  if (!total) { assert.equal(grid, null); continue; }
  const columns = Number(grid.style._props["--dsh-desktop-attachment-columns"]);
  const items = grid.querySelectorAll("[data-dsh-desktop-prompt-overlay-item]");
  const moreTiles = grid.querySelectorAll("[data-dsh-desktop-prompt-overlay-more]");
  assert.ok(grid.childNodes.length <= columns * 2, "images + files + more share at most two rows");
  assert.equal(moreTiles.length, total > columns * 2 ? 1 : 0, "at most one shared overflow tile");
  if (moreTiles.length) {
    assert.equal(moreTiles[0].textContent, "+" + (total - items.length));
    assert.equal(moreTiles[0], grid.childNodes[grid.childNodes.length - 1], "more is always the last visible cell");
    assert.ok(moreTiles[0].querySelector("svg"));
    assert.equal(moreTiles[0].getAttribute("role"), "img", "indicator does not pretend to be an interactive button");
  } else assert.equal(items.length, total);
  assert.equal(grid.style._props["--dsh-desktop-attachment-height"], imageCount ? "48px" : "30px");
}
// Resize the SAME live prompt; no preference toggles, text mutations or source replacement.
const responsiveRects = { scroll: { ...scroll.rect }, composer: { ...composer.rect }, textarea: { ...textarea.rect } };
scroll.rect = { ...scroll.rect, right: 1500 };
const liveNodes = [fixtureImage(0), fixtureImage(1), ...Array.from({ length: 10 }, () => fixtureFile(longName))];
const responsiveCard = replayAttachments(liveNodes);
const resizeCard = (width, target) => {
  composer.rect = { ...composer.rect, left: 40, right: 40 + width };
  textarea.rect = { ...textarea.rect, left: 56, right: 40 + width - 16 };
  if (target) target.trigger(composer);
  else window.dispatchEvent(new CustomEvent("resize"));
  const grid = responsiveCard.querySelector("[data-dsh-desktop-prompt-overlay-attachments]");
  const expectedColumns = Math.max(1, Math.floor((width - 25 + 6) / 126));
  assert.equal(Number.parseFloat(responsiveCard.style.width), width, "overlay follows the live composer width");
  assert.equal(Number(grid.style._props["--dsh-desktop-attachment-columns"]), expectedColumns, "column capacity updates even on a 1px threshold crossing");
  const expectedVisible = 12 <= expectedColumns * 2 ? 12 : expectedColumns * 2 - 1;
  assert.equal(grid.querySelectorAll("[data-dsh-desktop-prompt-overlay-item]").length, expectedVisible);
  const more = grid.querySelector("[data-dsh-desktop-prompt-overlay-more]");
  assert.equal(more?.textContent || "", expectedVisible < 12 ? "+" + (12 - expectedVisible) : "", "more count shrinks, disappears, and returns on narrowing");
  assert.deepEqual(u2.childNodes, liveNodes, "resize never mutates the original attachments");
  return grid;
};
for (const width of [270, 271, 396, 397, 775, 1040, 271, 270]) resizeCard(width);
const liveResizeObserver = ResizeObserver.instances.find((item) => item.targets.has(scroll));
assert.ok(liveResizeObserver?.targets.has(composer), "observe composer-only resizing, not just window/pane resize");
resizeCard(775, liveResizeObserver);
const stableGrid = resizeCard(780, liveResizeObserver);
assert.equal(resizeCard(782, liveResizeObserver), stableGrid, "reuse grid within a column band rather than recreate thumbnails each pixel");
const observationCount = liveResizeObserver.observeCalls;
const disconnectCount = liveResizeObserver.disconnectCalls;
liveResizeObserver.trigger(composer);
assert.equal(liveResizeObserver.observeCalls, observationCount, "settled resize does not re-observe unchanged nodes");
assert.equal(liveResizeObserver.disconnectCalls, disconnectCount, "avoid a perpetual initial-notification resize loop");
responsiveCard.querySelector("[data-dsh-desktop-prompt-overlay-body]").scrollTop = 40;
resizeCard(270, liveResizeObserver);
assert.equal(responsiveCard.querySelector("[data-dsh-desktop-prompt-overlay-body]").scrollTop, 40, "retain preview reading position across capacity changes");
scroll.rect = responsiveRects.scroll;
composer.rect = responsiveRects.composer;
textarea.rect = responsiveRects.textarea;
window.dispatchEvent(new CustomEvent("resize"));
console.log("ok - live width expansion, collapse, column thresholds and stable observation");
console.log("ok - mixed attachments share two rows and one icon-based overflow tile");
console.log("ok - attachment identity, prose classification, long names and inert labels");

// The current official rail turn can be unloaded even when the user never hovers its
// lower-right preview. aria-current is the stable signal for the message being read. It may
// provide a text-only turnOutline preview, but it must not start an unbounded history jump.
const activeTurnButton = new FakeElement("button");
activeTurnButton.setAttribute("aria-current", "true");
activeTurnButton.setAttribute("aria-label", "跳转并加载第 0 轮");
body.appendChild(activeTurnButton);
for (let i = 0; i < 6; i += 1) await Promise.resolve();
assert.deepEqual(historyLoadCalls, [], "passive active turn does not page history without hover");
assert.equal(historyNodeMounted, false, "passive active turn does not mount older DOM");
const outlineOverlay = overlays()[0];
assert.match(outlineOverlay.textContent, /archived prompt with attachment/, "active turnOutline text is still shown without hover");
assert.equal(outlineOverlay.querySelector("[data-dsh-desktop-prompt-overlay-media]")?.querySelectorAll("img").length || 0, 0, "passive preview does not trigger historical image loading");
assert.equal([...fileItems(outlineOverlay)].length, 0, "passive preview does not trigger historical file loading");

// An explicit official tooltip hover is an intentional request for the complete turn and may
// use the jump loader so the real DOM can provide files and images.
const turnTooltip = new FakeElement("div");
turnTooltip.setAttribute("role", "tooltip");
turnTooltip.setAttribute("id", "dsh-turn-preview");
turnTooltip.innerText = "archived prompt with attachment";
const turnButton = new FakeElement("button");
turnButton.setAttribute("aria-describedby", "dsh-turn-preview");
turnButton.setAttribute("aria-label", "跳转并加载第 0 轮");
body.appendChild(turnTooltip);
body.appendChild(turnButton);
for (let i = 0; i < 6; i += 1) await Promise.resolve();
assert.deepEqual(historyLoadCalls, [42], "explicit official preview uses its turnOutline seq");
assert.ok(historyNodeMounted, "explicit preview mounts the previously unloaded prompt");
const historyOverlay = overlays()[0];
assert.match(historyOverlay.textContent, /archived prompt with attachment/, "full historical prompt replaces the short preview");
assert.equal(historyOverlay.querySelector("[data-dsh-desktop-prompt-overlay-media]")?.querySelectorAll("img").length || 0, 1, "historical image is rendered from the real prompt DOM");
assert.ok([...fileItems(historyOverlay)].some((node) => node.getAttribute("title") === "archived.pdf"), "historical file is rendered from the real prompt DOM");
body.removeChild(turnTooltip);
body.removeChild(turnButton);
body.removeChild(activeTurnButton);
if (historyNode?.parentNode) historyNode.parentNode.removeChild(historyNode);
historyNodeMounted = false;
window.dispatchEvent(new CustomEvent("pointermove"));

// A session switch can be reported before the new history has hydrated. The old card must
// disappear immediately instead of showing stale text or stale media from the previous session.
const staleSessionText = overlay.textContent;
window.dispatchEvent(new CustomEvent("dsh-desktop-active-session-changed", { detail: { sessionId: "session-new" } }));
assert.equal(overlays().length, 0, "session change clears the stale detached overlay");
assert.ok(staleSessionText && /report\.csv|second prompt|image\.png/.test(staleSessionText), "the pre-switch card contains the old session");

// Once the new prompt DOM arrives, the same card path must render text, files and images together.
for (const node of [u1, u2, u3]) node.rect = { top: 0, bottom: 0, left: 0, right: 0 };
// Virtualized history can remount the old bubble as a new node; its unchanged signature is
// still stale and must not reopen the card.
const staleRemount = u2.cloneNode(true);
staleRemount.rect = { top: -220, bottom: -120, left: 0, right: 400 };
scroll.appendChild(staleRemount);
window.dispatchEvent(new CustomEvent("scroll"));
assert.equal(overlays().length, 0, "a remounted old bubble stays hidden during session hydration");
staleRemount.rect = { top: 0, bottom: 0, left: 0, right: 0 };
const u4 = addFlow("user", -220, -120);
u4.innerText = "latest session prompt";
const u4Image = new FakeElement("button");
u4Image.setAttribute("role", "button");
u4Image.setAttribute("title", "latest.png，点击查看原图");
const u4ImageNode = new FakeElement("img");
u4ImageNode.setAttribute("src", "https://example.test/latest.png");
u4Image.appendChild(u4ImageNode);
u4.appendChild(u4Image);
const u4File = fixtureFile("latest-report.pdf", "new/latest-report.pdf");
u4.appendChild(u4File);
const a4 = addFlow("assistant", -100, 900);
window.dispatchEvent(new CustomEvent("scroll"));
assert.equal(overlays().length, 1, "new session content recreates the detached overlay");
const latestOverlay = overlays()[0];
assert.match(latestOverlay.textContent, /latest session prompt/, "new session text replaces stale text");
assert.equal(latestOverlay.textContent.includes("second prompt with context"), false, "stale session text is not retained");
assert.equal(latestOverlay.querySelector("[data-dsh-desktop-prompt-overlay-media]")?.querySelectorAll("img").length || 0, 1, "new session image is rendered");
assert.deepEqual(
  [...fileItems(latestOverlay)].map((node) => node.getAttribute("title")).filter(Boolean),
  ["new/latest-report.pdf"],
  "new session file is rendered without demoting the image"
);
assert.ok(fileItems(latestOverlay).some((node) => node.getAttribute("title") === "new/latest-report.pdf"), "new session file identity is preserved");

window.dispatchEvent(new CustomEvent("dsh-desktop-hover-message-actions", { detail: false }));
assert.equal(overlays().length, 0, "setting off removes the detached overlay");
assert.equal(u1.hasAttribute("data-dsh-desktop-sticky-prompt"), false);
assert.equal(u2.hasAttribute("data-dsh-desktop-sticky-prompt"), false);

for (const cleanup of cleanups) cleanup();
assert.equal(documentElement.hasAttribute("data-dsh-desktop-hover-message-actions"), false);
assert.equal(hoverStyle.parentNode, null);
console.log("ok - detached prompt overlay mirrors selection without mutating messages");

// ---------------------------------------------------------------------------
// The settings panel itself. It is the surface a user actually reads, so render it
// and check the floating-prompt block rather than trusting the source to be well formed.
// ---------------------------------------------------------------------------
function collectClassNames(node, out = []) {
  if (!node || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const child of node) collectClassNames(child, out);
    return out;
  }
  const cls = node.props && node.props.className;
  if (typeof cls === "string") out.push(cls);
  if (node.props) collectClassNames(node.props.children, out);
  return out;
}
assert.ok(lastNavRender, "the settings section registers a render function");
const tabElement = lastNavRender();
assert.ok(tabElement && typeof tabElement.type === "function", "the settings tab is a component");
function collectText(node, out = []) {
  if (typeof node === "string") { out.push(node); return out; }
  if (typeof node === "number") { out.push(String(node)); return out; }
  if (!node || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const child of node) collectText(child, out);
    return out;
  }
  if (node.props) collectText(node.props.children, out);
  return out;
}
const tabTree = tabElement.type(tabElement.props);
const classNames = collectClassNames(tabTree);
const tabText = collectText(tabTree).join("\n");

// Two grouped settings, each drawn as ONE stacked row:
//   - the floating-prompt block (toggle + line budget), and
//   - the tray block (master toggle + session count + close-to-tray), whose three rows are one
//     thing because the master switch decides whether the other two mean anything at all. With a
//     divider between them they read as three unrelated settings.
function findElement(node, predicate) {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findElement(child, predicate);
      if (found) return found;
    }
    return null;
  }
  if (predicate(node)) return node;
  return node.props ? findElement(node.props.children, predicate) : null;
}
function collectElements(node, predicate, out = []) {
  if (!node || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const child of node) collectElements(child, predicate, out);
    return out;
  }
  if (predicate(node)) out.push(node);
  if (node.props) collectElements(node.props.children, predicate, out);
  return out;
}
const isStacked = (node) => String(node.props && node.props.className || "").includes("dshDesktopBridgeRowStacked");
const stackedGroups = collectElements(tabTree, isStacked);
assert.equal(stackedGroups.length, 2, "the panel groups exactly two settings");
// Each group is identified by its own content, not by its position, so reordering the cards
// cannot silently make one group's assertions run against the other.
const groupText = (group) => collectText(group.props.children).join("\n");
const groupLines = (group) => (Array.isArray(group.props.children) ? group.props.children : [group.props.children])
  .filter((child) => child && child.props && String(child.props.className || "").includes("dshDesktopBridgeRow"))
  .filter((child) => !String(child.props.className).includes("RowStacked"));
const overlayGroup = stackedGroups.find((group) => /悬浮我方提示词/.test(groupText(group)));
const trayGroup = stackedGroups.find((group) => /field\.tray_enabled/.test(groupText(group)));
assert.ok(overlayGroup, "the floating-prompt setting block is present");
assert.ok(trayGroup, "the tray setting block is present");
assert.equal(groupLines(overlayGroup).length, 2, "the grouped floating-prompt setting renders exactly two lines");
assert.equal(groupLines(trayGroup).length, 3, "the grouped tray setting renders exactly three lines");
// ...and they are the three tray rows, in the order the panel shows them.
assert.equal(
  groupLines(trayGroup).map((line) => (/field\.[a-z_]+/.exec(collectText(line.props.children).join("\n")) || [""])[0]).join(","),
  "field.tray_enabled,field.tray_session_limit,field.close_to_tray",
  "the tray group holds the three tray rows in order");
assert.ok(classNames.some((c) => c.includes("dshDesktopBridgeNumber")), "the line-budget line renders its number input");
// The value must appear ONCE. A separate "5 行" readout beside the input printed the same
// number twice, because the input's value already reflects the clamped pref.
assert.equal(classNames.filter((c) => c.includes("dshDesktopBridgeLinesValue")).length, 0, "the line budget has no duplicate readout");

// Exactly two lines must not be split by a divider: the outer row owns the only border.
const settingsCss = [...document.head.childNodes]
  .filter((node) => node.tagName === "STYLE")
  .map((node) => node.textContent)
  .join("\n");

// Regression guard: a JS-style // comment inside the injected CSS template string makes
// the parser fold it into the next selector, silently dropping that whole rule (this is
// how the grouped setting shipped un-styled). No injected sheet may carry line comments.
for (const sheet of [...document.head.childNodes].filter((node) => node.tagName === "STYLE")) {
  const offender = sheet.textContent.split("\n").find((line) => /^\s*\/\//.test(line));
  assert.equal(offender, undefined, "injected CSS has no // comment: " + sheet.getAttribute("data-plugin-css"));
}
// Both sheets are injected the same way, so the loop above covers the overlay CSS too.
assert.ok(hoverStyle.textContent.length > 0, "the overlay stylesheet is non-empty");
assert.match(settingsCss, /\.dshDesktopBridgeRowStacked > \.dshDesktopBridgeRow \{ border-bottom: none/, "the two lines have no divider between them");
assert.match(settingsCss, /\.dshDesktopBridgeRowStacked \{ flex-direction: column/, "the grouped setting lays its lines out vertically");

// The panel is localized from the shared catalog (it resolves through t(), not the nav label).
assert.match(tabText, /悬浮我方提示词/, "the floating-prompt row title is localized");
assert.match(tabText, /文案最大显示行数/, "the line-budget label is localized");
assert.doesNotMatch(tabText, /5 行/, "the resolved value is not printed twice");
assert.match(tabText, /悬浮卡片最多显示的文案行数/, "the line-budget hint is localized");
// Scoped to this block: the harness catalog is a deliberate subset, so other rows
// legitimately fall back to their key here (the Go catalog test covers those).
assert.doesNotMatch(tabText, /bridge\.enhanced_hover_title|bridge\.overlay_max_lines|bridge\.overlay_lines_value|tray\.open_settings/, "no raw catalog key reaches the floating-prompt block");
