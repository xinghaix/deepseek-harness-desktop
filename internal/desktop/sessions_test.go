package desktop

import (
	"strings"
	"testing"
	"unicode/utf8"

	"deepseek-harness-desktop/internal/dsh"
)

func TestClampTraySessionLimit(t *testing.T) {
	cases := []struct {
		in, want int
	}{
		{-3, 0},
		{0, 0},
		{1, 1},
		{5, 5},
		{20, 20},
		{21, 20},
		{99, 20},
	}
	for _, tc := range cases {
		if got := clampTraySessionLimit(tc.in); got != tc.want {
			t.Fatalf("clamp(%d) = %d, want %d", tc.in, got, tc.want)
		}
	}
}

func TestSelectTraySessionsSortsAndTruncates(t *testing.T) {
	all := []dsh.BridgeSession{
		{ID: "old", Title: "Old", UpdatedAt: 10, Running: false},
		{ID: "busy", Title: "Busy", UpdatedAt: 30, Running: true},
		{ID: "mid", Title: "Mid", UpdatedAt: 20, Running: false},
		{ID: "newer", Title: "Newer", UpdatedAt: 40, Running: false},
	}
	got := selectTraySessions(all, 3)
	if len(got) != 3 {
		t.Fatalf("len = %d, want 3", len(got))
	}
	// running first, then UpdatedAt among the rest
	if got[0].ID != "busy" || got[1].ID != "newer" || got[2].ID != "mid" {
		t.Fatalf("order = %v", []string{got[0].ID, got[1].ID, got[2].ID})
	}
	if selectTraySessions(all, 0) != nil {
		t.Fatal("limit 0 must hide the list")
	}
}

func TestOpenChatSessionJSEncodesID(t *testing.T) {
	got := openChatSessionJS("session-4514df73-e4a8-4326-a8c7-747860b4a4de")
	if !strings.Contains(got, `new CustomEvent("`+openChatSessionEvent+`"`) {
		t.Fatalf("missing event name: %s", got)
	}
	if !strings.Contains(got, `"session-4514df73-e4a8-4326-a8c7-747860b4a4de"`) {
		t.Fatalf("id must be JSON-encoded: %s", got)
	}
	if !strings.Contains(got, `window.__DSH_DESKTOP_OPEN_SESSION_PENDING__=id`) {
		t.Fatalf("missing pending marker: %s", got)
	}
	if !strings.Contains(got, `window.__DSH_DESKTOP_OPEN_SESSION__`) {
		t.Fatalf("missing same-turn open function: %s", got)
	}
	if openChatSessionJS("  ") != "" || openChatSessionJS("") != "" {
		t.Fatal("empty id must not emit JS")
	}
	quoted := openChatSessionJS(`sess"id`)
	if !strings.Contains(quoted, `sess\"id`) {
		t.Fatalf("quotes must be escaped: %s", quoted)
	}
}

func TestPendingOpenSessionRequestIdentity(t *testing.T) {
	var p pendingOpenSession
	first := p.set("same-session")
	claimed := p.claimRequest()
	if claimed.SessionID != "same-session" || claimed.RequestID != first || first == 0 {
		t.Fatalf("claim must carry first click identity: %#v, first=%d", claimed, first)
	}
	second := p.set("same-session")
	if second <= first {
		t.Fatalf("same-ID click needs a newer identity: %d <= %d", second, first)
	}
	// Completing the earlier claim cannot consume a click queued afterwards.
	newer := p.claimRequest()
	if newer.SessionID != "same-session" || newer.RequestID != second {
		t.Fatalf("new click lost after earlier claim: %#v", newer)
	}
	if empty := p.claimRequest(); empty.SessionID != "" || empty.RequestID != 0 {
		t.Fatalf("claim did not drain atomically: %#v", empty)
	}
}

func TestPendingOpenSessionClaimDrains(t *testing.T) {
	var p pendingOpenSession
	p.set("  session-abc  ")
	if got := p.claim(); got != "session-abc" {
		t.Fatalf("claim = %q", got)
	}
	if got := p.claim(); got != "" {
		t.Fatalf("second claim = %q, want empty", got)
	}
	p.set("")
	if got := p.claim(); got != "" {
		t.Fatalf("empty set should claim empty, got %q", got)
	}
}

func TestSelectTraySessionsDropsBlank(t *testing.T) {
	all := []dsh.BridgeSession{
		{ID: "blank-new", Title: "dsh-sol-pi", UpdatedAt: 200, Blank: true},
		{ID: "real-new", Title: "接入快手", UpdatedAt: 150},
		{ID: "blank-run", Title: "workspace", UpdatedAt: 180, Blank: true, Running: true},
		{ID: "real-old", Title: "SoL-Pi", UpdatedAt: 10},
		{ID: "blank-err", Title: "empty", UpdatedAt: 190, Blank: true, Error: true},
	}
	got := selectTraySessions(all, 5)
	if len(got) != 2 || got[0].ID != "real-new" || got[1].ID != "real-old" {
		ids := make([]string, len(got))
		for i, s := range got {
			ids[i] = s.ID
		}
		t.Fatalf("blank sessions must be dropped, got %v", ids)
	}
	if selectTraySessions([]dsh.BridgeSession{{ID: "b", Title: "dsh-sol-pi", Blank: true}}, 5) != nil {
		t.Fatal("blank-only list must hide the recent-sessions section")
	}
}

