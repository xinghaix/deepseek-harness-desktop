(function () {
  const ua = navigator.userAgent || "";
  const platform = navigator.platform || "";
  const isMac = /Mac|iPhone|iPad|iPod/.test(platform) || /Mac OS X/.test(ua);
  document.documentElement.dataset.platform = isMac ? "mac" : "other";
})();
const $ = (id) => document.getElementById(id);
const t = (key, ...vars) => (window.DSHI18n ? window.DSHI18n.t(key, ...vars) : key);
const stateLabels = () => ({
  stopped: t("state.stopped"),
  starting: t("state.starting"),
  running: t("state.running"),
  stopping: t("state.stopping"),
  failed: t("state.failed"),
});
const api = (method, ...args) => wails.Call.ByName(`main.DSH.${method}`, ...args);
const storageKey = "deepseek-harness-desktop.options";
const onboardingKey = "deepseek-harness-desktop.onboarding-done";
const pageParams = new URLSearchParams(window.location.search);
const manualManagement = pageParams.get("manage") === "1";
const configModal = pageParams.get("modal") === "1";
if (configModal) document.documentElement.classList.add("dsh-desktop-config-modal");
let state = "stopped";
let busy = false;
let cliReady = false;
let defaultOptions = null;
let lastVersion = "";
let autoOpenStarted = false;
let guidesPromise = null;
let closeAfterChat = !manualManagement;
let lastErrorReport = "";
let baselineOptions = null;

