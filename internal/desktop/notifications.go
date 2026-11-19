//go:build wails

package desktop

import (
	"crypto/rand"
	"encoding/json"
	"runtime"
	"slices"
	"strings"
	"sync"
	"sync/atomic"
	"time"
	"unicode"

	"deepseek-harness-desktop/internal/desktopstate"
	"deepseek-harness-desktop/internal/dsh"
	"deepseek-harness-desktop/internal/i18n"

	"github.com/wailsapp/wails/v3/pkg/application"
)

const (
	notificationTTL     = 24 * time.Hour
	notificationLimit   = 256
	notificationViewTTL = 8 * time.Second
)

type notificationKey struct{ sessionID, kind, key string }

type notificationTicket struct {
	request dsh.OpenSessionRequest
	key     notificationKey
	created time.Time
}

type notificationState struct {
	native    atomic.Pointer[nativeNotifications]
	mu        sync.Mutex
	active    map[string]bool
	tickets   map[string]notificationTicket
	seen      map[notificationKey]time.Time
	recent    []time.Time
	lastTest  time.Time
	visibleID string
	visibleAt time.Time
}

func notificationPrefs() (desktopstate.NotificationPrefs, error) {
	file, err := desktopstate.Load()
	return file.Prefs.EffectiveNotifications(), err
}

func notificationAvailable(status string) bool { return status == "available" || status == "unknown" }

func (a bridgeHostAdapter) NotificationSettings() (dsh.NotificationSettings, error) {
	prefs, err := notificationPrefs()
	native := a.service.notifications.native.Load()
	return dsh.NotificationSettings{
		NotificationPrefs: prefs,
		System:            native.status(),
		CanOpenSettings:   native != nil && (runtime.GOOS == "darwin" || runtime.GOOS == "windows"),
	}, err
}

func (a bridgeHostAdapter) SetNotificationPreference(key string, value bool) error {
	var candidate desktopstate.NotificationPrefs
	if !candidate.Set(key, value) {
		return i18n.ErrorfActive("bridge.err_not_allowed")
	}
	if err := desktopstate.Update(func(file *desktopstate.File) {
		prefs := file.Prefs.EffectiveNotifications()
		prefs.Set(key, value)
		file.Prefs.Notifications = &prefs
	}); err != nil {
		return i18n.ErrorfActive("notifications.save_failed")
	}
	return nil
}

func (a bridgeHostAdapter) NotificationAction(action string) error {
	s := a.service
	native := s.notifications.native.Load()
	if s.closing.Load() || native == nil {
		return i18n.ErrorfActive("notifications.unavailable")
	}
	if action == "open-system-settings" {
		if err := native.openSettings(); err != nil {
			return i18n.ErrorfActive("notifications.unavailable")
		}
		return nil
	}
	prefs, err := notificationPrefs()
	if err != nil || !prefs.Enabled {
		return i18n.ErrorfActive("notifications.disabled")
	}
	switch action {
	case "authorize":
		return native.authorize()
	case "test":
		return s.deliverNotification(dsh.OpenSessionRequest{Notification: "test"}, notificationKey{}, true)
	default:
		return i18n.ErrorfActive("bridge.err_not_allowed")
	}
}

func (a bridgeHostAdapter) ReportNotificationView(view dsh.NotificationView) {
	n := &a.service.notifications
	n.mu.Lock()
	n.visibleID, n.visibleAt = view.SessionID, time.Now()
	n.mu.Unlock()
}

