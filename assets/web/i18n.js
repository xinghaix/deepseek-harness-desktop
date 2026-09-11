/* Desktop shell i18n: catalog from LocaleBundle, apply data-i18n* attributes. */
(function (global) {
  const state = {
    locale: "en",
    catalog: {},
    language: "",
    source: "default",
    supported: [],
  };

  function t(key, ...vars) {
    let s = state.catalog[key];
    if (s == null || s === "") s = key;
    for (let i = 0; i < vars.length; i++) {
      s = String(s).split("{" + i + "}").join(vars[i] == null ? "" : String(vars[i]));
    }
    return s;
  }

  function applyElement(el) {
    const key = el.getAttribute("data-i18n");
    if (key) {
      const value = t(key);
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
        /* keep value; text nodes only for normal elements */
      } else if (el.childElementCount === 0) {
        el.textContent = value;
      } else {
        /* Prefer updating a dedicated text target when mixed markup exists */
        const target = el.querySelector("[data-i18n-text]") || null;
        if (target) target.textContent = value;
        else {
          for (const node of el.childNodes) {
            if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
              node.textContent = value;
              break;
            }
          }
        }
      }
    }
    const ph = el.getAttribute("data-i18n-placeholder");
    if (ph) el.setAttribute("placeholder", t(ph));
    const title = el.getAttribute("data-i18n-title");
    if (title) el.setAttribute("title", t(title));
    const aria = el.getAttribute("data-i18n-aria-label");
    if (aria) el.setAttribute("aria-label", t(aria));
    const expandKey = el.getAttribute("data-i18n-expand");
    if (expandKey) el.setAttribute("data-expand", t(expandKey));
    const collapseKey = el.getAttribute("data-i18n-collapse");
    if (collapseKey) el.setAttribute("data-collapse", t(collapseKey));
  }

  function applyAll(root) {
    const scope = root || document;
    scope.querySelectorAll("[data-i18n], [data-i18n-placeholder], [data-i18n-title], [data-i18n-aria-label], [data-i18n-expand], [data-i18n-collapse]").forEach(applyElement);
    if (document.documentElement && state.locale) {
      document.documentElement.lang = state.locale;
    }
  }

  function setBundle(bundle) {
    if (!bundle) return;
    state.locale = bundle.locale || "en";
    state.catalog = bundle.catalog || {};
    state.language = bundle.language == null ? "" : String(bundle.language);
    state.source = bundle.source || "default";
    state.supported = Array.isArray(bundle.supported) ? bundle.supported : [];
    applyAll(document);
  }

  function fillLanguageSelect(selectEl) {
    if (!selectEl) return;
    const current = state.language === "" || state.language === "system" ? "system" : state.locale;
    const opts = [{ code: "system", nativeName: t("lang.system") }].concat(
      (state.supported || []).map((s) => ({ code: s.code, nativeName: s.nativeName || s.code }))
    );
    selectEl.innerHTML = "";
    for (const o of opts) {
      const opt = document.createElement("option");
      opt.value = o.code;
      opt.textContent = o.code === "system" ? o.nativeName : `${o.nativeName} (${o.code})`;
      selectEl.appendChild(opt);
    }
    selectEl.value = current === "system" || !state.language ? "system" : (state.language || state.locale);
    if (![...selectEl.options].some((o) => o.value === selectEl.value)) {
      selectEl.value = "system";
    }
  }

  global.DSHI18n = {
    t,
    applyAll,
    setBundle,
    fillLanguageSelect,
    get locale() { return state.locale; },
    get language() { return state.language; },
    get source() { return state.source; },
    get catalog() { return state.catalog; },
  };
})(window);
