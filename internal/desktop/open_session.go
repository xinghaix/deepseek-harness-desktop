package desktop

import (
	"encoding/json"
	"strconv"
	"strings"
	"sync"

	"deepseek-harness-desktop/internal/dsh"
)

// Chat CustomEvent name dispatched into the WebView so the desktop-bridge
// client can call ctx.uiWorkspace.openSession (official DSH UI navigation).
const openChatSessionEvent = "dsh-desktop-open-session"

type pendingOpenSession struct {
	mu       sync.Mutex
	id       string
	sequence uint64
}

func normalizeSessionID(id string) string {
	return strings.TrimSpace(id)
}

func (p *pendingOpenSession) set(id string) uint64 {
	id = normalizeSessionID(id)
	p.mu.Lock()
	defer p.mu.Unlock()
	p.sequence++
	p.id = id
	return p.sequence
}

func (p *pendingOpenSession) peek() string {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.id
}

func (p *pendingOpenSession) claim() string {
	return p.claimRequest().SessionID
}

func (p *pendingOpenSession) claimRequest() dsh.OpenSessionRequest {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.id == "" {
		return dsh.OpenSessionRequest{}
	}
	request := dsh.OpenSessionRequest{SessionID: p.id, RequestID: p.sequence}
	p.id = ""
	return request
}

func openChatSessionJS(id string, requestIDs ...uint64) string {
	var requestID uint64
	if len(requestIDs) > 0 {
		requestID = requestIDs[0]
	}
	id = normalizeSessionID(id)
	if id == "" {
		return ""
	}
	payload, err := json.Marshal(id)
	if err != nil {
		return ""
	}
	// Prefer the in-page function (same evaluateJavaScript turn as dsh-context's
	// click handler). CustomEvent remains the fallback before apply() installs it.
	return `(function(){try{var id=` + string(payload) + `;var requestId=` + strconv.FormatUint(requestID, 10) + `;window.__DSH_DESKTOP_OPEN_SESSION_PENDING__=id;window.__DSH_DESKTOP_OPEN_SESSION_PENDING_REQUEST_ID__=requestId;var open=window.__DSH_DESKTOP_OPEN_SESSION__;if(typeof open==="function")open(id,requestId);else {var event=new CustomEvent("` + openChatSessionEvent + `",{detail:id});event.desktopRequestId=requestId;window.dispatchEvent(event);}}catch(_){}})();`
}
