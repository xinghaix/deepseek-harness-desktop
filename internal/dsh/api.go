package dsh

import (
	"deepseek-harness-desktop/internal/i18n"
	"fmt"
)

type CheckResult struct {
	Version        string  `json:"version"`
	Options        Options `json:"options"`
	AlreadyRunning bool    `json:"alreadyRunning,omitempty"`
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
	NodeCheck  string `json:"nodeCheck"`
	InstallCLI string `json:"installCLI"`
	VerifyCLI  string `json:"verifyCLI"`
}

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
			Message: i18n.TActive("msg.dsh_already_running_skip_check"),
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
		result.Message = i18n.TActive("msg.cli_found_ok")
		d.commitCLIOptions(normalized)
		return result, nil
	}
	result.Message = i18n.TActive("msg.cli_not_found_path")
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
	d.mu.Unlock()
	if busy {
		return CheckResult{AlreadyRunning: true, Options: normalized}, nil
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
		NodeCheck:  "node --version",
		InstallCLI: "npm install --global @deepseek-ai/dsh",
		VerifyCLI:  "dsh --version",
	}
}

// NormalizeLocationOptions 规范化 Home/Workspace 的绝对路径，供打开目录等桌面操作使用。
func NormalizeLocationOptions(o Options) (Options, error) {
	var err error
	if o.Home, err = absolutePath(o.Home); err != nil {
		return o, fmt.Errorf("DSH Home: %w", err)
	}
	o.DesktopDir = desktopDataDirPath(o.Home)
	if o.Workspace, err = absolutePath(o.Workspace); err != nil {
		return o, fmt.Errorf("%s: %w", i18n.TActive("err.workspace_path"), err)
	}
	return o, nil
}
