//go:build wails && (darwin || linux || windows)

package desktop

import (
	"context"
	"runtime"
	"sync/atomic"

	"deepseek-harness-desktop/internal/i18n"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/services/notifications"
)

type nativeNotifications struct {
	service       *notifications.NotificationService
	startupStatus string
	authorizing   atomic.Bool
}

// StartNotifications 在 Wails 生命周期中初始化原生模块，但不将其方法绑定给 WebView。
func (s *Service) StartNotifications(ctx context.Context) {
	var startupStatus string
	if runtime.GOOS == "linux" {
		startupStatus = platformNotificationStatus()
		if !notificationAvailable(startupStatus) {
			// Wails 在缺少 actions 时会把关闭通知解释为点击；不可启用该路径。
			s.notifications.native.Store(&nativeNotifications{startupStatus: startupStatus})
			return
		}
	}
	native := notifications.New()
	if err := native.ServiceStartup(ctx, application.ServiceOptions{}); err != nil {
		return
	}
	native.OnNotificationResponse(func(result notifications.NotificationResult) {
		if result.Error != nil {
			return
		}
		response := result.Response
		switch response.ActionIdentifier {
		case notifications.DefaultActionIdentifier, "com.apple.UNNotificationDefaultActionIdentifier":
			s.activateNotification(response.ID)
		}
	})
	s.notifications.native.Store(&nativeNotifications{service: native})
}

func (s *Service) stopNotifications() {
	if native := s.notifications.native.Swap(nil); native != nil && native.service != nil {
		native.service.OnNotificationResponse(nil)
		_ = native.service.ServiceShutdown()
	}
}

func (n *nativeNotifications) status() string {
	if n == nil {
		return "unavailable"
	}
	if n.startupStatus != "" {
		return n.startupStatus
	}
	if n.authorizing.Load() {
		return "authorizing"
	}
	return platformNotificationStatus()
}

func (n *nativeNotifications) authorize() error {
	if n.status() != "permission" || !n.authorizing.CompareAndSwap(false, true) {
		return nil
	}
	go func() {
		defer n.authorizing.Store(false)
		_, _ = n.service.RequestNotificationAuthorization()
	}()
	return nil
}

func (n *nativeNotifications) openSettings() error {
	app, err := desktopApp()
	if err != nil {
		return err
	}
	switch runtime.GOOS {
	case "darwin":
		return app.Browser.OpenURL("x-apple.systempreferences:com.apple.Notifications-Settings.extension")
	case "windows":
		return app.Browser.OpenURL("ms-settings:notifications")
	default:
		return i18n.ErrorfActive("notifications.unavailable")
	}
}

func (n *nativeNotifications) send(id, title, body string) error {
	return n.service.SendNotification(notifications.NotificationOptions{ID: id, Title: title, Body: body})
}

func (n *nativeNotifications) remove(id string) {
	_ = n.service.RemoveNotification(id)
}