function options() {
  return { executable: $("executable").value.trim(), home: $("home").value.trim(), workspace: $("workspace").value.trim(), port: 0 };
}
function errorText(error) { return error && error.message ? error.message : String(error || t("msg.operation_failed")); }
function formatAppVersion(v) {
  v = String(v || "").trim();
  if (!v) return "";
  if (v === "dev" || v.startsWith("dev-") || v.startsWith("v") || v.startsWith("V")) return v;
  return "v" + v;
}
function setMessage(text, isError = false) {
  $("onboarding-message").textContent = text || "";
  $("onboarding-message").dataset.error = isError ? "true" : "false";
  $("dashboard-message").textContent = text || t("dashboard.ready_message");
}
function setHidden(id, hidden) { $(id).hidden = hidden; }
function fillOptions(o) { if (!o) return; $("executable").value = o.executable || ""; $("home").value = o.home || ""; $("workspace").value = o.workspace || ""; }
function configSnapshot(o = options()) { return { executable: o.executable || "", home: o.home || "", workspace: o.workspace || "", port: 0 }; }
function configKey(o = options()) { return [o.executable || "", o.home || "", o.workspace || ""].join("\n"); }
function markBaseline(o = options()) { baselineOptions = configSnapshot(o); void api("SetConfigDirty", false); }
function isConfigDirty() { return Boolean(baselineOptions) && configKey() !== configKey(baselineOptions); }
function syncConfigDirty() { const dirty = isConfigDirty(); void api("SetConfigDirty", dirty); return dirty; }
function showDiscardDialog() { $("discard-config").hidden = false; }
function hideDiscardDialog() { $("discard-config").hidden = true; }
function requestCloseConfig() { if (isConfigDirty()) { showDiscardDialog(); return Promise.resolve(); } return api("DismissConfig"); }
function tryDismissConfigFromOverlay() { return api("TryDismissConfig"); }
function saveOptions(lastStartSucceeded = false) { try { const value = options(); value.lastStartSucceeded = Boolean(lastStartSucceeded); if (lastVersion) value.version = lastVersion; localStorage.setItem(storageKey, JSON.stringify(value)); void api("SaveLaunchOptions", value, Boolean(lastStartSucceeded)).catch(() => {}); } catch (_) {} }
function markStartupConfigStale() { try { const value = JSON.parse(localStorage.getItem(storageKey) || "null"); if (value && typeof value === "object" && value.lastStartSucceeded) { value.lastStartSucceeded = false; localStorage.setItem(storageKey, JSON.stringify(value)); } } catch (_) {} }
function loadSavedOptions() { try { const value = JSON.parse(localStorage.getItem(storageKey) || "null"); if (value && typeof value === "object") { fillOptions(value); return value; } } catch (_) {} return null; }
function clearErrorCard() { lastErrorReport = ""; setHidden("error-card", true); $("error-copy-state").textContent = ""; $("error-details-panel").open = false; }
function formatErrorReport(status) {
  const o = status && status.options ? status.options : {};
  const dash = t("msg.em_dash");
  const logs = status && status.logs ? status.logs : (status && status.error ? status.error : t("error.no_logs"));
  const labels = stateLabels();
  return [
    t("error.diag_header"),
    t("error.diag_state", labels[status && status.state] || (status && status.state) || t("state.failed")),
    t("error.diag_cli", o.executable || dash),
    t("error.diag_home", o.home || dash),
    t("error.diag_workspace", o.workspace || dash),
    t("error.diag_port", Number.isInteger(o.port) ? String(o.port) : dash),
    t("error.diag_desktop_error", status && status.error ? status.error : dash),
    "",
    t("error.diag_raw_logs"),
    logs,
  ].join("\n");
}
function renderErrorCard(status) {
  const failed = Boolean(status && (status.state === "failed" || status.error));
  if (!failed) { clearErrorCard(); return; }
  const isNewFailure = $("error-card").hidden;
  $("error-title").textContent = t("error.title");
  $("error-details-text").textContent = status.logs || status.error || t("error.no_dsh_details");
  if (isNewFailure) {
    $("error-details-panel").open = false;
    $("error-copy-state").textContent = "";
  }
  lastErrorReport = formatErrorReport(status);
  $("step-chat").dataset.state = "error";
  setHidden("error-card", false);
}
function showLoading(message) { clearErrorCard(); document.documentElement.classList.add("is-loading"); setHidden("loading-view", false); setHidden("onboarding-view", true); setHidden("dashboard-view", true); if (message) $("loading-message").textContent = message; }
function hideLoading() { document.documentElement.classList.remove("is-loading"); setHidden("loading-view", true); }
function showOnboarding() { hideLoading(); setHidden("onboarding-view", false); setHidden("dashboard-view", true); }
function showDashboard() { hideLoading(); setHidden("onboarding-view", true); setHidden("dashboard-view", false); }
function setDetect(stateName, title, message) { $("detect-card").dataset.state = stateName; $("detect-title").textContent = title; $("detect-message").textContent = message; }
function updateButtons() {
  const running = state === "running";
  $("start-first").disabled = busy || !cliReady || state === "starting" || state === "stopping";
  $("start-first").textContent = running ? t("btn.open_chat") : t("btn.start_open_chat");
  $("reload-chat").hidden = !running;
  $("reload-chat").disabled = busy || !cliReady || state === "starting" || state === "stopping";
  $("close-config").hidden = !running;
  $("close-config").disabled = busy || state === "starting" || state === "stopping";
  $("dashboard-start").disabled = busy || state === "starting" || state === "stopping";
  $("dashboard-start").textContent = running ? t("btn.reload_chat") : t("btn.start_dsh");
  $("dashboard-stop").disabled = busy || (state !== "running" && state !== "starting");
  $("dashboard-open").disabled = busy || state !== "running";
  $("open-home").disabled = busy;
  $("open-workspace").disabled = busy;
  $("open-settings").disabled = busy;
}
function statusPollDelayMs() {
  if (document.hidden) return 0;
  if (state === "starting" || state === "stopping") return 250;
  return 4000;
}
function renderStatus(status) {
  const previousState = state;
  const labels = stateLabels();
  const dash = t("msg.em_dash");
  state = status.state || "stopped";
  setRefreshDelay(statusPollDelayMs());
  if (state === "stopped" || state === "failed") autoOpenStarted = false;
  if (state === "failed") { markStartupConfigStale(); void loadGuides(); }
  if (state === "running" && previousState !== "running") saveOptions(true);
  $("retry-discovery").textContent = state === "failed" ? t("btn.retry_start") : t("btn.recheck");
  $("header-state").dataset.state = state;
  $("header-state").textContent = labels[state] || state;
  $("dashboard-state").dataset.state = state;
  $("dashboard-state").textContent = labels[state] || state;
  $("logs").textContent = status.logs || t("dashboard.no_logs");
  const o = status.options || {};
  $("metric-executable").textContent = o.executable || dash;
  $("metric-home").textContent = o.home || dash;
  $("metric-workspace").textContent = o.workspace || dash;
  $("metric-url").textContent = status.url || t("dashboard.url_not_ready");
  updateButtons();
  renderErrorCard(status);
  if (status.error) setMessage("");
  if (state === "failed" || status.error) showOnboarding();
  if (!manualManagement && state === "running" && previousState !== "running" && !autoOpenStarted) {
    autoOpenStarted = true;
    localStorage.setItem(onboardingKey, "1");
    if (manualManagement) showDashboard();
    else showLoading(t("loading.opening_chat"));
    void openReadyDSH();
  }
  const cliStepDone = cliReady || state === "running";
  $("step-cli").dataset.done = cliStepDone ? "true" : "false";
  $("step-cli").dataset.active = cliStepDone ? "false" : "true";
  const chatStepState = state === "failed" ? "error" : state === "running" ? "done" : "pending";
  $("step-chat").dataset.state = chatStepState;
  $("step-chat").dataset.active = state === "running" ? "true" : "false";
  $("step-chat").dataset.done = state === "running" ? "true" : "false";
}
async function refresh() {
  if (document.hidden) return;
  try { renderStatus(await api("Status")); } catch (error) { setMessage(errorText(error), true); }
}
function renderDesktopUpdate(u) {
  if (!u) return;
  const current = u.currentVersion || "";
  const shown = formatAppVersion(current);
  $("app-caption").textContent = shown ? t("app.caption_version", shown) : t("app.caption");
  $("update-version").textContent = shown || t("msg.em_dash");
  const bar = $("update-progress-bar");
  const progress = Math.max(0, Math.min(100, Math.round((u.progress || 0) * 100)));
  bar.style.width = `${progress}%`;
  $("update-progress").hidden = u.state !== "downloading";
  const notes = (u.notes || "").trim();
  $("update-notes").hidden = !notes || (u.state !== "available" && u.state !== "ready" && u.state !== "downloading");
  $("update-notes").textContent = notes;
  $("open-release").hidden = !u.releaseURL;
  const canInstall = u.state === "available" || u.state === "ready";
  $("install-update").hidden = !canInstall;
  $("install-update").disabled = busy || u.state === "downloading" || u.state === "applying";
  $("check-update").disabled = busy || u.state === "checking" || u.state === "downloading" || u.state === "applying";
  if (typeof u.autoCheck === "boolean") $("auto-check-update").checked = u.autoCheck;
  const messages = {
    idle: u.autoCheck ? t("update.idle_on") : t("update.idle_off"),
    checking: t("update.checking"),
    upToDate: t("update.up_to_date", formatAppVersion(current) || current),
    unavailable: u.error || t("update.unavailable"),
    available: t("update.available", formatAppVersion(u.latestVersion)),
    downloading: t("update.downloading", u.latestVersion, String(progress)),
    ready: t("update.ready", u.latestVersion),
    applying: t("update.applying"),
    failed: u.error || t("update.failed"),
  };
  $("update-message").textContent = messages[u.state] || u.error || "";
  lastUpdateState = u.state || "";
  setUpdateRefreshDelay(updatePollDelayMs());
}
async function refreshDesktopUpdate() {
  if (document.hidden) return;
  try { renderDesktopUpdate(await api("UpdateStatus")); } catch (_) {}
}
async function run(action, success) {
  busy = true; updateButtons();
  try { const result = await action(); if (success) success(result); }
  catch (error) { setMessage(errorText(error), true); }
  finally { busy = false; await refresh(); }
}
async function probeSelected() {
  try {
    const result = await api("CheckCLI", options());
    fillOptions(result.options); lastVersion = result.version || t("msg.version_detected"); $("version").textContent = lastVersion; cliReady = true;
    const runningNow = Boolean(result.alreadyRunning);
    setDetect("found", runningNow ? t("detect.running") : t("detect.found"), runningNow ? t("detect.running_saved", result.options.executable) : t("detect.verified", result.options.executable, lastVersion));
    setHidden("install-card", true); saveOptions(false); markBaseline(); setMessage(runningNow ? t("msg.runtime_saved") : t("msg.cli_ok"));
    $("step-cli").dataset.done = "true"; $("step-cli").dataset.active = "false";
    updateButtons(); return true;
  } catch (error) {
    cliReady = false; setDetect("error", t("detect.error_path"), errorText(error)); updateButtons(); return false;
  }
}
async function discover() {
  setDetect("checking", t("detect.checking_title"), t("detect.checking_detail")); cliReady = false; updateButtons();
  try {
    const result = await api("DiscoverCLI");
    if (result.found) { fillOptions(result.options); lastVersion = result.version || t("msg.version_detected"); $("version").textContent = lastVersion; cliReady = true; saveOptions(false); markBaseline(); setDetect("found", t("detect.found"), t("detect.found_version", result.options.executable, lastVersion)); setHidden("install-card", true); setMessage(t("msg.cli_ok")); }
    else { setDetect("missing", t("detect.missing"), result.message || t("detect.missing_message")); setHidden("install-card", false); $("advanced-settings").open = true; setMessage(t("msg.choose_or_install")); }
    updateButtons(); return result;
  } catch (error) { setDetect("error", t("detect.check_failed"), errorText(error)); setMessage(errorText(error), true); updateButtons(); return { found: false, error: errorText(error) }; }
}
async function openReadyDSH() {
  try {
    await api("OpenDSH");
  } catch (error) { setMessage(t("msg.open_webview_failed", errorText(error)), true); if (!manualManagement) showOnboarding(); }
}
async function startAutomatically(fastPath = false) {
  showLoading(fastPath ? t("loading.starting_saved") : t("loading.starting_found"));
  saveOptions(false);
  try { await api("Start", options()); return true; }
  catch (error) {
    if (fastPath) {
      markStartupConfigStale();
      const result = await discover();
      if (result && result.found) {
        showLoading(t("loading.starting_refound"));
        saveOptions(false);
        try { await api("Start", options()); return true; } catch (retryError) { error = retryError; }
      }
    }
    await loadGuides();
    const message = errorText(error);
    showOnboarding();
    setMessage("");
    renderErrorCard({ state: "failed", options: options(), error: message, logs: message });
  }
}
async function retryFailedStart() {
  clearErrorCard();
  let ready = await probeSelected();
  if (!ready) {
    const result = await discover();
    ready = Boolean(result && result.found);
  }
  if (!ready) return { found: false };
  closeAfterChat = !manualManagement;
  showLoading(t("loading.starting_fixed"));
  saveOptions(false);
  await api("Start", options());
  return { found: true };
}
function loadGuides() {
  if (guidesPromise) return guidesPromise;
  guidesPromise = (async () => {
    try { const guide = await api("InstallGuide"); $("node-command").textContent = guide.nodeCheck; $("cli-install-command").textContent = guide.installCLI; $("cli-verify-command").textContent = guide.verifyCLI; } catch (error) { setMessage(errorText(error), true); }
  })();
  return guidesPromise;
}
async function copyText(value, successText) {
  try {
    let copied = false;
    if (navigator.clipboard && window.isSecureContext !== false) {
      try { await navigator.clipboard.writeText(value); copied = true; } catch (_) {}
    }
    if (!copied) {
      const area = document.createElement("textarea");
      area.value = value; area.style.position = "fixed"; area.style.opacity = "0";
      document.body.appendChild(area);
      try { area.select(); if (!document.execCommand("copy")) throw new Error("copy failed"); }
      finally { area.remove(); }
    }
    if (successText) setMessage(successText);
    return true;
  } catch (_) { setMessage(t("msg.copy_failed_manual"), true); return false; }
}
function syncLanguageSelects() {
  if (!window.DSHI18n) return;
  window.DSHI18n.fillLanguageSelect($("ui-language"));
  window.DSHI18n.fillLanguageSelect($("ui-language-dashboard"));
}
async function applyLocaleBundle(bundle) {
  if (!bundle || !window.DSHI18n) return;
  window.DSHI18n.setBundle(bundle);
  applyPreferenceShortcutHints();
  syncLanguageSelects();
  updateButtons();
  void loadDesktopPrefs();
  void refresh();
  void refreshDesktopUpdate();
}
async function loadLocaleBundle() {
  try {
    const bundle = await api("LocaleBundle");
    await applyLocaleBundle(bundle);
    return bundle;
  } catch (_) {
    return null;
  }
}
async function changeLanguage(code) {
  const bundle = await api("SetLanguage", code);
  await applyLocaleBundle(bundle);
  return bundle;
}
function bindLanguageSelect(id) {
  const el = $(id);
  if (!el) return;
  el.onchange = () => run(() => changeLanguage(el.value));
}

