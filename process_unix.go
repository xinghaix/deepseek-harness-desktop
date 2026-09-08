//go:build linux || darwin

package main

import (
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
		return nil, fmt.Errorf("定位 DSH 单实例锁: %w", err)
	}
	file, err := os.OpenFile(path, os.O_CREATE|os.O_RDWR, 0600)
	if err != nil {
		return nil, fmt.Errorf("打开 DSH 单实例锁: %w", err)
	}
	if err := file.Chmod(0600); err != nil {
		_ = file.Close()
		return nil, fmt.Errorf("设置 DSH 单实例锁权限: %w", err)
	}
	if err := syscall.Flock(int(file.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		_ = file.Close()
		if errors.Is(err, syscall.EWOULDBLOCK) || errors.Is(err, syscall.EAGAIN) {
			return nil, errors.New("已有桌面端 DSH 正在运行；不会启动第二个实例")
		}
		return nil, fmt.Errorf("获取 DSH 单实例锁: %w", err)
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

func configureProcess(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
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
