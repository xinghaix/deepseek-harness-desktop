package desktop

import (
	"deepseek-harness-desktop/internal/dsh"
	"deepseek-harness-desktop/internal/i18n"
	"encoding/json"
)

// Derive menu identity from sanitized content, never from renderer-supplied IDs.
func runChatContextMenu(request dsh.ChatContextMenuRequest, open func(id string, x, y int, data string) error) error {
	if err := request.Validate(); err != nil {
		return err
	}
	raw, err := json.Marshal(contextPayload{Text: request.Text, Href: request.Href})
	if err != nil {
		return err
	}
	payload := parseContextPayload(string(raw))
	var id string
	switch {
	case payload.Text != "" && payload.Href != "":
		id = contextMenuBoth
	case payload.Text != "":
		id = contextMenuSearch
	case payload.Href != "":
		id = contextMenuLink
	default:
		return i18n.ErrorfActive("bridge.err_not_allowed")
	}
	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	return open(id, request.X, request.Y, string(data))
}
