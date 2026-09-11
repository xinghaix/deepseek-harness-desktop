package dsh

import (
	"bytes"
	"context"
	"deepseek-harness-desktop/internal/i18n"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"
)

const maxLogBytes = 64 * 1024
const desktopDataDirName = ".deepseek-harness-desktop"
const ownedProcessMarkerName = "dsh-process.json"
const ownedProcessLockName = "dsh.lock"
const desktopStateDirEnv = "DSH_DESKTOP_STATE_DIR"

const (
	autoRelaunchMaxAttempts = 5
	autoRelaunchBaseDelay   = time.Second
	autoRelaunchMaxDelay    = 30 * time.Second
	autoRelaunchReadyWait   = 45 * time.Second
)

// DSH 只管理自己接管的进程树，并通过全局锁和进程标记保证同一用户下
// 同时只有一个桌面端拥有的 DSH；Unix 使用进程组，Windows 使用 Job Object。
type Manager struct {
	mu                   sync.Mutex
	lifecycleMu          sync.Mutex
	cmd                  *exec.Cmd
	done                 chan struct{}
	cancel               context.CancelFunc
	state                string
	options              Options
	launchOptions        Options
	output               *cliOutput
	url, lastError       string
	browserTokenUsed     bool
	chatWindowURL        string
	managementWindowURL  string
	host                 BridgeHost
	owner                *ownedProcess
	processLock          *ownedProcessLock
	bridge               *desktopBridge
	closed               bool
	userStop             bool
	autoRelaunch         bool
	autoRelaunchAttempts int
	autoRelaunchGen      uint64
}

type Options struct {
	Executable string `json:"executable"`
	Home       string `json:"home"`
	DesktopDir string `json:"desktopDir"`
	Workspace  string `json:"workspace"`
	Port       int    `json:"port"`
}

type Status struct {
	State   string  `json:"state"`
	Options Options `json:"options"`
	URL     string  `json:"url"`
	Logs    string  `json:"logs"`
	Error   string  `json:"error"`
}

type ownedProcessMarker struct {
	PID        int       `json:"pid"`
	Executable string    `json:"executable"`
	Home       string    `json:"home"`
	StartedAt  time.Time `json:"startedAt"`
}

func defaultOptions() (Options, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return Options{}, err
	}
	dshHome := os.Getenv("DSH_HOME")
	if strings.TrimSpace(dshHome) == "" {
		dshHome = filepath.Join(home, ".dsh")
	}
	dshHome, err = absolutePath(dshHome)
	return Options{
		Executable: "dsh",
		Home:       dshHome,
		DesktopDir: desktopDataDirPath(dshHome),
		Workspace:  home,
		Port:       0,
	}, err
}

func desktopDataDirPath(home string) string {
	return filepath.Join(home, desktopDataDirName)
}

func ensurePrivateDirectory(directory string) (string, error) {
	if info, err := os.Lstat(directory); err == nil {
		if info.Mode()&os.ModeSymlink != 0 {
			return "", i18n.ErrorfActive("err.desktop_dir_symlink")
		}
		if !info.IsDir() {
			return "", i18n.ErrorfActive("err.desktop_dir_not_dir")
		}
	} else if os.IsNotExist(err) {
		if err := os.MkdirAll(directory, 0700); err != nil {
			return "", fmt.Errorf("%s: %w", i18n.TActive("err.desktop_dir_create"), err)
		}
	} else {
		return "", fmt.Errorf("%s: %w", i18n.TActive("err.desktop_dir_stat"), err)
	}
	if runtime.GOOS != "windows" {
		if err := os.Chmod(directory, 0700); err != nil {
			return "", fmt.Errorf("%s: %w", i18n.TActive("err.desktop_dir_chmod"), err)
		}
	}
	return directory, nil
}

func ensureDesktopDataDir(home string) (string, error) {
	return ensurePrivateDirectory(desktopDataDirPath(home))
}

func desktopProcessDataDir() (string, error) {
	if configured := strings.TrimSpace(os.Getenv(desktopStateDirEnv)); configured != "" {
		return absolutePath(configured)
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return desktopDataDirPath(home), nil
}

func ensureDesktopProcessDataDir() (string, error) {
	directory, err := desktopProcessDataDir()
	if err != nil {
		return "", fmt.Errorf("%s: %w", i18n.TActive("err.desktop_proc_dir"), err)
	}
	return ensurePrivateDirectory(directory)
}

func globalOwnedProcessMarkerPath() (string, error) {
	directory, err := desktopProcessDataDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(directory, ownedProcessMarkerName), nil
}

func ownedProcessLockPath() (string, error) {
	directory, err := desktopProcessDataDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(directory, ownedProcessLockName), nil
}

func ownedProcessMarkerPath(home string) string {
	return filepath.Join(desktopDataDirPath(home), ownedProcessMarkerName)
}

func readProcessMarker(path string) (ownedProcessMarker, bool, error) {
	raw, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return ownedProcessMarker{}, false, nil
	}
	if err != nil {
		return ownedProcessMarker{}, false, fmt.Errorf("%s: %w", i18n.TActive("err.marker_read"), err)
	}
	var marker ownedProcessMarker
	if err := json.Unmarshal(raw, &marker); err != nil {
		return ownedProcessMarker{}, false, fmt.Errorf("%s: %w", i18n.TActive("err.marker_parse"), err)
	}
	if marker.PID < 1 {
		return ownedProcessMarker{}, false, i18n.ErrorfActive("err.marker_bad_pid")
	}
	return marker, true, nil
}

