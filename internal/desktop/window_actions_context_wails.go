//go:build wails

package desktop

import (
	"deepseek-harness-desktop/internal/dsh"
	"deepseek-harness-desktop/internal/i18n"
	"fmt"
	"runtime"

	"github.com/wailsapp/wails/v3/pkg/application"
)

func (a bridgeHostAdapter) ShowChatContextMenu(request dsh.ChatContextMenuRequest) error {
	return runChatContextMenu(request, func(id string, x, y int, data string) error {
		// macOS keeps WKWebView's native menu and its system services.
		if runtime.GOOS == "darwin" {
			return i18n.ErrorfActive("bridge.err_not_allowed")
		}
		if a.service == nil {
			return i18n.ErrorfActive("err.app_not_ready")
		}
		app, err := desktopApp()
		if err != nil {
			return err
		}
		window, ok := app.Window.GetByName(chatWindowName)
		chat, isWebview := window.(*application.WebviewWindow)
		if !ok || !isWebview || chat == nil {
			return fmt.Errorf("%s: %s", i18n.TActive("err.reopen_chat_failed"), i18n.TActive("menu.open_chat"))
		}
		registerExternalContextMenus()
		chat.OpenContextMenu(&application.ContextMenuData{Id: id, X: x, Y: y, Data: data})
		return nil
	})
}
