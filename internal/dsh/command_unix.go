//go:build linux || darwin

package dsh

import (
	"context"
	"os/exec"
)

func newCLICommand(executable string, args ...string) *exec.Cmd {
	return exec.Command(executable, args...)
}

func newCLICommandContext(ctx context.Context, executable string, args ...string) *exec.Cmd {
	return exec.CommandContext(ctx, executable, args...)
}
