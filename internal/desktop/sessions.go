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

// traySessionListRank: running (0) > error (1) > idle (2) so active sessions
// stay inside traySessionLimit even when UpdatedAt is stale.
func traySessionListRank(s dsh.BridgeSession) int {
	if s.Running {
		return 0
	}
	if s.Error {
		return 1
	}
	return 2
}

func selectTraySessions(all []dsh.BridgeSession, limit int) []dsh.BridgeSession {
	if limit <= 0 || len(all) == 0 {
		return nil
	}
	cp := append([]dsh.BridgeSession(nil), all...)
	sort.SliceStable(cp, func(i, j int) bool {
		ri, rj := traySessionListRank(cp[i]), traySessionListRank(cp[j])
		if ri != rj {
			return ri < rj
		}
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

func fullTraySessionTitle(s dsh.BridgeSession, untitled string) string {
	title := strings.TrimSpace(s.Title)
	if title != "" {
		return title
	}
	id := strings.TrimSpace(s.ID)
	if id == "" {
		if untitled == "" {
			return "Untitled"
		}
		return untitled
	}
	return id
}

func traySessionTitle(s dsh.BridgeSession, untitled string) string {
	title := fullTraySessionTitle(s, untitled)
	// Keep short IDs as-is when used as fallback titles.
	if strings.TrimSpace(s.Title) == "" {
		id := strings.TrimSpace(s.ID)
		if id != "" && utf8.RuneCountInString(id) > 8 {
			return string([]rune(id)[:8])
		}
		return title
	}
	return truncateRunes(title, traySessionTitleRunes)
}

// traySessionMenuLabel applies a compact left status column for non-idle rows.
// NSMenuItem SetBitmap is unreliable in macOS status-item menus (Wails
// setMenuItemBitmap has no setSize), so the title itself must carry the mark.
// Color must live in the title: NSMenu plain strings cannot tint ●.
// Use compact colored circle emoji (翠绿 running / 红 error) plus thin space;
// idle rows get a double em-space pad so titles stay roughly aligned.
// SetBitmap remains best-effort with matching emerald/red PNG pips.
const (
	traySessionMarkRunning = "🟢"
	traySessionMarkError   = "🔴"
	traySessionMarkPad     = "  "
	traySessionMarkGap     = " "
)

func traySessionMenuLabel(title, status string) string {
	if title == "" {
		title = "Untitled"
	}
	switch status {
	case "running":
		return traySessionMarkRunning + traySessionMarkGap + title
	case "error":
		return traySessionMarkError + traySessionMarkGap + title
	default:
		return traySessionMarkPad + traySessionMarkGap + title
	}
}

// formatTraySessionLabel is kept for callers that only know the running bit;
// prefer traySessionMenuLabel when error status is available.
func formatTraySessionLabel(title, runningLabel, idleLabel string, running bool) string {
	_ = runningLabel
	_ = idleLabel
	status := "idle"
	if running {
		status = "running"
	}
	return traySessionMenuLabel(title, status)
}

// traySessionStatus ranks icon priority: running > error > idle.
func traySessionStatus(running, err bool) string {
	if running {
		return "running"
	}
	if err {
		return "error"
	}
	return "idle"
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
