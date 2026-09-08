//go:build wails

package desktop

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"deepseek-harness-desktop/internal/dsh"
	"deepseek-harness-desktop/internal/update"

	"github.com/wailsapp/wails/v3/pkg/application"
)

type Service struct {
	*dsh.Manager
	windowMu sync.Mutex
	updater  *update.Updater
	stopAuto context.CancelFunc
}

func New() *Service {
	ctx, cancel := context.WithCancel(context.Background())
	s := &Service{Manager: dsh.New(), updater: update.New(), stopAuto: cancel}
	s.SetOpenManagement(s.OpenManagement)
	go s.updater.RunPeriodic(ctx)
	return s
}

func (d *Service) ChooseExecutable() (string, error) {
	app, err := desktopApp()
	if err != nil {
		return "", err
	}
	return app.Dialog.OpenFile().
		CanChooseFiles(true).
		CanChooseDirectories(false).
		SetTitle("选择 dsh 可执行文件").
		SetMessage("请选择已经安装的 dsh；桌面端不会自动下载或安装").
		PromptForSingleSelection()
}

func (d *Service) ChooseHome() (string, error) {
	return d.chooseDirectory("选择 DSH Home", "请选择现有的 DSH Home 目录；不会创建新的配置目录")
}

func (d *Service) ChooseWorkspace() (string, error) {
	return d.chooseDirectory("选择 Chat 工作目录", "请选择 DSH 启动时使用的 Chat 工作目录")
}

func (d *Service) ChooseBridgePlugin() (string, error) {
	return d.chooseDirectory("选择 DSH 桥接插件目录", "请选择项目中的 plugins/deepseek-harness-desktop-bridge 目录")
}

func (d *Service) chooseDirectory(title, message string) (string, error) {
	app, err := desktopApp()
	if err != nil {
		return "", err
	}
	return app.Dialog.OpenFile().
		CanChooseDirectories(true).
		CanChooseFiles(false).
		SetTitle(title).
		SetMessage(message).
		PromptForSingleSelection()
}

func (d *Service) ReloadChat(o dsh.Options) error {
	o.Port = 0
	if err := d.RestartWithOptions(o); err != nil {
		return err
	}
	deadline := time.Now().Add(45 * time.Second)
	for time.Now().Before(deadline) {
		st := d.Status()
		switch st.State {
		case "running":
			if st.URL == "" {
				break
			}
			_ = d.NoteChatWindowURL("")
			return d.OpenDSH()
		case "failed":
			if st.Error != "" {
				return errors.New(st.Error)
			}
			return errors.New("重新打开 Chat 失败")
		}
		time.Sleep(150 * time.Millisecond)
	}
	return errors.New("重新打开 Chat 超时")
}

func (d *Service) OpenDSH() error {
	url, err := d.BrowserURL()
	if err != nil {
		return err
	}
	app, err := desktopApp()
	if err != nil {
		return err
	}
	d.windowMu.Lock()
	defer d.windowMu.Unlock()
	window, ok := app.Window.GetByName("main")
	_ = d.NoteChatWindowURL(url)
	if !ok {
		window = app.Window.NewWithOptions(PrimaryWindowOptions(url))
	} else {
		window.SetURL(url)
	}
	window.Show()
	window.Focus()
	return nil
}

// OpenManagement 把主窗口恢复到桌面端控制台，供用户从聊天窗口返回管理页。
func (d *Service) OpenManagement() error {
	app, err := desktopApp()
	if err != nil {
		return err
	}
	d.windowMu.Lock()
	defer d.windowMu.Unlock()
	const managementURL = "/?manage=1"
	window, ok := app.Window.GetByName("main")
	_ = d.NoteManagementWindowURL(managementURL)
	if !ok {
		window = app.Window.NewWithOptions(PrimaryWindowOptions(managementURL))
	} else {
		window.SetURL(managementURL)
	}
	window.Show()
	window.Focus()
	return nil
}

func (d *Service) OpenHome(o dsh.Options) error {
	o, err := dsh.NormalizeLocationOptions(o)
	if err != nil {
		return err
	}
	if err := requireDirectory(o.Home, "DSH Home"); err != nil {
		return err
	}
	app, err := desktopApp()
	if err != nil {
		return err
	}
	return app.Env.OpenFileManager(o.Home, false)
}

func (d *Service) OpenWorkspace(o dsh.Options) error {
	o, err := dsh.NormalizeLocationOptions(o)
	if err != nil {
		return err
	}
	if err := requireDirectory(o.Workspace, "工作目录"); err != nil {
		return err
	}
	app, err := desktopApp()
	if err != nil {
		return err
	}
	return app.Env.OpenFileManager(o.Workspace, false)
}

func (d *Service) OpenSettings(o dsh.Options) error {
	o, err := dsh.NormalizeLocationOptions(o)
	if err != nil {
		return err
	}
	path := filepath.Join(o.Home, "settings.yaml")
	if err := requireFile(path, "settings.yaml"); err != nil {
		return err
	}
	app, err := desktopApp()
	if err != nil {
		return err
	}
	return app.Browser.OpenFile(path)
}

func desktopApp() (*application.App, error) {
	app := application.Get()
	if app == nil {
		return nil, errors.New("桌面应用尚未就绪")
	}
	return app, nil
}

func requireDirectory(path, label string) error {
	info, err := os.Stat(path)
	if err != nil {
		return fmt.Errorf("%s 不存在：%w", label, err)
	}
	if !info.IsDir() {
		return fmt.Errorf("%s 不是目录：%s", label, path)
	}
	return nil
}

func requireFile(path, label string) error {
	info, err := os.Stat(path)
	if err != nil {
		return fmt.Errorf("未找到 %s：%s", label, path)
	}
	if info.IsDir() {
		return fmt.Errorf("%s 是目录而不是文件：%s", label, path)
	}
	return nil
}
