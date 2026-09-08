//go:build windows

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
	if resolved, err := filepath.EvalSymlinks(exe); err == nil {
		exe = resolved
	}
	if err := replaceFile(exe, staged); err != nil {
		return err
	}
	cmd := exec.Command("cmd", "/C", fmt.Sprintf("ping 127.0.0.1 -n 2 >nul & start \"\" %q", exe))
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x00000200}
	return cmd.Start()
}
