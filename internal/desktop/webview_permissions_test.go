//go:build wails

package desktop

import (
	"os"
	"strings"
	"testing"

	"github.com/wailsapp/wails/v3/pkg/application"
)

func TestChatWebviewAllowsMicrophoneOnly(t *testing.T) {
	chat := ChatWindowOptions("http://127.0.0.1:12345/?token=test")
	mgmt := ManagementWindowOptions("/")
	modal := ConfigModalWindowOptions("/?manage=1&modal=1", "zh-CN")

	if got := chat.Permissions[application.PermissionMicrophone]; got != application.PermissionDefault {
		t.Fatalf("Chat microphone policy: got %v, want PermissionDefault (OS/WebView prompt)", got)
	}
	for _, kind := range []application.PermissionType{
		application.PermissionCamera,
		application.PermissionGeolocation,
		application.PermissionNotifications,
		application.PermissionClipboardRead,
	} {
		if chat.Permissions[kind] != application.PermissionDeny {
			t.Fatalf("Chat must still deny %v", kind)
		}
	}
	for _, opts := range []application.WebviewWindowOptions{mgmt, modal} {
		if opts.Permissions[application.PermissionMicrophone] != application.PermissionDeny {
			t.Fatalf("%s must deny microphone", opts.Name)
		}
	}
}

func TestDarwinMicUsageDescriptionAndAudioEntitlement(t *testing.T) {
	plist, err := os.ReadFile(repoFile(t, "assets", "darwin", "Info.plist"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(plist), "NSMicrophoneUsageDescription") {
		t.Fatal("macOS Info.plist must declare NSMicrophoneUsageDescription so WKWebView exposes navigator.mediaDevices")
	}
	ent, err := os.ReadFile(repoFile(t, "assets", "darwin", "entitlements.plist"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(ent), "com.apple.security.device.audio-input") {
		t.Fatal("darwin entitlements must allow device.audio-input for hardened-runtime production signing")
	}
}
