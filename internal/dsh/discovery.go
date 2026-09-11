package dsh

import (
	"context"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"
)

// cliCandidates 返回桌面端可安全尝试的 dsh 路径。GUI 进程经常拿不到用户
// shell 的 PATH，因此这里先检查用户目录，再检查 shell/PATH 和系统全局目录。
func cliCandidates(preferred string) []string {
	seen := make(map[string]struct{})
	result := make([]string, 0, 24)
	add := func(candidate string) {
		candidate = strings.TrimSpace(candidate)
		if candidate == "" {
			return
		}
		if info, err := os.Stat(candidate); err != nil || info.IsDir() {
			return
		}
		absolute, err := filepath.Abs(candidate)
		if err != nil {
			return
		}
		if _, ok := seen[absolute]; ok {
			return
		}
		seen[absolute] = struct{}{}
		result = append(result, absolute)
	}

	// 用户手动填写的绝对路径必须排在所有自动候选之前。
	if filepath.IsAbs(preferred) || strings.ContainsAny(preferred, `/\\`) {
		add(preferred)
	}

	names := make([]string, 0, 4)
	addName := func(name string) {
		if strings.TrimSpace(name) == "" {
			return
		}
		if filepath.IsAbs(name) || strings.ContainsAny(name, `/\\`) {
			return
		}
		for _, existing := range names {
			if existing == name {
				return
			}
		}
		names = append(names, name)
	}
	addName(preferred)
	for _, name := range []string{"dsh", "dsh.cmd", "dsh.exe"} {
		addName(name)
	}
	for _, dir := range cliSearchDirectories() {
		for _, name := range names {
			add(filepath.Join(dir, name))
		}
	}

	// 最后补充当前环境 PATH 中 exec.LookPath 能解析、但不在常见目录清单里的路径。
	for _, name := range names {
		if resolved, err := execLookPath(name); err == nil {
			add(resolved)
		}
	}
	return result
}

// execLookPath 只为发现逻辑保留一个可替换的窄入口，便于跨平台测试和阅读。
var execLookPath = func(name string) (string, error) {
	return exec.LookPath(name)
}

func resolveCLIExecutable(name string) (string, error) {
	if resolved, err := execLookPath(name); err == nil {
		return resolved, nil
	}
	if filepath.IsAbs(name) || strings.ContainsAny(name, `/\\`) {
		return "", exec.ErrNotFound
	}
	for _, candidate := range cliCandidates(name) {
		if resolved, err := execLookPath(candidate); err == nil {
			return resolved, nil
		}
	}
	return "", exec.ErrNotFound
}

func cliSearchDirectories() []string {
	searchDirsOnce.Do(func() {
		searchDirsCache = computeCLISearchDirectories()
	})
	return searchDirsCache
}

