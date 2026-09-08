//go:build wails

package main

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

type CheckResult struct {
	Version string  `json:"version"`
	Options Options `json:"options"`
}

// DiscoveryResult 是首次启动引导需要的 CLI 探测结果。
type DiscoveryResult struct {
	Found      bool     `json:"found"`
	Version    string   `json:"version"`
	Options    Options  `json:"options"`
	Candidates []string `json:"candidates"`
	Message    string   `json:"message"`
}

// InstallGuide 描述不会自动执行的安装步骤，方便用户复制到终端确认执行。
type InstallGuide struct {
	NodeCheck     string `json:"nodeCheck"`
	InstallCLI    string `json:"installCLI"`
	VerifyCLI     string `json:"verifyCLI"`
	InstallBridge string `json:"installBridge"`
}

// BridgeGuide 是本项目内桥接插件的安装提示。
type BridgeGuide struct {
	PluginPath        string `json:"pluginPath"`
	DirectoryExists   bool   `json:"directoryExists"`
	InstallCommand    string `json:"installCommand"`
	PowerShellCommand string `json:"powerShellCommand"`
	VerifyCommand     string `json:"verifyCommand"`
}

const bridgePluginDirectory = "plugins/deepseek-harness-desktop-bridge"

// Defaults 返回用户现有的 DSH_HOME、桌面端专属目录和 GUI 可见的 Chat 工作目录。
func (d *DSH) Defaults() (Options, error) {
	return defaultOptions()
}

// DiscoverCLI 在不改变 DSH_HOME 的前提下自动探测常见的 dsh 安装位置。
func (d *DSH) DiscoverCLI() (DiscoveryResult, error) {
	d.lifecycleMu.Lock()
	defer d.lifecycleMu.Unlock()
	defaults, err := defaultOptions()
	if err != nil {
		return DiscoveryResult{}, err
	}
	d.mu.Lock()
	if d.cmd != nil {
		options := d.options
		d.mu.Unlock()
		return DiscoveryResult{
			Found:   true,
			Options: options,
			Message: "已有 DSH 实例运行；不会再次启动 dsh 检测进程",
		}, nil
	}
	d.mu.Unlock()
	result := DiscoveryResult{Options: defaults}
	for _, candidate := range cliCandidates(defaults.Executable) {
		o := defaults
		o.Executable = candidate
		normalized, normalizeErr := normalizeOptions(o)
		if normalizeErr != nil {
			continue
		}
		result.Candidates = append(result.Candidates, normalized.Executable)
		version, checkErr := checkCLI(normalized)
		if checkErr != nil {
			continue
		}
		result.Found = true
		result.Version = version
		result.Options = normalized
		result.Message = "已找到并通过 dsh CLI 检测"
		d.commitCLIOptions(normalized)
		return result, nil
	}
	result.Message = "未在 GUI 的 PATH 和常见 Node 全局目录中找到 dsh"
	return result, nil
}

// CheckCLI 校验路径并运行用户已经安装的 CLI，不修改 DSH_HOME。
func (d *DSH) CheckCLI(o Options) (CheckResult, error) {
	d.lifecycleMu.Lock()
	defer d.lifecycleMu.Unlock()
	normalized, err := normalizeOptions(o)
	if err != nil {
		return CheckResult{}, err
	}
	d.mu.Lock()
	busy := d.cmd != nil
	runningOptions := d.options
	d.mu.Unlock()
	if busy {
		return CheckResult{Version: "DSH 已运行", Options: runningOptions}, nil
	}
	version, err := checkCLI(normalized)
	if err != nil {
		return CheckResult{}, err
	}
	d.commitCLIOptions(normalized)
	return CheckResult{Version: version, Options: normalized}, nil
}

// InstallGuide 返回首次启动页展示的 CLI 安装命令；调用方必须显式复制并执行。
func (d *DSH) InstallGuide() InstallGuide {
	return InstallGuide{
		NodeCheck:     "node --version",
		InstallCLI:    "npm install --global @deepseek-ai/dsh",
		VerifyCLI:     "dsh --version",
		InstallBridge: "dsh plugin --profile web add file:<项目目录>/plugins/deepseek-harness-desktop-bridge",
	}
}

