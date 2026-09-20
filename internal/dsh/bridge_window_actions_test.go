package dsh

import (
	"errors"
	"net/http/httptest"
	"strings"
	"testing"
)

type windowActionBridgeHost struct {
	routeTestBridgeHost
	actions []string
	err     error
}

func (h *windowActionBridgeHost) ChatWindowAction(action string) error {
	h.actions = append(h.actions, action)
	return h.err
}

func TestDesktopBridgeChatWindowAction(t *testing.T) {
	for _, action := range []string{"minimize", "maximize", "close", "settings", "dismiss-config"} {
		t.Run(action, func(t *testing.T) {
			host := &windowActionBridgeHost{}
			owner := New()
			owner.SetBridgeHost(host)
			bridge := &desktopBridge{owner: owner, token: "test-token"}
			req := httptest.NewRequest("POST", "/v1/chat-window-action", strings.NewReader(`{"action":"`+action+`"}`))
			req.Header.Set(desktopBridgeTokenHeader, "test-token")
			res := httptest.NewRecorder()
			bridge.serveHTTP(res, req)
			if res.Code != 200 || len(host.actions) != 1 || host.actions[0] != action {
				t.Fatalf("status=%d calls=%v body=%s", res.Code, host.actions, res.Body.String())
			}
		})
	}
}

func TestDesktopBridgeChatWindowActionRejections(t *testing.T) {
	for _, tc := range []struct {
		name, method, token, body string
		status                    int
	}{
		{"missing auth", "POST", "", `{"action":"close"}`, 401},
		{"wrong auth", "POST", "wrong", `{"action":"close"}`, 401},
		{"wrong method", "GET", "test-token", `{"action":"close"}`, 405},
		{"empty", "POST", "test-token", "", 400},
		{"malformed", "POST", "test-token", "{", 400},
		{"missing", "POST", "test-token", "{}", 400},
		{"null", "POST", "test-token", "null", 400},
		{"null action", "POST", "test-token", `{"action":null}`, 400},
		{"number", "POST", "test-token", `{"action":42}`, 400},
		{"array", "POST", "test-token", `{"action":[]}`, 400},
		{"object", "POST", "test-token", `{"action":{}}`, 400},
		{"boolean", "POST", "test-token", `{"action":true}`, 400},
		{"unknown", "POST", "test-token", `{"action":"quit"}`, 400},
		{"case", "POST", "test-token", `{"action":"Close"}`, 400},
		{"whitespace", "POST", "test-token", `{"action":" close "}`, 400},
		{"trailing", "POST", "test-token", `{"action":"close"}{}`, 400},
		{"extra selector", "POST", "test-token", `{"action":"close","name":"main"}`, 400},
	} {
		t.Run(tc.name, func(t *testing.T) {
			host := &windowActionBridgeHost{}
			owner := New()
			owner.SetBridgeHost(host)
			bridge := &desktopBridge{owner: owner, token: "test-token"}
			req := httptest.NewRequest(tc.method, "/v1/chat-window-action", strings.NewReader(tc.body))
			req.Header.Set(desktopBridgeTokenHeader, tc.token)
			res := httptest.NewRecorder()
			bridge.serveHTTP(res, req)
			if res.Code != tc.status || len(host.actions) != 0 {
				t.Fatalf("status=%d calls=%v body=%s", res.Code, host.actions, res.Body.String())
			}
		})
	}
}

func TestDesktopBridgeChatWindowActionLegacyAndFailure(t *testing.T) {
	for _, host := range []BridgeHost{nil, &routeTestBridgeHost{}, &windowActionBridgeHost{err: errors.New("native failure")}} {
		owner := New()
		owner.SetBridgeHost(host)
		bridge := &desktopBridge{owner: owner, token: "test-token"}
		req := httptest.NewRequest("POST", "/v1/chat-window-action", strings.NewReader(`{"action":"close"}`))
		req.Header.Set(desktopBridgeTokenHeader, "test-token")
		res := httptest.NewRecorder()
		bridge.serveHTTP(res, req)
		if res.Code != 409 {
			t.Fatalf("status=%d body=%s", res.Code, res.Body.String())
		}
		if h, ok := host.(*windowActionBridgeHost); ok && (len(h.actions) != 1 || !strings.Contains(res.Body.String(), "native failure")) {
			t.Fatalf("native failure lost: %s", res.Body.String())
		}
		req = httptest.NewRequest("GET", "/v1/status", nil)
		req.Header.Set(desktopBridgeTokenHeader, "test-token")
		res = httptest.NewRecorder()
		bridge.serveHTTP(res, req)
		if res.Code != 200 {
			t.Fatalf("legacy status=%d", res.Code)
		}
	}
}
