package dsh

import (
	"bytes"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// Implement only the capabilities exercised here; embedding the interface keeps
// the HTTP tests independent of platform-specific process-supervision fixtures.
type routeTestBridgeHost struct{ BridgeHost }

func (*routeTestBridgeHost) BridgeLocaleBundle() BridgeLocaleBundle {
	return BridgeLocaleBundle{Locale: "en", Catalog: map[string]string{"bridge.card_status": "Status"}}
}
func (*routeTestBridgeHost) SetPromptOverlayMaxLines(n int) (BridgePrefs, error) {
	return BridgePrefs{PromptOverlayMaxLines: n}, nil
}
func (*routeTestBridgeHost) SetRestoreLastSession(b bool) (BridgePrefs, error) {
	return BridgePrefs{RestoreLastSession: b}, nil
}
func (*routeTestBridgeHost) SetRememberWindowSize(b bool) (BridgePrefs, error) {
	return BridgePrefs{RememberWindowSize: b}, nil
}
func (*routeTestBridgeHost) ClaimOpenSession() string { return "legacy-session" }

type sequencedBridgeHost struct{ routeTestBridgeHost }

func (*sequencedBridgeHost) ClaimOpenSessionRequest() OpenSessionRequest {
	return OpenSessionRequest{SessionID: "same-session", RequestID: 42}
}

type externalURLBridgeHost struct {
	routeTestBridgeHost
	urls []string
	err  error
}

func (h *externalURLBridgeHost) OpenExternalURL(url string) error {
	h.urls = append(h.urls, url)
	return h.err
}

func TestDesktopBridgeOpenExternalURL(t *testing.T) {
	host := &externalURLBridgeHost{}
	owner := New()
	owner.SetBridgeHost(host)
	bridge := &desktopBridge{owner: owner, token: "test-token"}
	req := httptest.NewRequest(http.MethodPost, "/v1/open-external-url", strings.NewReader(`{"url":"https://example.com/docs"}`))
	req.Header.Set(desktopBridgeTokenHeader, "test-token")
	res := httptest.NewRecorder()
	bridge.serveHTTP(res, req)
	if res.Code != http.StatusOK || len(host.urls) != 1 || host.urls[0] != "https://example.com/docs" {
		t.Fatalf("external URL: status=%d calls=%v body=%s", res.Code, host.urls, res.Body.String())
	}
}

func TestDesktopBridgeOpenExternalURLRejections(t *testing.T) {
	for _, tc := range []struct {
		name, method, token, body string
		status                    int
	}{
		{"missing auth", "POST", "", `{"url":"https://example.com"}`, 401},
		{"wrong auth", "POST", "wrong", `{"url":"https://example.com"}`, 401},
		{"wrong method", "GET", "test-token", `{"url":"https://example.com"}`, 405},
		{"malformed", "POST", "test-token", "{", 400},
		{"missing", "POST", "test-token", "{}", 400},
		{"empty body", "POST", "test-token", "", 400},
		{"empty URL", "POST", "test-token", `{"url":"  "}`, 400},
		{"number", "POST", "test-token", `{"url":12}`, 400},
		{"null URL", "POST", "test-token", `{"url":null}`, 400},
		{"boolean", "POST", "test-token", `{"url":true}`, 400},
		{"object", "POST", "test-token", `{"url":{}}`, 400},
		{"array", "POST", "test-token", `{"url":[]}`, 400},
		{"null body", "POST", "test-token", "null", 400},
		{"trailing JSON", "POST", "test-token", `{"url":"https://example.com"}{}`, 400},
	} {
		t.Run(tc.name, func(t *testing.T) {
			host := &externalURLBridgeHost{}
			owner := New()
			owner.SetBridgeHost(host)
			bridge := &desktopBridge{owner: owner, token: "test-token"}
			req := httptest.NewRequest(tc.method, "/v1/open-external-url", strings.NewReader(tc.body))
			req.Header.Set(desktopBridgeTokenHeader, tc.token)
			res := httptest.NewRecorder()
			bridge.serveHTTP(res, req)
			if res.Code != tc.status || len(host.urls) != 0 {
				t.Fatalf("status=%d calls=%v body=%s", res.Code, host.urls, res.Body.String())
			}
		})
	}
}

func TestDesktopBridgeOpenExternalURLFailureAndLegacyHost(t *testing.T) {
	for _, tc := range []struct {
		name string
		host BridgeHost
	}{
		{"launcher failure", &externalURLBridgeHost{err: errors.New("launcher failed")}},
		{"legacy host", &routeTestBridgeHost{}},
		{"no host", nil},
	} {
		t.Run(tc.name, func(t *testing.T) {
			owner := New()
			owner.SetBridgeHost(tc.host)
			bridge := &desktopBridge{owner: owner, token: "test-token"}
			req := httptest.NewRequest("POST", "/v1/open-external-url", strings.NewReader(`{"url":"https://example.com"}`))
			req.Header.Set(desktopBridgeTokenHeader, "test-token")
			res := httptest.NewRecorder()
			bridge.serveHTTP(res, req)
			if res.Code != http.StatusConflict {
				t.Fatalf("status=%d body=%s", res.Code, res.Body.String())
			}
			if host, ok := tc.host.(*externalURLBridgeHost); ok {
				if len(host.urls) != 1 || !strings.Contains(res.Body.String(), "launcher failed") {
					t.Fatalf("failure lost: calls=%v body=%s", host.urls, res.Body.String())
				}
			}
			// Optional capability absence must not disable existing routes.
			req = httptest.NewRequest("GET", "/v1/status", nil)
			req.Header.Set(desktopBridgeTokenHeader, "test-token")
			res = httptest.NewRecorder()
			bridge.serveHTTP(res, req)
			if res.Code != http.StatusOK {
				t.Fatalf("legacy status failed: %d", res.Code)
			}
		})
	}
}

func TestDesktopBridgeClaimCarriesRequestIdentity(t *testing.T) {
	owner := New()
	owner.SetBridgeHost(&sequencedBridgeHost{})
	bridge := &desktopBridge{owner: owner, token: "test-token"}
	req := httptest.NewRequest(http.MethodPost, "/v1/claim-open-session", nil)
	req.Header.Set(desktopBridgeTokenHeader, "test-token")
	res := httptest.NewRecorder()
	bridge.serveHTTP(res, req)
	if res.Code != http.StatusOK || !strings.Contains(res.Body.String(), `"requestId":42`) || !strings.Contains(res.Body.String(), `"sessionId":"same-session"`) {
		t.Fatalf("claim lost request identity: %d %s", res.Code, res.Body.String())
	}
}

func TestDesktopBridgeAuthenticationAndScope(t *testing.T) {
	owner := New()
	// The locale bundle is a host capability, so inject a host before asserting
	// that the endpoint serves the catalog.
	owner.SetBridgeHost(&routeTestBridgeHost{})
	endpoint := filepath.Join(t.TempDir(), "desktop-bridge-endpoint.json")
	bridge, err := newDesktopBridge(owner, endpoint)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = bridge.close() })
	if !strings.HasPrefix(bridge.url, "http://127.0.0.1:") || len(bridge.token) != 64 {
		t.Fatalf("unsafe bridge address or token: %q, %d", bridge.url, len(bridge.token))
	}
	raw, err := os.ReadFile(endpoint)
	if err != nil || !strings.Contains(string(raw), bridge.token) || !strings.Contains(string(raw), bridge.url) {
		t.Fatalf("endpoint file missing credentials: %v %s", err, raw)
	}

	client := &http.Client{Timeout: time.Second}
	get := func(path, token string) (*http.Response, []byte) {
		t.Helper()
		deadline := time.Now().Add(time.Second)
		for {
			req, requestErr := http.NewRequest(http.MethodGet, bridge.url+path, nil)
			if requestErr != nil {
				t.Fatal(requestErr)
			}
			if token != "" {
				req.Header.Set(desktopBridgeTokenHeader, token)
			}
			response, requestErr := client.Do(req)
			if requestErr == nil {
				body, readErr := io.ReadAll(response.Body)
				_ = response.Body.Close()
				if readErr != nil {
					t.Fatal(readErr)
				}
				return response, body
			}
			if time.Now().After(deadline) {
				t.Fatal(requestErr)
			}
			time.Sleep(5 * time.Millisecond)
		}
	}

	response, body := get("/v1/status", "wrong")
	if response.StatusCode != http.StatusUnauthorized || !strings.Contains(string(body), "token") {
		t.Fatalf("invalid token response: %d %s", response.StatusCode, body)
	}
	response, body = get("/v1/status", bridge.token)
	if response.StatusCode != http.StatusOK || !strings.Contains(string(body), `"state":"stopped"`) {
		t.Fatalf("authenticated status response: %d %s", response.StatusCode, body)
	}
	response, body = get("/v1/ping", bridge.token)
	if response.StatusCode != http.StatusOK || !strings.Contains(string(body), `"ok":true`) {
		t.Fatalf("ping response: %d %s", response.StatusCode, body)
	}
	response, body = get("/v1/capabilities", bridge.token)
	if response.StatusCode != http.StatusOK || !strings.Contains(string(body), `"schema":"deepseek-harness-desktop/capabilities"`) || strings.Contains(string(body), bridge.token) {
		t.Fatalf("capabilities response: %d %s", response.StatusCode, body)
	}
	handshakeRequest, err := http.NewRequest(http.MethodPost, bridge.url+"/v1/handshake", bytes.NewReader([]byte(`{"schema":"deepseek-harness-desktop/capabilities","protocol":"1","transport":{"selected":"loopback-http"}}`)))
	if err != nil {
		t.Fatal(err)
	}
	handshakeRequest.Header.Set(desktopBridgeTokenHeader, bridge.token)
	handshakeRequest.Header.Set("Content-Type", "application/json")
	handshakeResponse, err := client.Do(handshakeRequest)
	if err != nil {
		t.Fatal(err)
	}
	handshakeBody, err := io.ReadAll(handshakeResponse.Body)
	_ = handshakeResponse.Body.Close()
	if err != nil {
		t.Fatal(err)
	}
	if handshakeResponse.StatusCode != http.StatusOK || !strings.Contains(string(handshakeBody), `"compatible":true`) || strings.Contains(string(handshakeBody), bridge.token) {
		t.Fatalf("handshake response: %d %s", handshakeResponse.StatusCode, handshakeBody)
	}
	response, _ = get("/v1/status?extra=1", bridge.token)
	if response.StatusCode != http.StatusBadRequest {
		t.Fatalf("query was accepted with status %d", response.StatusCode)
	}
	response, _ = get("/v1/restart", bridge.token)
	if response.StatusCode != http.StatusMethodNotAllowed {
		t.Fatalf("wrong method was accepted with status %d", response.StatusCode)
	}
	// The floating-card line budget is a normal clamped pref write over the same plane.
	linesRequest, err := http.NewRequest(http.MethodPost, bridge.url+"/v1/set-prompt-overlay-max-lines", bytes.NewReader([]byte(`{"lines":9}`)))
	if err != nil {
		t.Fatal(err)
	}
	linesRequest.Header.Set(desktopBridgeTokenHeader, bridge.token)
	linesRequest.Header.Set("Content-Type", "application/json")
	linesResponse, err := client.Do(linesRequest)
	if err != nil {
		t.Fatal(err)
	}
	linesBody, err := io.ReadAll(linesResponse.Body)
	_ = linesResponse.Body.Close()
	if err != nil {
		t.Fatal(err)
	}
	if linesResponse.StatusCode != http.StatusOK || !strings.Contains(string(linesBody), `"promptOverlayMaxLines":9`) {
		t.Fatalf("set prompt overlay max lines response: %d %s", linesResponse.StatusCode, linesBody)
	}
	response, _ = get("/v1/set-prompt-overlay-max-lines", bridge.token)
	if response.StatusCode != http.StatusMethodNotAllowed {
		t.Fatalf("max-lines accepted GET with status %d", response.StatusCode)
	}

	restoreRequest, err := http.NewRequest(http.MethodPost, bridge.url+"/v1/set-restore-last-session", bytes.NewReader([]byte(`{"enabled":true}`)))
	if err != nil {
		t.Fatal(err)
	}
	restoreRequest.Header.Set(desktopBridgeTokenHeader, bridge.token)
	restoreRequest.Header.Set("Content-Type", "application/json")
	restoreResponse, err := client.Do(restoreRequest)
	if err != nil {
		t.Fatal(err)
	}
	restoreBody, err := io.ReadAll(restoreResponse.Body)
	_ = restoreResponse.Body.Close()
	if err != nil {
		t.Fatal(err)
	}
	if restoreResponse.StatusCode != http.StatusOK || !strings.Contains(string(restoreBody), `"restoreLastSession":true`) {
		t.Fatalf("set restore last session response: %d %s", restoreResponse.StatusCode, restoreBody)
	}

	windowSizeRequest, err := http.NewRequest(http.MethodPost, bridge.url+"/v1/set-remember-window-size", bytes.NewReader([]byte(`{"enabled":false}`)))
	if err != nil {
		t.Fatal(err)
	}
	windowSizeRequest.Header.Set(desktopBridgeTokenHeader, bridge.token)
	windowSizeRequest.Header.Set("Content-Type", "application/json")
	windowSizeResponse, err := client.Do(windowSizeRequest)
	if err != nil {
		t.Fatal(err)
	}
	windowSizeBody, err := io.ReadAll(windowSizeResponse.Body)
	_ = windowSizeResponse.Body.Close()
	if err != nil {
		t.Fatal(err)
	}
	if windowSizeResponse.StatusCode != http.StatusOK || !strings.Contains(string(windowSizeBody), `"rememberWindowSize":false`) {
		t.Fatalf("set remember window size response: %d %s", windowSizeResponse.StatusCode, windowSizeBody)
	}

	// The Chat webview loads the shared UI catalog through the same token-fenced plane.
	response, body = get("/v1/locale-bundle", bridge.token)
	if response.StatusCode != http.StatusOK || !strings.Contains(string(body), "\"locale\":\"en\"") || !strings.Contains(string(body), "\"bridge.card_status\":\"Status\"") {
		t.Fatalf("locale bundle response: %d %s", response.StatusCode, body)
	}
	response, _ = get("/v1/locale-bundle", "wrong")
	if response.StatusCode != http.StatusUnauthorized {
		t.Fatalf("locale bundle accepted an invalid token with status %d", response.StatusCode)
	}
	response, _ = get("/unknown", bridge.token)
	if response.StatusCode != http.StatusNotFound {
		t.Fatalf("unknown endpoint was accepted with status %d", response.StatusCode)
	}

	bridge.mu.Lock()
	url, token := bridge.url, bridge.token
	bridge.mu.Unlock()
	env := bridge.env([]string{desktopBridgeURLVar + "=old", desktopBridgeTokenVar + "=old", desktopBridgeEndpointFileVar + "=old", "DSH_HOME=/tmp/example"})
	joined := strings.Join(env, "\n")
	if strings.Contains(joined, "=old") || !strings.Contains(joined, desktopBridgeURLVar+"="+url) || !strings.Contains(joined, desktopBridgeTokenVar+"="+token) || !strings.Contains(joined, desktopBridgeEndpointFileVar+"="+endpoint) {
		t.Fatalf("bridge environment was not replaced safely: %v", env)
	}
}