func readOwnedProcessMarker(home string) (ownedProcessMarker, bool, error) {
	return readProcessMarker(ownedProcessMarkerPath(home))
}

func guardOwnedProcessMarker(home string) error {
	paths := []string{ownedProcessMarkerPath(home)}
	globalPath, err := globalOwnedProcessMarkerPath()
	if err != nil {
		return fmt.Errorf("%s: %w", i18n.TActive("err.marker_locate"), err)
	}
	if filepath.Clean(globalPath) != filepath.Clean(paths[0]) {
		paths = append(paths, globalPath)
	}
	for _, path := range paths {
		marker, found, err := readProcessMarker(path)
		if err != nil || !found {
			if err != nil {
				return err
			}
			continue
		}
		if ownedProcessTreeAlive(nil, marker.PID) {
			// Desktop may have crashed after the CLI parent exited, leaving the
			// process group (Node grandchildren) alive under the old PGID.
			if !ownedProcessAlive(marker.PID) {
				_ = reclaimOrphanedProcessGroup(marker.PID)
				if !ownedProcessTreeAlive(nil, marker.PID) {
					if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
						return fmt.Errorf("%s: %w", i18n.TActive("err.marker_cleanup"), err)
					}
					continue
				}
			}
			return fmt.Errorf("%s", i18n.TActive("err.marker_still_running", strconv.Itoa(marker.PID)))
		}
		if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
			return fmt.Errorf("%s: %w", i18n.TActive("err.marker_cleanup"), err)
		}
	}
	return nil
}

func writeProcessMarker(path string, marker ownedProcessMarker) error {
	raw, err := json.Marshal(marker)
	if err != nil {
		return err
	}
	temporary, err := os.CreateTemp(filepath.Dir(path), ".dsh-process-*.tmp")
	if err != nil {
		return fmt.Errorf("%s: %w", i18n.TActive("err.marker_create"), err)
	}
	temporaryPath := temporary.Name()
	defer os.Remove(temporaryPath)
	if _, err := temporary.Write(raw); err != nil {
		_ = temporary.Close()
		return fmt.Errorf("%s: %w", i18n.TActive("err.marker_write"), err)
	}
	if err := temporary.Chmod(0600); err != nil {
		_ = temporary.Close()
		return fmt.Errorf("%s: %w", i18n.TActive("err.marker_chmod"), err)
	}
	if err := temporary.Close(); err != nil {
		return fmt.Errorf("%s: %w", i18n.TActive("err.marker_close"), err)
	}
	if err := os.Rename(temporaryPath, path); err != nil {
		return fmt.Errorf("%s: %w", i18n.TActive("err.marker_commit"), err)
	}
	if runtime.GOOS != "windows" {
		if err := os.Chmod(path, 0600); err != nil {
			return fmt.Errorf("%s: %w", i18n.TActive("err.marker_chmod"), err)
		}
	}
	return nil
}

func writeOwnedProcessMarker(home string, pid int, executable string) error {
	return writeProcessMarker(ownedProcessMarkerPath(home), ownedProcessMarker{
		PID: pid, Executable: executable, Home: home, StartedAt: time.Now().UTC(),
	})
}

func writeGlobalOwnedProcessMarker(home string, pid int, executable string) error {
	path, err := globalOwnedProcessMarkerPath()
	if err != nil {
		return fmt.Errorf("%s: %w", i18n.TActive("err.marker_locate"), err)
	}
	return writeProcessMarker(path, ownedProcessMarker{
		PID: pid, Executable: executable, Home: home, StartedAt: time.Now().UTC(),
	})
}

func removeProcessMarker(path string, pid int) error {
	marker, found, err := readProcessMarker(path)
	if err != nil || !found {
		return err
	}
	if marker.PID != pid {
		return fmt.Errorf("%s", i18n.TActive("err.marker_wrong_pid", strconv.Itoa(marker.PID), strconv.Itoa(pid)))
	}
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}

