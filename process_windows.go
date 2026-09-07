//go:build windows

package main

import (
	"fmt"
	"os/exec"
	"strconv"
	"strings"
	"time"
)

func configureProcess(cmd *exec.Cmd) {}

func terminateOwnedProcess(cmd *exec.Cmd) error {
	return taskkill(cmd, false)
}

func killOwnedProcessTree(cmd *exec.Cmd) error {
	return taskkill(cmd, true)
}

func taskkill(cmd *exec.Cmd, force bool) error {
	if cmd.Process == nil {
		return nil
	}
	args := []string{"/PID", strconv.Itoa(cmd.Process.Pid), "/T"}
	if force {
		args = append(args, "/F")
	}
	out, err := exec.Command("taskkill", args...).CombinedOutput()
	if err == nil {
		return nil
	}
	message := strings.ToLower(string(out))
	if strings.Contains(message, "no running instance") || strings.Contains(message, "not found") || strings.Contains(message, "does not exist") {
		return nil
	}
	return fmt.Errorf("taskkill: %w: %s", err, strings.TrimSpace(string(out)))
}

func ownedProcessTreeAlive(pid int) bool {
	// ponytail: taskkill /T is enough for this wrapper; use Job Objects only if
	// Windows graceful-shutdown semantics become a real requirement.
	return false
}

func waitForOwnedProcessTree(pid int, timeout time.Duration) {
	_ = pid
	_ = timeout
}