func TestWriteDesktopBridgeOverlay(t *testing.T) {
	dir := t.TempDir()
	patch, err := writeDesktopBridgeOverlay(dir)
	if err != nil {
		t.Fatal(err)
	}
	want := filepath.Join(dir, desktopBridgeDirName, "cordis.patch.yml")
	if patch != want {
		t.Fatalf("patch = %q, want %q", patch, want)
	}
	for _, rel := range []string{
		"cordis.patch.yml", "package.json",
		filepath.Join("lib", "index.js"),
		filepath.Join("lib", "client.js"),
	} {
		if _, err := os.Stat(filepath.Join(dir, desktopBridgeDirName, rel)); err != nil {
			t.Fatal(err)
		}
	}
	patchText, err := os.ReadFile(patch)
	if err != nil {
		t.Fatal(err)
	}
	for _, fragment := range []string{"- remove:", "deepseek-harness-desktop-bridge", "name: ./lib/index.js"} {
		if !strings.Contains(string(patchText), fragment) {
			t.Fatalf("patch missing %q", fragment)
		}
	}
	clientBytes, err := os.ReadFile(filepath.Join(dir, desktopBridgeDirName, "lib", "client.js"))
	if err != nil {
		t.Fatal(err)
	}
	client := string(clientBytes)
	for _, fragment := range []string{"settings.section", `t("tray.open_settings")`, `t("bridge.card_enhancements")`, "showCopySessionId", "setShowCopySessionId", "hoverMessageActions", "setHoverMessageActions", "chatContentVisibility", `t("field.chat_content_visibility")`, "setRestoreLastSession", "setRememberWindowSize", `t("field.restore_last_session")`, `t("field.remember_window_size")`, `t("dashboard.shortcuts_title")`, "setShortcuts", "CAPABILITIES_SCHEMA", "ensureDesktopHandshake", "http-fallback"} {
		if !strings.Contains(client, fragment) {
			t.Fatalf("client overlay missing %q", fragment)
		}
	}
	if strings.Contains(client, "settings.plugins.tab") {
		t.Fatal("client still registers plugins.tab instead of first-class section")
	}
	pkgBytes, err := os.ReadFile(filepath.Join(dir, desktopBridgeDirName, "package.json"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(pkgBytes), "@deepseek-ai/dsh-client-ui-settings") {
		t.Fatal("package.json missing settings shell inject dependency")
	}
	if strings.Contains(string(pkgBytes), "dsh-client-ui-settings-plugins") {
		t.Fatal("package.json still depends on plugins-tab package")
	}
	hostBytes, err := os.ReadFile(filepath.Join(dir, desktopBridgeDirName, "lib", "index.js"))
	if err != nil {
		t.Fatal(err)
	}
	host := string(hostBytes)
	for _, fragment := range []string{`inject = ["connection", "webServer"]`, `ctx.inject(["connection", "webServer"]`, "webServer.register", "kind: \"prefix\"", "configFromEndpointFile", "setRestoreLastSession", "setRememberWindowSize"} {
		if !strings.Contains(host, fragment) {
			t.Fatalf("host overlay missing %q", fragment)
		}
	}
	if strings.Contains(host, `inject = []`) {
		t.Fatal("host overlay must not use empty top-level inject (nested-only left Cordis RPC unregistered → HTTP 405)")
	}
}

func TestDesktopBridgeListenerRecreate(t *testing.T) {
	owner := New()
	endpoint := filepath.Join(t.TempDir(), "desktop-bridge-endpoint.json")
	bridge, err := newDesktopBridge(owner, endpoint)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = bridge.close() })

	bridge.mu.Lock()
	oldURL, oldToken, listener := bridge.url, bridge.token, bridge.listener
	bridge.mu.Unlock()
	if listener == nil {
		t.Fatal("missing listener")
	}
	// Unexpected listener death (not Shutdown) should recreate with a fresh token.
	if err := listener.Close(); err != nil {
		t.Fatal(err)
	}

	deadline := time.Now().Add(2 * time.Second)
	var newURL, newToken string
	for time.Now().Before(deadline) {
		raw, readErr := os.ReadFile(endpoint)
		if readErr == nil {
			text := string(raw)
			if !strings.Contains(text, oldToken) && strings.Contains(text, "http://127.0.0.1:") {
				bridge.mu.Lock()
				newURL, newToken = bridge.url, bridge.token
				bridge.mu.Unlock()
				if newURL != "" && newToken != "" && newURL != oldURL && newToken != oldToken {
					break
				}
			}
		}
		time.Sleep(10 * time.Millisecond)
	}
	if newURL == "" || newToken == "" || newURL == oldURL || newToken == oldToken {
		t.Fatalf("bridge did not recreate endpoint after listener death: old=%s/%s new=%s/%s", oldURL, oldToken, newURL, newToken)
	}

	client := &http.Client{Timeout: time.Second}
	req, err := http.NewRequest(http.MethodGet, newURL+"/v1/ping", nil)
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set(desktopBridgeTokenHeader, newToken)
	response, err := client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	body, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatal(err)
	}
	if response.StatusCode != http.StatusOK || !strings.Contains(string(body), `"ok":true`) {
		t.Fatalf("recreated bridge ping failed: %d %s", response.StatusCode, body)
	}
}
