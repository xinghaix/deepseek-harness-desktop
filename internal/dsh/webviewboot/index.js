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

  function loadViaXHR(url) {
    var key = cacheKey(url);
    return fetchViaXHR(url).then(function (source) {
      delete xhrCache[key];
      (0, eval)(source);
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
