package dsh

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
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
func (d *Manager) Defaults() (Options, error) {
	return defaultOptions()
}

// DiscoverCLI 在不改变 DSH_HOME 的前提下自动探测常见的 dsh 安装位置。
func (d *Manager) DiscoverCLI() (DiscoveryResult, error) {
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
func (d *Manager) CheckCLI(o Options) (CheckResult, error) {
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
func (d *Manager) InstallGuide() InstallGuide {
	return InstallGuide{
		NodeCheck:     "node --version",
		InstallCLI:    "npm install --global @deepseek-ai/dsh",
		VerifyCLI:     "dsh --version",
		InstallBridge: "dsh plugin --profile web add file:<项目目录>/plugins/deepseek-harness-desktop-bridge",
	}
}

// BridgeGuide 生成适合当前系统 shell 的本地插件安装命令，不会写入 profile。
func (d *Manager) BridgeGuide(pluginPath string) (BridgeGuide, error) {
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

// NormalizeLocationOptions 规范化 Home/Workspace 的绝对路径，供打开目录等桌面操作使用。
func NormalizeLocationOptions(o Options) (Options, error) {
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
