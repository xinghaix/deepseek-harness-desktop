package main

import (
	"strings"
	"testing"
)

func TestManagementUIContract(t *testing.T) {
	data, err := assets.ReadFile("assets/index.html")
	if err != nil {
		t.Fatal(err)
	}
	html := string(data)
	for _, label := range []string{
		"dsh 可执行文件", "DSH Home", "桌面端目录（固定）", "Chat 工作目录", "本机端口",
		"选择文件", "恢复默认路径", "选择文件夹", "重新检测 CLI",
		"启动并打开 DSH Chat", "停止 DSH", "在桌面 WebView 打开 Chat", "打开 DSH Home",
		"打开工作目录", "打开 settings.yaml", "可选：安装桌面管理桥接插件",
		"DSH 启动失败", "复制错误信息", "查看原始错误",
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
		"Start", "RestartWithOptions", "Stop", "Status", "OpenDSH", "ChooseExecutable",
		"ChooseHome", "ChooseWorkspace", "ChooseBridgePlugin", "OpenHome",
		"OpenWorkspace", "OpenSettings",
	} {
		if !strings.Contains(html, "api(\""+method) {
			t.Fatalf("UI does not call bound method %q", method)
		}
	}
	if !strings.Contains(html, `id="port" type="number" min="0"`) || !strings.Contains(html, "自动选择 loopback 空闲端口") {
		t.Fatal("UI must expose port 0 as the automatic-port option")
	}
	if !strings.Contains(html, "autoOpenStarted") || !strings.Contains(html, "openReadyDSH(closeAfterChat)") {
		t.Fatal("UI must open DSH automatically after readiness")
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