func (a bridgeHostAdapter) ReportNotificationEvent(event dsh.NotificationEvent) {
	s := a.service
	n := &s.notifications
	if event.Kind == "running" {
		n.mu.Lock()
		if event.Closed {
			delete(n.active, event.SessionID)
		} else {
			if n.active == nil {
				n.active = make(map[string]bool)
			}
			if len(n.active) < notificationLimit {
				n.active[event.SessionID] = true
			}
		}
		n.mu.Unlock()
		return
	}
	kind := event.Kind
	if kind == "plan-review" {
		kind = "question"
	}
	key := notificationKey{sessionID: event.SessionID, kind: kind, key: event.Key}
	if event.Closed {
		if native := n.native.Load(); native != nil {
			for _, id := range n.settle(key) {
				go native.remove(id)
			}
		}
		return
	}
	if s.closing.Load() {
		return
	}
	prefs, err := notificationPrefs()
	if err != nil || !prefs.Allows(event.Kind) || !s.notificationSessionAllowed(event.SessionID) || s.notificationAlreadyVisible(event.SessionID) {
		return
	}
	request := dsh.OpenSessionRequest{SessionID: event.SessionID, Notification: event.Kind}
	_ = s.deliverNotification(request, key, false)
}

func (s *Service) notificationSessionAllowed(id string) bool {
	s.sessionsMu.Lock()
	defer s.sessionsMu.Unlock()
	for _, item := range s.sessions {
		if item.ID == id {
			return !item.Archived && !item.Blank && item.Origin != "subagent"
		}
	}
	return true // Host 已验证，会话目录可能尚未同步到桌面。
}

func (s *Service) notificationAlreadyVisible(id string) bool {
	n := &s.notifications
	n.mu.Lock()
	visible := id != "" && id == n.visibleID && time.Since(n.visibleAt) < notificationViewTTL
	n.mu.Unlock()
	if !visible {
		return false
	}
	app := application.Get()
	if app == nil {
		return false
	}
	chat, ok := app.Window.GetByName(chatWindowName)
	return ok && chat != nil && isNativeWindowShown(chat) && !chat.IsMinimised() && chat.IsFocused()
}

func (n *notificationState) reserve(ticket notificationTicket, test bool) string {
	n.mu.Lock()
	defer n.mu.Unlock()
	now := ticket.created
	if n.tickets == nil {
		n.tickets = make(map[string]notificationTicket)
		n.seen = make(map[notificationKey]time.Time)
	}
	if test {
		if now.Sub(n.lastTest) < 3*time.Second {
			return ""
		}
		n.lastTest = now
	} else {
		if since, ok := n.seen[ticket.key]; ok && now.Sub(since) < notificationTTL {
			return ""
		}
		n.recent = slices.DeleteFunc(n.recent, func(at time.Time) bool { return now.Sub(at) >= time.Minute })
		limit := 10
		if ticket.key.kind == "completed" {
			limit = 6
		}
		if len(n.recent) >= limit {
			return ""
		}
		n.recent = append(n.recent, now)
		if len(n.seen) >= notificationLimit {
			deleteOldest(n.seen, func(t time.Time) time.Time { return t })
		}
		n.seen[ticket.key] = now
	}
	if len(n.tickets) >= notificationLimit {
		deleteOldest(n.tickets, func(t notificationTicket) time.Time { return t.created })
	}
	id := rand.Text()
	n.tickets[id] = ticket
	return id
}

func deleteOldest[K comparable, V any](entries map[K]V, timestamp func(V) time.Time) {
	var oldest K
	var at time.Time
	for key, entry := range entries {
		if candidate := timestamp(entry); at.IsZero() || candidate.Before(at) {
			oldest, at = key, candidate
		}
	}
	if !at.IsZero() {
		delete(entries, oldest)
	}
}

func (n *notificationState) settle(key notificationKey) []string {
	n.mu.Lock()
	defer n.mu.Unlock()
	var ids []string
	for id, ticket := range n.tickets {
		if ticket.key == key && !ticket.request.Settled {
			ticket.request.Settled = true
			n.tickets[id] = ticket
			ids = append(ids, id)
		}
	}
	return ids
}

func (n *notificationState) take(id string, now time.Time) (dsh.OpenSessionRequest, bool) {
	n.mu.Lock()
	defer n.mu.Unlock()
	ticket, ok := n.tickets[id]
	delete(n.tickets, id)
	return ticket.request, ok && now.Sub(ticket.created) < notificationTTL
}