func TestSelectTraySessionsDropsArchivedAndDuplicateIDs(t *testing.T) {
	all := []dsh.BridgeSession{
		{ID: "visible", Title: "same title", UpdatedAt: 30},
		{ID: "visible", Title: "same title", UpdatedAt: 20},
		{ID: "archived", Title: "same title", UpdatedAt: 40, Archived: true},
		{ID: "subagent", Title: "same title", UpdatedAt: 60, Origin: "subagent"},
		{ID: "", Title: "invalid", UpdatedAt: 50},
	}
	got := selectTraySessions(all, 5)
	if len(got) != 1 || got[0].ID != "visible" {
		t.Fatalf("archived/subagent/duplicate/invalid rows must be removed, got %+v", got)
	}
}

func TestSelectTraySessionsPrefersRunningAndError(t *testing.T) {
	all := []dsh.BridgeSession{
		{ID: "idle-new", Title: "IdleNew", UpdatedAt: 100},
		{ID: "idle-mid", Title: "IdleMid", UpdatedAt: 90},
		{ID: "idle-old", Title: "IdleOld", UpdatedAt: 80},
		{ID: "err-stale", Title: "Err", UpdatedAt: 5, Error: true},
		{ID: "run-stale", Title: "Run", UpdatedAt: 1, Running: true},
	}
	got := selectTraySessions(all, 3)
	if len(got) != 3 {
		t.Fatalf("len = %d, want 3", len(got))
	}
	if got[0].ID != "run-stale" || got[1].ID != "err-stale" || got[2].ID != "idle-new" {
		t.Fatalf("priority order = %v", []string{got[0].ID, got[1].ID, got[2].ID})
	}
	// running wins over error even when error is newer
	mixed := []dsh.BridgeSession{
		{ID: "e", UpdatedAt: 50, Error: true},
		{ID: "r", UpdatedAt: 10, Running: true},
	}
	got2 := selectTraySessions(mixed, 2)
	if got2[0].ID != "r" || got2[1].ID != "e" {
		t.Fatalf("running before error: %v %v", got2[0].ID, got2[1].ID)
	}
}

func TestTraySessionTitleFallback(t *testing.T) {
	if got := traySessionTitle(dsh.BridgeSession{Title: "  My task  ", ID: "abc"}, "Untitled"); got != "My task" {
		t.Fatalf("prefer title: %q", got)
	}
	if got := traySessionTitle(dsh.BridgeSession{ID: "abcdefghij"}, "Untitled"); got != "abcdefgh" {
		t.Fatalf("short id: %q", got)
	}
	if got := traySessionTitle(dsh.BridgeSession{}, "未命名"); got != "未命名" {
		t.Fatalf("untitled: %q", got)
	}
	if got := traySessionMenuLabel("My task", "running"); got != "🟢 My task" {
		t.Fatalf("running prefix: %q", got)
	}
	if got := traySessionMenuLabel("My task", "error"); got != "🔴 My task" {
		t.Fatalf("error prefix: %q", got)
	}
	if got := traySessionMenuLabel("My task", "idle"); got != "My task" {
		t.Fatalf("idle unmarked: %q", got)
	}
	if got := traySessionMenuLabel("", "running"); got != "🟢 Untitled" {
		t.Fatalf("empty title fallback: %q", got)
	}
	if got := formatTraySessionLabel("My task", "运行中", "空闲", true); got != "🟢 My task" {
		t.Fatalf("formatTray running: %q", got)
	}
	if got := formatTraySessionLabel("My task", "运行中", "空闲", false); got != "My task" {
		t.Fatalf("formatTray idle: %q", got)
	}
	if got := traySessionStatus(true, true); got != "running" {
		t.Fatalf("running wins over error: %q", got)
	}
	if got := traySessionStatus(false, true); got != "error" {
		t.Fatalf("error status: %q", got)
	}
	if got := traySessionStatus(false, false); got != "idle" {
		t.Fatalf("idle status: %q", got)
	}
	long := strings.Repeat("标题", 30)
	if got := traySessionTitle(dsh.BridgeSession{Title: long}, "未命名"); utf8.RuneCountInString(got) != traySessionTitleRunes || !strings.HasSuffix(got, "…") {
		t.Fatalf("title truncate runes=%d got=%q", utf8.RuneCountInString(got), got)
	}
	if got := fullTraySessionTitle(dsh.BridgeSession{Title: long}, "未命名"); got != long {
		t.Fatalf("full title must not truncate")
	}
}

