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
		"选择文件", "使用默认", "选择文件夹", "检测 CLI",
		"启动 DSH", "停止 DSH", "打开 DSH 界面", "打开 DSH Home",
		"打开工作目录", "打开 settings.yaml", "复用本机 DSH",
	} {
		if !strings.Contains(html, label) {
			t.Fatalf("missing accepted UI copy %q", label)
		}
	}
	for _, method := range []string{
		"Defaults", "CheckCLI", "Start", "Stop", "Status", "OpenDSH",
		"ChooseExecutable", "ChooseHome", "ChooseWorkspace", "OpenHome",
		"OpenWorkspace", "OpenSettings",
	} {
		if !strings.Contains(html, "api(\""+method) {
			t.Fatalf("UI does not call bound method %q", method)
		}
	}
	if strings.Contains(html, "保存配置") {
		t.Fatal("UI must not imply duplicate configuration or automatic installation")
	}
}
