package desktop

import (
	"encoding/json"
	"os"
	"strings"
	"testing"
)

func TestDesktopBridgePluginContract(t *testing.T) {
	root := repoFile(t, "internal", "dsh", "desktopbridge")
	manifestBytes, err := os.ReadFile(root + "/package.json")
	if err != nil {
		t.Fatal(err)
	}
	var manifest struct {
		Name    string         `json:"name"`
		Main    string         `json:"main"`
		Exports map[string]any `json:"exports"`
		DSH     struct {
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
	if manifest.DSH.Client.Platform != "web" {
		t.Fatalf("plugin does not declare web client: %+v", manifest.DSH)
	}
	inject := strings.Join(manifest.DSH.Client.Inject, ",")
	if !strings.Contains(inject, "@deepseek-ai/dsh-client-ui-settings") {
		t.Fatalf("client inject missing settings shell: %v", manifest.DSH.Client.Inject)
	}
	if !strings.Contains(inject, "@deepseek-ai/dsh-client-ui-workspace") {
		t.Fatalf("client inject missing workspace UI (openSession): %v", manifest.DSH.Client.Inject)
	}
	if !strings.Contains(inject, "@deepseek-ai/dsh-client-ui-layout") {
		t.Fatalf("client inject missing layout (selectPanel): %v", manifest.DSH.Client.Inject)
	}
	if strings.Contains(inject, "dsh-client-ui-settings-plugins") {
		t.Fatalf("client inject still targets plugins tab package: %v", manifest.DSH.Client.Inject)
	}
	if _, ok := manifest.Exports["./client"]; !ok {
		t.Fatal("plugin does not export its client bundle")
	}

	patchBytes, err := os.ReadFile(root + "/cordis.patch.yml")
	if err != nil {
		t.Fatal(err)
	}
	patch := string(patchBytes)
	for _, fragment := range []string{"- remove:", "- insert:", "deepseek-harness-desktop-bridge", "name: ./lib/index.js"} {
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
		"DSH_DESKTOP_BRIDGE_URL", "DSH_DESKTOP_BRIDGE_TOKEN", "DSH_DESKTOP_BRIDGE_ENDPOINT_FILE",
		`inject = ["connection", "webServer"]`, `ctx.inject(["connection", "webServer"]`, "webServer.register", `kind: "prefix"`,
		"/desktop-bridge", "/v1/status", "/v1/restart", "/v1/reload-chat", "/v1/open-management", "/v1/report-chat-busy",
		"/v1/prefs", "/v1/check-update", "/v1/set-show-copy-session-id", "/v1/set-chat-content-visibility",
		"configFromEndpointFile", "desktop-bridge/unavailable",
		"blank: Boolean(raw.blank)",
		"origin: typeof raw.origin === \"string\" ? raw.origin : \"\"",
		"/v1/claim-open-session",
		"claimOpenSession",
	} {
		if !strings.Contains(host, fragment) {
			t.Fatalf("host bridge missing %q", fragment)
		}
	}
	// Empty top-level inject alone never registered Cordis HTTP RPC (POST → 405).
	if strings.Contains(host, `inject = []`) {
		t.Fatal(`host must declare inject=["connection", "webServer"], not empty inject`)
	}

	clientBytes, err := os.ReadFile(root + "/lib/client.js")
	if err != nil {
		t.Fatal(err)
	}
	client := string(clientBytes)
	for _, fragment := range []string{
		"window.__ModuleLoader__.load", "settings.section", "桌面设置",
		"connection.rpc.call", "启动并打开 Chat", "重启并打开 Chat", "reloadChat",
		"reconnecting", "desktop-not-running", "重新连接",
		"Do NOT use a sticky globalThis guard",
		"reportChatBusy",
		"anySessionRunning",
		"sessions",
		"role: \"switch\"",
		"showCopySessionId",
		"setShowCopySessionId",
		"chatContentVisibility",
		"setChatContentVisibility",
		"installChatContentVisibility",
		"content-visibility:auto",
		"DSH增强设置",
		"dsh-desktop-show-copy-session-id",
		"installCopySessionIdMenu",
		"sessionIdFromReactFiber",
		"sessionMenuLocale",
		"COPY_SESSION_ID_MENU_ATTRIBUTE",
		"COPY_SESSION_ID_WRAPPER_ATTRIBUTE",
		"archive.parentElement.before",
		"navigator.clipboard.writeText",
		"role='menuitem'",
		"never replace or mutate the official module",
		"复制会话ID",
		"blank: Boolean(s.blank)",
		"archivedSessionIds",
		"archived: archived.has(sid)",
		"origin: typeof s.origin === \"string\" ? s.origin : \"\"",
		"const seen = new Set()",
		"dsh-desktop-open-session",
		"uiWorkspace.openSession",
		"claimOpenSession",
		"OPEN_SESSION_PENDING_GLOBAL",
		"consumeQueuedOpenSession",
		"drainQueuedOpenSession",
		"prefetchSessionHistory",
		"OPEN_SESSION_WARM_MS",
		"OPEN_SESSION_WARM_LIMIT",
		"recentWarmIds",
		"trayRecentSessionsEnabled",
		"__DSH_DESKTOP_OPEN_SESSION__",
		`"uiWorkspace"`,
		`"workspaces"`,
		`"layout"`,
	} {
		if !strings.Contains(client, fragment) {
			t.Fatalf("client bridge missing %q", fragment)
		}
	}
	if strings.Contains(client, "ctx.sessions.open(id)") {
		t.Fatal("tray navigation must not bypass uiWorkspace.openSession")
	}
	for _, forbidden := range []string{"停止 DSH", `invoke("stop"`} {
		if strings.Contains(client, forbidden) {
			t.Fatalf("client bridge must not expose stop: %q", forbidden)
		}
	}
	if strings.Contains(host, `stop: Object.freeze`) || strings.Contains(host, `path: "/v1/stop"`) {
		t.Fatal("host Cordis allowlist must not expose stop")
	}
	if strings.Contains(client, "全部恢复默认") {
		t.Fatal("client shortcuts must not expose restore-all; reset is per-row")
	}
	if !strings.Contains(client, `children: "恢复默认"`) || !strings.Contains(client, `children: "清除"`) {
		t.Fatal("client shortcut rows must expose per-row clear and restore default")
	}
	if !strings.Contains(client, `addEventListener("pointerdown"`) {
		t.Fatal("client must cancel shortcut recording on pointerdown outside the chip")
	}
	if strings.Contains(client, `children: "▾"`) || strings.Contains(client, "⌘Q / Ctrl+Q") {
		t.Fatal("language dropdown must use the stroke chevron; preference hints must follow the configured shortcut")
	}
	if !strings.Contains(client, "dshDesktopBridgeInlineKbd") || !strings.Contains(client, "boundShortcutLabel") {
		t.Fatal("preference hints must render the current shortcut binding")
	}
}
