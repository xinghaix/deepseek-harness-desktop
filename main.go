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
	"deepseek-harness-desktop/internal/i18n"
	"deepseek-harness-desktop/internal/runtimeperf"
	"deepseek-harness-desktop/internal/update"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

//go:embed assets/web
//go:embed assets/shared/app-icon.png
//go:embed assets/shared/app-icon.svg
//go:embed assets/darwin/app-icon.png
var assets embed.FS

type DSH struct{ *desktop.WailsFacade }

func main() {
	if dsh.RunSupervisorIfRequested() {
		return
	}
	runtimeperf.Tune()
	runtimeperf.MaybeStartPprof()
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

	icon := appIcon()
	service := desktop.New(icon)
	manager := &DSH{WailsFacade: desktop.NewWailsFacade(service)}
	app := application.New(application.Options{
		Name:        "Deepseek Harness Desktop",
		Description: i18n.TActive("app.description"),
		SingleInstance: &application.SingleInstanceOptions{
			UniqueID: "com.deepseek.harness.desktop",
			ExitCode: 0,
			OnSecondInstanceLaunch: func(application.SecondInstanceData) {
				if err := service.OpenManagement(); err != nil {
					log.Printf("已有桌面端实例，唤回配置窗口失败: %v", err)
				}
			},
		},
		Icon: icon,
		Services: []application.Service{
			application.NewService(manager),
		},
		Assets: application.AssetOptions{
			Handler: mux,
		},
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: false, // close-to-tray: Hide must not quit the app
		},
		Windows: desktop.ApplicationWindowsOptions(),
		Linux:   desktop.ApplicationLinuxOptions(),
		OnShutdown: func() {
			if err := service.Close(); err != nil {
				log.Printf("关闭 DSH 进程失败: %v", err)
			}
		},
	})

	// 桌面动作放进各平台宿主菜单（macOS 应用菜单 / Windows·Linux「文件」），
	// 不再单独挂「设置」。Edit role 仍负责把焦点 WebView 接到系统剪贴板快捷键。
	app.Menu.SetApplicationMenu(desktop.ApplicationMenu(app, service))

	management := app.Window.NewWithOptions(desktop.ManagementWindowOptions("/"))
	service.StartTrayIfEnabled()
	desktop.TuneNativeWebView(management)
	if management != nil {
		management.RegisterHook(events.Common.WindowRuntimeReady, func(*application.WindowEvent) {
			desktop.TuneNativeWebView(management)
			if err := update.MarkHealthy(); err != nil {
				log.Printf("更新健康标记失败: %v", err)
				return
			}
			update.CleanupLeftovers()
		})
	}

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
