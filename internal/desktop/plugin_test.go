package desktop

import (
	"encoding/json"
	"os"
	"strings"
	"testing"
)

func TestDesktopBridgePluginContract(t *testing.T) {
	root := repoFile(t, "plugins", "deepseek-harness-desktop-bridge")
	manifestBytes, err := os.ReadFile(root + "/package.json")
	if err != nil {
		t.Fatal(err)
	}
	var manifest struct {
		Name    string         `json:"name"`
		Main    string         `json:"main"`
		Exports map[string]any `json:"exports"`
		DSH     struct {
			Bundle struct {
				Patch string `json:"patch"`
			} `json:"bundle"`
			Client struct {
				Platform string   `json:"platform"`
				Inject   []string `json:"inject"`
			} `json:"client"`
		} `json:"dsh"`
	}
	if err := json.Unmarshal(manifestBytes, &manifest); err != nil {
		t.Fatal(err)
	}
	if manifest.Name != "@deepseek-ai/deepseek-harness-desktop-bridge" || manifest.Main != "lib/index.js" {
		t.Fatalf("unexpected plugin identity: %+v", manifest)
	}
	if manifest.DSH.Bundle.Patch != "./cordis.patch.yml" || manifest.DSH.Client.Platform != "web" {
		t.Fatalf("plugin does not declare its bundle and web client: %+v", manifest.DSH)
	}
	if _, ok := manifest.Exports["./client"]; !ok {
		t.Fatal("plugin does not export its client bundle")
	}

	patchBytes, err := os.ReadFile(root + "/cordis.patch.yml")
	if err != nil {
		t.Fatal(err)
	}
	patch := string(patchBytes)
	for _, fragment := range []string{"- insert:", "deepseek-harness-desktop-bridge", manifest.Name} {
		if !strings.Contains(patch, fragment) {
			t.Fatalf("patch missing %q", fragment)
		}
	}

	hostBytes, err := os.ReadFile(root + "/lib/index.js")
	if err != nil {
		t.Fatal(err)
	}
	host := string(hostBytes)
	for _, fragment := range []string{
		"DSH_DESKTOP_BRIDGE_URL", "DSH_DESKTOP_BRIDGE_TOKEN", "ctx.connection.rpc.handle",
		"/desktop-bridge", "/v1/status", "/v1/restart", "/v1/stop", "/v1/open-management",
	} {
		if !strings.Contains(host, fragment) {
			t.Fatalf("host bridge missing %q", fragment)
		}
	}

	clientBytes, err := os.ReadFile(root + "/lib/client.js")
	if err != nil {
		t.Fatal(err)
	}
	client := string(clientBytes)
	for _, fragment := range []string{
		"window.__ModuleLoader__.load", "settings.plugins.tab", "桌面管理", "打开桌面配置",
		"connection.rpc.call", "启动 DSH", "重启 DSH", "停止 DSH",
	} {
		if !strings.Contains(client, fragment) {
			t.Fatalf("client bridge missing %q", fragment)
		}
	}
}
