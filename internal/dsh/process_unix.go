//go:build linux || darwin

package dsh

import (
	"deepseek-harness-desktop/internal/i18n"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"strconv"
	"strings"
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
	if cmd == nil || cmd.Process == nil {
		return nil
	}
	pgid := cmd.Process.Pid
	killSupervisedDetachedChildren(pgid)
	err := syscall.Kill(-pgid, syscall.SIGKILL)
	if errors.Is(err, syscall.ESRCH) {
		return nil
	}
	return err
}

func killProcessGroupByID(pgid int) {
	if pgid < 1 {
		return
	}
	_ = syscall.Kill(-pgid, syscall.SIGKILL)
}

func parsePSHierarchyDetachedChildren(output string, rootPGID, selfPID int) (pids []int, pgids []int) {
	if rootPGID < 1 {
		return nil, nil
	}
	type procRow struct {
		pid  int
		ppid int
		pgid int
	}
	var rows []procRow
	childrenByPPID := make(map[int][]procRow)
	for _, rawLine := range strings.Split(output, "\n") {
		fields := strings.Fields(rawLine)
		if len(fields) < 3 {
			continue
		}
		pid, err1 := strconv.Atoi(fields[0])
		ppid, err2 := strconv.Atoi(fields[1])
		pgid, err3 := strconv.Atoi(fields[2])
		if err1 != nil || err2 != nil || err3 != nil || pid < 1 {
			continue
		}
		row := procRow{pid: pid, ppid: ppid, pgid: pgid}
		rows = append(rows, row)
		childrenByPPID[ppid] = append(childrenByPPID[ppid], row)
	}
	visited := make(map[int]bool)
	var queue []int
	for _, row := range rows {
		if row.pid == rootPGID || row.pgid == rootPGID {
			if !visited[row.pid] {
				visited[row.pid] = true
				queue = append(queue, row.pid)
			}
		}
	}
	seenPGID := make(map[int]bool)
	for len(queue) > 0 {
		curr := queue[0]
		queue = queue[1:]
		for _, child := range childrenByPPID[curr] {
			if !visited[child.pid] {
				visited[child.pid] = true
				queue = append(queue, child.pid)
			}
			if child.pid != selfPID && child.pid != rootPGID {
				pids = append(pids, child.pid)
			}
			if child.pgid > 1 && child.pgid != rootPGID && child.pgid != selfPID && !seenPGID[child.pgid] {
				seenPGID[child.pgid] = true
				pgids = append(pgids, child.pgid)
			}
		}
	}
	return pids, pgids
}

func parsePSEnvDetachedChildren(output string, rootPGID, selfPID int) (pids []int, pgids []int) {
	if rootPGID < 1 {
		return nil, nil
	}
	wantedToken := "DSHD_SUPERVISE_PGID=" + strconv.Itoa(rootPGID)
	seenPID := make(map[int]bool)
	seenPGID := make(map[int]bool)
	for _, rawLine := range strings.Split(output, "\n") {
		fields := strings.Fields(rawLine)
		if len(fields) < 4 {
			continue
		}
		pid, err1 := strconv.Atoi(fields[0])
		ppid, err2 := strconv.Atoi(fields[1])
		pgid, err3 := strconv.Atoi(fields[2])
		if err1 != nil || err2 != nil || err3 != nil || pid <= 1 || pid == selfPID || pid == rootPGID {
			continue
		}
		matched := hasEnvToken(fields[3:], wantedToken)
		if !matched && ppid == 1 && hasEnvToken(fields[3:], "DSHD_SUPERVISE=1") && !hasEnvPrefix(fields[3:], "DSHD_SUPERVISE_PGID=") {
			if strings.Contains(rawLine, "ego-cast-worker.mjs") {
				matched = true
			}
		}
		if !matched {
			continue
		}
		if !seenPID[pid] {
			seenPID[pid] = true
			pids = append(pids, pid)
		}
		if pgid > 1 && pgid != rootPGID && pgid != selfPID && !seenPGID[pgid] {
			seenPGID[pgid] = true
			pgids = append(pgids, pgid)
		}
	}
	return pids, pgids
}

func hasEnvToken(tokens []string, wanted string) bool {
	for _, tok := range tokens {
		if tok == wanted {
			return true
		}
	}
	return false
}

func hasEnvPrefix(tokens []string, prefix string) bool {
	for _, tok := range tokens {
		if strings.HasPrefix(tok, prefix) {
			return true
		}
	}
	return false
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
	killSupervisedDetachedChildren(pgid)
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
