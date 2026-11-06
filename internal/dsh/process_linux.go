//go:build linux

package dsh

import (
	"os"
	"os/exec"
	"syscall"
)

func configureProcess(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{
		Setpgid:   true,
		Pdeathsig: syscall.SIGKILL,
	}
}

func killSupervisedDetachedChildren(pgid int) {
	if pgid < 1 {
		return
	}
	selfPID := os.Getpid()
	targetPIDs := make(map[int]struct{})
	targetPGIDs := make(map[int]struct{})
	if out, err := exec.Command("ps", "-axo", "pid=,ppid=,pgid=").Output(); err == nil {
		pids, pgids := parsePSHierarchyDetachedChildren(string(out), pgid, selfPID)
		for _, pid := range pids {
			targetPIDs[pid] = struct{}{}
		}
		for _, g := range pgids {
			targetPGIDs[g] = struct{}{}
		}
	}
	if out, err := exec.Command("ps", "axww", "-e", "-o", "pid=,ppid=,pgid=,command=").Output(); err == nil {
		pids, pgids := parsePSEnvDetachedChildren(string(out), pgid, selfPID)
		for _, pid := range pids {
			targetPIDs[pid] = struct{}{}
		}
		for _, g := range pgids {
			targetPGIDs[g] = struct{}{}
		}
	}
	for g := range targetPGIDs {
		if g > 1 && g != pgid && g != selfPID {
			_ = syscall.Kill(-g, syscall.SIGKILL)
		}
	}
	for pid := range targetPIDs {
		if pid > 1 && pid != pgid && pid != selfPID {
			_ = syscall.Kill(pid, syscall.SIGKILL)
		}
	}
}

func killApplicationCoalitionChildren(pgid int) {
	killSupervisedDetachedChildren(pgid)
}
