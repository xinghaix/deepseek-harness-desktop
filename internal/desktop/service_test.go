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
	raw, err := os.ReadFile(repoFile(t, "main.go"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(raw), "menu.AddRole(application.EditMenu)") {
		t.Fatal("application menu must expose the system Edit role")
	}
}

func TestConfigModalStaysAboveChatWindow(t *testing.T) {
	chat := ChatWindowOptions("http://127.0.0.1:12345/?token=test")
	modal := ConfigModalWindowOptions("/?manage=1&modal=1")
	if chat.Name != "dsh" || modal.Name != "main" {
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
	modal := ConfigModalWindowOptions("/?manage=1")
	if chat.Name != "dsh" || config.Name != "main" || modal.Name != "main" {
		t.Fatal("Chat must be a separate WebView from the config page")
	}
	if !modal.AlwaysOnTop || modal.Width >= chat.Width {
		t.Fatal("config over Chat must be a smaller always-on-top modal")
	}
	options := chat
	if options.Mac.TitleBar.ToolbarStyle != application.MacToolbarStyleUnifiedCompact {
		t.Fatalf("macOS Chat 应使用紧凑 unified 标题栏，得到 %v", options.Mac.TitleBar.ToolbarStyle)
	}
	if options.Mac.InvisibleTitleBarHeight != desktopNativeTopInset {
		t.Fatalf("macOS 注入安全区与原生标题栏高度不一致：%d != %d", options.Mac.InvisibleTitleBarHeight, desktopNativeTopInset)
	}
}
