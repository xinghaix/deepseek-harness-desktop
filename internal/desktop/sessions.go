package desktop

import (
	"sort"
	"strings"
	"unicode/utf8"

	"deepseek-harness-desktop/internal/dsh"
)

const (
	defaultTraySessionLimit = 5
	maxTraySessionLimit     = 20
	traySessionTitleRunes   = 36
)

func clampTraySessionLimit(n int) int {
	if n < 0 {
		return 0
	}
	if n > maxTraySessionLimit {
		return maxTraySessionLimit
	}
	return n
}

func selectTraySessions(all []dsh.BridgeSession, limit int) []dsh.BridgeSession {
	if limit <= 0 || len(all) == 0 {
		return nil
	}
	cp := append([]dsh.BridgeSession(nil), all...)
	sort.SliceStable(cp, func(i, j int) bool {
		if cp[i].UpdatedAt != cp[j].UpdatedAt {
			return cp[i].UpdatedAt > cp[j].UpdatedAt
		}
		return cp[i].ID < cp[j].ID
	})
	if len(cp) > limit {
		cp = cp[:limit]
	}
	return cp
}

func traySessionTitle(s dsh.BridgeSession, untitled string) string {
	title := strings.TrimSpace(s.Title)
	if title != "" {
		return truncateRunes(title, traySessionTitleRunes)
	}
	id := strings.TrimSpace(s.ID)
	if id == "" {
		if untitled == "" {
			return "Untitled"
		}
		return untitled
	}
	if utf8.RuneCountInString(id) > 8 {
		return string([]rune(id)[:8])
	}
	return id
}

func formatTraySessionLabel(title, runningLabel, idleLabel string, running bool) string {
	status := idleLabel
	if running {
		status = runningLabel
	}
	if title == "" {
		title = "Untitled"
	}
	return title + " · " + status
}

func truncateRunes(s string, n int) string {
	if n <= 0 || s == "" {
		return ""
	}
	if utf8.RuneCountInString(s) <= n {
		return s
	}
	r := []rune(s)
	if n == 1 {
		return "…"
	}
	return string(r[:n-1]) + "…"
}
