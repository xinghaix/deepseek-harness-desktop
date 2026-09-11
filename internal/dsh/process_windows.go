//go:build windows

package dsh

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"time"
	"unsafe"

	"deepseek-harness-desktop/internal/i18n"
	"golang.org/x/sys/windows"
)

type ownedProcess struct {
	job windows.Handle
}

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
	var overlapped windows.Overlapped
	err = windows.LockFileEx(
		windows.Handle(file.Fd()),
		windows.LOCKFILE_EXCLUSIVE_LOCK|windows.LOCKFILE_FAIL_IMMEDIATELY,
		0, 1, 0, &overlapped,
	)
	if err != nil {
		_ = file.Close()
		if errors.Is(err, windows.ERROR_LOCK_VIOLATION) || errors.Is(err, windows.ERROR_SHARING_VIOLATION) {
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
	var overlapped windows.Overlapped
	unlockErr := windows.UnlockFileEx(windows.Handle(lock.file.Fd()), 0, 1, 0, &overlapped)
	closeErr := lock.file.Close()
	return errors.Join(unlockErr, closeErr)
}

// attachOwnedProcess 把 DSH 根进程加入独立 Job Object。Job 句柄关闭时，
// Windows 会自动结束仍属于该 Job 的后代，桌面端自身崩溃也不会遗留 DSH。
func attachOwnedProcess(cmd *exec.Cmd) (*ownedProcess, error) {
	if cmd == nil || cmd.Process == nil {
		return nil, i18n.ErrorfActive("err.process_not_started")
	}
	job, err := windows.CreateJobObject(nil, nil)
	if err != nil {
		return nil, fmt.Errorf("%s: %w", i18n.TActive("err.job_create"), err)
	}
	closeJob := true
	defer func() {
		if closeJob {
			_ = windows.CloseHandle(job)
		}
	}()
	limits := windows.JOBOBJECT_EXTENDED_LIMIT_INFORMATION{}
	limits.BasicLimitInformation.LimitFlags = windows.JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
	if _, err := windows.SetInformationJobObject(
		job,
		windows.JobObjectExtendedLimitInformation,
		uintptr(unsafe.Pointer(&limits)),
		uint32(unsafe.Sizeof(limits)),
	); err != nil {
		return nil, fmt.Errorf("%s: %w", i18n.TActive("err.job_policy"), err)
	}
	process, err := windows.OpenProcess(
		windows.PROCESS_SET_QUOTA|windows.PROCESS_TERMINATE|windows.PROCESS_QUERY_LIMITED_INFORMATION,
		false,
		uint32(cmd.Process.Pid),
	)
	if err != nil {
		return nil, fmt.Errorf("%s: %w", i18n.TActive("err.process_open"), err)
	}
	defer windows.CloseHandle(process)
	if err := windows.AssignProcessToJobObject(job, process); err != nil {
		return nil, fmt.Errorf("%s: %w", i18n.TActive("err.attach_tree"), err)
	}
	closeJob = false
	return &ownedProcess{job: job}, nil
}

func releaseOwnedProcess(owner *ownedProcess) error {
	if owner == nil || owner.job == 0 {
		return nil
	}
	return windows.CloseHandle(owner.job)
}

func configureProcess(cmd *exec.Cmd) {}

func terminateOwnedProcess(owner *ownedProcess, cmd *exec.Cmd) error {
	_ = owner
	return taskkill(cmd, false)
}

func killOwnedProcessTree(owner *ownedProcess, cmd *exec.Cmd) error {
	if owner != nil && owner.job != 0 {
		if err := windows.TerminateJobObject(owner.job, 1); err == nil {
			return nil
		} else if !errors.Is(err, windows.ERROR_INVALID_HANDLE) {
			// Job Object 是首选路径；taskkill 作为兼容性兜底，处理进程
			// 已脱离 Job 或系统拒绝操作 Job 的情况。
			if fallbackErr := taskkill(cmd, true); fallbackErr == nil {
				return nil
			} else {
				return fmt.Errorf("%s", i18n.TActive("err.job_kill_fallback", err.Error(), fmt.Sprint(fallbackErr)))
			}
		}
	}
	return taskkill(cmd, true)
}

func taskkill(cmd *exec.Cmd, force bool) error {
	if cmd == nil || cmd.Process == nil {
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

// processTreeSnapshot 使用 Toolhelp 快照检查根 PID 及其仍挂在该 PID
// 下的后代。即使根进程已经退出，后代的 ParentProcessID 仍能阻止误启动
// 第二个 DSH。
func processTreeSnapshot(pid uint32) bool {
	if pid == 0 {
		return false
	}
	snapshot, err := windows.CreateToolhelp32Snapshot(windows.TH32CS_SNAPPROCESS, 0)
	if err != nil {
		// 无法检查时必须按“仍存在”处理，避免把观察失败误判为
		// 已退出而启动第二个 DSH。
		return true
	}
	defer windows.CloseHandle(snapshot)
	children := make(map[uint32][]uint32)
	present := make(map[uint32]struct{})
	var entry windows.ProcessEntry32
	entry.Size = uint32(unsafe.Sizeof(entry))
	if err := windows.Process32First(snapshot, &entry); err != nil {
		return !errors.Is(err, windows.ERROR_NO_MORE_FILES)
	}
	for {
		present[entry.ProcessID] = struct{}{}
		children[entry.ParentProcessID] = append(children[entry.ParentProcessID], entry.ProcessID)
		err := windows.Process32Next(snapshot, &entry)
		if errors.Is(err, windows.ERROR_NO_MORE_FILES) {
			break
		}
		if err != nil {
			return true
		}
	}
	queue := []uint32{pid}
	seen := make(map[uint32]struct{})
	for len(queue) > 0 {
		current := queue[0]
		queue = queue[1:]
		if _, ok := seen[current]; ok {
			continue
		}
		seen[current] = struct{}{}
		if _, ok := present[current]; ok {
			return true
		}
		queue = append(queue, children[current]...)
	}
	return false
}

func ownedProcessTreeAlive(owner *ownedProcess, pid int) bool {
	if owner != nil && owner.job != 0 {
		var info struct {
			TotalUserTime             int64
			TotalKernelTime           int64
			ThisPeriodTotalUserTime   int64
			ThisPeriodTotalKernelTime int64
			TotalPageFaultCount       uint32
			TotalProcesses            uint32
			ActiveProcesses           uint32
			TotalTerminatedProcesses  uint32
		}
		var returned uint32
		if err := windows.QueryInformationJobObject(
			owner.job,
			windows.JobObjectBasicAccountingInformation,
			uintptr(unsafe.Pointer(&info)),
			uint32(unsafe.Sizeof(info)),
			&returned,
		); err == nil {
			return info.ActiveProcesses > 0
		}
	}
	return processTreeSnapshot(uint32(pid))
}

func ownedProcessAlive(pid int) bool {
	return processTreeSnapshot(uint32(pid))
}

func waitForOwnedProcessTree(owner *ownedProcess, pid int, timeout time.Duration) bool {
	deadline := time.Now().Add(timeout)
	for ownedProcessTreeAlive(owner, pid) && time.Now().Before(deadline) {
		time.Sleep(20 * time.Millisecond)
	}
	return !ownedProcessTreeAlive(owner, pid)
}
