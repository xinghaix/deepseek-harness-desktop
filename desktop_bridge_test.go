package main

import (
	"io"
	"net/http"
	"strings"
	"testing"
	"time"
)

func TestDesktopBridgeAuthenticationAndScope(t *testing.T) {
	owner := newDSH()
	bridge, err := newDesktopBridge(owner)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = bridge.close() })
	if !strings.HasPrefix(bridge.url, "http://127.0.0.1:") || len(bridge.token) != 64 {
		t.Fatalf("unsafe bridge address or token: %q, %d", bridge.url, len(bridge.token))
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
	if response.StatusCode != http.StatusUnauthorized || !strings.Contains(string(body), "令牌") {
		t.Fatalf("invalid token response: %d %s", response.StatusCode, body)
	}
	response, body = get("/v1/status", bridge.token)
	if response.StatusCode != http.StatusOK || !strings.Contains(string(body), `"state":"stopped"`) {
		t.Fatalf("authenticated status response: %d %s", response.StatusCode, body)
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

	env := bridge.env([]string{desktopBridgeURLVar + "=old", desktopBridgeTokenVar + "=old", "DSH_HOME=/tmp/example"})
	joined := strings.Join(env, "\n")
	if strings.Contains(joined, "old") || !strings.Contains(joined, desktopBridgeURLVar+"="+bridge.url) || !strings.Contains(joined, desktopBridgeTokenVar+"="+bridge.token) {
		t.Fatalf("bridge environment was not replaced safely: %v", env)
	}
}
