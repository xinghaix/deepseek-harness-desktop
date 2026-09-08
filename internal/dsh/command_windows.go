//go:build windows

package dsh

import (
	"context"
	"os/exec"
	"path/filepath"
	"strings"
)

func newCLICommand(executable string, args ...string) *exec.Cmd {
	if isWindowsScript(executable) {
		return exec.Command("cmd.exe", "/d", "/s", "/c", commandLine(executable, args...))
	}
	return exec.Command(executable, args...)
}

func newCLICommandContext(ctx context.Context, executable string, args ...string) *exec.Cmd {
	if isWindowsScript(executable) {
		return exec.CommandContext(ctx, "cmd.exe", "/d", "/s", "/c", commandLine(executable, args...))
	}
	return exec.CommandContext(ctx, executable, args...)
}

func isWindowsScript(executable string) bool {
	ext := strings.ToLower(filepath.Ext(executable))
	return ext == ".cmd" || ext == ".bat"
}

func commandLine(executable string, args ...string) string {
	parts := make([]string, 0, len(args)+1)
	parts = append(parts, quoteCmdArg(executable))
	for _, arg := range args {
		parts = append(parts, quoteCmdArg(arg))
	}
	// 当命令路径包含空格时，cmd.exe /s /c 需要一对最外层引号。
	return `"` + strings.Join(parts, " ") + `"`
}

func quoteCmdArg(value string) string {
	if value == "" {
		return `""`
	}
	return `"` + strings.ReplaceAll(value, `"`, `""`) + `"`
}
