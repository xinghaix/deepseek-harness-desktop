//go:build wails

package desktop

import (
	"log"
	"runtime"

	"deepseek-harness-desktop/internal/i18n"

	"github.com/wailsapp/wails/v3/pkg/application"
)

const appMenuLabel = "Deepseek Harness Desktop"

type menuController interface {
	OpenManagement() error
	OpenDSH() error
	RequestQuit() error
}

type localeResolver interface {
	resolvedLocale() string
}

// ApplicationMenu 把桌面端动作放进各平台的宿主菜单，不再单独挂一个「设置」。
// macOS 的第一个菜单就是应用菜单；Windows / Linux 没有 AppMenu role，改用「文件」。
func ApplicationMenu(app *application.App, controller menuController) *application.Menu {
	if app == nil {
		return nil
	}
	locale := "en"
	if lr, ok := controller.(localeResolver); ok {
		if l := lr.resolvedLocale(); l != "" {
			locale = l
		}
	}
	return newApplicationMenu(runtime.GOOS, app.NewMenu, controller, app.Quit, locale)
}

func newApplicationMenu(goos string, newMenu func() *application.Menu, controller menuController, quitFallback func(), locale string) *application.Menu {
	menu := newMenu()
	host := menu.AddSubmenu(hostMenuLabel(goos, locale))
	if goos == "darwin" {
		if item := menu.FindByLabel(appMenuLabel); item != nil {
			item.SetRole(application.AppMenu)
		}
		addRoleItem(host, i18n.T(locale, "menu.about"), "", application.About)
		host.AddSeparator()
	}
	addDesktopActions(host, controller, locale)
	if goos == "darwin" {
		host.AddSeparator()
		host.AddRole(application.ServicesMenu)
		if item := host.FindByRole(application.ServicesMenu); item != nil {
			item.SetLabel(i18n.T(locale, "menu.services"))
		}
		host.AddSeparator()
		addRoleItem(host, i18n.T(locale, "menu.hide"), "CmdOrCtrl+h", application.Hide)
		addRoleItem(host, i18n.T(locale, "menu.hide_others"), "CmdOrCtrl+OptionOrAlt+h", application.HideOthers)
		addRoleItem(host, i18n.T(locale, "menu.show_all"), "", application.ShowAll)
	}
	host.AddSeparator()
	addQuit(host, controller, quitFallback, locale)
	menu.AddRole(application.EditMenu)
	return menu
}

func hostMenuLabel(goos, locale string) string {
	if goos == "darwin" {
		return appMenuLabel
	}
	return i18n.T(locale, "menu.file")
}

func addDesktopActions(menu *application.Menu, controller menuController, locale string) {
	openManagement := i18n.T(locale, "menu.open_management")
	openChat := i18n.T(locale, "menu.open_chat")
	menu.Add(openManagement).SetAccelerator("CmdOrCtrl+,").OnClick(func(*application.Context) {
		if err := controller.OpenManagement(); err != nil {
			log.Printf("open management failed: %v", err)
		}
	})
	menu.Add(openChat).OnClick(func(*application.Context) {
		if err := controller.OpenDSH(); err != nil {
			log.Printf("open chat failed: %v", err)
		}
	})
}

func addQuit(menu *application.Menu, controller menuController, quitFallback func(), locale string) {
	menu.Add(i18n.T(locale, "menu.quit")).SetAccelerator("CmdOrCtrl+q").OnClick(func(*application.Context) {
		if err := controller.RequestQuit(); err != nil {
			log.Printf("quit confirm failed: %v", err)
			if quitFallback != nil {
				quitFallback()
			}
		}
	})
}

func addRoleItem(menu *application.Menu, label, accelerator string, role application.Role) *application.MenuItem {
	item := menu.Add(label)
	if accelerator != "" {
		item.SetAccelerator(accelerator)
	}
	return item.SetRole(role)
}
