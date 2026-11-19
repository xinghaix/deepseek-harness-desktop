package dsh

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

type notificationRouteHost struct {
	routeTestBridgeHost
	settings NotificationSettings
	events   []NotificationEvent
	actions  []string
	views    []NotificationView
}

func (h *notificationRouteHost) NotificationSettings() (NotificationSettings, error) {
	return h.settings, nil
}
func (h *notificationRouteHost) SetNotificationPreference(key string, value bool) error {
	h.settings.NotificationPrefs.Set(key, value)
	return nil
}
func (h *notificationRouteHost) NotificationAction(action string) error {
	h.actions = append(h.actions, action)
	return nil
}
func (h *notificationRouteHost) ReportNotificationEvent(event NotificationEvent) {
	h.events = append(h.events, event)
}
func (h *notificationRouteHost) ReportNotificationView(view NotificationView) {
	h.views = append(h.views, view)
}

func TestDesktopBridgeNotificationRoutes(t *testing.T) {
	host := &notificationRouteHost{}
	manager := New()
	manager.SetBridgeHost(host)
	bridge := &desktopBridge{owner: manager, token: "test-token"}
	for _, tc := range []struct {
		path, method, token, body string
		want                      int
	}{
		{"notification-event", "POST", "", `{"kind":"approval","sessionId":"session","key":"one"}`, http.StatusUnauthorized},
		{"notification-event", "POST", "test-token", `{"kind":"toast-anything","sessionId":"session","key":"one"}`, http.StatusBadRequest},
		{"notification-event", "POST", "test-token", `{"kind":"approval","sessionId":"session","key":"` + strings.Repeat("x", 2050) + `"}`, http.StatusBadRequest},
		{"notification-event", "POST", "test-token", `{"kind":"approval","sessionId":"session","key":"one"}`, http.StatusOK},
		{"notification-settings", "POST", "test-token", `{"key":"approval"}`, http.StatusBadRequest},
		{"notification-settings", "POST", "test-token", `{"key":"approvalPolicy","value":true}`, http.StatusBadRequest},
		{"notification-settings", "POST", "test-token", `{"key":"approval","value":true}`, http.StatusOK},
		{"notification-settings", "GET", "test-token", ``, http.StatusOK},
		{"notification-action", "POST", "test-token", `{"action":"approve"}`, http.StatusBadRequest},
		{"notification-action", "POST", "test-token", `{"action":"test"}`, http.StatusOK},
		{"notification-view", "POST", "test-token", `{"sessionId":"session"}`, http.StatusOK},
	} {
		r := httptest.NewRequest(tc.method, "/v1/"+tc.path, strings.NewReader(tc.body))
		r.Header.Set(desktopBridgeTokenHeader, tc.token)
		w := httptest.NewRecorder()
		bridge.serveHTTP(w, r)
		if w.Code != tc.want {
			t.Fatalf("%s %s: got HTTP %d want %d: %s", tc.method, tc.path, w.Code, tc.want, w.Body)
		}
	}
	if !host.settings.Approval || len(host.events) != 1 || len(host.views) != 1 || len(host.actions) != 1 || host.actions[0] != "test" {
		t.Fatalf("rejected payload leaked or valid payload dropped: %+v", host)
	}
}
