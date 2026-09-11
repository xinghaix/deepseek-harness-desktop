/** Desktop WebView boot overlay for DSH's client combo loader. */
export const name = "desktop-webview-boot";
export const inject = ["webServer"];

// WKWebView cannot load long combo <script src="/plugins/??...">.
// Fast path: one XHR of the full combo (desktop raises Node
// max-http-header-size so this no longer 431s). Slow path: on 431,
// expand to per-package ?? URLs with bounded concurrency.
const LOAD_BUNDLE = `(function () {
  var CONCURRENCY = 8;

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

  function loadViaXHR(url) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open("GET", url);
      xhr.onload = function () {
        if (xhr.status !== 200) {
          var err = new Error("desktop-webview-boot: xhr " + xhr.status + " for " + url);
          err.status = xhr.status;
          reject(err);
          return;
        }
        try {
          (0, eval)(xhr.responseText);
          resolve();
        } catch (err) {
          reject(err);
        }
      };
      xhr.onerror = function () {
        reject(new Error("desktop-webview-boot: xhr network error for " + url));
      };
      xhr.send();
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
}
