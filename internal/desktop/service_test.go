//go:build wails && (linux || darwin)

package desktop

import (
	"os"
	"runtime"
	"strings"
	"testing"

	"github.com/wailsapp/wails/v3/pkg/application"
)

func TestApplicationMenuProvidesSystemEditShortcuts(t *testing.T) {
	raw, err := os.ReadFile(repoFile(t, "internal", "desktop", "menu.go"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(raw), "menu.AddRole(application.EditMenu)") {
		t.Fatal("application menu must expose the system Edit role")
	}
}

func TestConfigModalStaysAboveChatWindow(t *testing.T) {
	chat := ChatWindowOptions("http://127.0.0.1:12345/?token=test")
	modal := ConfigModalWindowOptions("/?manage=1&modal=1", "zh-CN")
	if chat.Name != chatWindowName || modal.Name != configWindowName {
		t.Fatal("Chat must be a separate WebView from the config modal")
	}
	if !modal.AlwaysOnTop || modal.Width >= chat.Width {
		t.Fatal("config over Chat must be a smaller always-on-top modal")
	}
	if !modal.Frameless || modal.CloseButtonState != application.ButtonHidden {
		t.Fatal("config modal over Chat must not show traffic lights or window chrome")
	}
	if runtime.GOOS == "darwin" && modal.Mac.CornerRadius == 0 {
		t.Fatal("macOS config modal must use a custom corner radius so Wails does not keep AppKit traffic lights")
	}
	if runtime.GOOS == "darwin" && ManagementWindowOptions("/").Frameless {
		t.Fatal("first-run setup window should keep native traffic lights")
	}
}

func TestMacChatWindowUsesCompactTitlebarInset(t *testing.T) {
	if runtime.GOOS != "darwin" {
		t.Skip("macOS 标题栏配置仅适用于 darwin")
	}
	chat := ChatWindowOptions("http://127.0.0.1:12345/?token=test")
	config := ManagementWindowOptions("/")
	modal := ConfigModalWindowOptions("/?manage=1", "zh-CN")
	if chat.Name != chatWindowName || config.Name != setupWindowName || modal.Name != configWindowName {
		t.Fatal("Chat, first-run setup, and config modal must be separate windows")
	}
	if !modal.AlwaysOnTop || modal.Width >= chat.Width {
		t.Fatal("config over Chat must be a smaller always-on-top modal")
	}
	options := chat
	if options.Mac.TitleBar.ToolbarStyle != application.MacToolbarStyleUnifiedCompact {
		t.Fatalf("macOS Chat 应使用紧凑 unified 标题栏，得到 %v", options.Mac.TitleBar.ToolbarStyle)
	}
	if options.Mac.InvisibleTitleBarHeight != desktopNativeTopInset {
		t.Fatalf("macOS Chat 必须保留 InvisibleTitleBarHeight=%d（原生拖拽条，见 Wails frameless 文档），得到 %d", desktopNativeTopInset, options.Mac.InvisibleTitleBarHeight)
	}
	if config.Mac.InvisibleTitleBarHeight != desktopNativeTopInset {
		t.Fatalf("macOS 配置窗仍应保留 InvisibleTitleBarHeight=%d，得到 %d", desktopNativeTopInset, config.Mac.InvisibleTitleBarHeight)
	}
	rawService, err := os.ReadFile(repoFile(t, "internal", "desktop", "service.go"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(rawService), "func (d *Service) ToggleChatZoom()") {
		t.Fatal("must expose ToggleChatZoom for chrome maximize button")
	}
}

func TestCloseToTrayHookHidesInsteadOfQuit(t *testing.T) {
	raw, err := os.ReadFile(repoFile(t, "internal", "desktop", "service.go"))
	if err != nil {
		t.Fatal(err)
	}
	src := string(raw)
	if !strings.Contains(src, "closeToTray") || !strings.Contains(src, "hideToTray") {
		t.Fatal("Chat WindowClosing must hide to tray when closeToTray is enabled")
	}
	if !strings.Contains(src, "Mac.WindowShouldClose") || !strings.Contains(src, "Windows.WindowClosing") || !strings.Contains(src, "Linux.WindowDeleteEvent") {
		t.Fatal("close-to-tray must bind platform-native close events on darwin/windows/linux")
	}
	tray, err := os.ReadFile(repoFile(t, "internal", "desktop", "tray.go"))
	if err != nil {
		t.Fatal(err)
	}
	traySrc := string(tray)
	if !strings.Contains(traySrc, "app.SystemTray.New()") {
		t.Fatal("must create the tray with Wails SystemTray.New")
	}
	if !strings.Contains(traySrc, "SetIcon") {
		t.Fatal("tray must use SetIcon for the colorful app icon")
	}
}

func TestCloseChatToTrayHidesWithoutQuit(t *testing.T) {
	tray, err := os.ReadFile(repoFile(t, "internal", "desktop", "tray.go"))
	if err != nil {
		t.Fatal(err)
	}
	traySrc := string(tray)
	if !strings.Contains(traySrc, "func (d *Service) CloseChatToTray()") {
		t.Fatal("must expose CloseChatToTray for Cmd/Ctrl+W")
	}
	if !strings.Contains(traySrc, "ensureTrayForHide") {
		t.Fatal("CloseChatToTray must ensure tray even when closeToTray is off")
	}
	// CloseChatToTray body must not call RequestQuit.
	idx := strings.Index(traySrc, "func (d *Service) CloseChatToTray()")
	if idx < 0 {
		t.Fatal("CloseChatToTray missing")
	}
	rest := traySrc[idx:]
	end := strings.Index(rest, "\nfunc ")
	if end > 0 {
		rest = rest[:end]
	}
	if strings.Contains(rest, "RequestQuit") {
		t.Fatal("CloseChatToTray must not RequestQuit (W hides; Q quits)")
	}
	if !strings.Contains(rest, "hideToTray") {
		t.Fatal("CloseChatToTray must call hideToTray")
	}

	menu, err := os.ReadFile(repoFile(t, "internal", "desktop", "menu.go"))
	if err != nil {
		t.Fatal(err)
	}
	menuSrc := string(menu)
	if !strings.Contains(menuSrc, `SetAccelerator("CmdOrCtrl+w")`) {
		t.Fatal("menu must bind CmdOrCtrl+w to Close Window")
	}
	if !strings.Contains(menuSrc, "CloseChatToTray") {
		t.Fatal("Close Window menu path must call CloseChatToTray, not RequestQuit")
	}
	if !strings.Contains(menuSrc, `SetAccelerator("CmdOrCtrl+q")`) {
		t.Fatal("quit must keep CmdOrCtrl+q")
	}
}