$("check-cli").onclick = () => run(() => probeSelected());
$("retry-discovery").onclick = () => run(() => {
  if (state === "failed") return retryFailedStart();
  if ($("executable").value.trim()) return probeSelected();
  return discover();
});
$("restore-defaults").onclick = () => { fillOptions(defaultOptions); cliReady = false; syncConfigDirty(); void discover(); };
$("choose-executable").onclick = $("choose-executable-missing").onclick = () => run(async () => { const path = await api("ChooseExecutable"); if (path) { $("executable").value = path; $("advanced-settings").open = true; await probeSelected(); } });
$("choose-home").onclick = () => run(async () => { const path = await api("ChooseHome"); if (path) { $("home").value = path; cliReady = false; syncConfigDirty(); } });
$("choose-workspace").onclick = () => run(async () => { const path = await api("ChooseWorkspace"); if (path) { $("workspace").value = path; cliReady = false; syncConfigDirty(); } });
$("copy-cli-command").onclick = () => copyText($("cli-install-command").textContent, t("msg.copy_cli_ok"));
$("copy-error").onclick = async () => {
  if (!lastErrorReport) return;
  const copied = await copyText(lastErrorReport, "");
  $("error-copy-state").textContent = copied ? t("btn.copied") : t("btn.copy_failed");
};
$("start-first").onclick = () => run(async () => {
  if (!cliReady && !(await probeSelected())) throw new Error(t("msg.need_cli_check"));
  closeAfterChat = !manualManagement;
  saveOptions(false);
  markBaseline();
  if (state === "running") await api("OpenDSH");
  else await api("Start", options());
}, () => setMessage(state === "running" ? t("msg.chat_opened_refresh") : t("msg.dsh_starting_auto")));
$("reload-chat").onclick = () => run(async () => { saveOptions(false); markBaseline(); await api("ReloadChat", options()); }, () => setMessage(t("msg.reopening_chat_config")));
$("dashboard-start").onclick = () => run(async () => { if (state === "running") { saveOptions(false); markBaseline(); return api("ReloadChat", options()); } return api("Start", options()); }, () => setMessage(state === "running" ? t("msg.reopening_chat") : t("msg.dsh_starting")));
$("dashboard-stop").onclick = () => run(() => api("Stop"), () => setMessage(t("msg.stop_requested")));
$("dashboard-open").onclick = () => run(() => api("OpenDSH"), () => setMessage(t("msg.opened_webview")));
$("open-home").onclick = () => run(() => api("OpenHome", options()));
$("open-workspace").onclick = () => run(() => api("OpenWorkspace", options()));
$("open-settings").onclick = () => run(() => api("OpenSettings", options()));
$("reconfigure").onclick = () => { localStorage.removeItem(onboardingKey); closeAfterChat = false; clearErrorCard(); showOnboarding(); setMessage(t("msg.reconfigure")); };
$("close-config").onclick = () => run(() => requestCloseConfig());
$("discard-cancel").onclick = () => hideDiscardDialog();
$("discard-confirm").onclick = () => run(async () => { if (baselineOptions) fillOptions(baselineOptions); markBaseline(); hideDiscardDialog(); await api("DismissConfig"); });
$("check-update").onclick = () => run(() => api("CheckUpdate"));
$("auto-check-update").onchange = () => run(() => api("SetAutoCheckUpdate", $("auto-check-update").checked));
function applyConfirmQuitPref(enabled) {
  ["confirm-quit-busy", "confirm-quit-busy-setup"].forEach((id) => { const el = $(id); if (el) el.checked = enabled; });
}
function applyTrayEnabledPref(enabled) {
  ["tray-enabled", "tray-enabled-setup"].forEach((id) => { const el = $(id); if (el) el.checked = enabled; });
  document.querySelectorAll(".tray-dependent").forEach((el) => {
    el.classList.toggle("is-disabled", !enabled);
  });
  ["close-to-tray", "close-to-tray-setup", "tray-session-limit", "tray-session-limit-setup"].forEach((id) => {
    const el = $(id);
    if (el) el.disabled = !enabled;
  });
}
function applyCloseToTrayPref(enabled) {
  ["close-to-tray", "close-to-tray-setup"].forEach((id) => { const el = $(id); if (el) el.checked = enabled; });
}
function applyTraySessionLimitPref(n) {
  const value = String(Number.isFinite(n) ? n : 5);
  ["tray-session-limit", "tray-session-limit-setup"].forEach((id) => { const el = $(id); if (el) el.value = value; });
}
function applyDesktopTrayPrefs(prefs) {
  if (!prefs) return;
  const trayOn = prefs.trayEnabled === true;
  applyTrayEnabledPref(trayOn);
  if (typeof prefs.closeToTray === "boolean") applyCloseToTrayPref(trayOn && prefs.closeToTray);
  if (typeof prefs.traySessionLimit === "number") applyTraySessionLimitPref(prefs.traySessionLimit);
}
const DEFAULT_SHORTCUTS = {
  openSettings: "CmdOrCtrl+,",
  closeChat: "CmdOrCtrl+w",
  quit: "CmdOrCtrl+q",
  hide: "CmdOrCtrl+h",
  hideOthers: "CmdOrCtrl+OptionOrAlt+h",
};
const SHORTCUT_LABEL_KEYS = {
  openSettings: "shortcut.open_settings_label",
  closeChat: "shortcut.close_chat_label",
  quit: "shortcut.quit_label",
  hide: "shortcut.hide_label",
  hideOthers: "shortcut.hide_others_label",
};
let shortcutRecordingId = null;
let lastShortcutPrefs = null;
function isMacPlatform() {
  return document.documentElement.dataset.platform === "mac";
}
function formatAccelerator(accel) {
  if (accel == null || accel === "") return "";
  const mac = isMacPlatform();
  let s = String(accel);
  s = s.replace(/CmdOrCtrl\+/gi, mac ? "⌘" : "Ctrl+");
  s = s.replace(/CommandOrControl\+/gi, mac ? "⌘" : "Ctrl+");
  s = s.replace(/\bControl\+/gi, mac ? "⌃" : "Ctrl+");
  s = s.replace(/OptionOrAlt\+/gi, mac ? "⌥" : "Alt+");
  s = s.replace(/Alt\+/gi, mac ? "⌥" : "Alt+");
  s = s.replace(/Shift\+/gi, mac ? "⇧" : "Shift+");
  if (mac) {
    s = s.replace(/\+/g, "");
    // Uppercase lone letter keys for display (w -> W) but keep punctuation.
    s = s.replace(/([a-z])$/i, (m) => m.toUpperCase());
  }
  return s;
}
function shortcutDisplayLabel(accel, row) {
  if (accel === "") return t("shortcut.cleared");
  const formatted = formatAccelerator(accel);
  if (formatted) return formatted;
  if (row) {
    const fallback = isMacPlatform() ? row.getAttribute("data-default-mac") : row.getAttribute("data-default-other");
    if (fallback) return fallback;
  }
  return accel;
}
function normalizeAccelCompare(accel) {
  return String(accel || "").trim().toLowerCase();
}
/** Map KeyboardEvent → Wails accelerator, or null if modifier-only / unsupported. */
function keyboardEventToAccelerator(event) {
  const code = event.code || "";
  const key = event.key || "";
  if (key === "Escape" || code === "Escape") return { cancel: true };
  const modifierCodes = new Set([
    "ShiftLeft", "ShiftRight", "ControlLeft", "ControlRight",
    "AltLeft", "AltRight", "MetaLeft", "MetaRight", "OSLeft", "OSRight",
  ]);
  if (modifierCodes.has(code) || key === "Shift" || key === "Control" || key === "Alt" || key === "Meta") {
    return null;
  }
  let keyToken = "";
  if (/^Key[A-Z]$/.test(code)) keyToken = code.slice(3).toLowerCase();
  else if (/^Digit[0-9]$/.test(code)) keyToken = code.slice(5);
  else if (/^Numpad[0-9]$/.test(code)) keyToken = code.slice(6);
  else if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) keyToken = code;
  else {
    const codeMap = {
      Comma: ",", Period: ".", Slash: "/", Backslash: "\\", BracketLeft: "[", BracketRight: "]",
      Semicolon: ";", Quote: "'", Minus: "-", Equal: "=", Backquote: "`",
      Space: "Space", Tab: "Tab", Enter: "Return", NumpadEnter: "Return",
      Backspace: "Backspace", Delete: "Delete", Insert: "Insert",
      ArrowUp: "Up", ArrowDown: "Down", ArrowLeft: "Left", ArrowRight: "Right",
      Home: "Home", End: "End", PageUp: "PageUp", PageDown: "PageDown",
      NumpadAdd: "Plus", NumpadSubtract: "-", NumpadMultiply: "*", NumpadDivide: "/",
      NumpadDecimal: ".",
    };
    if (Object.prototype.hasOwnProperty.call(codeMap, code)) keyToken = codeMap[code];
    else if (key.length === 1) {
      const ch = key.toLowerCase();
      if (/[a-z0-9]/.test(ch) || "`-=[]\\;',./".includes(ch)) keyToken = ch;
    }
  }
  if (!keyToken) return { invalid: true };
  const parts = [];
  const mac = isMacPlatform();
  if (mac) {
    if (event.metaKey) parts.push("CmdOrCtrl");
    if (event.ctrlKey) parts.push("Control");
  } else if (event.ctrlKey || event.metaKey) {
    parts.push("CmdOrCtrl");
  }
  if (event.altKey) parts.push("OptionOrAlt");
  if (event.shiftKey) parts.push("Shift");
  parts.push(keyToken);
  return { accel: parts.join("+") };
}
function stopShortcutRecording({ restore = true } = {}) {
  if (!shortcutRecordingId) return;
  const id = shortcutRecordingId;
  shortcutRecordingId = null;
  window.removeEventListener("keydown", onShortcutRecordKeydown, true);
  window.removeEventListener("pointerdown", onShortcutRecordPointerDown, true);
  if (restore) {
    applyShortcutsPrefs(lastShortcutPrefs);
    return;
  }
  const li = document.querySelector(`#shortcuts-list [data-shortcut="${id}"]`);
  const kbd = li && li.querySelector("[data-shortcut-display]");
  if (kbd) {
    kbd.classList.remove("is-recording");
    kbd.removeAttribute("aria-pressed");
  }
}
function onShortcutRecordPointerDown(event) {
  if (!shortcutRecordingId) return;
  if (event.button != null && event.button !== 0) return;
  const target = event.target;
  if (target && typeof target.closest === "function") {
    const kbd = target.closest("[data-shortcut-display]");
    if (kbd) {
      const li = kbd.closest("[data-shortcut]");
      if (li && li.getAttribute("data-shortcut") === shortcutRecordingId) return;
    }
  }
  stopShortcutRecording({ restore: true });
}
function onShortcutRecordKeydown(event) {
  if (!shortcutRecordingId) return;
  event.preventDefault();
  event.stopPropagation();
  const parsed = keyboardEventToAccelerator(event);
  if (!parsed) return; // bare modifier
  if (parsed.cancel) {
    stopShortcutRecording({ restore: true });
    return;
  }
  if (parsed.invalid || !parsed.accel) {
    setMessage(t("shortcut.invalid"), true);
    return;
  }
  const id = shortcutRecordingId;
  void run(async () => {
    const prefs = await api("DesktopPrefs");
    const current = Object.assign({}, DEFAULT_SHORTCUTS, (prefs && prefs.shortcuts) || {});
    const want = normalizeAccelCompare(parsed.accel);
    for (const otherId of Object.keys(current)) {
      if (otherId === id) continue;
      if (normalizeAccelCompare(current[otherId]) === want && current[otherId] !== "") {
        const label = t(SHORTCUT_LABEL_KEYS[otherId] || otherId);
        setMessage(t("shortcut.conflict", label), true);
        // stay in recording
        return;
      }
    }
    current[id] = parsed.accel;
    try {
      const updated = await api("SetShortcuts", current);
      stopShortcutRecording({ restore: false });
      applyShortcutsPrefs(updated);
      setMessage(t("dashboard.ready_message"));
    } catch (error) {
      setMessage(errorText(error), true);
      // keep recording so the user can try another combo
    }
  });
}
function startShortcutRecording(id) {
  if (shortcutRecordingId === id) {
    stopShortcutRecording({ restore: true });
    return;
  }
  stopShortcutRecording({ restore: true });
  shortcutRecordingId = id;
  const li = document.querySelector(`#shortcuts-list [data-shortcut="${id}"]`);
  const kbd = li && li.querySelector("[data-shortcut-display]");
  if (kbd) {
    kbd.classList.add("is-recording");
    kbd.classList.remove("is-cleared");
    kbd.removeAttribute("data-i18n");
    kbd.setAttribute("aria-pressed", "true");
    kbd.textContent = t("shortcut.recording");
  }
  window.addEventListener("keydown", onShortcutRecordKeydown, true);
  window.addEventListener("pointerdown", onShortcutRecordPointerDown, true);
}
function effectiveShortcutAccel(id) {
  const map = (lastShortcutPrefs && lastShortcutPrefs.shortcuts && typeof lastShortcutPrefs.shortcuts === "object") ? lastShortcutPrefs.shortcuts : {};
  return Object.prototype.hasOwnProperty.call(map, id) ? map[id] : (DEFAULT_SHORTCUTS[id] || "");
}
function applyPreferenceShortcutHints() {
  const quit = formatAccelerator(effectiveShortcutAccel("quit"));
  const close = formatAccelerator(effectiveShortcutAccel("closeChat"));
  const pairs = [
    ["field.confirm_quit_hint", "field.confirm_quit_hint_none", quit],
    ["field.confirm_quit_hint_dashboard", "field.confirm_quit_hint_dashboard_none", quit],
    ["field.tray_enabled_hint", "field.tray_enabled_hint_none", close],
    ["field.tray_enabled_hint_dashboard", "field.tray_enabled_hint_dashboard_none", close],
    ["field.close_to_tray_hint", "field.close_to_tray_hint_none", quit],
    ["field.close_to_tray_hint_dashboard", "field.close_to_tray_hint_dashboard_none", quit],
  ];
  pairs.forEach(([withKey, noneKey, label]) => {
    document.querySelectorAll(`[data-i18n="${withKey}"], [data-i18n="${noneKey}"]`).forEach((el) => {
      el.textContent = label ? t(withKey, label) : t(noneKey);
    });
  });
}
function applyShortcutsPrefs(prefs) {
  if (prefs) lastShortcutPrefs = prefs;
  const map = (lastShortcutPrefs && lastShortcutPrefs.shortcuts && typeof lastShortcutPrefs.shortcuts === "object") ? lastShortcutPrefs.shortcuts : {};
  document.querySelectorAll("#shortcuts-list [data-shortcut]").forEach((li) => {
    const id = li.getAttribute("data-shortcut");
    const accel = Object.prototype.hasOwnProperty.call(map, id) ? map[id] : (DEFAULT_SHORTCUTS[id] || "");
    const kbd = li.querySelector("[data-shortcut-display]");
    const clearBtn = li.querySelector(".shortcut-clear");
    const resetBtn = li.querySelector(".shortcut-reset");
    const cleared = accel === "";
    const isDefault = normalizeAccelCompare(accel) === normalizeAccelCompare(DEFAULT_SHORTCUTS[id] || "");
    const recording = shortcutRecordingId === id;
    if (kbd && !recording) {
      if (cleared) {
        kbd.setAttribute("data-i18n", "shortcut.cleared");
        kbd.textContent = t("shortcut.cleared");
      } else {
        kbd.removeAttribute("data-i18n");
        kbd.textContent = shortcutDisplayLabel(accel, kbd);
      }
      kbd.classList.toggle("is-cleared", cleared);
      kbd.classList.remove("is-recording");
      kbd.setAttribute("tabindex", "0");
      kbd.setAttribute("role", "button");
      kbd.setAttribute("title", t("shortcut.recording"));
    }
    if (clearBtn) clearBtn.disabled = cleared;
    if (resetBtn) resetBtn.disabled = isDefault;
  });
  applyPreferenceShortcutHints();
}
async function loadDesktopPrefs() {
  try {
    const prefs = await api("DesktopPrefs");
    if (prefs && typeof prefs.confirmQuitWhenBusy === "boolean") applyConfirmQuitPref(prefs.confirmQuitWhenBusy);
    applyDesktopTrayPrefs(prefs);
    applyShortcutsPrefs(prefs);
  } catch (_) {}
}
["confirm-quit-busy", "confirm-quit-busy-setup"].forEach((id) => {
  const el = $(id);
  if (!el) return;
  el.onchange = () => run(async () => {
    const prefs = await api("SetConfirmQuitWhenBusy", el.checked);
    applyConfirmQuitPref(prefs.confirmQuitWhenBusy);
  });
});
["tray-enabled", "tray-enabled-setup"].forEach((id) => {
  const el = $(id);
  if (!el) return;
  el.onchange = () => run(async () => {
    const prefs = await api("SetTrayEnabled", el.checked);
    applyDesktopTrayPrefs(prefs);
  });
});
["close-to-tray", "close-to-tray-setup"].forEach((id) => {
  const el = $(id);
  if (!el) return;
  el.onchange = () => run(async () => {
    const prefs = await api("SetCloseToTray", el.checked);
    applyDesktopTrayPrefs(prefs);
  });
});
["tray-session-limit", "tray-session-limit-setup"].forEach((id) => {
  const el = $(id);
  if (!el) return;
  el.onchange = () => run(async () => {
    const prefs = await api("SetTraySessionLimit", Number(el.value));
    applyDesktopTrayPrefs(prefs);
  });
});
const shortcutsList = $("shortcuts-list");
if (shortcutsList) {
  shortcutsList.addEventListener("click", (event) => {
    const kbd = event.target.closest("[data-shortcut-display]");
    if (kbd && shortcutsList.contains(kbd)) {
      const li = kbd.closest("[data-shortcut]");
      if (!li) return;
      event.preventDefault();
      startShortcutRecording(li.getAttribute("data-shortcut"));
      return;
    }
    const btn = event.target.closest(".shortcut-clear, .shortcut-reset");
    if (!btn || !shortcutsList.contains(btn)) return;
    const li = btn.closest("[data-shortcut]");
    if (!li) return;
    const id = li.getAttribute("data-shortcut");
    stopShortcutRecording({ restore: false });
    void run(async () => {
      const prefs = await api("DesktopPrefs");
      const current = Object.assign({}, DEFAULT_SHORTCUTS, (prefs && prefs.shortcuts) || {});
      if (btn.classList.contains("shortcut-reset")) current[id] = DEFAULT_SHORTCUTS[id] || "";
      else current[id] = "";
      const updated = await api("SetShortcuts", current);
      applyShortcutsPrefs(updated);
    });
  });
  shortcutsList.addEventListener("keydown", (event) => {
    const kbd = event.target.closest("[data-shortcut-display]");
    if (!kbd || !shortcutsList.contains(kbd)) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    if (shortcutRecordingId) return;
    event.preventDefault();
    const li = kbd.closest("[data-shortcut]");
    if (li) startShortcutRecording(li.getAttribute("data-shortcut"));
  });
}
bindLanguageSelect("ui-language");
bindLanguageSelect("ui-language-dashboard");
$("install-update").onclick = () => run(() => api("InstallUpdate"), () => setMessage(t("update.installing")));
$("open-release").onclick = () => run(() => api("OpenReleasePage"));
["executable", "workspace"].forEach((id) => $(id).addEventListener("input", () => { cliReady = false; updateButtons(); syncConfigDirty(); }));
$("home").addEventListener("input", () => { cliReady = false; updateButtons(); syncConfigDirty(); });
async function load() {
  // Paint splash immediately; load locale in parallel with Defaults.
  document.documentElement.classList.add("is-loading");
  setHidden("loading-view", false);
  setHidden("onboarding-view", true);
  setHidden("dashboard-view", true);
  const localeP = loadLocaleBundle();
  void loadDesktopPrefs();
  void api("AppVersion").then((v) => {
    const shown = formatAppVersion(v);
    if (shown) $("app-caption").textContent = t("app.caption_version", shown);
  }).catch(() => {});
  let saved = null;
  try {
    const [, defaults, disk] = await Promise.all([localeP, api("Defaults"), api("PersistedLaunch").catch(() => null)]);
    defaultOptions = defaults;
    fillOptions(defaultOptions);
    saved = loadSavedOptions();
    if (disk && disk.present && disk.options) {
      fillOptions(disk.options);
      saved = Object.assign({}, disk.options, { lastStartSucceeded: Boolean(disk.lastStartSucceeded), version: (saved && saved.version) || lastVersion });
      try { localStorage.setItem(storageKey, JSON.stringify(saved)); } catch (_) {}
    }
    showLoading(manualManagement ? t("loading.opening_config") : t("loading.reading_saved"));
  } catch (error) {
    await localeP.catch(() => {});
    showOnboarding();
    setMessage(errorText(error), true);
    return;
  }
  if (manualManagement) {
    await loadGuides();
    const ready = await probeSelected();
    if (ready) showDashboard(); else { await discover(); showOnboarding(); }
    await refresh();
    markBaseline();
    return;
  }
  if (saved && saved.executable && saved.lastStartSucceeded === true) {
    cliReady = true;
    lastVersion = saved.version || t("msg.version_last_ok");
    $("version").textContent = lastVersion;
    setDetect("cached", t("detect.cached_title"), t("detect.cached_message", saved.executable));
    await startAutomatically(true);
    await refresh();
    markBaseline();
    return;
  }
  await loadGuides();
  let found = false;
  if (saved && saved.executable) found = await probeSelected();
  if (!found) {
    const result = await discover();
    found = Boolean(result && result.found);
  }
  if (found) await startAutomatically();
  else showOnboarding();
  await refresh();
  markBaseline();
}
window.addEventListener("DOMContentLoaded", load, { once: true });
const STATUS_EVENT = "dsh:status";
let refreshDelayMs = 4000;
let refreshTimer = null;
function setRefreshDelay(ms) {
  if (refreshDelayMs === ms && (ms === 0 ? !refreshTimer : Boolean(refreshTimer))) return;
  refreshDelayMs = ms;
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
  if (ms > 0) refreshTimer = setInterval(() => { void refresh(); }, ms);
}
let lastUpdateState = "";
let updateRefreshDelayMs = 8000;
let updateRefreshTimer = null;
function updatePollDelayMs() {
  if (document.hidden) return 0;
  if (lastUpdateState === "downloading" || lastUpdateState === "applying" || lastUpdateState === "checking") return 400;
  return 8000;
}
function setUpdateRefreshDelay(ms) {
  if (updateRefreshDelayMs === ms && (ms === 0 ? !updateRefreshTimer : Boolean(updateRefreshTimer))) return;
  updateRefreshDelayMs = ms;
  if (updateRefreshTimer) {
    clearInterval(updateRefreshTimer);
    updateRefreshTimer = null;
  }
  if (ms > 0) updateRefreshTimer = setInterval(() => { void refreshDesktopUpdate(); }, ms);
}
function subscribeStatusEvents() {
  const events = window.wails && window.wails.Events;
  if (!events || typeof events.On !== "function" || subscribeStatusEvents.done) return Boolean(subscribeStatusEvents.done);
  events.On(STATUS_EVENT, () => { void refresh(); });
  subscribeStatusEvents.done = true;
  return true;
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    setRefreshDelay(0);
    setUpdateRefreshDelay(0);
    return;
  }
  setRefreshDelay(statusPollDelayMs());
  setUpdateRefreshDelay(updatePollDelayMs());
  void refresh();
  void refreshDesktopUpdate();
});
setRefreshDelay(statusPollDelayMs());
setUpdateRefreshDelay(updatePollDelayMs());
if (!subscribeStatusEvents()) {
  let tries = 0;
  const timer = setInterval(() => {
    if (subscribeStatusEvents() || ++tries > 40) clearInterval(timer);
  }, 50);
}
