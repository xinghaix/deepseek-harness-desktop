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
		"dsh 可执行文件", "DSH Home", "工作目录", "本机端口",
		"选择文件", "恢复默认路径", "选择文件夹", "重新检测 CLI",
		"启动并打开 DSH Chat", "停止 DSH", "在桌面 WebView 打开 Chat", "打开 DSH Home",
		"打开工作目录", "打开 settings.yaml", "可选：安装桌面管理桥接插件",
		"DSH 启动失败", "复制错误信息", "查看原始错误",
	} {
		if !strings.Contains(html, label) {
			t.Fatalf("missing accepted UI copy %q", label)
		}
	}
	for _, method := range []string{
		"Defaults", "DiscoverCLI", "InstallGuide", "BridgeGuide", "CheckCLI",
		"Start", "Restart", "Stop", "Status", "OpenDSH", "ChooseExecutable",
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
	for _, fragment := range []string{"formatErrorReport", "DSH 返回的原始错误信息", "error-details", "copy-error"} {
		if !strings.Contains(html, fragment) {
			t.Fatalf("UI is missing startup error diagnostics fragment %q", fragment)
		}
	}
	if strings.Contains(html, "保存配置") {
		t.Fatal("UI must not imply duplicate configuration or automatic installation")
	}
}
