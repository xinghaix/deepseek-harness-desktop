package desktop

import (
	"encoding/json"
	"strings"
	"sync"
)

// Chat CustomEvent name dispatched into the WebView so the desktop-bridge
// client can call ctx.uiWorkspace.openSession (official DSH UI navigation).
const openChatSessionEvent = "dsh-desktop-open-session"

type pendingOpenSession struct {
	mu sync.Mutex
	id string
}

func normalizeSessionID(id string) string {
	return strings.TrimSpace(id)
}

func (p *pendingOpenSession) set(id string) {
	id = normalizeSessionID(id)
	p.mu.Lock()
	defer p.mu.Unlock()
	p.id = id
}

func (p *pendingOpenSession) claim() string {
	p.mu.Lock()
	defer p.mu.Unlock()
	id := p.id
	p.id = ""
	return id
}

func openChatSessionJS(id string) string {
	id = normalizeSessionID(id)
	if id == "" {
		return ""
	}
	payload, err := json.Marshal(id)
	if err != nil {
		return ""
	}
	return `(function(){try{var id=` + string(payload) + `;window.__DSH_DESKTOP_OPEN_SESSION_PENDING__=id;window.dispatchEvent(new CustomEvent("` + openChatSessionEvent + `",{detail:id}));}catch(_){}})();`
}