func computeCLISearchDirectories() []string {
	home, _ := os.UserHomeDir()
	homeDirs := make([]string, 0, 20)
	addHome := func(dir string) {
		if strings.TrimSpace(dir) != "" {
			homeDirs = append(homeDirs, dir)
		}
	}
	if home != "" {
		for _, dir := range []string{
			filepath.Join(home, "bin"),
			filepath.Join(home, ".local", "bin"),
			filepath.Join(home, ".npm-global", "bin"),
			filepath.Join(home, ".volta", "bin"),
			filepath.Join(home, ".nvm", "current", "bin"),
			filepath.Join(home, ".fnm", "aliases", "default", "bin"),
			filepath.Join(home, ".asdf", "shims"),
			filepath.Join(home, ".bun", "bin"),
			filepath.Join(home, ".yarn", "bin"),
			filepath.Join(home, ".config", "yarn", "global", "node_modules", ".bin"),
			filepath.Join(home, ".local", "share", "pnpm"),
			filepath.Join(home, "Library", "pnpm"),
			filepath.Join(home, "Library", "Application Support", "pnpm"),
		} {
			addHome(dir)
		}
		for _, pattern := range []string{
			filepath.Join(home, ".nvm", "versions", "node", "*", "bin"),
			filepath.Join(home, ".fnm", "node-versions", "*", "installation", "bin"),
			filepath.Join(home, "Library", "Application Support", "fnm", "node-versions", "*", "installation", "bin"),
			// Homebrew Node keeps npm globals under Cellar; /opt/homebrew/bin/dsh is often absent.
			"/opt/homebrew/Cellar/node/*/bin",
			"/usr/local/Cellar/node/*/bin",
		} {
			matches, _ := filepath.Glob(pattern)
			for _, match := range matches {
				addHome(match)
			}
		}
	}

	pathDirs := append(pathEntries(os.Getenv("PATH")), shellPathEntries()...)
	userPathDirs := make([]string, 0, len(pathDirs))
	otherPathDirs := make([]string, 0, len(pathDirs))
	for _, dir := range pathDirs {
		if isWithin(home, dir) {
			userPathDirs = append(userPathDirs, dir)
		} else {
			otherPathDirs = append(otherPathDirs, dir)
		}
	}

	globalDirs := make([]string, 0, 10)
	if runtime.GOOS == "windows" {
		if appData := os.Getenv("APPDATA"); appData != "" {
			globalDirs = append(globalDirs, filepath.Join(appData, "npm"))
		}
		if localAppData := os.Getenv("LOCALAPPDATA"); localAppData != "" {
			globalDirs = append(globalDirs, filepath.Join(localAppData, "npm"))
		}
		if programFiles := os.Getenv("ProgramFiles"); programFiles != "" {
			globalDirs = append(globalDirs, filepath.Join(programFiles, "nodejs"))
		}
	} else if runtime.GOOS == "darwin" {
		globalDirs = append(globalDirs, "/opt/homebrew/bin", "/usr/local/bin", "/opt/local/bin", "/usr/bin")
	} else {
		globalDirs = append(globalDirs, "/usr/local/bin", "/usr/bin", "/snap/bin")
	}

	return uniqueDirectories(append(append(append(homeDirs, userPathDirs...), otherPathDirs...), globalDirs...))
}

func pathEntries(value string) []string {
	if value == "" {
		return nil
	}
	return strings.Split(value, string(os.PathListSeparator))
}

var (
	shellPathOnce  sync.Once
	shellPathCache []string
	searchDirsOnce sync.Once
	searchDirsCache []string
)

// warmCLISearchCache precomputes login-shell PATH and candidate dirs so the
// first Start/Discover does not block on a slow interactive shell.
func warmCLISearchCache() {
	go func() { _ = cliSearchDirectories() }()
}

func shellPathEntries() []string {
	shellPathOnce.Do(func() {
		shellPathCache = loadShellPathEntries()
	})
	return shellPathCache
}

func loadShellPathEntries() []string {
	if runtime.GOOS == "windows" {
		return nil
	}
	shell := strings.TrimSpace(os.Getenv("SHELL"))
	if shell == "" {
		shell = "/bin/sh"
	}
	// Merge -lc and -ilc PATH. A fast non-empty -lc (common after cold-start
	// tuning) is often incomplete for GUI apps and must NOT skip -ilc — that
	// regression dropped first-install auto-detect for Homebrew Cellar dsh.
	var merged []string
	for _, attempt := range []struct {
		args    []string
		timeout time.Duration
	}{
		{[]string{"-lc", `printf %s "$PATH"`}, 800 * time.Millisecond},
		{[]string{"-ilc", `printf %s "$PATH"`}, 1500 * time.Millisecond},
	} {
		ctx, cancel := context.WithTimeout(context.Background(), attempt.timeout)
		command := exec.CommandContext(ctx, shell, attempt.args...)
		command.Stderr = io.Discard
		output, err := command.Output()
		cancel()
		if err != nil || strings.TrimSpace(string(output)) == "" {
			continue
		}
		merged = append(merged, pathEntries(string(output))...)
	}
	return uniqueDirectories(merged)
}

func isWithin(root, path string) bool {
	if root == "" || path == "" {
		return false
	}
	root, rootErr := filepath.Abs(root)
	path, pathErr := filepath.Abs(path)
	if rootErr != nil || pathErr != nil {
		return false
	}
	relative, err := filepath.Rel(root, path)
	return err == nil && relative != ".." && !strings.HasPrefix(relative, ".."+string(filepath.Separator))
}

func uniqueDirectories(dirs []string) []string {
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
	return result
}
