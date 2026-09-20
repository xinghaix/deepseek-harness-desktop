package desktop

import "deepseek-harness-desktop/internal/i18n"

// Only the three native window operations needed by Chat are exposed here.
// In particular, close must invoke Close so the existing close hooks decide
// whether to hide to tray or close; Hide and Quit would bypass that policy.
type chatWindowCallbacks struct {
	minimise       func()
	toggleMaximise func()
	close          func()
}

func runChatWindowAction(action string, existingChat func() (chatWindowCallbacks, error), settings, dismissConfig func() error) error {
	// Validate again at the native boundary, independently of the HTTP route.
	switch action {
	case "minimize", "maximize", "close", "settings", "dismiss-config":
	default:
		return i18n.ErrorfActive("bridge.err_not_allowed")
	}
	chat, err := existingChat()
	if err != nil {
		return err
	}
	switch action {
	case "minimize":
		chat.minimise()
	case "maximize":
		chat.toggleMaximise()
	case "close":
		chat.close()
	case "settings":
		return settings()
	case "dismiss-config":
		return dismissConfig()
	}
	return nil
}
