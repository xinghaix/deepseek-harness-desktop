//go:build wails

package desktop

import (
	"deepseek-harness-desktop/internal/i18n"
	"fmt"
)

// chatWindowAction never creates or selects an arbitrary window. The same
// adapter is used on Windows, Linux and macOS.
func (a bridgeHostAdapter) ChatWindowAction(action string) error {
	return runChatWindowAction(action, func() (chatWindowCallbacks, error) {
		if a.service == nil {
			return chatWindowCallbacks{}, i18n.ErrorfActive("err.app_not_ready")
		}
		app, err := desktopApp()
		if err != nil {
			return chatWindowCallbacks{}, err
		}
		chat, ok := app.Window.GetByName(chatWindowName)
		if !ok || chat == nil {
			return chatWindowCallbacks{}, fmt.Errorf("%s: %s", i18n.TActive("err.reopen_chat_failed"), i18n.TActive("menu.open_chat"))
		}
		return chatWindowCallbacks{minimise: func() { chat.Minimise() }, toggleMaximise: func() { chat.ToggleMaximise() }, close: func() { chat.Close() }}, nil
	}, func() error { return a.service.OpenManagement() }, func() error { return a.service.TryDismissConfig() })
}
