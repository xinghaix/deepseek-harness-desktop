package dsh

import (
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestDesktopBridgeAuthenticationAndScope(t *testing.T) {
	owner := New()
	endpoint := filepath.Join(t.TempDir(), "bridge-endpoint.json")
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
	response, _ = get("/v1/status?extra=1", bridge.token)
	if response.StatusCode != http.StatusBadRequest {
		t.Fatalf("query was accepted with status %d", response.StatusCode)
	}
	response, _ = get("/v1/restart", bridge.token)
	if response.StatusCode != http.StatusMethodNotAllowed {
		t.Fatalf("wrong method was accepted with status %d", response.StatusCode)
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
	for _, fragment := range []string{"settings.section", "桌面设置"} {
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
	for _, fragment := range []string{`inject = ["connection", "webServer"]`, `ctx.inject(["connection", "webServer"]`, "webServer.register", "kind: \"prefix\"", "configFromEndpointFile"} {
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
	endpoint := filepath.Join(t.TempDir(), "bridge-endpoint.json")
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
