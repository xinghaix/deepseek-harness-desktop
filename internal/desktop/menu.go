//go:build wails

package desktop

import (
	"log"
	"runtime"

	"github.com/wailsapp/wails/v3/pkg/application"
)

const (
	appMenuLabel  = "Deepseek Harness Desktop"
	fileMenuLabel = "文件"

	openManagementLabel = "打开桌面端配置"
	openChatLabel       = "打开 DSH Chat"
	quitLabel           = "退出"

	aboutLabel      = "关于 Deepseek Harness Desktop"
	servicesLabel   = "服务"
	hideLabel       = "隐藏 Deepseek Harness Desktop"
	hideOthersLabel = "隐藏其他"
	showAllLabel    = "显示全部"
)

type menuController interface {
	OpenManagement() error
	OpenDSH() error
	RequestQuit() error
}

// ApplicationMenu 把桌面端动作放进各平台的宿主菜单，不再单独挂一个「设置」。
// macOS 的第一个菜单就是应用菜单；Windows / Linux 没有 AppMenu role，改用「文件」。
func ApplicationMenu(app *application.App, controller menuController) *application.Menu {
	if app == nil {
		return nil
	}
	return newApplicationMenu(runtime.GOOS, app.NewMenu, controller, app.Quit)
}

func newApplicationMenu(goos string, newMenu func() *application.Menu, controller menuController, quitFallback func()) *application.Menu {
	menu := newMenu()
	host := menu.AddSubmenu(hostMenuLabel(goos))
	if goos == "darwin" {
		if item := menu.FindByLabel(appMenuLabel); item != nil {
			item.SetRole(application.AppMenu)
		}
		addRoleItem(host, aboutLabel, "", application.About)
		host.AddSeparator()
	}
	addDesktopActions(host, controller)
	if goos == "darwin" {
		host.AddSeparator()
		host.AddRole(application.ServicesMenu)
		if item := host.FindByRole(application.ServicesMenu); item != nil {
			item.SetLabel(servicesLabel)
		}
		host.AddSeparator()
		addRoleItem(host, hideLabel, "CmdOrCtrl+h", application.Hide)
		addRoleItem(host, hideOthersLabel, "CmdOrCtrl+OptionOrAlt+h", application.HideOthers)
		addRoleItem(host, showAllLabel, "", application.ShowAll)
	}
	host.AddSeparator()
	addQuit(host, controller, quitFallback)
	menu.AddRole(application.EditMenu)
	return menu
}

func hostMenuLabel(goos string) string {
	if goos == "darwin" {
		return appMenuLabel
	}
	return fileMenuLabel
}

func addDesktopActions(menu *application.Menu, controller menuController) {
	menu.Add(openManagementLabel).SetAccelerator("CmdOrCtrl+,").OnClick(func(*application.Context) {
		if err := controller.OpenManagement(); err != nil {
			log.Printf("打开桌面端配置失败: %v", err)
		}
	})
	menu.Add(openChatLabel).OnClick(func(*application.Context) {
		if err := controller.OpenDSH(); err != nil {
			log.Printf("打开 DSH Chat 失败: %v", err)
		}
	})
}

func addQuit(menu *application.Menu, controller menuController, quitFallback func()) {
	menu.Add(quitLabel).SetAccelerator("CmdOrCtrl+q").OnClick(func(*application.Context) {
		if err := controller.RequestQuit(); err != nil {
			log.Printf("退出确认失败: %v", err)
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
