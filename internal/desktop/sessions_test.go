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
	if got[0].ID != "newer" || got[1].ID != "busy" || got[2].ID != "mid" {
		t.Fatalf("order = %v", []string{got[0].ID, got[1].ID, got[2].ID})
	}
	if selectTraySessions(all, 0) != nil {
		t.Fatal("limit 0 must hide the list")
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
	if got := formatTraySessionLabel("My task", "运行中", "空闲", true); got != "My task · 运行中" {
		t.Fatalf("running label: %q", got)
	}
	if got := formatTraySessionLabel("My task", "运行中", "空闲", false); got != "My task" {
		t.Fatalf("idle label should omit status: %q", got)
	}
	long := strings.Repeat("标题", 30)
	if got := traySessionTitle(dsh.BridgeSession{Title: long}, "未命名"); utf8.RuneCountInString(got) != traySessionTitleRunes || !strings.HasSuffix(got, "…") {
		t.Fatalf("title truncate runes=%d got=%q", utf8.RuneCountInString(got), got)
	}
	if got := fullTraySessionTitle(dsh.BridgeSession{Title: long}, "未命名"); got != long {
		t.Fatalf("full title must not truncate")
	}
}
