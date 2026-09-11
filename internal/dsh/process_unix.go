//go:build linux || darwin

package dsh

import (
	"deepseek-harness-desktop/internal/i18n"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"syscall"
	"time"
)

type ownedProcess struct{}

type ownedProcessLock struct {
	file *os.File
}

func acquireOwnedProcessLock() (*ownedProcessLock, error) {
	path, err := ownedProcessLockPath()
	if err != nil {
		return nil, fmt.Errorf("%s: %w", i18n.TActive("err.lock_locate"), err)
	}
	file, err := os.OpenFile(path, os.O_CREATE|os.O_RDWR, 0600)
	if err != nil {
		return nil, fmt.Errorf("%s: %w", i18n.TActive("err.lock_open"), err)
	}
	if err := file.Chmod(0600); err != nil {
		_ = file.Close()
		return nil, fmt.Errorf("%s: %w", i18n.TActive("err.lock_chmod"), err)
	}
	if err := syscall.Flock(int(file.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		_ = file.Close()
		if errors.Is(err, syscall.EWOULDBLOCK) || errors.Is(err, syscall.EAGAIN) {
			return nil, i18n.ErrorfActive("err.lock_held")
		}
		return nil, fmt.Errorf("%s: %w", i18n.TActive("err.lock_acquire"), err)
	}
	return &ownedProcessLock{file: file}, nil
}

func releaseOwnedProcessLock(lock *ownedProcessLock) error {
	if lock == nil || lock.file == nil {
		return nil
	}
	unlockErr := syscall.Flock(int(lock.file.Fd()), syscall.LOCK_UN)
	closeErr := lock.file.Close()
	return errors.Join(unlockErr, closeErr)
}

func attachOwnedProcess(cmd *exec.Cmd) (*ownedProcess, error) {
	_ = cmd
	return &ownedProcess{}, nil
}

func releaseOwnedProcess(owner *ownedProcess) error {
	_ = owner
	return nil
}

func terminateOwnedProcess(owner *ownedProcess, cmd *exec.Cmd) error {
	_ = owner
	if cmd.Process == nil {
		return nil
	}
	return cmd.Process.Signal(syscall.SIGTERM)
}

func killOwnedProcessTree(owner *ownedProcess, cmd *exec.Cmd) error {
	_ = owner
	if cmd.Process == nil {
		return nil
	}
	err := syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL)
	if errors.Is(err, syscall.ESRCH) {
		return nil
	}
	return err
}

func ownedProcessTreeAlive(owner *ownedProcess, pid int) bool {
	_ = owner
	if ownedProcessAlive(pid) {
		return true
	}
	err := syscall.Kill(-pid, 0)
	return err == nil || errors.Is(err, syscall.EPERM)
}

func ownedProcessAlive(pid int) bool {
	err := syscall.Kill(pid, 0)
	return err == nil || errors.Is(err, syscall.EPERM)
}

func waitForOwnedProcessTree(owner *ownedProcess, pid int, timeout time.Duration) bool {
	deadline := time.Now().Add(timeout)
	for ownedProcessTreeAlive(owner, pid) && time.Now().Before(deadline) {
		time.Sleep(20 * time.Millisecond)
	}
	return !ownedProcessTreeAlive(owner, pid)
}


// reclaimOrphanedProcessGroup kills leftovers that still share a crashed
// desktop session's process group after the recorded parent PID is gone.
func reclaimOrphanedProcessGroup(pgid int) error {
	if pgid < 1 {
		return nil
	}
	err := syscall.Kill(-pgid, syscall.SIGKILL)
	if errors.Is(err, syscall.ESRCH) {
		return nil
	}
	deadline := time.Now().Add(2 * time.Second)
	for ownedProcessTreeAlive(nil, pgid) && time.Now().Before(deadline) {
		time.Sleep(20 * time.Millisecond)
	}
	return err
}
