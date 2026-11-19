//go:build wails

package desktop

import (
	"strings"
	"testing"
	"time"

	"deepseek-harness-desktop/internal/desktopstate"
	"deepseek-harness-desktop/internal/dsh"
	"deepseek-harness-desktop/internal/i18n"
)

func TestNotificationPreferencesKeepIndependentSwitches(t *testing.T) {
	t.Setenv(desktopstate.StateDirEnv, t.TempDir())
	desktopstate.ResetCacheForTest()
	t.Cleanup(desktopstate.ResetCacheForTest)
	before, err := notificationPrefs()
	if err != nil || before.Enabled || !before.Question || !before.Approval || !before.Completed || !before.Interrupted || !before.Error || before.ShowTitle {
		t.Fatalf("defaults: %+v, %v", before, err)
	}
	host := bridgeHostAdapter{service: &Service{}}
	for _, change := range []struct {
		key string
		val bool
	}{{"enabled", true}, {"approval", false}, {"enabled", false}, {"enabled", true}} {
		if err := host.SetNotificationPreference(change.key, change.val); err != nil {
			t.Fatal(err)
		}
	}
	prefs, err := notificationPrefs()
	if err != nil || !prefs.Allows("plan-review") || prefs.Allows("approval") || !prefs.Allows("error") {
		t.Fatalf("effective switches: %+v, %v", prefs, err)
	}
	if err := host.SetNotificationPreference("arbitrary", true); err == nil {
		t.Fatal("notification preference whitelist was bypassed")
	}
}

func TestNotificationTicketDedupeAndStaleClick(t *testing.T) {
	var n notificationState
	now := time.Now()
	approval := notificationTicket{
		request: dsh.OpenSessionRequest{SessionID: "approval-chat", Notification: "approval"},
		key:     notificationKey{sessionID: "approval-chat", kind: "approval", key: "pending-1"}, created: now,
	}
	id := n.reserve(approval, false)
	if id == "" || strings.Contains(id, approval.request.SessionID) || n.reserve(approval, false) != "" {
		t.Fatal("ticket ID is not opaque and deduplicated")
	}
	if ids := n.settle(approval.key); len(ids) != 1 || ids[0] != id {
		t.Fatalf("wrong withdrawal: %v", ids)
	}
	if request, ok := n.take(id, now); !ok || !request.Settled || request.SessionID != "approval-chat" {
		t.Fatalf("stale click must still open only the related conversation: %+v %t", request, ok)
	}
	if _, ok := n.take(id, now); ok {
		t.Fatal("system callback replayed")
	}
	approval.key.key = "pending-2"
	id = n.reserve(approval, false)
	if _, ok := n.take(id, now.Add(notificationTTL)); ok {
		t.Fatal("expired ticket accepted")
	}
}

func TestNotificationCompletionCannotExhaustUrgentBudget(t *testing.T) {
	var n notificationState
	now := time.Now()
	for _, id := range []string{"1", "2", "3", "4", "5", "6"} {
		if n.reserve(notificationTicket{created: now, key: notificationKey{key: id, kind: "completed"}}, false) == "" {
			t.Fatal("completion budget exhausted early")
		}
	}
	if n.reserve(notificationTicket{created: now, key: notificationKey{key: "7", kind: "completed"}}, false) != "" {
		t.Fatal("completion budget not enforced")
	}
	if n.reserve(notificationTicket{created: now, key: notificationKey{key: "7", kind: "error"}}, false) == "" {
		t.Fatal("final error should still reach the OS after completion burst")
	}
}

func TestNotificationBannerText(t *testing.T) {
	s := &Service{sessions: []dsh.BridgeSession{
		{ID: "one", Title: "/private/workspace"},
		{ID: "two", Title: "Plan review", ExplicitTitle: true},
	}}
	for _, tc := range []struct {
		name, kind, sessionID string
		group, showTitle      bool
		wantTitle, wantBody   string
	}{
		{"privacy off", "completed", "two", false, false, "completed", ""},
		{"private fallback", "error", "one", false, true, "error", ""},
		{"compact title", "completed", "two", false, true, "completed", "Plan review"},
		{"test keeps instructions", "test", "two", false, true, "test", i18n.TActive("notifications.native.test_body")},
		{"group keeps instructions", "interrupted", "two", true, true, "multiple", i18n.TActive("notifications.native.multiple_body")},
	} {
		t.Run(tc.name, func(t *testing.T) {
			req := dsh.OpenSessionRequest{Notification: tc.kind, SessionID: tc.sessionID}
			if tc.group {
				req.SessionIDs = []string{"one", "two"}
			}
			title, body := s.notificationText(req, tc.showTitle)
			if title != i18n.TActive("notifications.native."+tc.wantTitle) || body != tc.wantBody || strings.ContainsAny(body, "\r\n") {
				t.Fatalf("unexpected banner text: %q / %q", title, body)
			}
		})
	}
}

func TestNotificationOnlyUsesExplicitTitle(t *testing.T) {
	s := &Service{sessions: []dsh.BridgeSession{
		{ID: "one", Title: "/private/workspace"},
		{ID: "two", Title: "\nPlan\u202e review\t", ExplicitTitle: true},
	}}
	if s.notificationSessionTitle("one") != "" || s.notificationSessionTitle("two") != "Plan  review" {
		t.Fatal("unsafe notification title")
	}
}
