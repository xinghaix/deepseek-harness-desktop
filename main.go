//go:build wails

package main

import (
	"log"

	"github.com/wailsapp/wails/v3/pkg/application"
)

func main() {
	manager := newDSH()
	app := application.New(application.Options{
		Name:        "DSH Desktop",
		Description: "管理本机已安装的 DSH CLI，不复制 DSH 配置",
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

	app.Window.NewWithOptions(application.WebviewWindowOptions{
		Name:            "main",
		Title:           "DSH Desktop",
		Width:           980,
		Height:          760,
		MinWidth:        760,
		MinHeight:       620,
		URL:             "/",
		DevToolsEnabled: false,
	})

	if err := app.Run(); err != nil {
		log.Fatal(err)
	}
}
