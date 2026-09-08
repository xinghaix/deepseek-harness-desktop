package desktop

import (
	"os"
	"strings"
	"testing"
)

func readManagementUI(t *testing.T) string {
	t.Helper()
	var b strings.Builder
	for _, name := range []string{"index.html", "styles.css", "app.js"} {
		data, err := os.ReadFile(repoFile(t, "assets", "web", name))
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
		"打开工作目录", "打开 settings.yaml", "可选：安装桌面管理桥接插件",
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
		"Defaults", "DiscoverCLI", "InstallGuide", "BridgeGuide", "CheckCLI",
		"Start", "Stop", "Status", "OpenDSH", "ChooseExecutable",
		"ChooseHome", "ChooseWorkspace", "ChooseBridgePlugin", "OpenHome",
		"OpenWorkspace", "OpenSettings", "CheckUpdate", "InstallUpdate", "UpdateStatus", "OpenReleasePage", "SetAutoCheckUpdate", "ReloadChat",
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
	if !strings.Contains(html, `api("ReloadChat"`) {
		t.Fatal("runtime config changes must reopen Chat instead of restarting the desktop app")
	}
	for _, fragment := range []string{"loading-view", "prefers-color-scheme: dark", "manualManagement"} {
		if !strings.Contains(html, fragment) {
			t.Fatalf("UI is missing startup/theme/config fragment %q", fragment)
		}
	}
	if !strings.Contains(html, "navigator.platform") || !strings.Contains(html, "document.execCommand(\"copy\")") {
		t.Fatal("UI must choose the platform command and provide a clipboard fallback")
	}
	if !strings.Contains(html, "bridgeGuide.verifyCommand") {
		t.Fatal("UI must show how to verify the bridge installation")
	}
	if !strings.Contains(html, `if (!manualManagement && state === "running"`) {
		t.Fatal("manual configuration must not reopen or refresh the existing Chat window")
	}
	for _, fragment := range []string{"scrollbar-color", "navigator.userAgentData", "Windows PowerShell", "macOS 终端", "Linux 终端", "DSH cwd", "DSH_HOME/.deepseek-harness-desktop", "desktopDir", "重试启动", "retryFailedStart", "lastStartSucceeded", "startAutomatically(true)", `aria-readonly="true"`} {
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
}
