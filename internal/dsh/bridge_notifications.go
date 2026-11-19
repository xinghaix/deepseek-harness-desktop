package dsh

import (
	"net/http"
	"strings"
	"unicode"

	"deepseek-harness-desktop/internal/desktopstate"
	"deepseek-harness-desktop/internal/i18n"
)

// NotificationHost 是可选桌面能力；CLI 和旧桌面桥无需实现。
type NotificationHost interface {
	NotificationSettings() (NotificationSettings, error)
	SetNotificationPreference(key string, value bool) error
	NotificationAction(action string) error
	ReportNotificationEvent(NotificationEvent)
	ReportNotificationView(NotificationView)
}

type NotificationSettings struct {
	desktopstate.NotificationPrefs
	System          string `json:"system"`
	CanOpenSettings bool   `json:"canOpenSettings"`
}

type NotificationEvent struct {
	Kind      string `json:"kind"`
	SessionID string `json:"sessionId"`
	Key       string `json:"key"`
	Closed    bool   `json:"closed"`
}

type NotificationView struct {
	SessionID string `json:"sessionId"`
}

func validNotificationID(value string, max int) bool {
	return len(value) > 0 && len(value) <= max && strings.IndexFunc(value, func(r rune) bool {
		return unicode.IsControl(r) || unicode.IsSpace(r)
	}) < 0
}

func (event NotificationEvent) valid() bool {
	if !validNotificationID(event.SessionID, 256) || !validNotificationID(event.Key, 256) {
		return false
	}
	switch event.Kind {
	case "question", "plan-review", "approval", "completed", "interrupted", "error", "running":
		return true
	}
	return false
}

func (b *desktopBridge) serveNotifications(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path == "/v1/notification-config" {
		if r.Method != http.MethodGet {
			writeBridgeError(w, http.StatusMethodNotAllowed, i18n.TActive("err.bridge_method"))
			return
		}
		file, err := desktopstate.Load()
		if err != nil {
			writeBridgeError(w, http.StatusInternalServerError, i18n.TActive("bridge.err_read_status"))
			return
		}
		writeBridgeJSON(w, http.StatusOK, file.Prefs.EffectiveNotifications())
		return
	}
	base, _ := b.owner.getBridgeHost()
	host, ok := base.(NotificationHost)
	if !ok {
		writeBridgeError(w, http.StatusNotImplemented, i18n.TActive("notifications.unavailable"))
		return
	}
	bad := func() { writeBridgeError(w, http.StatusBadRequest, i18n.TActive("bridge.err_not_allowed")) }
	respond := func(err error) {
		if err != nil {
			writeBridgeError(w, http.StatusConflict, err.Error())
			return
		}
		writeBridgeJSON(w, http.StatusOK, map[string]bool{"ok": true})
	}
	r.Body = http.MaxBytesReader(w, r.Body, 2048)
	if r.URL.Path == "/v1/notification-settings" && r.Method == http.MethodGet {
		settings, err := host.NotificationSettings()
		if err != nil {
			respond(err)
			return
		}
		writeBridgeJSON(w, http.StatusOK, settings)
		return
	}
	if r.Method != http.MethodPost {
		writeBridgeError(w, http.StatusMethodNotAllowed, i18n.TActive("err.bridge_method"))
		return
	}
	switch r.URL.Path {
	case "/v1/notification-settings":
		var body struct {
			Key   string `json:"key"`
			Value *bool  `json:"value"`
		}
		var probe desktopstate.NotificationPrefs
		if decodeBridgeJSON(r, &body) != nil || body.Value == nil || !probe.Set(body.Key, *body.Value) {
			bad()
			return
		}
		if err := host.SetNotificationPreference(body.Key, *body.Value); err != nil {
			respond(err)
			return
		}
		settings, err := host.NotificationSettings()
		if err != nil {
			respond(err)
			return
		}
		writeBridgeJSON(w, http.StatusOK, settings)
	case "/v1/notification-action":
		var body struct {
			Action string `json:"action"`
		}
		if decodeBridgeJSON(r, &body) != nil || (body.Action != "authorize" && body.Action != "test" && body.Action != "open-system-settings") {
			bad()
			return
		}
		respond(host.NotificationAction(body.Action))
	case "/v1/notification-event":
		var body NotificationEvent
		if decodeBridgeJSON(r, &body) != nil || !body.valid() {
			bad()
			return
		}
		host.ReportNotificationEvent(body)
		respond(nil)
	case "/v1/notification-view":
		var body NotificationView
		if decodeBridgeJSON(r, &body) != nil || (body.SessionID != "" && !validNotificationID(body.SessionID, 256)) {
			bad()
			return
		}
		host.ReportNotificationView(body)
		respond(nil)
	}
}
