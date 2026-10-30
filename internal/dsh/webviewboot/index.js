/** Desktop WebView boot overlay for DSH's client combo loader. */
export const name = "desktop-webview-boot";
export const inject = ["webServer"];

// WKWebView cannot load long combo <script src="/plugins/??...">.
// Fast path: one XHR of the full combo (desktop raises Node
// max-http-header-size so this no longer 431s). Slow path: on 431,
// expand to per-package ?? URLs with bounded concurrency.
const LOAD_BUNDLE = `(function () {
  var CONCURRENCY = 8;
  var xhrCache = Object.create(null);

  function parseCombo(url) {
    var text = String(url == null ? "" : url);
    var at = text.indexOf("??");
    if (at === -1) return null;
    var head = text.slice(0, at + 2);
    var rest = text.slice(at + 2);
    var amp = rest.indexOf("&");
    var list = amp === -1 ? rest : rest.slice(0, amp);
    var suffix = amp === -1 ? "" : rest.slice(amp);
    var pkgs = list.split(",").filter(Boolean);
    if (!pkgs.length) return null;
    return { head: head, pkgs: pkgs, suffix: suffix };
  }

  function packageURLs(url) {
    var parsed = parseCombo(url);
    if (!parsed) return [String(url)];
    return parsed.pkgs.map(function (pkg) {
      return parsed.head + pkg + parsed.suffix;
    });
  }

  function cacheKey(url) {
    var text = String(url == null ? "" : url);
    var at = text.indexOf("plugins/??");
    return at === -1 ? text : text.slice(at);
  }

  function requestURL(url) {
    var text = String(url == null ? "" : url);
    return text.indexOf("plugins/??") === 0 ? "/" + text : text;
  }

  function fetchViaXHR(url) {
    var key = cacheKey(url);
    var reqUrl = requestURL(url);
    if (xhrCache[key]) return xhrCache[key];
    var pending = new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open("GET", reqUrl);
      xhr.onload = function () {
        if (xhr.status !== 200) {
          delete xhrCache[key];
          var err = new Error("desktop-webview-boot: xhr " + xhr.status + " for " + reqUrl);
          err.status = xhr.status;
          reject(err);
          return;
        }
        resolve(xhr.responseText);
      };
      xhr.onerror = function () {
        delete xhrCache[key];
        reject(new Error("desktop-webview-boot: xhr network error for " + reqUrl));
      };
      xhr.send();
    });
    xhrCache[key] = pending;
    return pending;
  }

  var scProxy = globalThis.__DSH_DESKTOP_SHORTCUTS_PROXY__ = globalThis.__DSH_DESKTOP_SHORTCUTS_PROXY__ || (function () {
    var nav = typeof navigator !== "undefined" ? navigator : null;
    var ua = String((nav && (nav.platform || nav.userAgent)) || "");
    var datasetPlatform = /Mac|iPhone|iPod|iPad/i.test(ua) ? "darwin" : (/Win/i.test(ua) ? "win32" : "linux");
    var proxy = {
      service: null,
      delegate: null,
      pendingDefinitions: null,
      pendingGets: [],
      configListeners: [],
      keyboardListeners: [],
      datasetPlatform: datasetPlatform,
      shortcuts: {
        get: function (defs) {
          if (Array.isArray(defs)) proxy.pendingDefinitions = defs;
          if (proxy.delegate && proxy.delegate.shortcuts) {
            return proxy.delegate.shortcuts.get(defs);
          }
          return new Promise(function (resolve) {
            proxy.pendingGets.push({ defs: defs, resolve: resolve });
          });
        },
        edit: function (op, rev) {
          if (proxy.delegate && proxy.delegate.shortcuts) {
            return proxy.delegate.shortcuts.edit(op, rev);
          }
          return Promise.resolve({ status: "not-ready" });
        },
        subscribe: function (fn) {
          if (typeof fn === "function" && proxy.configListeners.indexOf(fn) === -1) {
            proxy.configListeners.push(fn);
          }
          var off = proxy.delegate && proxy.delegate.shortcuts ? proxy.delegate.shortcuts.subscribe(fn) : null;
          return function () {
            var idx = proxy.configListeners.indexOf(fn);
            if (idx !== -1) proxy.configListeners.splice(idx, 1);
            if (typeof off === "function") off();
          };
        },
        recording: function (active) {
          if (proxy.delegate && proxy.delegate.shortcuts) {
            return proxy.delegate.shortcuts.recording(active);
          }
          return Promise.resolve();
        }
      },
      keyboard: {
        closeWindow: function () {
          if (proxy.delegate && proxy.delegate.keyboard) {
            return proxy.delegate.keyboard.closeWindow();
          }
          return Promise.resolve();
        },
        subscribe: function (fn) {
          if (typeof fn === "function" && proxy.keyboardListeners.indexOf(fn) === -1) {
            proxy.keyboardListeners.push(fn);
          }
          var off = proxy.delegate && proxy.delegate.keyboard ? proxy.delegate.keyboard.subscribe(fn) : null;
          return function () {
            var idx = proxy.keyboardListeners.indexOf(fn);
            if (idx !== -1) proxy.keyboardListeners.splice(idx, 1);
            if (typeof off === "function") off();
          };
        }
      },
      wrapFactory: function (origFactory, req) {
        var customWrap = globalThis.__DSH_DESKTOP_WRAP_SHORTCUTS_FACTORY__;
        if (typeof customWrap === "function" && customWrap !== proxy.wrapFactory) {
          return customWrap(origFactory, req);
        }
        var mod = origFactory(req);
        var OrigService = typeof mod === "function" ? mod : (mod && (mod.ShortcutsService || mod.default));
        if (typeof OrigService !== "function") return mod;
        class DesktopBridgedShortcutsService extends OrigService {
          constructor(ctx) {
            var docEl = typeof document !== "undefined" ? document.documentElement : null;
            var hadPlatformAttr = docEl && typeof docEl.hasAttribute === "function" ? docEl.hasAttribute("data-platform") : false;
            var prevPlatformAttr = docEl && hadPlatformAttr && typeof docEl.getAttribute === "function" ? docEl.getAttribute("data-platform") : null;
            var prevDatasetPlatform = docEl && docEl.dataset ? docEl.dataset.platform : undefined;
            var hadDshDesktop = typeof window !== "undefined" && Object.prototype.hasOwnProperty.call(window, "dshDesktop");
            var prevDshDesktop = typeof window !== "undefined" ? window.dshDesktop : undefined;
            if (docEl && docEl.dataset) {
              docEl.dataset.platform = proxy.datasetPlatform;
            } else if (docEl && typeof docEl.setAttribute === "function") {
              docEl.setAttribute("data-platform", proxy.datasetPlatform);
            }
            if (typeof window !== "undefined") {
              window.dshDesktop = Object.assign(
                {},
                prevDshDesktop && typeof prevDshDesktop === "object" ? prevDshDesktop : {},
                { shortcuts: proxy.shortcuts, keyboard: proxy.keyboard }
              );
            }
            try {
              super(ctx);
            } finally {
              if (docEl && docEl.dataset) {
                if (hadPlatformAttr && prevPlatformAttr !== null) {
                  docEl.dataset.platform = prevPlatformAttr;
                } else if (prevDatasetPlatform !== undefined) {
                  docEl.dataset.platform = prevDatasetPlatform;
                } else {
                  try { delete docEl.dataset.platform; } catch (_) {}
                  if (typeof docEl.removeAttribute === "function") docEl.removeAttribute("data-platform");
                }
              } else if (docEl && typeof docEl.removeAttribute === "function") {
                if (hadPlatformAttr && prevPlatformAttr !== null) {
                  docEl.setAttribute("data-platform", prevPlatformAttr);
                } else {
                  docEl.removeAttribute("data-platform");
                }
              }
              if (typeof window !== "undefined") {
                if (hadDshDesktop) {
                  window.dshDesktop = prevDshDesktop;
                } else {
                  delete window.dshDesktop;
                }
              }
            }
            if (!this.ctx && ctx) {
              this.ctx = ctx;
            }
            proxy.service = this;
            if (proxy.delegate && typeof proxy.delegate.attachService === "function") {
              try { proxy.delegate.attachService(this); } catch (_) {}
            }
            if (typeof this.__dshDesktopCommandsDispose !== "function" && typeof this.__dshDesktopBootCommandsDispose !== "function") {
              var self = this;
              var bootSpecs = [
                {
                  id: "desktop.quit",
                  zh: "退出",
                  en: "Quit",
                  aliases: ["quit", "exit", "退出", "退出应用"],
                  defaults: {
                    "desktop:macos": { code: "KeyQ", modifiers: ["primary"] },
                    "desktop:windows": { code: "KeyQ", modifiers: ["primary"] },
                    "desktop:linux": { code: "KeyQ", modifiers: ["primary"] }
                  }
                }
              ];
              if (proxy.datasetPlatform === "darwin") {
                bootSpecs.push(
                  {
                    id: "desktop.hide",
                    zh: "隐藏应用",
                    en: "Hide App",
                    aliases: ["hide", "hide app", "隐藏", "隐藏应用"],
                    defaults: {
                      "desktop:macos": { code: "KeyH", modifiers: ["primary"] }
                    }
                  },
                  {
                    id: "desktop.hideOthers",
                    zh: "隐藏其他",
                    en: "Hide Others",
                    aliases: ["hide others", "隐藏其他", "隐藏其它"],
                    defaults: {
                      "desktop:macos": { code: "KeyH", modifiers: ["primary", "alt"] }
                    }
                  }
                );
              }
              var bootDisposers = [];
              for (var bi = 0; bi < bootSpecs.length; bi++) {
                (function (spec) {
                  try {
                    var d = self.register({
                      id: spec.id,
                      label: function () {
                        var snap = (ctx || self.ctx) && (ctx || self.ctx).locale && typeof (ctx || self.ctx).locale.getSnapshot === "function"
                          ? (ctx || self.ctx).locale.getSnapshot()
                          : null;
                        var snapLang = typeof snap === "string" ? snap : (snap && typeof snap.active === "string" ? snap.active : "");
                        var docLang = typeof document !== "undefined" && document.documentElement ? (document.documentElement.lang || "") : "";
                        var navLang = typeof navigator !== "undefined" ? (navigator.language || "") : "";
                        var activeLang = snapLang || docLang || navLang || "";
                        return String(activeLang).toLowerCase().indexOf("zh") === 0 ? spec.zh : spec.en;
                      },
                      aliases: spec.aliases,
                      defaults: spec.defaults,
                      regions: ["page", "editable", "terminal"],
                      modals: ["settings", "shortcuts", "other"],
                      resolve: function () {
                        return { status: "handled", run: function () {} };
                      }
                    });
                    if (typeof d === "function") bootDisposers.push(d);
                  } catch (_) {}
                })(bootSpecs[bi]);
              }
              this.__dshDesktopBootCommandsDispose = function () {
                delete self.__dshDesktopBootCommandsDispose;
                for (var di = 0; di < bootDisposers.length; di++) {
                  try { bootDisposers[di](); } catch (_) {}
                }
              };
            }
          }
          register(command) {
            if (command && typeof command.id === "string" && command.id.indexOf("desktop.") === 0 && command.defaults && command.defaults["desktop:linux"]) {
              var linuxDefault = command.defaults["desktop:linux"];
              var safeDefaults = Object.assign({}, command.defaults);
              delete safeDefaults["desktop:linux"];
              var patchedCommand = Object.assign({}, command, { defaults: safeDefaults });
              var dispose = super.register(patchedCommand);
              patchedCommand.defaults["desktop:linux"] = linuxDefault;
              if (this.registry && typeof this.registry.refreshLabels === "function") {
                this.registry.refreshLabels();
              }
              if (typeof this.syncDefinitions === "function") {
                try { this.syncDefinitions(); } catch (_) {}
              }
              return dispose;
            }
            return super.register(command);
          }
        }
        for (var k of Object.keys(OrigService)) {
          try { DesktopBridgedShortcutsService[k] = OrigService[k]; } catch (_) {}
        }
        DesktopBridgedShortcutsService.ShortcutsService = DesktopBridgedShortcutsService;
        DesktopBridgedShortcutsService.default = DesktopBridgedShortcutsService;
        if (typeof mod === "function") {
          return DesktopBridgedShortcutsService;
        }
        var wrappedMod = Object.create(null);
        Object.defineProperty(wrappedMod, Symbol.toStringTag, { value: "Module" });
        for (var mk of Object.keys(mod)) wrappedMod[mk] = mod[mk];
        wrappedMod.ShortcutsService = DesktopBridgedShortcutsService;
        wrappedMod.default = DesktopBridgedShortcutsService;
        return wrappedMod;
      },
      wrapUiFactory: function (origFactory, req) {
        var OrigMap = globalThis.Map;
        if (typeof OrigMap === "function" && typeof Proxy === "function") {
          try {
            globalThis.Map = new Proxy(OrigMap, {
              construct: function (Target, args, newTarget) {
                var m = Reflect.construct(Target, args, newTarget);
                try {
                  if (m && typeof m.get === "function" && typeof m.set === "function" && m.get("shortcuts.open") === 0 && m.get("page.close") === 19) {
                    m.set("settings.open", 0.1);
                    m.set("page.close", 0.2);
                    m.set("desktop.quit", 0.3);
                    m.set("desktop.hide", 0.4);
                    m.set("desktop.hideOthers", 0.5);
                  }
                } catch (_) {}
                return m;
              }
            });
          } catch (_) {}
        }
        try {
          return origFactory(req);
        } finally {
          if (typeof OrigMap === "function") {
            globalThis.Map = OrigMap;
          }
        }
      }
    };
    return proxy;
  })();

  function wrapShortcutsSpec(spec) {
    if (!spec || typeof spec.factory !== "function" || spec.factory.__dshDesktopWrapped) {
      return spec;
    }
    if (spec.id === "@deepseek-ai/dsh-client-shortcuts") {
      var origFactory = spec.factory;
      var wrappedFactory = function (require) {
        return scProxy.wrapFactory(origFactory, require);
      };
      wrappedFactory.__dshDesktopWrapped = true;
      return Object.assign({}, spec, { factory: wrappedFactory });
    }
    if (spec.id === "@deepseek-ai/dsh-client-ui-shortcuts") {
      var origUiFactory = spec.factory;
      var wrappedUiFactory = function (require) {
        return scProxy.wrapUiFactory(origUiFactory, require);
      };
      wrappedUiFactory.__dshDesktopWrapped = true;
      return Object.assign({}, spec, { factory: wrappedUiFactory });
    }
    return spec;
  }

  function hookModuleLoader() {
    var loader = globalThis["__" + "ModuleLoader__"];
    if (!loader) return;
    if (Array.isArray(loader.pendingQueue)) {
      for (var i = 0; i < loader.pendingQueue.length; i++) {
        loader.pendingQueue[i] = wrapShortcutsSpec(loader.pendingQueue[i]);
      }
    }
    if (typeof loader.load === "function" && !loader.load.__dshDesktopShortcutsHooked) {
      var origLoad = loader.load;
      var wrappedLoad = function (spec) {
        return origLoad.call(this, wrapShortcutsSpec(spec));
      };
      wrappedLoad.__dshDesktopShortcutsHooked = true;
      loader.load = wrappedLoad;
    }
    if (typeof loader.create === "function" && !loader.create.__dshDesktopShortcutsCreateHooked) {
      var origCreate = loader.create;
      var wrappedCreate = function () {
        var res = origCreate.apply(this, arguments);
        hookModuleLoader();
        return res;
      };
      wrappedCreate.__dshDesktopShortcutsCreateHooked = true;
      loader.create = wrappedCreate;
    }
  }
  hookModuleLoader();

  function loadViaXHR(url) {
    var key = cacheKey(url);
    return fetchViaXHR(url).then(function (source) {
      delete xhrCache[key];
      hookModuleLoader();
      (0, eval)(source);
      hookModuleLoader();
    });
  }

  function mapPool(items, limit, worker) {
    if (!items.length) return Promise.resolve([]);
    var i = 0;
    var active = 0;
    return new Promise(function (resolve, reject) {
      var settled = false;
      function fail(err) {
        if (settled) return;
        settled = true;
        reject(err);
      }
      function kick() {
        if (settled) return;
        while (active < limit && i < items.length) {
          active++;
          Promise.resolve(worker(items[i++])).then(function () {
            active--;
            if (i >= items.length && active === 0) {
              settled = true;
              resolve();
            } else {
              kick();
            }
          }, fail);
        }
      }
      kick();
    });
  }

  function loadParallel(url) {
    return mapPool(packageURLs(url), CONCURRENCY, loadViaXHR);
  }

  function loadBundle(url) {
    return loadViaXHR(url).catch(function (err) {
      if (!err || err.status !== 431) throw err;
      return loadParallel(url);
    });
  }

  // 在 <head> 注入的 __DSH_BOOT__.batches 就绪后立即并发启动 XHR 预取，
  // 使 application 批次与 vendor.js / index.js 下载、解析完全并行。
  function prefetchBootBatches() {
    hookModuleLoader();
    var boot = globalThis.__DSH_BOOT__;
    var batches = boot && Array.isArray(boot.batches) ? boot.batches : null;
    if (!batches) return;
    for (var i = 0; i < batches.length; i++) {
      var batch = batches[i];
      if (batch && typeof batch.url === "string" && batch.url) {
        fetchViaXHR(batch.url).catch(function () {});
      }
    }
  }
  globalThis.__DSH_BOOT_KICK__ = prefetchBootBatches;
  if (typeof queueMicrotask === "function") {
    queueMicrotask(prefetchBootBatches);
  } else {
    setTimeout(prefetchBootBatches, 0);
  }

  var transport = globalThis.__DSH_TRANSPORT__ = globalThis.__DSH_TRANSPORT__ || {};
  transport.loadBundle = loadBundle;

  var proto = HTMLScriptElement.prototype;
  var desc = Object.getOwnPropertyDescriptor(proto, "src");
  if (desc && desc.set && desc.get) {
    Object.defineProperty(proto, "src", {
      configurable: true,
      enumerable: desc.enumerable,
      get: function () { return this.__dshComboUrl || desc.get.call(this); },
      set: function (value) {
        var text = String(value == null ? "" : value);
        if (text.indexOf("??") !== -1 && text.indexOf("plugins/") !== -1) {
          this.__dshComboUrl = text;
          return;
        }
        desc.set.call(this, value);
      }
    });
  }

  function interceptAppend(orig) {
    return function () {
      var kept = [];
      var lastCombo = null;
      for (var i = 0; i < arguments.length; i++) {
        var el = arguments[i];
        if (el && el.__dshComboUrl) {
          lastCombo = el;
          (function (target, combo) {
            loadBundle(combo).then(function () {
              target.dispatchEvent(new Event("load"));
            }).catch(function () {
              target.dispatchEvent(new Event("error"));
            });
          })(el, el.__dshComboUrl);
        } else {
          kept.push(el);
        }
      }
      if (kept.length === 0) return lastCombo;
      return orig.apply(this, kept);
    };
  }
  if (typeof Element !== "undefined" && Element.prototype.append) {
    Element.prototype.append = interceptAppend(Element.prototype.append);
  }
  if (typeof Node !== "undefined" && Node.prototype.appendChild) {
    Node.prototype.appendChild = interceptAppend(Node.prototype.appendChild);
  }
})();`;

