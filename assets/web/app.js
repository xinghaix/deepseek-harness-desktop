const $ = (id) => document.getElementById(id);
const labels = { stopped: "未启动", starting: "启动中", running: "运行中", stopping: "停止中", failed: "启动失败" };
const api = (method, ...args) => wails.Call.ByName(`main.DSH.${method}`, ...args);
const storageKey = "deepseek-harness-desktop.options";
const onboardingKey = "deepseek-harness-desktop.onboarding-done";
const manualManagement = new URLSearchParams(window.location.search).get("manage") === "1";
let state = "stopped";
let busy = false;
let cliReady = false;
let defaultOptions = null;
let lastVersion = "";
let autoOpenStarted = false;
let bridgeGuide = null;
let guidesPromise = null;
let closeAfterChat = !manualManagement;
let lastErrorReport = "";

function options() {
  return { executable: $("executable").value.trim(), home: $("home").value.trim(), desktopDir: $("desktop-dir").value.trim(), workspace: $("workspace").value.trim(), port: 0 };
}
function errorText(error) { return error && error.message ? error.message : String(error || "操作失败"); }
function formatAppVersion(v) {
  v = String(v || "").trim();
  if (!v) return "";
  if (v === "dev" || v.startsWith("dev-") || v.startsWith("v") || v.startsWith("V")) return v;
  return "v" + v;
}
function setMessage(text, isError = false) { $("onboarding-message").textContent = text || ""; $("onboarding-message").dataset.error = isError ? "true" : "false"; $("dashboard-message").textContent = text || "准备启动 DSH…"; }
function setHidden(id, hidden) { $(id).hidden = hidden; }
function desktopDirForHome(home) { const value = String(home || "").trim(); if (!value) return ""; const separator = value.includes("\\") ? "\\" : "/"; const base = value.replace(/[\\/]+$/, "") || separator; return base === separator ? `${base}.deepseek-harness-desktop` : `${base}${separator}.deepseek-harness-desktop`; }
function syncDesktopDir() { $("desktop-dir").value = desktopDirForHome($("home").value); }
function fillOptions(o) { if (!o) return; $("executable").value = o.executable || ""; $("home").value = o.home || ""; $("desktop-dir").value = desktopDirForHome(o.home) || o.desktopDir || ""; $("workspace").value = o.workspace || ""; }
function saveOptions(lastStartSucceeded = false) { try { const value = options(); value.lastStartSucceeded = Boolean(lastStartSucceeded); if (lastVersion) value.version = lastVersion; localStorage.setItem(storageKey, JSON.stringify(value)); } catch (_) {} }
function markStartupConfigStale() { try { const value = JSON.parse(localStorage.getItem(storageKey) || "null"); if (value && typeof value === "object" && value.lastStartSucceeded) { value.lastStartSucceeded = false; localStorage.setItem(storageKey, JSON.stringify(value)); } } catch (_) {} }
function loadSavedOptions() { try { const value = JSON.parse(localStorage.getItem(storageKey) || "null"); if (value && typeof value === "object") { fillOptions(value); return value; } } catch (_) {} return null; }
function clearErrorCard() { lastErrorReport = ""; setHidden("error-card", true); $("error-copy-state").textContent = ""; $("error-details-panel").open = false; }
function formatErrorReport(status) {
  const o = status && status.options ? status.options : {};
  const logs = status && status.logs ? status.logs : (status && status.error ? status.error : "暂无错误日志");
  return [
    "Deepseek Harness Desktop 启动诊断",
    `状态：${labels[status && status.state] || (status && status.state) || "启动失败"}`,
    `CLI：${o.executable || "—"}`,
    `DSH Home：${o.home || "—"}`,
    `桌面端目录：${o.desktopDir || "—"}`,
    `Chat 工作目录：${o.workspace || "—"}`,
    `端口：${Number.isInteger(o.port) ? o.port : "—"}`,
    `桌面端错误：${status && status.error ? status.error : "—"}`,
    "",
    "DSH 原始启动日志：",
    logs,
  ].join("\n");
}
function renderErrorCard(status) {
  const failed = Boolean(status && (status.state === "failed" || status.error));
  if (!failed) { clearErrorCard(); return; }
  const isNewFailure = $("error-card").hidden;
  $("error-title").textContent = "DSH 启动失败";
  $("error-details-text").textContent = status.logs || status.error || "未收到 DSH 错误详情。";
  if (isNewFailure) {
    $("error-details-panel").open = false;
    $("error-copy-state").textContent = "";
  }
  lastErrorReport = formatErrorReport(status);
  $("step-chat").dataset.state = "error";
  setHidden("error-card", false);
}
function showLoading(message) { clearErrorCard(); setHidden("loading-view", false); setHidden("onboarding-view", true); setHidden("dashboard-view", true); if (message) $("loading-message").textContent = message; }
function hideLoading() { setHidden("loading-view", true); }
function showOnboarding() { hideLoading(); setHidden("onboarding-view", false); setHidden("dashboard-view", true); }
function showDashboard() { hideLoading(); setHidden("onboarding-view", true); setHidden("dashboard-view", false); }
function setDetect(stateName, title, message) { $("detect-card").dataset.state = stateName; $("detect-title").textContent = title; $("detect-message").textContent = message; }
function updateButtons() {
  const running = state === "running";
  $("start-first").disabled = busy || !cliReady || state === "starting" || state === "stopping";
  $("start-first").textContent = running ? "打开 DSH Chat" : "启动并打开 DSH Chat";
  $("reload-chat").hidden = !running;
  $("reload-chat").disabled = busy || !cliReady || state === "starting" || state === "stopping";
  $("close-config").hidden = !running;
  $("close-config").disabled = busy || state === "starting" || state === "stopping";
  $("dashboard-start").disabled = busy || state === "starting" || state === "stopping";
  $("dashboard-start").textContent = running ? "重新打开 Chat" : "启动 DSH";
  $("dashboard-stop").disabled = busy || (state !== "running" && state !== "starting");
  $("dashboard-open").disabled = busy || state !== "running";
  $("open-home").disabled = busy;
  $("open-workspace").disabled = busy;
  $("open-settings").disabled = busy;
}
function renderStatus(status) {
  const previousState = state;
  state = status.state || "stopped";
  if (state === "stopped" || state === "failed") autoOpenStarted = false;
  if (state === "failed") { markStartupConfigStale(); void loadGuides(); }
  if (state === "running" && previousState !== "running") saveOptions(true);
  $("retry-discovery").textContent = state === "failed" ? "重试启动" : "重新检查";
  $("header-state").dataset.state = state;
  $("header-state").textContent = labels[state] || state;
  $("dashboard-state").dataset.state = state;
  $("dashboard-state").textContent = labels[state] || state;
  $("logs").textContent = status.logs || "暂无日志";
  const o = status.options || {};
  $("metric-executable").textContent = o.executable || "—";
  $("metric-home").textContent = o.home || "—";
  $("metric-desktop-dir").textContent = o.desktopDir || desktopDirForHome(o.home) || "—";
  $("metric-workspace").textContent = o.workspace || "—";
  $("metric-url").textContent = status.url || "未就绪";
  updateButtons();
  renderErrorCard(status);
  if (status.error) setMessage("");
  if (state === "failed" || status.error) showOnboarding();
  if (!manualManagement && state === "running" && previousState !== "running" && !autoOpenStarted) {
    autoOpenStarted = true;
    localStorage.setItem(onboardingKey, "1");
    if (manualManagement) showDashboard();
    else showLoading("dsh 已就绪，正在打开 DSH Chat…");
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
async function refresh() { try { renderStatus(await api("Status")); } catch (error) { setMessage(errorText(error), true); } void refreshDesktopUpdate(); }
function renderDesktopUpdate(u) {
  if (!u) return;
  const current = u.currentVersion || "";
  const shown = formatAppVersion(current);
  $("app-caption").textContent = shown ? `DSH 的桌面伴侣 · ${shown}` : "DSH 的桌面伴侣";
  $("update-version").textContent = shown || "—";
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
  const labels = {
    idle: u.autoCheck ? "启动约 1 小时后开始检查，之后大约每天一次；发现新版本由你决定是否安装。" : "已关闭定期检查。需要时请手动检查，发现新版本由你决定是否安装。",
    checking: "正在检查 GitHub Release…",
    upToDate: `已是最新版本 ${formatAppVersion(current) || current}。`,
    unavailable: u.error || "还没有 GitHub Release。",
    available: `发现新版本 ${formatAppVersion(u.latestVersion)}。确认后才会安装。`,
    downloading: `正在下载 v${u.latestVersion}… ${progress}%`,
    ready: `v${u.latestVersion} 已下载并完成校验，可以安装并重启。`,
    applying: "正在替换应用并准备重启…",
    failed: u.error || "更新失败",
  };
  $("update-message").textContent = labels[u.state] || u.error || "";
}
async function refreshDesktopUpdate() {
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
    fillOptions(result.options); lastVersion = result.version || "已检测"; $("version").textContent = lastVersion; cliReady = true;
    const runningNow = result.version === "DSH 已运行";
    setDetect("found", runningNow ? "dsh 正在运行" : "dsh 已就绪", runningNow ? `运行配置已保存（${result.options.executable}）。不必重启桌面应用。` : `已验证 ${result.options.executable}，版本：${lastVersion}`);
    setHidden("install-card", true); saveOptions(false); setMessage(runningNow ? "运行配置已保存。请在 Chat 页面刷新；若改了工作目录或 Home，点「重新打开 Chat」。" : "CLI 检测通过，可以直接启动 DSH Chat。");
    $("step-cli").dataset.done = "true"; $("step-cli").dataset.active = "false";
    updateButtons(); return true;
  } catch (error) {
    cliReady = false; setDetect("error", "还需要确认 dsh 路径", errorText(error)); updateButtons(); return false;
  }
}
async function discover() {
  setDetect("checking", "正在检查 dsh", "优先检查用户目录，再检查 shell PATH 和系统全局目录…"); cliReady = false; updateButtons();
  try {
    const result = await api("DiscoverCLI");
    if (result.found) { fillOptions(result.options); lastVersion = result.version || "已检测"; $("version").textContent = lastVersion; cliReady = true; saveOptions(false); setDetect("found", "dsh 已就绪", `已找到 ${result.options.executable}，版本：${lastVersion}`); setHidden("install-card", true); setMessage("CLI 检测通过，可以直接启动 DSH Chat。"); }
    else { setDetect("missing", "没有找到 dsh", result.message || "请选择已安装的 dsh，或按下方步骤安装。"); setHidden("install-card", false); $("advanced-settings").open = true; setMessage("请选择 dsh 可执行文件，或先完成 CLI 安装。"); }
    updateButtons(); return result;
  } catch (error) { setDetect("error", "检查失败", errorText(error)); setMessage(errorText(error), true); updateButtons(); return { found: false, error: errorText(error) }; }
  updateButtons();
}
async function openReadyDSH() {
  try {
    await api("OpenDSH");
  } catch (error) { setMessage(`DSH 已启动，但打开桌面 WebView 失败：${errorText(error)}`, true); if (!manualManagement) showOnboarding(); }
}
async function startAutomatically(fastPath = false) {
  showLoading(fastPath ? "正在使用已保存配置启动本机 DSH 服务…" : "已找到 dsh，正在启动本机 DSH 服务…");
  saveOptions(false);
  try { await api("Start", options()); return true; }
  catch (error) {
    if (fastPath) {
      markStartupConfigStale();
      const result = await discover();
      if (result && result.found) {
        showLoading("已重新找到 dsh，正在启动本机 DSH 服务…");
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
  showLoading("CLI 已修复，正在重新启动本机 DSH 服务…");
  saveOptions(false);
  await api("Start", options());
  return { found: true };
}
function loadGuides() {
  if (guidesPromise) return guidesPromise;
  guidesPromise = (async () => {
    try { const guide = await api("InstallGuide"); $("node-command").textContent = guide.nodeCheck; $("cli-install-command").textContent = guide.installCLI; $("cli-verify-command").textContent = guide.verifyCLI; } catch (error) { setMessage(errorText(error), true); }
    await refreshBridgeGuide();
  })();
  return guidesPromise;
}
function currentBridgePlatform() {
  const platform = String((navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || navigator.userAgent || "").toLowerCase();
  if (platform.includes("win")) return { label: "Windows PowerShell", command: bridgeGuide && bridgeGuide.powerShellCommand };
  if (platform.includes("mac")) return { label: "macOS 终端", command: bridgeGuide && bridgeGuide.installCommand };
  return { label: "Linux 终端", command: bridgeGuide && bridgeGuide.installCommand };
}
function renderBridgeCommand() {
  if (!bridgeGuide) return;
  const platform = currentBridgePlatform();
  $("bridge-command").textContent = `${platform.label}：\n${platform.command}\n\n验证：\n${bridgeGuide.verifyCommand}`;
  $("copy-bridge-command").textContent = `复制 ${platform.label} 命令`;
}
async function refreshBridgeGuide() {
  try { bridgeGuide = await api("BridgeGuide", $("bridge-path").value.trim()); $("bridge-path").value = bridgeGuide.pluginPath; renderBridgeCommand(); $("bridge-status").textContent = bridgeGuide.directoryExists ? "已找到项目内插件目录；安装命令只会把它加入 web profile。" : "未找到插件目录，请选择项目中的 plugins/deepseek-harness-desktop-bridge 目录。"; $("step-bridge").dataset.done = bridgeGuide.directoryExists ? "true" : "false"; } catch (error) { $("bridge-status").textContent = errorText(error); }
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
    setMessage(successText);
    return true;
  } catch (_) { setMessage("复制失败，请手动选择命令复制。", true); return false; }
}
$("check-cli").onclick = () => run(() => probeSelected());
$("retry-discovery").onclick = () => run(() => {
  if (state === "failed") return retryFailedStart();
  if ($("executable").value.trim()) return probeSelected();
  return discover();
});
$("restore-defaults").onclick = () => { fillOptions(defaultOptions); cliReady = false; void discover(); };
$("choose-executable").onclick = $("choose-executable-missing").onclick = () => run(async () => { const path = await api("ChooseExecutable"); if (path) { $("executable").value = path; $("advanced-settings").open = true; await probeSelected(); } });
$("choose-home").onclick = () => run(async () => { const path = await api("ChooseHome"); if (path) { $("home").value = path; syncDesktopDir(); cliReady = false; saveOptions(false); } });
$("choose-workspace").onclick = () => run(async () => { const path = await api("ChooseWorkspace"); if (path) { $("workspace").value = path; cliReady = false; saveOptions(false); } });
$("choose-bridge").onclick = () => run(async () => { const path = await api("ChooseBridgePlugin"); if (path) { $("bridge-path").value = path; await refreshBridgeGuide(); } });
$("bridge-path").addEventListener("change", refreshBridgeGuide);
$("copy-cli-command").onclick = () => copyText($("cli-install-command").textContent, "已复制 DSH CLI 安装命令。");
$("copy-bridge-command").onclick = () => { const platform = currentBridgePlatform(); const command = platform.command || $("bridge-command").textContent.split("\n", 1)[0]; return copyText(command, `已复制 ${platform.label} 安装命令。`); };
$("copy-error").onclick = async () => {
  if (!lastErrorReport) return;
  const copied = await copyText(lastErrorReport, "");
  $("error-copy-state").textContent = copied ? "已复制" : "复制失败";
};
$("start-first").onclick = () => run(async () => {
  if (!cliReady && !(await probeSelected())) throw new Error("请先完成 dsh CLI 检测");
  closeAfterChat = !manualManagement;
  saveOptions(false);
  if (state === "running") await api("OpenDSH");
  else await api("Start", options());
}, () => setMessage(state === "running" ? "已打开 DSH Chat，可在页面内刷新。" : "DSH 正在启动；就绪后会自动打开桌面 Chat WebView。"));
$("reload-chat").onclick = () => run(() => api("ReloadChat", options()), () => setMessage("正在用新的运行配置重新打开 Chat…"));
$("dashboard-start").onclick = () => run(() => state === "running" ? api("ReloadChat", options()) : api("Start", options()), () => setMessage(state === "running" ? "正在重新打开 Chat…" : "DSH 正在启动…"));
$("dashboard-stop").onclick = () => run(() => api("Stop"), () => setMessage("已请求停止 DSH。"));
$("dashboard-open").onclick = () => run(() => api("OpenDSH"), () => setMessage("已在桌面端 WebView 打开 DSH Chat。"));
$("open-home").onclick = () => run(() => api("OpenHome", options()));
$("open-workspace").onclick = () => run(() => api("OpenWorkspace", options()));
$("open-settings").onclick = () => run(() => api("OpenSettings", options()));
$("reconfigure").onclick = () => { localStorage.removeItem(onboardingKey); closeAfterChat = false; clearErrorCard(); showOnboarding(); setMessage("可以调整路径后重新检测 CLI。"); };
$("close-config").onclick = () => run(() => api("OpenDSH"), () => setMessage("已回到 Chat。"));
$("show-bridge-guide").onclick = () => { showOnboarding(); $("bridge-card").open = true; void loadGuides(); $("bridge-card").scrollIntoView({ behavior: "smooth", block: "center" }); };
$("check-update").onclick = () => run(() => api("CheckUpdate"));
$("auto-check-update").onchange = () => run(() => api("SetAutoCheckUpdate", $("auto-check-update").checked));
$("install-update").onclick = () => run(() => api("InstallUpdate"), () => setMessage("正在安装桌面端更新并重启…"));
$("open-release").onclick = () => run(() => api("OpenReleasePage"));
["executable"].forEach((id) => $(id).addEventListener("input", () => { cliReady = false; updateButtons(); }));
$("home").addEventListener("input", () => { syncDesktopDir(); cliReady = false; updateButtons(); });
async function load() {
  showLoading(manualManagement ? "正在打开桌面配置…" : "正在读取已保存配置…");
  void api("AppVersion").then((v) => {
    const shown = formatAppVersion(v);
    if (shown) $("app-caption").textContent = `DSH 的桌面伴侣 · ${shown}`;
  }).catch(() => {});
  let saved = null;
  try { defaultOptions = await api("Defaults"); fillOptions(defaultOptions); saved = loadSavedOptions(); } catch (error) { showOnboarding(); setMessage(errorText(error), true); return; }
  if (manualManagement) {
    await loadGuides();
    const ready = await probeSelected();
    if (ready) showDashboard(); else { await discover(); showOnboarding(); }
    await refresh();
    return;
  }
  if (saved && saved.executable && saved.lastStartSucceeded === true) {
    cliReady = true;
    lastVersion = saved.version || "上次已验证";
    $("version").textContent = lastVersion;
    setDetect("cached", "正在使用已保存配置", `将直接启动 ${saved.executable}，跳过重复 CLI 检查…`);
    await startAutomatically(true);
    await refresh();
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
}
window.addEventListener("DOMContentLoaded", load, { once: true });
setInterval(refresh, 700);
