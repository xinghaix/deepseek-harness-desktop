//go:build wails

package main

import (
	"embed"
	"io/fs"
	"log"
	"net/http"
	"runtime"

	"deepseek-harness-desktop/internal/desktop"
	"deepseek-harness-desktop/internal/dsh"
	"deepseek-harness-desktop/internal/update"

	"github.com/wailsapp/wails/v3/pkg/application"
)

//go:embed assets/web
//go:embed assets/shared/app-icon.png
//go:embed assets/shared/app-icon.svg
//go:embed assets/darwin/app-icon.png
var assets embed.FS

type DSH struct{ *desktop.Service }

func main() {
	if dsh.RunSupervisorIfRequested() {
		return
	}
	update.CleanupLeftovers()
	web, err := fs.Sub(assets, "assets/web")
	if err != nil {
		log.Fatal(err)
	}
	shared, err := fs.Sub(assets, "assets/shared")
	if err != nil {
		log.Fatal(err)
	}
	mux := http.NewServeMux()
	mux.Handle("/shared/", http.StripPrefix("/shared/", http.FileServer(http.FS(shared))))
	mux.Handle("/", application.BundledAssetFileServer(web))

	service := desktop.New()
	manager := &DSH{Service: service}
	app := application.New(application.Options{
		Name:        "Deepseek Harness Desktop",
		Description: "管理本机已安装的 DSH CLI，并在桌面 WebView 中运行 DSH Chat",
		SingleInstance: &application.SingleInstanceOptions{
			UniqueID: "com.deepseek.harness.desktop",
			ExitCode: 0,
			OnSecondInstanceLaunch: func(application.SecondInstanceData) {
				if err := manager.OpenManagement(); err != nil {
					log.Printf("已有桌面端实例，唤回配置窗口失败: %v", err)
				}
			},
		},
		Icon: appIcon(),
		Services: []application.Service{
			application.NewService(manager),
		},
		Assets: application.AssetOptions{
			Handler: mux,
		},
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: true,
		},
		OnShutdown: func() {
			if err := manager.Close(); err != nil {
				log.Printf("关闭 DSH 进程失败: %v", err)
			}
		},
	})

	// 桌面动作放进各平台宿主菜单（macOS 应用菜单 / Windows·Linux「文件」），
	// 不再单独挂「设置」。Edit role 仍负责把焦点 WebView 接到系统剪贴板快捷键。
	app.Menu.SetApplicationMenu(desktop.ApplicationMenu(app, manager))

	app.Window.NewWithOptions(desktop.ManagementWindowOptions("/"))

	if err := app.Run(); err != nil {
		log.Fatal(err)
	}
}

func appIcon() []byte {
	name := "assets/shared/app-icon.png"
	if runtime.GOOS == "darwin" {
		name = "assets/darwin/app-icon.png"
	}
	data, err := assets.ReadFile(name)
	if err != nil {
		panic(err)
	}
	return data
}