export function stripComboPreloads(html) {
  return html.replace(/<link\s+rel="preload"\s+as="script"\s+href="\/plugins\/\?\?[^"]*">/g, "");
}

export function injectLoadBundle(table) {
  for (let i = table.length - 1; i >= 0; i--) {
    if (table[i] && table[i].kind === "script-preload") table.splice(i, 1);
  }
  table.unshift({
    kind: "script",
    placement: "head",
    text: LOAD_BUNDLE,
  });
  table.push({
    kind: "script",
    placement: "head",
    text: "globalThis.__DSH_BOOT_KICK__&&globalThis.__DSH_BOOT_KICK__();",
  });
}

export function apply(ctx) {
  ctx.webServer.tapIndex(stripComboPreloads);
  ctx.on("webserver/index-inject", injectLoadBundle);

  // 本机回环接口（127.0.0.1 / ::1）传输 13MB+ 客户端插件 combo 包时，
  // 实时 gzip 压缩与浏览器解压开销高达 ~220ms，而回环内存直传仅需 ~22ms。
  if (ctx.webServer && "gzip" in ctx.webServer && typeof ctx.effect === "function") {
    ctx.effect(() => {
      const prevGzip = ctx.webServer.gzip;
      ctx.webServer.gzip = undefined;
      return () => {
        ctx.webServer.gzip = prevGzip;
      };
    }, "desktop-webview-boot:disable-loopback-gzip");
  }

  // 启动就绪后在空闲刻预热 clientModules combo Buffer 并刷新 V8 字节码编译缓存落盘。
  if (typeof ctx.effect === "function") {
    ctx.effect(() => {
      const timer = setTimeout(() => {
        try {
          const cm = typeof ctx.get === "function" ? ctx.get("clientModules") : ctx.clientModules;
          const scripts = typeof cm?.scripts === "function" ? cm.scripts() : null;
          if (scripts && typeof scripts.values === "function") {
            for (const build of scripts.values()) {
              if (typeof build === "function") build();
            }
          }
        } catch {
          // 忽略不同 DSH 版本的内部结构差异
        }
        import("node:module")
          .then((mod) => {
            if (typeof mod.flushCompileCache === "function") {
              mod.flushCompileCache();
            }
          })
          .catch(() => {});
      }, 20);
      if (typeof timer?.unref === "function") timer.unref();
      return () => clearTimeout(timer);
    }, "desktop-webview-boot:warm-caches");
  }
}