func removeOwnedProcessMarker(home string, pid int) error {
	paths := []string{ownedProcessMarkerPath(home)}
	globalPath, err := globalOwnedProcessMarkerPath()
	if err != nil {
		return err
	}
	if filepath.Clean(globalPath) != filepath.Clean(paths[0]) {
		paths = append(paths, globalPath)
	}
	for _, path := range paths {
		if err := removeProcessMarker(path, pid); err != nil {
			return err
		}
	}
	return nil
}

func absolutePath(path string) (string, error) {
	if strings.TrimSpace(path) == "" {
		return "", i18n.ErrorfActive("err.path_empty")
	}
	if path == "~" || strings.HasPrefix(path, "~/") || strings.HasPrefix(path, `~\`) {
		home, err := os.UserHomeDir()
		if err != nil {
			return "", err
		}
		if path == "~" {
			path = home
		} else {
			path = filepath.Join(home, path[2:])
		}
	}
	return filepath.Abs(path)
}

func normalizeOptions(o Options) (Options, error) {
	if o.Port < 0 || o.Port > 65535 {
		return o, i18n.ErrorfActive("err.port_range")
	}
	var err error
	if o.Home, err = absolutePath(o.Home); err != nil {
		return o, fmt.Errorf("DSH Home: %w", err)
	}
	o.DesktopDir = desktopDataDirPath(o.Home)
	if o.Workspace, err = absolutePath(o.Workspace); err != nil {
		return o, fmt.Errorf("%s: %w", i18n.TActive("err.workspace_path"), err)
	}
	info, err := os.Stat(o.Workspace)
	if err != nil {
		return o, fmt.Errorf("%s: %w", i18n.TActive("err.workspace_path"), err)
	}
	if !info.IsDir() {
		return o, i18n.ErrorfActive("err.workspace_not_dir")
	}
	info, err = os.Stat(o.Home)
	if err != nil && !os.IsNotExist(err) {
		return o, fmt.Errorf("DSH Home: %w", err)
	}
	if err == nil && !info.IsDir() {
		return o, i18n.ErrorfActive("err.home_not_dir")
	}
	if strings.HasPrefix(o.Executable, "~") {
		if o.Executable, err = absolutePath(o.Executable); err != nil {
			return o, err
		}
	}
	o.Executable, err = resolveCLIExecutable(o.Executable)
	if err != nil {
		return o, fmt.Errorf("%s: %w", i18n.TActive("err.cli_not_executable"), err)
	}
	o.Executable, err = filepath.Abs(o.Executable)
	return o, err
}

func childEnv(home string) []string {
	env := make([]string, 0, len(os.Environ())+1)
	for _, entry := range os.Environ() {
		key, _, _ := strings.Cut(entry, "=")
		if !strings.EqualFold(key, "DSH_HOME") {
			env = append(env, entry)
		}
	}
	if home != "" {
		env = append(env, "DSH_HOME="+home)
	}
	return env
}

// cliEnv 为桌面端启动的 CLI 补齐用户在终端中通常拥有、但 GUI 进程未必继承的
// Node/npm 路径。它不会修改桌面进程自己的环境，只作用于子进程。
func cliEnv(home, executable string) []string {
	env := childEnv(home)
	pathValue := envValue(env, "PATH")
	dirs := []string{filepath.Dir(executable)}
	dirs = append(dirs, cliSearchDirectories()...)
	if pathValue != "" {
		dirs = append(dirs, strings.Split(pathValue, string(os.PathListSeparator))...)
	}
	env = withEnvValue(env, "PATH", joinPathDirectories(dirs))
	// DSH client-modules combo URLs grow with installed plugins; Node's default
	// 16KiB max header size returns HTTP 431 once Cookie + Request-Line overflow.
	return withNodeMaxHTTPHeaderSize(env, 128<<10)
}

func envValue(env []string, wanted string) string {
	for _, entry := range env {
		key, value, ok := strings.Cut(entry, "=")
		if ok && strings.EqualFold(key, wanted) {
			return value
		}
	}
	return ""
}

// withNodeMaxHTTPHeaderSize ensures the DSH Node child accepts long combo
// request lines. Preserves an existing user-provided max-http-header-size.
func withNodeMaxHTTPHeaderSize(env []string, size int) []string {
	if size <= 0 {
		return env
	}
	flag := fmt.Sprintf("--max-http-header-size=%d", size)
	cur := strings.TrimSpace(envValue(env, "NODE_OPTIONS"))
	if cur == "" {
		return withEnvValue(env, "NODE_OPTIONS", flag)
	}
	for _, part := range strings.Fields(cur) {
		if strings.HasPrefix(part, "--max-http-header-size=") || part == "--max-http-header-size" {
			return env
		}
	}
	return withEnvValue(env, "NODE_OPTIONS", cur+" "+flag)
}

func withEnvValue(env []string, wanted, value string) []string {
	result := make([]string, 0, len(env)+1)
	found := false
	for _, entry := range env {
		key, _, _ := strings.Cut(entry, "=")
		if strings.EqualFold(key, wanted) {
			if !found {
				result = append(result, wanted+"="+value)
				found = true
			}
			continue
		}
		result = append(result, entry)
	}
	if !found {
		result = append(result, wanted+"="+value)
	}
	return result
}

func joinPathDirectories(dirs []string) string {
	seen := make(map[string]struct{}, len(dirs))
	result := make([]string, 0, len(dirs))
	for _, dir := range dirs {
		dir = strings.TrimSpace(dir)
		if dir == "" {
			continue
		}
		if absolute, err := filepath.Abs(dir); err == nil {
			dir = absolute
		}
		if _, ok := seen[dir]; ok {
			continue
		}
		seen[dir] = struct{}{}
		result = append(result, dir)
	}
	return strings.Join(result, string(os.PathListSeparator))
}

func New() *Manager {
	warmCLISearchCache()
	return &Manager{state: "stopped"}
}

// SetBridgeHost 注入桌面宿主实现（配置窗、选路径、偏好、更新等）。
// 进程内核不能依赖 Wails。
func (d *Manager) SetBridgeHost(host BridgeHost) {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.host = host
}

func (d *Manager) getBridgeHost() (BridgeHost, error) {
	d.mu.Lock()
	host := d.host
	d.mu.Unlock()
	if host == nil {
		return nil, i18n.ErrorfActive("err.mgmt_wails_only")
	}
	return host, nil
}

func (d *Manager) callOpenManagement() error {
	host, err := d.getBridgeHost()
	if err != nil {
		return err
	}
	return host.OpenManagement()
}

func (d *Manager) callReloadChat(o Options) error {
	host, err := d.getBridgeHost()
	if err != nil {
		return err
	}
	return host.ReloadChat(o)
}

// NoteChatWindowURL 记录 Chat 窗口当前加载的 URL；返回是否需要重新加载。
func (d *Manager) NoteChatWindowURL(url string) bool {
	d.mu.Lock()
	defer d.mu.Unlock()
	if d.chatWindowURL == url {
		return false
	}
	d.chatWindowURL = url
	return true
}

// NoteManagementWindowURL 记录配置窗口当前加载的 URL；返回是否需要重新加载。
func (d *Manager) NoteManagementWindowURL(url string) bool {
	d.mu.Lock()
	defer d.mu.Unlock()
	if d.managementWindowURL == url {
		return false
	}
	d.managementWindowURL = url
	return true
}

// commitCLIOptions 提交一次成功的 CLI 检测结果。若上一次 DSH 已经确认退出，
// 这里同时清除旧的失败状态，避免新的配置页继续显示过期的启动错误。
func (d *Manager) commitCLIOptions(o Options) {
	d.mu.Lock()
	defer d.mu.Unlock()
	if d.cmd != nil {
		return
	}
	d.options, d.launchOptions = o, o
	if d.state == "failed" {
		d.state, d.lastError, d.url = "stopped", "", ""
	}
}

func (d *Manager) Start(o Options) error {
	d.lifecycleMu.Lock()
	defer d.lifecycleMu.Unlock()
	d.mu.Lock()
	d.autoRelaunchGen++
	d.autoRelaunch = false
	d.autoRelaunchAttempts = 0
	d.userStop = false
	d.mu.Unlock()
	return d.start(o)
}

func (d *Manager) start(o Options) error {
	o, err := normalizeOptions(o)
	if err != nil {
		return err
	}
	d.mu.Lock()
	if d.closed {
		d.mu.Unlock()
		return i18n.ErrorfActive("err.app_shutting_down")
	}
	if d.cmd != nil {
		state := d.state
		d.mu.Unlock()
		if state == "stopping" || state == "failed" {
			return i18n.ErrorfActive("err.tree_not_exited_no_start")
		}
		return i18n.ErrorfActive("err.dsh_already_running")
	}
	d.mu.Unlock()
	if o.DesktopDir, err = ensureDesktopDataDir(o.Home); err != nil {
		return err
	}
	if _, err := ensureDesktopProcessDataDir(); err != nil {
		return err
	}
	processLock, err := acquireOwnedProcessLock()
	if err != nil {
		return err
	}
	lockOwned := true
	defer func() {
		if lockOwned {
			_ = releaseOwnedProcessLock(processLock)
		}
	}()
	if err := guardOwnedProcessMarker(o.Home); err != nil {
		return err
	}
	d.mu.Lock()
	defer d.mu.Unlock()
	if d.closed {
		return i18n.ErrorfActive("err.app_shutting_down")
	}
	if d.cmd != nil {
		if d.state == "stopping" || d.state == "failed" {
			return i18n.ErrorfActive("err.tree_not_exited_no_start")
		}
		return i18n.ErrorfActive("err.dsh_already_running")
	}
	if d.bridge == nil {
		d.bridge, err = newDesktopBridge(d, bridgeEndpointPath(o.DesktopDir))
		if err != nil {
			return err
		}
	} else {
		d.bridge.mu.Lock()
		d.bridge.endpointFile = bridgeEndpointPath(o.DesktopDir)
		d.bridge.mu.Unlock()
		if err := d.bridge.writeEndpointFile(); err != nil {
			return err
		}
	}
	// UI always requests port 0. A non-zero port is only for tests; refuse to take over a busy port.
	if o.Port != 0 {
		listener, err := net.Listen("tcp4", net.JoinHostPort("127.0.0.1", strconv.Itoa(o.Port)))
		if err != nil {
			return fmt.Errorf("%s: %w", i18n.TActive("err.port_unavailable"), err)
		}
		_ = listener.Close()
	}
	output := newOutput()
	bootPatch, err := writeWebviewBootOverlay(o.DesktopDir)
	if err != nil {
		return err
	}
	bridgePatch, err := writeDesktopBridgeOverlay(o.DesktopDir)
	if err != nil {
		return err
	}
	cmd := newCLICommand(o.Executable, webCLIArgs([]string{bootPatch, bridgePatch}, o.Port)...)
	cmd.Dir, cmd.Env = o.Workspace, d.bridge.env(cliEnv(o.Home, o.Executable))
	configureProcess(cmd)
	cmd.Stdout, cmd.Stderr = output, output
	cmd.WaitDelay = time.Second // A grandchild holding stdout must not prevent reaping the CLI.
	if err := cmd.Start(); err != nil {
		d.state, d.lastError = "failed", err.Error()
		return err
	}
	// 先写全局标记，再写 DSH_HOME 下的诊断标记。若桌面端在这两步之间
	// 崩溃，新的实例至少仍会看到全局标记，不能因更换 DSH_HOME 而绕过单实例保护。
	if err := writeGlobalOwnedProcessMarker(o.Home, cmd.Process.Pid, o.Executable); err != nil {
		_ = killOwnedProcessTree(nil, cmd)
		_ = cmd.Wait()
		_ = waitForOwnedProcessTree(nil, cmd.Process.Pid, 3*time.Second)
		_ = removeOwnedProcessMarker(o.Home, cmd.Process.Pid)
		output.finish()
		return err
	}
	owner, err := attachOwnedProcess(cmd)
	if err != nil {
		_ = killOwnedProcessTree(nil, cmd)
		_ = cmd.Wait()
		_ = waitForOwnedProcessTree(nil, cmd.Process.Pid, 3*time.Second)
		_ = removeOwnedProcessMarker(o.Home, cmd.Process.Pid)
		output.finish()
		return fmt.Errorf("%s: %w", i18n.TActive("err.attach_tree_failed"), err)
	}
	if err := writeOwnedProcessMarker(o.Home, cmd.Process.Pid, o.Executable); err != nil {
		_ = killOwnedProcessTree(owner, cmd)
		_ = cmd.Wait()
		_ = waitForOwnedProcessTree(owner, cmd.Process.Pid, 3*time.Second)
		_ = releaseOwnedProcess(owner)
		_ = removeOwnedProcessMarker(o.Home, cmd.Process.Pid)
		output.finish()
		return err
	}
	d.options, d.launchOptions, d.output, d.url, d.lastError = o, o, output, "", ""
	d.browserTokenUsed = false
	d.chatWindowURL = ""
	d.userStop = false
	d.autoRelaunch = true
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	d.cmd, d.done, d.cancel, d.state = cmd, make(chan struct{}), cancel, "starting"
	d.owner, d.processLock = owner, processLock
	lockOwned = false
	done := d.done
	go func() {
		err := cmd.Wait()
		// 即使父进程自行退出，也不要留下桌面端拥有的子进程。
		cleanupErr := killOwnedProcessTree(owner, cmd)
		output.finish()
		d.finishProcess(cmd, owner, processLock, done, cancel, err, cleanupErr)
	}()
	go d.awaitReady(ctx, cmd, output.urls, o.Port)
	return nil
}

func (d *Manager) finishProcess(cmd *exec.Cmd, owner *ownedProcess, processLock *ownedProcessLock, done chan struct{}, cancel context.CancelFunc, exitErr, cleanupErr error) {
	if !waitForOwnedProcessTree(owner, cmd.Process.Pid, 3*time.Second) {
		d.mu.Lock()
		if d.cmd == cmd {
			d.state = "failed"
			d.url = ""
			if cleanupErr != nil {
				d.lastError = i18n.TActive("err.tree_exit_unconfirmed_prefix") + ": " + cleanupErr.Error()
			} else {
				d.lastError = i18n.TActive("err.tree_exit_unconfirmed")
			}
		}
		d.mu.Unlock()
		go d.awaitOwnedProcessTree(cmd, owner, processLock, done, cancel, exitErr, cleanupErr)
		return
	}
	d.finalizeProcess(cmd, owner, processLock, done, cancel, exitErr, cleanupErr)
}

func (d *Manager) awaitOwnedProcessTree(cmd *exec.Cmd, owner *ownedProcess, processLock *ownedProcessLock, done chan struct{}, cancel context.CancelFunc, exitErr, cleanupErr error) {
	for {
		_ = killOwnedProcessTree(owner, cmd)
		if waitForOwnedProcessTree(owner, cmd.Process.Pid, time.Second) {
			d.finalizeProcess(cmd, owner, processLock, done, cancel, exitErr, cleanupErr)
			return
		}
	}
}

func (d *Manager) finalizeProcess(cmd *exec.Cmd, owner *ownedProcess, processLock *ownedProcessLock, done chan struct{}, cancel context.CancelFunc, exitErr, cleanupErr error) {
	d.mu.Lock()
	defer d.mu.Unlock()
	if d.cmd != cmd {
		return
	}
	cancel()
	markerErr := removeOwnedProcessMarker(d.options.Home, cmd.Process.Pid)
	if d.state != "stopping" && d.lastError == "" {
		d.lastError = i18n.TActive("err.dsh_unexpected_exit")
		if exitErr != nil {
			d.lastError += ": " + exitErr.Error()
		}
	}
	ownerErr := releaseOwnedProcess(owner)
	lockErr := releaseOwnedProcessLock(processLock)
	if cleanupErr != nil {
		d.lastError = i18n.TActive("err.cleanup_children") + ": " + cleanupErr.Error()
	} else if markerErr != nil {
		d.lastError = i18n.TActive("err.cleanup_marker") + ": " + markerErr.Error()
	} else if ownerErr != nil {
		d.lastError = i18n.TActive("err.release_owner") + ": " + ownerErr.Error()
	} else if lockErr != nil {
		d.lastError = i18n.TActive("err.release_lock") + ": " + lockErr.Error()
	}
	d.state = "stopped"
	if d.lastError != "" {
		d.state = "failed"
	}
	d.cmd, d.url, d.chatWindowURL = nil, "", ""
	d.owner, d.processLock = nil, nil
	close(done)
	shouldRelaunch := !d.closed && d.autoRelaunch && !d.userStop && strings.TrimSpace(d.launchOptions.Executable) != ""
	gen := d.autoRelaunchGen
	if shouldRelaunch {
		go d.scheduleAutoRelaunch(gen)
	}
}

func (d *Manager) awaitReady(ctx context.Context, cmd *exec.Cmd, urls <-chan string, requestedPort int) {
	client := &http.Client{
		Timeout:       time.Second,
		Transport:     &http.Transport{Proxy: nil, DisableKeepAlives: true},
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
	}
	defer client.CloseIdleConnections()
	ticker := time.NewTicker(50 * time.Millisecond)
	defer ticker.Stop()
	candidate := ""
	candidateBase := ""
	candidatePort := 0
	for {
		select {
		case <-ctx.Done():
			if errors.Is(ctx.Err(), context.DeadlineExceeded) {
				d.failStartup(cmd, i18n.TActive("err.startup_timeout"))
			}
			return
		case announced := <-urls:
			u, err := url.Parse(announced)
			if err != nil || u == nil {
				d.failStartup(cmd, i18n.TActive("err.cli_url_mismatch"))
				return
			}
			actualPort, portErr := strconv.Atoi(u.Port())
			portMatches := requestedPort == 0 || actualPort == requestedPort
			if u.Scheme != "http" || u.Hostname() != "127.0.0.1" || u.Port() == "" || portErr != nil || actualPort < 1 || actualPort > 65535 || !portMatches || u.User != nil || u.Fragment != "" || (u.Path != "" && u.Path != "/") {
				d.failStartup(cmd, i18n.TActive("err.cli_url_mismatch"))
				return
			}
			candidate = announced
			candidateBase = "http://" + u.Host
			candidatePort = actualPort
		case <-ticker.C:
			if candidate == "" {
				continue
			}
			// Do not GET the printed ?token= URL here: dsh web treats it as a
			// one-time login. The WebView must be the process that redeems it.
			req, _ := http.NewRequestWithContext(ctx, http.MethodGet, candidateBase+"/", nil)
			response, err := client.Do(req)
			if err != nil {
				continue
			}
			location := response.Header.Get("Location")
			_ = response.Body.Close()
			if redirect, err := url.Parse(location); err == nil && redirect.Host != "" && !loopbackHost(redirect.Hostname()) {
				d.failStartup(cmd, i18n.TActive("err.cli_url_mismatch"))
				return
			}
			d.mu.Lock()
			if d.cmd == cmd && d.state == "starting" {
				d.options.Port = candidatePort
				d.url, d.browserTokenUsed, d.state = candidate, false, "running"
			}
			d.mu.Unlock()
			return
		}
	}
}

func loopbackHost(host string) bool {
	return host == "127.0.0.1" || host == "localhost" || host == "::1"
}

func (d *Manager) failStartup(cmd *exec.Cmd, message string) {
	d.mu.Lock()
	if d.cmd != cmd || d.state != "starting" {
		d.mu.Unlock()
		return
	}
	d.lastError = message
	d.mu.Unlock()
	// Use stop() (not Stop()) so userStop stays clear and auto-relaunch can continue.
	d.lifecycleMu.Lock()
	defer d.lifecycleMu.Unlock()
	_ = d.stop()
}

func (d *Manager) Stop() error {
	d.lifecycleMu.Lock()
	defer d.lifecycleMu.Unlock()
	d.mu.Lock()
	d.userStop = true
	d.autoRelaunch = false
	d.autoRelaunchGen++
	d.mu.Unlock()
	return d.stop()
}

func (d *Manager) stop() error {
	d.mu.Lock()
	cmd, owner, done := d.cmd, d.owner, d.done
	if cmd == nil {
		d.mu.Unlock()
		return nil
	}
	if d.state != "stopping" {
		d.state = "stopping"
		d.cancel()
		if err := terminateOwnedProcess(owner, cmd); err != nil && !errors.Is(err, os.ErrProcessDone) {
			d.lastError = i18n.TActive("err.stop_signal_failed") + ": " + err.Error()
		}
	}
	d.mu.Unlock()
	timer := time.NewTimer(7 * time.Second) // Upstream grants plugins five seconds to dispose.
	defer timer.Stop()
	select {
	case <-done:
		return nil
	case <-timer.C:
	}
	d.mu.Lock()
	owned := d.cmd == cmd
	d.mu.Unlock()
	if owned {
		if err := killOwnedProcessTree(owner, cmd); err != nil {
			return fmt.Errorf("%s: %w", i18n.TActive("err.force_stop_failed"), err)
		}
		_, _ = fmt.Fprintln(d.output, i18n.TActive("log.force_killed_tree"))
		if !waitForOwnedProcessTree(owner, cmd.Process.Pid, 3*time.Second) {
			return i18n.ErrorfActive("err.tree_still_alive")
		}
	}
	select {
	case <-done:
		return nil
	case <-time.After(3 * time.Second):
		return i18n.ErrorfActive("err.dsh_not_exited")
	}
}

func (d *Manager) Close() error {
	d.lifecycleMu.Lock()
	defer d.lifecycleMu.Unlock()
	d.mu.Lock()
	d.closed = true
	d.userStop = true
	d.autoRelaunch = false
	d.autoRelaunchGen++
	d.mu.Unlock()
	stopErr := d.stop()
	d.mu.Lock()
	bridge := d.bridge
	d.bridge = nil
	d.mu.Unlock()
	bridgeErr := closeBridge(bridge)
	if stopErr != nil && bridgeErr != nil {
		return errors.Join(stopErr, bridgeErr)
	}
	if stopErr != nil {
		return stopErr
	}
	return bridgeErr
}

// Restart 使用最近一次成功提交给桌面端的选项，供设置页的手动操作调用。
func (d *Manager) Restart() error {
	d.lifecycleMu.Lock()
	defer d.lifecycleMu.Unlock()
	return d.restart()
}

// RestartWithOptions 使用配置页当前提交的路径和端口重启 DSH，并沿用配置页已有的
// 校验与启动链路。桥接插件继续使用无参 Restart，保持原有行为。
func (d *Manager) RestartWithOptions(o Options) error {
	d.lifecycleMu.Lock()
	defer d.lifecycleMu.Unlock()
	return d.restartWithOptions(o)
}

func (d *Manager) restart() error {
	d.mu.Lock()
	if d.closed {
		d.mu.Unlock()
		return i18n.ErrorfActive("err.app_shutting_down")
	}
	o := d.launchOptions
	if strings.TrimSpace(o.Executable) == "" {
		d.mu.Unlock()
		return i18n.ErrorfActive("err.no_restart_config")
	}
	d.mu.Unlock()
	return d.restartWithOptions(o)
}

func (d *Manager) restartWithOptions(o Options) error {
	if strings.TrimSpace(o.Executable) == "" {
		return i18n.ErrorfActive("err.no_restart_config")
	}
	// Intentional restart under lifecycleMu: cancel pending auto-relaunch for the stop phase.
	d.mu.Lock()
	d.autoRelaunchGen++
	d.autoRelaunch = false
	d.autoRelaunchAttempts = 0
	d.userStop = false
	d.mu.Unlock()
	if err := d.stop(); err != nil {
		return err
	}
	return d.start(o)
}

func closeBridge(bridge *desktopBridge) error {
	if bridge == nil {
		return nil
	}
	return bridge.close()
}

func (d *Manager) Status() Status {
	d.mu.Lock()
	defer d.mu.Unlock()
	s := Status{State: d.state, Options: d.options, Error: d.lastError}
	if d.output != nil {
		s.Logs = d.output.text()
	}
	if d.url != "" {
		s.URL = "http://" + net.JoinHostPort("127.0.0.1", strconv.Itoa(d.options.Port)) + "/"
	}
	return s
}

func (d *Manager) BrowserURL() (string, error) {
	d.mu.Lock()
	defer d.mu.Unlock()
	if d.state != "running" {
		return "", i18n.ErrorfActive("err.dsh_not_ready")
	}
	if d.browserTokenUsed {
		return "http://" + net.JoinHostPort("127.0.0.1", strconv.Itoa(d.options.Port)) + "/", nil
	}
	return d.url, nil
}

func (d *Manager) MarkBrowserOpened() {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.browserTokenUsed = true
}

func checkCLI(o Options) (string, error) {
	o, err := normalizeOptions(o)
	if err != nil {
		return "", err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	output := newOutput()
	cmd := newCLICommandContext(ctx, o.Executable, "--version")
	// --version 只校验可执行文件；这里绝不初始化或修改 DSH_HOME。
	cmd.Dir, cmd.Env = o.Workspace, cliEnv("", o.Executable)
	configureProcess(cmd)
	cmd.Stdout, cmd.Stderr, cmd.WaitDelay = output, output, time.Second
	cmd.Cancel = func() error { return killOwnedProcessTree(nil, cmd) }
	err = cmd.Run()
	if cmd.Process != nil {
		_ = killOwnedProcessTree(nil, cmd)
		waitForOwnedProcessTree(nil, cmd.Process.Pid, 3*time.Second)
	}
	output.finish()
	if err != nil {
		return "", fmt.Errorf("%s: %w: %s", i18n.TActive("err.cli_check_failed"), err, output.text())
	}
	return strings.TrimSpace(output.text()), nil
}

// 使用 io.Writer 而不是 Scanner，确保恶意超长行也能被排空；只保留完整日志行。
// ponytail：内存上限为 64 KiB；单行超过 16 KiB 时丢弃该行，不写入日志文件。
type cliOutput struct {
	mu       sync.Mutex
	data     string
	pending  []byte
	dropping bool
	urls     chan string
}

var queryURL = regexp.MustCompile(`(https?://[^\s?#]+)[?#][^\s]*`)

func newOutput() *cliOutput { return &cliOutput{urls: make(chan string, 1)} }

func (o *cliOutput) line(line string) {
	if strings.HasPrefix(line, "dsh web: http") {
		fields := strings.Fields(strings.TrimPrefix(line, "dsh web: "))
		if len(fields) == 0 {
			return
		}
		candidate := fields[0]
		if strings.Contains(line, " (LAN:") {
			candidate = "LAN binding is not allowed"
		}
		select {
		case o.urls <- candidate:
		default:
		}
	}
	o.data += queryURL.ReplaceAllString(line, "$1?[credentials-redacted]")
	if len(o.data) > maxLogBytes {
		o.data = o.data[len(o.data)-maxLogBytes:]
		if newline := strings.IndexByte(o.data, '\n'); newline >= 0 {
			o.data = o.data[newline+1:]
		} else {
			o.data = ""
		}
	}
}

func (o *cliOutput) Write(p []byte) (int, error) {
	o.mu.Lock()
	defer o.mu.Unlock()
	original := len(p)
	for len(p) > 0 {
		newline := bytes.IndexByte(p, '\n')
		length := len(p)
		if newline >= 0 {
			length = newline + 1
		}
		part := p[:length]
		p = p[length:]
		if len(o.pending)+len(part) > 16*1024 {
			o.pending, o.dropping = nil, true
		}
		if !o.dropping {
			o.pending = append(o.pending, part...)
		}
		if newline >= 0 {
			if o.dropping {
				o.line(i18n.TActive("log.dropped_long_line") + "\n")
			} else {
				o.line(string(o.pending))
			}
			o.pending, o.dropping = nil, false
		}
	}
	return original, nil
}

func (o *cliOutput) finish() {
	o.mu.Lock()
	defer o.mu.Unlock()
	if len(o.pending) > 0 {
		o.line(string(o.pending) + "\n")
		o.pending = nil
	}
}

func (o *cliOutput) text() string { o.mu.Lock(); defer o.mu.Unlock(); return o.data }
