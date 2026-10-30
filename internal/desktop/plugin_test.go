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
		"/v1/prefs", "/v1/locale-bundle", "/v1/check-update", "/v1/set-delete-session-actions", "/v1/set-hover-message-actions", "/v1/set-chat-content-visibility",
		"/v1/set-prompt-overlay-max-lines",
		"deleteSession",
		"DELETE_SESSION_ID_PATTERN",
		"agent.scope?.dispose",
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
		"window.__ModuleLoader__.load", "settings.section", `t("tray.open_settings")`,
		"connection.rpc.call", `t("btn.start_open_chat")`, `t("bridge.restart_open_chat")`, "reloadChat",
		"reconnecting", "desktop-not-running", `t("bridge.reconnect")`,
		"Do NOT use a sticky globalThis guard",
		"reportChatBusy",
		"anySessionRunning",
		"sessions",
		"role: \"switch\"",
		"deleteSessionActions",
		"setDeleteSessionActions",
		"hoverMessageActions",
		"dsh-desktop-delete-session-actions",
		"installSessionMenuSlots",
		"installArchivedSessionDelete",
		"data-dsh-delete-session",
		"data-dsh-delete-archived-session",
		"data-dsh-delete-session-confirm",
		"bridge.session_delete_confirm",
		"bridge.session_delete_title",
		"bridge.session_delete_action",
		"field.delete_session_actions",
		"deleteSession",
		"setHoverMessageActions",
		"installHoverMessageActions",
		`t("bridge.enhanced_hover_title")`,
		"data-dsh-desktop-prompt-overlay",
		"data-dsh-desktop-prompt-overlay-media",
		"data-dsh-desktop-prompt-overlay-files",
		"data-dsh-desktop-prompt-overlay-text",
		"data-dsh-desktop-prompt-overlay-item",
		"data-dsh-desktop-prompt-overlay-more",
		"data-dsh-desktop-prompt-overlay-toolbar",
		"data-dsh-desktop-prompt-overlay-time",
		"data-dsh-desktop-prompt-overlay-action",
		"data-dsh-desktop-prompt-overlay-action-done",
		"markPromptActionDone",
		"LOCALE_BUNDLE_GLOBAL",
		"EARLY_FALLBACK_EN",
		"setLocaleBundle",
		"loadLocaleBundle",
		"localeBundle",
		"bridge.overlay_label",
		"buildPromptPreview",
		"collectPromptPreviewParts",
		"hasPreviewMediaDescendant",
		"PROMPT_OVERLAY_MAX_WIDTH_PX",
		"createPromptToolbar",
		"collectNativeOperationControls",
		"chatContentVisibility",
		"setChatContentVisibility",
		"setPromptOverlayMaxLines",
		"promptOverlayMaxLines",
		"installChatContentVisibility",
		"content-visibility:auto",
		`t("bridge.card_enhancements")`,
		"DeleteSessionMenuItem",
		"sessionMenuLocale",
		"sidebar.workspaces.session.menu.item",
		"MenuItemButton",
		"role='menuitem'",
		"deepseek-harness-desktop.delete-session",
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
		"dshWindowBackground",
		"syncNativeWindowBackground",
	} {
		if !strings.Contains(client, fragment) {
			t.Fatalf("client bridge missing %q", fragment)
		}
	}
	if strings.Contains(client, "ctx.sessions.open(id)") {
		t.Fatal("tray navigation must not bypass uiWorkspace.openSession")
	}
	for _, forbidden := range []string{"停止 DSH", `invoke("stop"`, "CopySessionIdMenuItem", "deepseek-harness-desktop.copy-session-id", "showCopySessionId", "setShowCopySessionId", "field.show_copy_session_id"} {
		if strings.Contains(client, forbidden) {
			t.Fatalf("客户端桥接不应包含已移除或禁止的入口：%q", forbidden)
		}
	}
	if strings.Contains(host, "setShowCopySessionId") || strings.Contains(host, "/v1/set-show-copy-session-id") {
		t.Fatal("宿主桥接不应再暴露复制会话 ID 设置接口")
	}
	if strings.Contains(host, `stop: Object.freeze`) || strings.Contains(host, `path: "/v1/stop"`) {
		t.Fatal("host Cordis allowlist must not expose stop")
	}
	if strings.Contains(client, "dshDesktopBridgeShortcutRow") || strings.Contains(client, `t("dashboard.shortcuts_title")`) {
		t.Fatal("client desktop settings must not render a duplicate standalone shortcuts card")
	}
	for _, required := range []string{"@deepseek-ai/dsh-client-shortcuts", "__DSH_DESKTOP_WRAP_SHORTCUTS_FACTORY__", "desktop.quit", "desktop.hide", "desktop.hideOthers", "setShortcutsRecording", "shortcutAction"} {
		if !strings.Contains(client, required) {
			t.Fatalf("client must bridge native DSH shortcuts (%q missing)", required)
		}
	}
	for _, hostRoute := range []string{"/v1/set-shortcuts-recording", "/v1/shortcut-action"} {
		if !strings.Contains(host, hostRoute) {
			t.Fatalf("host must expose native shortcut route %q", hostRoute)
		}
	}
	if strings.Contains(client, `children: "▾"`) || strings.Contains(client, "⌘Q / Ctrl+Q") {
		t.Fatal("language dropdown must use the stroke chevron; preference hints must follow the configured shortcut")
	}
	if !strings.Contains(client, "dshDesktopBridgeInlineKbd") || !strings.Contains(client, "boundShortcutLabel") || !strings.Contains(client, "subscribeCatalog") {
		t.Fatal("preference hints must reactively render the current shortcut binding from the native catalog")
	}
}