func (s *Service) handleNotificationProcessExit(unexpected bool) {
	n := &s.notifications
	n.mu.Lock()
	ids := make([]string, 0, len(n.active))
	for id := range n.active {
		ids = append(ids, id)
	}
	clear(n.active)
	n.visibleID = ""
	n.mu.Unlock()
	ids = slices.DeleteFunc(ids, func(id string) bool { return !s.notificationSessionAllowed(id) })
	prefs, err := notificationPrefs()
	if err != nil || !unexpected || !prefs.Allows("interrupted") || len(ids) == 0 || s.closing.Load() {
		return
	}
	slices.Sort(ids)
	request := dsh.OpenSessionRequest{Notification: "interrupted"}
	if len(ids) == 1 {
		request.SessionID = ids[0]
	} else {
		request.SessionIDs = ids
	}
	go func() {
		_ = s.deliverNotification(request, notificationKey{kind: "interrupted", key: rand.Text()}, false)
	}()
}

func (s *Service) deliverNotification(request dsh.OpenSessionRequest, key notificationKey, test bool) error {
	n := &s.notifications
	native := n.native.Load()
	if native == nil || !notificationAvailable(native.status()) {
		return i18n.ErrorfActive("notifications.unavailable")
	}
	id := n.reserve(notificationTicket{request: request, key: key, created: time.Now()}, test)
	if id == "" {
		if test {
			return i18n.ErrorfActive("notifications.try_again")
		}
		return nil
	}
	prefs, err := notificationPrefs()
	title, body := s.notificationText(request, err == nil && prefs.ShowTitle)
	if err := native.send(id, title, body); err != nil {
		n.take(id, time.Now())
		return i18n.ErrorfActive("notifications.send_failed")
	}
	n.mu.Lock()
	settled := n.tickets[id].request.Settled
	n.mu.Unlock()
	if settled {
		native.remove(id)
	}
	return nil
}

func (s *Service) notificationText(request dsh.OpenSessionRequest, showTitle bool) (title, body string) {
	if len(request.SessionIDs) > 1 {
		return i18n.TActive("notifications.native.multiple"), i18n.TActive("notifications.native.multiple_body")
	}
	if request.Notification == "test" {
		return i18n.TActive("notifications.native.test"), i18n.TActive("notifications.native.test_body")
	}
	// 普通通知保留事件标题，正文只放用户允许显示的会话标题；点击行为不变。
	title = i18n.TActive("notifications.native." + request.Notification)
	if showTitle && request.SessionID != "" {
		body = s.notificationSessionTitle(request.SessionID)
	}
	return title, body
}

func (s *Service) notificationSessionTitle(id string) string {
	s.sessionsMu.Lock()
	defer s.sessionsMu.Unlock()
	for _, item := range s.sessions {
		if item.ID != id || !item.ExplicitTitle {
			continue
		}
		label := strings.TrimSpace(strings.Map(func(r rune) rune {
			if unicode.IsControl(r) || unicode.Is(unicode.Cf, r) {
				return ' '
			}
			// Linux 通知正文允许简单标记；标题只作纯文本。
			switch r {
			case '<':
				return '‹'
			case '>':
				return '›'
			case '&':
				return '＆'
			}
			return r
		}, item.Title))
		if chars := []rune(label); len(chars) > 64 {
			label = string(chars[:63]) + "…"
		}
		return label
	}
	return ""
}

func (s *Service) activateNotification(id string) {
	request, ok := s.notifications.take(id, time.Now())
	if !ok || s.closing.Load() {
		return
	}
	request = s.pendingOpen.setRequest(request)
	go func() {
		if app := application.Get(); app != nil {
			if chat, found := app.Window.GetByName(chatWindowName); found && chat != nil {
				payload, _ := json.Marshal(request)
				chat.ExecJS(`window.__DSH_DESKTOP_OPEN_NOTIFICATION__?.(` + string(payload) + `);`)
				if chat.IsMinimised() {
					chat.UnMinimise()
				}
			}
		}
		s.revealChatFromTray()
	}()
}