// BridgeGuide 生成适合当前系统 shell 的本地插件安装命令，不会写入 profile。
func (d *DSH) BridgeGuide(pluginPath string) (BridgeGuide, error) {
	if strings.TrimSpace(pluginPath) == "" {
		pluginPath = defaultBridgePluginPath()
	}
	path, err := absolutePath(pluginPath)
	if err != nil {
		return BridgeGuide{}, err
	}
	info, statErr := os.Stat(path)
	exists := statErr == nil && info.IsDir()
	return BridgeGuide{
		PluginPath:        path,
		DirectoryExists:   exists,
		InstallCommand:    "dsh plugin --profile web add " + shellQuote("file:"+path),
		PowerShellCommand: "dsh plugin --profile web add " + powerShellQuote("file:"+path),
		VerifyCommand:     "dsh --profile web --dump-config",
	}, nil
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
	return d.chooseDirectory("选择 Chat 工作目录", "请选择 DSH 启动时使用的 Chat 工作目录")
}

func (d *DSH) ChooseBridgePlugin() (string, error) {
	return d.chooseDirectory("选择 DSH 桥接插件目录", "请选择项目中的 plugins/deepseek-harness-desktop-bridge 目录")
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

func managementWindowOptions(url string) application.WebviewWindowOptions {
	options := application.WebviewWindowOptions{
		Name:               "main",
		Title:              "Deepseek Harness Desktop",
		Width:              980,
		Height:             760,
		MinWidth:           760,
		MinHeight:          620,
		URL:                url,
		UseApplicationMenu: true,
		Windows:            application.WindowsWindow{Theme: application.SystemDefault},
		DevToolsEnabled:    false,
	}
	return applyDesktopWindowChrome(options, true)
}

func chatWindowOptions(url string) application.WebviewWindowOptions {
	return chatWindowOptionsWithMode(url, false)
}

func chatWindowOptionsWithMode(url string, useActionPill bool) application.WebviewWindowOptions {
	options := application.WebviewWindowOptions{
		Name:               "dsh",
		Title:              "Deepseek Harness Desktop - DSH",
		Width:              1280,
		Height:             860,
		MinWidth:           900,
		MinHeight:          640,
		URL:                url,
		UseApplicationMenu: true,
		Windows:            application.WindowsWindow{Theme: application.SystemDefault},
		DevToolsEnabled:    false,
	}
	return applyDesktopWindowChromeWithMode(options, false, useActionPill)
}

func applyDesktopWindowChrome(options application.WebviewWindowOptions, management bool) application.WebviewWindowOptions {
	return applyDesktopWindowChromeWithMode(options, management, false)
}

func applyDesktopWindowChromeWithMode(options application.WebviewWindowOptions, management, useActionPill bool) application.WebviewWindowOptions {
	if runtime.GOOS == "darwin" {
		// macOS 使用原生 traffic lights。紧凑 unified 标题栏保留原生按钮，
		// 同时减少顶部垂直留白；注入 CSS/脚本使用同一安全区基准，避免按钮覆盖内容。
		options.Frameless = false
		options.Mac.TitleBar = application.MacTitleBarHiddenInsetUnified
		options.Mac.TitleBar.ToolbarStyle = application.MacToolbarStyleUnifiedCompact
		options.Mac.InvisibleTitleBarHeight = desktopNativeTopInset
		options.JS = desktopChromeScriptWithMode(management, true, useActionPill)
		// CSS 由 WebView 在导航完成后直接注入，和异步挂载的 React DOM
		// 解耦；JS 仍负责给配置页和 sidebar 写入动态标记。
		options.CSS = escapeWailsCSS(desktopSidebarTransitionCSS + desktopNativeWindowInsetCSS + desktopActionPillCSSForWindow(management))
		return options
	}
	options.Frameless = true
	options.JS = desktopChromeScriptWithMode(management, false, useActionPill)
	return options
}

func (d *DSH) ensureChatWindowNavigationHook(window application.Window) {
	d.mu.Lock()
	if d.chatWindowNavigationHooked {
		d.mu.Unlock()
		return
	}
	d.chatWindowNavigationHooked = true
	d.mu.Unlock()

	syncMode := func(*application.WindowEvent) {
		d.mu.Lock()
		enabled := d.options.UseActionPill
		d.mu.Unlock()
		window.ExecJS(desktopActionPillModeScriptForMode(enabled))
	}
	switch runtime.GOOS {
	case "darwin":
		window.OnWindowEvent(events.Mac.WebViewDidFinishNavigation, syncMode)
	case "windows":
		window.OnWindowEvent(events.Windows.WebViewNavigationCompleted, syncMode)
	case "linux":
		window.OnWindowEvent(events.Linux.WindowLoadFinished, syncMode)
	}
}

func (d *DSH) OpenDSH() error {
	url, err := d.browserURL()
	if err != nil {
		return err
	}
	d.mu.Lock()
	useActionPill := d.options.UseActionPill
	d.mu.Unlock()
	app, err := desktopApp()
	if err != nil {
		return err
	}
	d.windowMu.Lock()
	defer d.windowMu.Unlock()
	window, ok := app.Window.GetByName("dsh")
	if !ok {
		window = app.Window.NewWithOptions(chatWindowOptionsWithMode(url, useActionPill))
		d.mu.Lock()
		d.chatWindowURL = url
		d.chatWindowUseActionPill = useActionPill
		d.chatWindowNavigationHooked = false
		d.mu.Unlock()
		d.ensureChatWindowNavigationHook(window)
	} else {
		d.mu.Lock()
		needsReload := d.chatWindowURL != url
		modeChanged := d.chatWindowUseActionPill != useActionPill
		if needsReload {
			d.chatWindowURL = url
		}
		d.chatWindowUseActionPill = useActionPill
		d.mu.Unlock()
		d.ensureChatWindowNavigationHook(window)
		if needsReload {
			window.SetURL(url)
		}
		if modeChanged && !needsReload {
			window.ExecJS(desktopActionPillModeScriptForMode(useActionPill))
		}
	}
	window.Show()
	window.Focus()
	return nil
}

// OpenManagement 把主窗口恢复到桌面端控制台，供用户从聊天窗口返回管理页。
func (d *DSH) OpenManagement() error {
	app, err := desktopApp()
	if err != nil {
		return err
	}
	d.windowMu.Lock()
	defer d.windowMu.Unlock()
	const managementURL = "/?manage=1"
	window, ok := app.Window.GetByName("main")
	if !ok {
		window = app.Window.NewWithOptions(managementWindowOptions(managementURL))
		d.mu.Lock()
		d.managementWindowURL = managementURL
		d.mu.Unlock()
	} else {
		d.mu.Lock()
		needsReload := d.managementWindowURL != managementURL
		if needsReload {
			d.managementWindowURL = managementURL
		}
		d.mu.Unlock()
		if needsReload {
			window.SetURL(managementURL)
		}
	}
	window.Show()
	window.Focus()
	return nil
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
	o.DesktopDir = desktopDataDirPath(o.Home)
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

func defaultBridgePluginPath() string {
	if configured := strings.TrimSpace(os.Getenv("DSH_DESKTOP_BRIDGE_PATH")); configured != "" {
		return configured
	}
	candidates := make([]string, 0, 4)
	if cwd, err := os.Getwd(); err == nil {
		candidates = append(candidates, filepath.Join(cwd, bridgePluginDirectory))
	}
	if executable, err := os.Executable(); err == nil {
		if resolved, resolveErr := filepath.EvalSymlinks(executable); resolveErr == nil {
			executable = resolved
		}
		dir := filepath.Dir(executable)
		candidates = append(candidates,
			filepath.Join(dir, "..", bridgePluginDirectory),
			filepath.Join(dir, "..", "Resources", bridgePluginDirectory),
		)
	}
	for _, candidate := range candidates {
		if info, err := os.Stat(filepath.Join(candidate, "package.json")); err == nil && !info.IsDir() {
			if absolute, err := filepath.Abs(candidate); err == nil {
				return absolute
			}
		}
	}
	if len(candidates) > 0 {
		if absolute, err := filepath.Abs(candidates[0]); err == nil {
			return absolute
		}
	}
	return bridgePluginDirectory
}

func shellQuote(value string) string {
	replacement := string([]byte{39, 34, 39, 34, 39})
	return "'" + strings.ReplaceAll(value, "'", replacement) + "'"
}

func powerShellQuote(value string) string {
	return "'" + strings.ReplaceAll(value, "'", "''") + "'"
}
