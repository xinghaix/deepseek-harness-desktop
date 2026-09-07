//go:build wails

package main

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"

	"github.com/wailsapp/wails/v3/pkg/application"
)

type CheckResult struct {
	Version string  `json:"version"`
	Options Options `json:"options"`
}

// Defaults returns the user's existing DSH_HOME and GUI-visible working directory.
func (d *DSH) Defaults() (Options, error) {
	return defaultOptions()
}

// CheckCLI validates paths and runs the user's installed CLI without changing DSH_HOME.
func (d *DSH) CheckCLI(o Options) (CheckResult, error) {
	normalized, err := normalizeOptions(o)
	if err != nil {
		return CheckResult{}, err
	}
	d.mu.Lock()
	busy := d.cmd != nil
	d.mu.Unlock()
	if busy {
		return CheckResult{}, errors.New("请先停止当前 DSH 实例")
	}
	version, err := checkCLI(normalized)
	if err != nil {
		return CheckResult{}, err
	}
	d.mu.Lock()
	d.options = normalized
	d.mu.Unlock()
	return CheckResult{Version: version, Options: normalized}, nil
}

func (d *DSH) ChooseExecutable() (string, error) {
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

func (d *DSH) ChooseHome() (string, error) {
	return d.chooseDirectory("选择 DSH Home", "请选择现有的 DSH Home 目录；不会创建新的配置目录")
}

func (d *DSH) ChooseWorkspace() (string, error) {
	return d.chooseDirectory("选择工作目录", "请选择 DSH 启动时使用的工作目录")
}

func (d *DSH) chooseDirectory(title, message string) (string, error) {
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

func (d *DSH) OpenDSH() error {
	url, err := d.browserURL()
	if err != nil {
		return err
	}
	app, err := desktopApp()
	if err != nil {
		return err
	}
	return app.Browser.OpenURL(url)
}

func (d *DSH) OpenHome(o Options) error {
	o, err := normalizeLocationOptions(o)
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

func (d *DSH) OpenWorkspace(o Options) error {
	o, err := normalizeLocationOptions(o)
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

func (d *DSH) OpenSettings(o Options) error {
	o, err := normalizeLocationOptions(o)
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

func normalizeLocationOptions(o Options) (Options, error) {
	var err error
	if o.Home, err = absolutePath(o.Home); err != nil {
		return o, fmt.Errorf("DSH Home: %w", err)
	}
	if o.Workspace, err = absolutePath(o.Workspace); err != nil {
		return o, fmt.Errorf("工作目录: %w", err)
	}
	return o, nil
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
