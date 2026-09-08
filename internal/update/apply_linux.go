//go:build linux

package update

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
)

func applyAndRelaunch(staged, _ string) error {
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	exe, err = filepath.EvalSymlinks(exe)
	if err != nil {
		return err
	}
	if err := replaceFile(exe, staged); err != nil {
		return err
	}
	cmd := exec.Command("/bin/sh", "-c", fmt.Sprintf("while kill -0 %d 2>/dev/null; do sleep 0.2; done; exec %q", os.Getpid(), exe))
	cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true}
	cmd.Stdin = nil
	cmd.Stdout = nil
	cmd.Stderr = nil
	return cmd.Start()
}
