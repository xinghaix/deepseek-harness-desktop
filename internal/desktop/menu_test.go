//go:build wails

package desktop

import (
	"os"
	"strings"
	"testing"

	"deepseek-harness-desktop/internal/i18n"

	"github.com/wailsapp/wails/v3/pkg/application"
)

type stubMenuController struct{}

func (stubMenuController) OpenManagement() error { return nil }
func (stubMenuController) OpenDSH() error        { return nil }
func (stubMenuController) RequestQuit() error    { return nil }

func TestApplicationMenuMergesDesktopActionsIntoHostMenu(t *testing.T) {
	locale := "zh-CN"
	openManagementLabel := i18n.T(locale, "menu.open_management")
	openChatLabel := i18n.T(locale, "menu.open_chat")
	quitLabel := i18n.T(locale, "menu.quit")
	aboutLabel := i18n.T(locale, "menu.about")
	servicesLabel := i18n.T(locale, "menu.services")
	hideLabel := i18n.T(locale, "menu.hide")
	hideOthersLabel := i18n.T(locale, "menu.hide_others")
	showAllLabel := i18n.T(locale, "menu.show_all")
	fileMenuLabel := i18n.T(locale, "menu.file")

	cases := []struct {
		goos     string
		host     string
		wantHost []string
	}{
		{
			goos: "darwin",
			host: appMenuLabel,
			wantHost: []string{
				aboutLabel, "-",
				openManagementLabel, openChatLabel, "-",
				servicesLabel, "-",
				hideLabel, hideOthersLabel, showAllLabel, "-",
				quitLabel,
			},
		},
		{
			goos:     "windows",
			host:     fileMenuLabel,
			wantHost: []string{openManagementLabel, openChatLabel, "-", quitLabel},
		},
		{
			goos:     "linux",
			host:     fileMenuLabel,
			wantHost: []string{openManagementLabel, openChatLabel, "-", quitLabel},
		},
	}
	for _, tc := range cases {
		t.Run(tc.goos, func(t *testing.T) {
			menu := newApplicationMenu(tc.goos, application.NewMenu, stubMenuController{}, func() {}, locale)
			if got := menu.ItemAt(0); got == nil || got.Label() != tc.host || !got.IsSubmenu() {
				t.Fatalf("host menu = %v, want submenu %q", labelOf(got), tc.host)
			}
			if tc.goos == "darwin" && menu.FindByRole(application.AppMenu) == nil {
				t.Fatal("macOS host menu must use the AppMenu role")
			}
			if item := menu.FindByLabel("设置"); item != nil {
				t.Fatal("must not keep a separate 设置 menu")
			}
			got := menuLabels(menu.ItemAt(0).GetSubmenu())
			if strings.Join(got, "|") != strings.Join(tc.wantHost, "|") {
				t.Fatalf("host items = %q, want %q", got, tc.wantHost)
			}
			openConfig := menu.FindByLabel(openManagementLabel)
			if openConfig == nil || openConfig.GetAccelerator() == "" {
				t.Fatal("打开桌面端配置 must keep CmdOrCtrl+,")
			}
			quit := menu.FindByLabel(quitLabel)
			if quit == nil || quit.GetAccelerator() == "" {
				t.Fatal("退出 must keep CmdOrCtrl+Q")
			}
			if edit := menu.ItemAt(1); edit == nil || edit.Label() != "Edit" || !edit.IsSubmenu() {
				t.Fatalf("second menu = %v, want Edit", labelOf(edit))
			}
		})
	}
}

func TestApplicationMenuDoesNotUseDefaultQuitRole(t *testing.T) {
	for _, goos := range []string{"darwin", "windows", "linux"} {
		menu := newApplicationMenu(goos, application.NewMenu, stubMenuController{}, func() {}, "en")
		if item := menu.FindByRole(application.Quit); item != nil {
			t.Fatalf("%s must not use the Wails Quit role, which skips busy-task confirmation", goos)
		}
	}
}

func TestMainWiresSharedApplicationMenu(t *testing.T) {
	raw, err := os.ReadFile(repoFile(t, "main.go"))
	if err != nil {
		t.Fatal(err)
	}
	source := string(raw)
	if !strings.Contains(source, "desktop.ApplicationMenu(") {
		t.Fatal("main must install the shared application menu")
	}
	if strings.Contains(source, `AddSubmenu("设置")`) {
		t.Fatal("main must not keep a separate 设置 submenu")
	}
}

func menuLabels(menu *application.Menu) []string {
	if menu == nil {
		return nil
	}
	var labels []string
	for i := 0; ; i++ {
		item := menu.ItemAt(i)
		if item == nil {
			return labels
		}
		if item.IsSeparator() {
			labels = append(labels, "-")
			continue
		}
		labels = append(labels, item.Label())
	}
}

func labelOf(item *application.MenuItem) string {
	if item == nil {
		return "<nil>"
	}
	return item.Label()
}
