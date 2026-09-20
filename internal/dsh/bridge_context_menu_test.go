package dsh

import (
	"encoding/json"
	"errors"
	"net/http/httptest"
	"strings"
	"testing"
)

type contextMenuBridgeHost struct {
	routeTestBridgeHost
	calls []ChatContextMenuRequest
	err   error
}

func (h *contextMenuBridgeHost) ShowChatContextMenu(r ChatContextMenuRequest) error {
	h.calls = append(h.calls, r)
	return h.err
}

func TestDesktopBridgeChatContextMenu(t *testing.T) {
	valid := `{"x":12,"y":34,"text":"selected","href":"https://example.com"}`
	for _, tc := range []struct {
		name, method, token, body string
		status                    int
	}{
		{"valid", "POST", "test-token", valid, 200},
		{"no auth", "POST", "", valid, 401},
		{"wrong method", "GET", "test-token", valid, 405},
		{"invalid JSON", "POST", "test-token", "{", 400},
		{"missing", "POST", "test-token", "{}", 400},
		{"null", "POST", "test-token", "null", 400},
		{"null coordinate", "POST", "test-token", strings.Replace(valid, "12", "null", 1), 400},
		{"negative", "POST", "test-token", strings.Replace(valid, "12", "-1", 1), 400},
		{"large coordinate", "POST", "test-token", strings.Replace(valid, "12", "100001", 1), 400},
		{"fractional", "POST", "test-token", strings.Replace(valid, "12", "1.2", 1), 400},
		{"text type", "POST", "test-token", strings.Replace(valid, `"selected"`, "42", 1), 400},
		{"null href", "POST", "test-token", strings.Replace(valid, `"https://example.com"`, "null", 1), 400},
		{"oversized text", "POST", "test-token", strings.Replace(valid, "selected", strings.Repeat("x", 8193), 1), 400},
		{"oversized href", "POST", "test-token", strings.Replace(valid, "https://example.com", strings.Repeat("x", 8193), 1), 400},
		{"menu injection", "POST", "test-token", strings.TrimSuffix(valid, "}") + `,"id":"arbitrary"}`, 400},
		{"window injection", "POST", "test-token", strings.TrimSuffix(valid, "}") + `,"window":"main"}`, 400},
	} {
		t.Run(tc.name, func(t *testing.T) {
			h := &contextMenuBridgeHost{}
			owner := New()
			owner.SetBridgeHost(h)
			b := &desktopBridge{owner: owner, token: "test-token"}
			req := httptest.NewRequest(tc.method, "/v1/chat-context-menu", strings.NewReader(tc.body))
			req.Header.Set(desktopBridgeTokenHeader, tc.token)
			res := httptest.NewRecorder()
			b.serveHTTP(res, req)
			if res.Code != tc.status {
				t.Fatalf("status=%d body=%s", res.Code, res.Body.String())
			}
			if tc.status == 200 {
				var want ChatContextMenuRequest
				_ = json.Unmarshal([]byte(valid), &want)
				if len(h.calls) != 1 || h.calls[0] != want {
					t.Fatalf("calls=%v", h.calls)
				}
			} else if len(h.calls) != 0 {
				t.Fatalf("invalid call=%v", h.calls)
			}
		})
	}
}
func TestDesktopBridgeChatContextMenuLegacyAndFailure(t *testing.T) {
	for _, host := range []BridgeHost{nil, &routeTestBridgeHost{}, &contextMenuBridgeHost{err: errors.New("menu unavailable")}} {
		owner := New()
		owner.SetBridgeHost(host)
		b := &desktopBridge{owner: owner, token: "test-token"}
		req := httptest.NewRequest("POST", "/v1/chat-context-menu", strings.NewReader(`{"x":0,"y":0,"text":"selected","href":""}`))
		req.Header.Set(desktopBridgeTokenHeader, "test-token")
		res := httptest.NewRecorder()
		b.serveHTTP(res, req)
		if res.Code != 409 {
			t.Fatalf("status=%d body=%s", res.Code, res.Body.String())
		}
	}
}
