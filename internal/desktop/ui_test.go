package desktop

import (
	"os"
	"strings"
	"testing"
)

func readManagementUI(t *testing.T) string {
	t.Helper()
	var b strings.Builder
	for _, name := range []string{"index.html", "styles.css", "app.js", "i18n.js"} {
		data, err := os.ReadFile(repoFile(t, "assets", "web", name))
		if err != nil {
			t.Fatal(err)
		}
		b.Write(data)
		b.WriteByte('\n')
	}
	for _, loc := range []string{"en", "zh-CN"} {
		data, err := os.ReadFile(repoFile(t, "internal", "i18n", "locales", loc+".json"))
		if err != nil {
			t.Fatal(err)
		}
		b.Write(data)
		b.WriteByte('\n')
	}
	return b.String()
}

func TestManagementUIContract(t *testing.T) {
	html := readManagementUI(t)
	for _, label := range []string{
		"dsh 可执行文件", "DSH Home", "桌面端目录（固定）", "Chat 工作目录", "运行配置", "桌面配置",
		"选择文件", "恢复默认路径", "选择文件夹", "重新检测 CLI",
		"启动并打开 DSH Chat", "停止 DSH", "在桌面 WebView 打开 Chat", "打开 DSH Home",
		"打开工作目录", "打开 settings.yaml", "桌面设置（Chat 内）",
		"DSH 启动失败", "复制错误信息", "查看原始错误", "桌面端更新", "检查更新", "每天自动检查更新",
	} {
		if !strings.Contains(html, label) {
			t.Fatalf("missing accepted UI copy %q", label)
		}
	}
	if strings.Contains(html, "DSH Desktop") {
		t.Fatal("UI must use the full Deepseek Harness Desktop application name")
	}
	for _, removed := range []string{"Chat 折叠交互", "横向操作胶囊", "useActionPill", "action-pill", "metric-sidebar-mode"} {
		if strings.Contains(html, removed) {
			t.Fatalf("UI must not expose removed Chat fold interaction %q", removed)
		}
	}
	for _, method := range []string{
		"Defaults", "DiscoverCLI", "InstallGuide", "CheckCLI",
		"Start", "Stop", "Status", "OpenDSH", "ChooseExecutable",
		"ChooseHome", "ChooseWorkspace", "OpenHome",
		"OpenWorkspace", "OpenSettings", "CheckUpdate", "InstallUpdate", "UpdateStatus", "OpenReleasePage", "SetAutoCheckUpdate", "ReloadChat",
		"SetConfigDirty", "DismissConfig", "DesktopPrefs", "SetConfirmQuitWhenBusy",
		"SetTrayEnabled", "SetCloseToTray", "SetTraySessionLimit",
		"LocaleBundle", "SetLanguage", "SetShortcuts",
	} {
		if !strings.Contains(html, "api(\""+method) {
			t.Fatalf("UI does not call bound method %q", method)
		}
	}
	if strings.Contains(html, `id="port"`) || strings.Contains(html, "本机端口") {
		t.Fatal("UI must not expose a manual DSH port setting")
	}
	if !strings.Contains(html, `port: 0`) {
		t.Fatal("UI must always launch dsh web with port 0")
	}
	if !strings.Contains(html, "autoOpenStarted") || !strings.Contains(html, "void openReadyDSH()") {
		t.Fatal("UI must open DSH automatically after readiness")
	}
	if !strings.Contains(html, "关闭并回到 Chat") || !strings.Contains(html, `id="close-config"`) {
		t.Fatal("config is a secondary page that must close before returning to Chat")
	}
	if !strings.Contains(html, `id="discard-config"`) || !strings.Contains(html, "不保存并关闭") || !strings.Contains(html, "isConfigDirty") {
		t.Fatal("dirty config must confirm before closing")
	}
	if !strings.Contains(html, "TryDismissConfig") {
		t.Fatal("clicking outside a clean config modal must try to dismiss it")
	}
	if !strings.Contains(html, "dsh-desktop-config-modal") {
		t.Fatal("config modal page must mark itself for compact layout")
	}
	if !strings.Contains(html, "--wails-draggable: drag") {
		t.Fatal("config modal topbar must be a Wails drag region")
	}
	if !strings.Contains(html, `id="confirm-quit-busy"`) || !strings.Contains(html, "有任务在运行时退出先确认") {
		t.Fatal("desktop settings must allow disabling quit confirmation while a task is running")
	}
	if !strings.Contains(html, `id="tray-enabled"`) || !strings.Contains(html, "开启系统托盘") {
		t.Fatal("desktop settings must expose tray-enabled master switch")
	}
	if !strings.Contains(html, `id="close-to-tray"`) || !strings.Contains(html, "关闭窗口到托盘") {
		t.Fatal("desktop settings must expose close-to-tray")
	}
	if !strings.Contains(html, `id="shortcuts-panel"`) || !strings.Contains(html, "dashboard.shortcuts_title") {
		t.Fatal("desktop settings must expose keyboard shortcuts panel")
	}
	if !strings.Contains(html, `data-shortcut="closeChat"`) || !strings.Contains(html, "shortcut.clear") {
		t.Fatal("shortcuts panel must expose clearable rows")
	}
	if !strings.Contains(html, "shortcut.hide_others_label") {
		t.Fatal("shortcuts panel must include hideOthers row")
	}
	if !strings.Contains(html, "SetShortcuts") {
		t.Fatal("dashboard must wire SetShortcuts")
	}
	if !strings.Contains(html, "keyboardEventToAccelerator") || !strings.Contains(html, "startShortcutRecording") {
		t.Fatal("shortcuts panel must support click-to-record remapping")
	}
	if !strings.Contains(html, "shortcut.recording") || !strings.Contains(html, "shortcut.conflict") {
		t.Fatal("locales must expose shortcut recording/conflict copy")
	}
	if strings.Contains(html, `id="shortcuts-reset-all"`) || strings.Contains(html, "shortcut.reset_all") || strings.Contains(html, "全部恢复默认") {
		t.Fatal("shortcuts panel must not expose restore-all; reset is per-row")
	}
	if !strings.Contains(html, `class="secondary shortcut-reset"`) || !strings.Contains(html, `class="secondary shortcut-clear"`) {
		t.Fatal("each shortcut row must expose clear and restore-default")
	}
	if !strings.Contains(html, "onShortcutRecordPointerDown") {
		t.Fatal("recording must cancel when clicking away without a new combo")
	}
	if !strings.Contains(html, "applyPreferenceShortcutHints") {
		t.Fatal("preference hints must follow the configured shortcut bindings")
	}
	if strings.Contains(html, "暂不支持改键") || strings.Contains(html, "Remapping is not supported") {
		t.Fatal("shortcuts hint must no longer say remapping is unsupported")
	}
	if !strings.Contains(html, `id="tray-session-limit"`) || !strings.Contains(html, "任务显示数量") {
		t.Fatal("desktop settings must expose tray session limit")
	}
	if !strings.Contains(html, `id="ui-language"`) || !strings.Contains(html, "data-i18n") || !strings.Contains(html, "DSHI18n") {
		t.Fatal("desktop settings must expose language select and data-i18n / DSHI18n wiring")
	}
	if !strings.Contains(html, `api("ReloadChat"`) {
		t.Fatal("runtime config changes must reopen Chat instead of restarting the desktop app")
	}
	for _, fragment := range []string{"loading-view", "prefers-color-scheme: dark", "manualManagement"} {
		if !strings.Contains(html, fragment) {
			t.Fatalf("UI is missing startup/theme/config fragment %q", fragment)
		}
	}
	if !strings.Contains(html, "document.execCommand(\"copy\")") {
		t.Fatal("UI must provide a clipboard fallback")
	}
	if !strings.Contains(html, `if (!manualManagement && state === "running"`) {
		t.Fatal("manual configuration must not reopen or refresh the existing Chat window")
	}
	for _, fragment := range []string{"scrollbar-color", "DSH cwd", "DSH_HOME/workspaces", "重试启动", "retryFailedStart", "lastStartSucceeded", "startAutomatically(true)", "桌面桥接已内置"} {
		if !strings.Contains(html, fragment) {
			t.Fatalf("UI is missing platform/workspace fragment %q", fragment)
		}
	}
	if strings.Contains(html, "工作目录（DSH cwd，固定）") {
		t.Fatal("UI must not present Chat workspace as fixed")
	}
	for _, fragment := range []string{"formatErrorReport", "DSH 返回的原始错误信息", "error-details", "copy-error"} {
		if !strings.Contains(html, fragment) {
			t.Fatalf("UI is missing startup error diagnostics fragment %q", fragment)
		}
	}
	if strings.Contains(html, `id="save-config"`) {
		t.Fatal("UI must not add a duplicate save button")
	}
	if !strings.Contains(html, "dsh:status") || !strings.Contains(html, "subscribeStatusEvents") {
		t.Fatal("management UI must subscribe to notify-pull status events")
	}
	if !strings.Contains(html, "visibilitychange") || !strings.Contains(html, "document.hidden") {
		t.Fatal("management UI must pause Status/Update polling when hidden")
	}
	if strings.Contains(html, "? 100 : 900") {
		t.Fatal("management UI must not poll Status every 100/900ms")
	}
}
