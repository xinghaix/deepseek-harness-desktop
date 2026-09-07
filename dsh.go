package main

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
)

const maxLogBytes = 64 * 1024

// ponytail: one owned Unix process group. Add Windows Job Objects only with Windows testing.
type DSH struct {
	mu             sync.Mutex
	cmd            *exec.Cmd
	done           chan struct{}
	cancel         context.CancelFunc
	state          string
	options        Options
	output         *cliOutput
	url, lastError string
	closed         bool
}

type Options struct {
	Executable string `json:"executable"`
	Home       string `json:"home"`
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
	return Options{Executable: "dsh", Home: dshHome, Workspace: home, Port: 3080}, err
}

func absolutePath(path string) (string, error) {
	if strings.TrimSpace(path) == "" {
		return "", errors.New("路径不能为空")
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
	if o.Port < 1 || o.Port > 65535 {
		return o, errors.New("端口必须在 1–65535 之间")
	}
	var err error
	if o.Home, err = absolutePath(o.Home); err != nil {
		return o, fmt.Errorf("DSH Home: %w", err)
	}
	if o.Workspace, err = absolutePath(o.Workspace); err != nil {
		return o, fmt.Errorf("工作目录: %w", err)
	}
	info, err := os.Stat(o.Workspace)
	if err != nil {
		return o, fmt.Errorf("工作目录: %w", err)
	}
	if !info.IsDir() {
		return o, errors.New("工作目录不是目录")
	}
	info, err = os.Stat(o.Home)
	if err != nil && !os.IsNotExist(err) {
		return o, fmt.Errorf("DSH Home: %w", err)
	}
	if err == nil && !info.IsDir() {
		return o, errors.New("DSH Home 不是目录")
	}
	if strings.HasPrefix(o.Executable, "~") {
		if o.Executable, err = absolutePath(o.Executable); err != nil {
			return o, err
		}
	}
	o.Executable, err = exec.LookPath(o.Executable)
	if err != nil {
		return o, fmt.Errorf("找不到可执行的 dsh；请选择已安装的 CLI（不会自动下载）: %w", err)
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

func newDSH() *DSH { return &DSH{state: "stopped"} }

func (d *DSH) Start(o Options) error {
	o, err := normalizeOptions(o)
	if err != nil {
		return err
	}
	d.mu.Lock()
	defer d.mu.Unlock()
	if d.closed {
		return errors.New("应用正在关闭")
	}
	if d.cmd != nil {
		return errors.New("请先停止当前 DSH 实例")
	}
	listener, err := net.Listen("tcp4", net.JoinHostPort("127.0.0.1", strconv.Itoa(o.Port)))
	if err != nil {
		return fmt.Errorf("端口不可用；不会接管或停止其他进程: %w", err)
	}
	_ = listener.Close()
	output := newOutput()
	cmd := newCLICommand(o.Executable, "web", "--host", "127.0.0.1", "--port", strconv.Itoa(o.Port), "--no-open")
	cmd.Dir, cmd.Env = o.Workspace, childEnv(o.Home)
	configureProcess(cmd)
	cmd.Stdout, cmd.Stderr = output, output
	cmd.WaitDelay = time.Second // A grandchild holding stdout must not prevent reaping the CLI.
	d.options, d.output, d.url, d.lastError = o, output, "", ""
	if err := cmd.Start(); err != nil {
		d.state, d.lastError = "failed", err.Error()
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	d.cmd, d.done, d.cancel, d.state = cmd, make(chan struct{}), cancel, "starting"
	done := d.done
	go func() {
		err := cmd.Wait()
		// Do not leave owned descendants behind even if their parent exits on its own.
		cleanupErr := killOwnedProcessTree(cmd)
		waitForOwnedProcessTree(cmd.Process.Pid, 3*time.Second)
		output.finish()
		d.mu.Lock()
		defer d.mu.Unlock()
		cancel()
		if d.state != "stopping" && d.lastError == "" {
			d.lastError = "DSH 意外退出"
			if err != nil {
				d.lastError += ": " + err.Error()
			}
		}
		if cleanupErr != nil {
			d.lastError = "无法清理 DSH 子进程: " + cleanupErr.Error()
		}
		d.state = "stopped"
		if d.lastError != "" {
			d.state = "failed"
		}
		d.cmd, d.url = nil, ""
		close(done)
	}()
	go d.awaitReady(ctx, cmd, output.urls, o.Port)
	return nil
}

func (d *DSH) awaitReady(ctx context.Context, cmd *exec.Cmd, urls <-chan string, port int) {
	base := "http://" + net.JoinHostPort("127.0.0.1", strconv.Itoa(port))
	jar, _ := cookiejar.New(nil)
	client := &http.Client{
		Jar: jar, Timeout: time.Second,
		Transport:     &http.Transport{Proxy: nil, DisableKeepAlives: true},
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
	}
	defer client.CloseIdleConnections()
	ticker := time.NewTicker(150 * time.Millisecond)
	defer ticker.Stop()
	candidate := ""
	for {
		select {
		case <-ctx.Done():
			if errors.Is(ctx.Err(), context.DeadlineExceeded) {
				d.failStartup(cmd, "启动超时：未收到匹配的就绪 URL 或本机认证检查未通过")
			}
			return
		case announced := <-urls:
			u, err := url.Parse(announced)
			if err != nil || u.Scheme != "http" || "http://"+u.Host != base || u.User != nil || u.Fragment != "" || (u.Path != "" && u.Path != "/") {
				d.failStartup(cmd, "CLI 报告的 URL/监听范围不符合请求；检查 Home patch 是否覆盖了 host 或 port")
				return
			}
			candidate = announced
		case <-ticker.C:
			if candidate == "" {
				continue
			}
			req, _ := http.NewRequestWithContext(ctx, http.MethodGet, candidate, nil)
			response, err := client.Do(req)
			if err != nil {
				continue
			}
			code, location := response.StatusCode, response.Header.Get("Location")
			_ = response.Body.Close()
			// DSH 0.1.2-rc.1 exchanges ?token for a signed cookie then redirects to /.
			// Follow only this exact local hop, never an arbitrary Location header.
			if code == http.StatusSeeOther && location == "/" {
				req, _ = http.NewRequestWithContext(ctx, http.MethodGet, base+"/", nil)
				response, err = client.Do(req)
				if err != nil {
					continue
				}
				code = response.StatusCode
				_ = response.Body.Close()
			}
			if code != http.StatusOK {
				continue
			}
			d.mu.Lock()
			if d.cmd == cmd && d.state == "starting" {
				d.url, d.state = candidate, "running"
			}
			d.mu.Unlock()
			return
		}
	}
}

func (d *DSH) failStartup(cmd *exec.Cmd, message string) {
	d.mu.Lock()
	if d.cmd != cmd || d.state != "starting" {
		d.mu.Unlock()
		return
	}
	d.lastError = message
	d.mu.Unlock()
	_ = d.Stop()
}

func (d *DSH) Stop() error {
	d.mu.Lock()
	cmd, done := d.cmd, d.done
	if cmd == nil {
		d.mu.Unlock()
		return nil
	}
	if d.state != "stopping" {
		d.state = "stopping"
		d.cancel()
		if err := terminateOwnedProcess(cmd); err != nil && !errors.Is(err, os.ErrProcessDone) {
			d.lastError = "发送停止信号失败: " + err.Error()
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
		if err := killOwnedProcessTree(cmd); err != nil {
			return fmt.Errorf("强制停止失败: %w", err)
		}
		_, _ = fmt.Fprintln(d.output, "[desktop] 优雅停止超时，已强制结束本次进程树")
		waitForOwnedProcessTree(cmd.Process.Pid, 3*time.Second)
	}
	select {
	case <-done:
		return nil
	case <-time.After(3 * time.Second):
		return errors.New("DSH 尚未退出；禁止启动新的实例")
	}
}

func (d *DSH) Close() error {
	d.mu.Lock()
	d.closed = true
	d.mu.Unlock()
	return d.Stop()
}

func (d *DSH) Status() Status {
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

func (d *DSH) browserURL() (string, error) {
	d.mu.Lock()
	defer d.mu.Unlock()
	if d.state != "running" {
		return "", errors.New("DSH 尚未就绪")
	}
	return d.url, nil
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
	// --version validates the executable only; never initialize or mutate DSH_HOME here.
	cmd.Dir, cmd.Env = o.Workspace, childEnv("")
	configureProcess(cmd)
	cmd.Stdout, cmd.Stderr, cmd.WaitDelay = output, output, time.Second
	cmd.Cancel = func() error { return killOwnedProcessTree(cmd) }
	err = cmd.Run()
	if cmd.Process != nil {
		_ = killOwnedProcessTree(cmd)
		waitForOwnedProcessTree(cmd.Process.Pid, 3*time.Second)
	}
	output.finish()
	if err != nil {
		return "", fmt.Errorf("检测 CLI 失败（npm 安装还需要 Node 在 GUI PATH 中）: %w: %s", err, output.text())
	}
	return strings.TrimSpace(output.text()), nil
}

// io.Writer, not Scanner: drain even hostile long lines. Keep complete lines only.
// ponytail: 64 KiB in memory; drop individual lines over 16 KiB, no log files.
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
	o.data += queryURL.ReplaceAllString(line, "$1?[凭据参数已隐藏]")
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
				o.line("[desktop] 已丢弃一条超过 16 KiB 的日志\n")
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
