//go:build wails

package main

import (
	"log"

	"github.com/wailsapp/wails/v3/pkg/application"
)

func main() {
	manager := newDSH()
	app := application.New(application.Options{
		Name:        "Deepseek Harness Desktop",
		Description: "管理本机已安装的 DSH CLI，并在桌面 WebView 中运行 DSH Chat",
		Icon:        appIcon,
		Services: []application.Service{
			application.NewService(manager),
		},
		Assets: application.AssetOptions{
			Handler: application.BundledAssetFileServer(assets),
		},
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: true,
		},
		OnShutdown: func() { _ = manager.Close() },
	})

	menu := app.NewMenu()
	settingsMenu := menu.AddSubmenu("设置")
	settingsMenu.Add("打开桌面端配置").SetAccelerator("CmdOrCtrl+,").OnClick(func(*application.Context) {
		if err := manager.OpenManagement(); err != nil {
			log.Printf("打开桌面端配置失败: %v", err)
		}
	})
	settingsMenu.Add("打开 DSH Chat").OnClick(func(*application.Context) {
		if err := manager.OpenDSH(); err != nil {
			log.Printf("打开 DSH Chat 失败: %v", err)
		}
	})
	settingsMenu.AddSeparator()
	settingsMenu.Add("退出").SetAccelerator("CmdOrCtrl+q").OnClick(func(*application.Context) { app.Quit() })
	app.Menu.SetApplicationMenu(menu)

	app.Window.NewWithOptions(managementWindowOptions("/"))

	if err := app.Run(); err != nil {
		log.Fatal(err)
	}
}
