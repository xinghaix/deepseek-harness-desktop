//go:build darwin

package dsh

import (
	"context"
	"os"
	"os/exec"
)

const superviseFlag = "-dsh-supervise"

func newCLICommand(executable string, args ...string) *exec.Cmd {
	cmd := exec.Command(executable, args...)
	if len(args) > 0 && args[0] == "web" {
		return wrapSupervisedCommand(cmd)
	}
	return cmd
}

func newCLICommandContext(ctx context.Context, executable string, args ...string) *exec.Cmd {
	return exec.CommandContext(ctx, executable, args...)
}

func wrapSupervisedCommand(inner *exec.Cmd) *exec.Cmd {
	if inner == nil || os.Getenv("DSHD_SUPERVISE") == "1" {
		return inner
	}
	self, err := os.Executable()
	if err != nil {
		return inner
	}
	exe := inner.Path
	if exe == "" && len(inner.Args) > 0 {
		exe = inner.Args[0]
	}
	args := append([]string{superviseFlag, exe}, inner.Args[1:]...)
	cmd := exec.Command(self, args...)
	cmd.Dir = inner.Dir
	cmd.Env = inner.Env
	cmd.Stdin = inner.Stdin
	cmd.Stdout = inner.Stdout
	cmd.Stderr = inner.Stderr
	return cmd
}
