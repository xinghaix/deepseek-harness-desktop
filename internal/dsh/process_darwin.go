//go:build darwin

package dsh

import (
	"bytes"
	"os"
	"os/exec"
	"strings"
	"syscall"
	"time"
	"unsafe"
)

const (
	procInfoCallListPIDs = 1
	procInfoCallPIDInfo  = 2

	procAllPIDs = 1

	procPIDTBSDInfo      = 3
	procPIDPathInfo      = 11
	procPIDCoalitionInfo = 20

	procPIDTBSDInfoSize      = 136
	procPIDPathInfoSize      = 4096
	procPIDCoalitionInfoSize = 40
)

type darwinCoalitionInfo struct {
	Resource uint64
	Jetsam   uint64
	Reserved [3]uint64
}

func configureProcess(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
}

func isAppBundleExecutable() bool {
	exe, err := os.Executable()
	if err != nil {
		return false
	}
	return strings.Contains(exe, ".app/Contents/MacOS/")
}

func darwinListAllPIDs() []int {
	r1, _, errno := syscall.Syscall6(
		syscall.SYS_PROC_INFO,
		procInfoCallListPIDs,
		procAllPIDs,
		0,
		0,
		0,
		0,
	)
	if errno != 0 || int(r1) <= 0 {
		return nil
	}
	capCount := int(r1)/4 + 64
	buf := make([]int32, capCount)
	r1, _, errno = syscall.Syscall6(
		syscall.SYS_PROC_INFO,
		procInfoCallListPIDs,
		procAllPIDs,
		0,
		0,
		uintptr(unsafe.Pointer(&buf[0])),
		uintptr(len(buf)*4),
	)
	if errno != 0 || int(r1) <= 0 {
		return nil
	}
	n := int(r1) / 4
	if n > len(buf) {
		n = len(buf)
	}
	out := make([]int, 0, n)
	for i := 0; i < n; i++ {
		if buf[i] > 0 {
			out = append(out, int(buf[i]))
		}
	}
	return out
}

func darwinProcBSDInfo(pid int) (ppid, pgid int, ok bool) {
	if pid <= 0 {
		return 0, 0, false
	}
	var buf [34]uint32
	r1, _, errno := syscall.Syscall6(
		syscall.SYS_PROC_INFO,
		procInfoCallPIDInfo,
		uintptr(pid),
		procPIDTBSDInfo,
		0,
		uintptr(unsafe.Pointer(&buf[0])),
		procPIDTBSDInfoSize,
	)
	if errno != 0 || int(r1) < procPIDTBSDInfoSize {
		return 0, 0, false
	}
	return int(buf[4]), int(buf[25]), true
}

func darwinProcCoalition(pid int) (resource, jetsam uint64, ok bool) {
	if pid <= 0 {
		return 0, 0, false
	}
	var info darwinCoalitionInfo
	r1, _, errno := syscall.Syscall6(
		syscall.SYS_PROC_INFO,
		procInfoCallPIDInfo,
		uintptr(pid),
		procPIDCoalitionInfo,
		0,
		uintptr(unsafe.Pointer(&info)),
		procPIDCoalitionInfoSize,
	)
	if errno != 0 || int(r1) < procPIDCoalitionInfoSize || info.Resource == 0 {
		return 0, 0, false
	}
	return info.Resource, info.Jetsam, true
}

func darwinProcPath(pid int) string {
	if pid <= 0 {
		return ""
	}
	var buf [procPIDPathInfoSize]byte
	_, _, errno := syscall.Syscall6(
		syscall.SYS_PROC_INFO,
		procInfoCallPIDInfo,
		uintptr(pid),
		procPIDPathInfo,
		0,
		uintptr(unsafe.Pointer(&buf[0])),
		procPIDPathInfoSize,
	)
	if errno != 0 {
		return ""
	}
	if idx := bytes.IndexByte(buf[:], 0); idx >= 0 {
		return string(buf[:idx])
	}
	return string(buf[:])
}

// isProtectedDesktopOrXPCPath 保护系统 XPC 服务与桌面主包可执行文件本身（.app/Contents/MacOS/），
// 确保重启 DSH（重新打开）或子进程清理时绝不误杀桌面宿主 GUI 进程或 WebKit XPC 进程。
func isProtectedDesktopOrXPCPath(path string) bool {
	if path == "" {
		return false
	}
	return strings.HasPrefix(path, "/System/Library/") ||
		strings.HasPrefix(path, "/Library/Apple/") ||
		strings.Contains(path, ".xpc/Contents/MacOS/") ||
		strings.Contains(path, ".app/Contents/MacOS/")
}

// killSupervisedDetachedChildren 清理指定 DSH 进程组（pgid）派生出的后代进程（含通过 setsid/setpgid
// 脱离原进程组的子进程）。此函数在 Stop / Restart（“重新打开”）时也会调用，因此只扫描 pgid 的后代树，
// 绝不扫描整个应用 Coalition，且无条件跳过自身、父进程及桌面主程序。
func killSupervisedDetachedChildren(pgid int) {
	if pgid < 1 {
		return
	}
	selfPID := os.Getpid()
	parentPID := os.Getppid()
	allPIDs := darwinListAllPIDs()
	if len(allPIDs) == 0 {
		return
	}
	type procMeta struct {
		pid  int
		ppid int
		pgid int
	}
	childrenByPPID := make(map[int][]procMeta, 64)
	var rows []procMeta
	for _, pid := range allPIDs {
		ppid, cpgid, ok := darwinProcBSDInfo(pid)
		if !ok {
			continue
		}
		m := procMeta{pid: pid, ppid: ppid, pgid: cpgid}
		rows = append(rows, m)
		childrenByPPID[ppid] = append(childrenByPPID[ppid], m)
	}

	targetPIDs := make(map[int]struct{})
	targetPGIDs := make(map[int]struct{})
	visited := make(map[int]bool)
	var queue []int
	for _, r := range rows {
		if r.pid == pgid || r.pgid == pgid {
			if !visited[r.pid] {
				visited[r.pid] = true
				queue = append(queue, r.pid)
			}
		}
	}
	for len(queue) > 0 {
		curr := queue[0]
		queue = queue[1:]
		for _, child := range childrenByPPID[curr] {
			if !visited[child.pid] {
				visited[child.pid] = true
				queue = append(queue, child.pid)
			}
			if child.pid <= 1 || child.pid == selfPID || child.pid == parentPID || child.pid == pgid {
				continue
			}
			if isProtectedDesktopOrXPCPath(darwinProcPath(child.pid)) {
				continue
			}
			targetPIDs[child.pid] = struct{}{}
			if child.pgid > 1 && child.pgid != selfPID && child.pgid != parentPID && child.pgid != pgid {
				targetPGIDs[child.pgid] = struct{}{}
			}
		}
	}
	for g := range targetPGIDs {
		_ = syscall.Kill(-g, syscall.SIGKILL)
	}
	for pid := range targetPIDs {
		_ = syscall.Kill(pid, syscall.SIGKILL)
	}
}

// killApplicationCoalitionChildren 仅在桌面端整体退出（Manager.Close）或宿主崩溃（watchParent）时调用，
// 扫描当前应用包的 XNU 内核 Coalition，清理所有已脱离父进程（PPID=1）且清空了环境变量的后台守护进程
//（如 ssh -fN、ego-cast-worker.mjs 等），并等待它们从内核进程表彻底消失后再退出主进程。
func killApplicationCoalitionChildren(pgid int) {
	if !isAppBundleExecutable() {
		return
	}
	selfPID := os.Getpid()
	parentPID := os.Getppid()
	inSupervisor := os.Getenv("DSHD_SUPERVISE") == "1"

	var targetResourceCoal, targetJetsamCoal uint64
	if pgid > 0 {
		targetResourceCoal, targetJetsamCoal, _ = darwinProcCoalition(pgid)
	}
	if targetResourceCoal == 0 {
		targetResourceCoal, targetJetsamCoal, _ = darwinProcCoalition(selfPID)
	}
	if targetResourceCoal == 0 {
		return
	}

	sweepOnce := func() int {
		allPIDs := darwinListAllPIDs()
		if len(allPIDs) == 0 {
			return 0
		}
		targetPIDs := make(map[int]struct{})
		targetPGIDs := make(map[int]struct{})
		for _, pid := range allPIDs {
			if pid <= 1 || pid == selfPID || pid == parentPID {
				continue
			}
			_, cpgid, ok := darwinProcBSDInfo(pid)
			if !ok {
				continue
			}
			cRes, cJet, ok := darwinProcCoalition(pid)
			if !ok {
				continue
			}
			if cRes != targetResourceCoal && (targetJetsamCoal == 0 || cJet != targetJetsamCoal) {
				continue
			}
			if isProtectedDesktopOrXPCPath(darwinProcPath(pid)) {
				continue
			}
			targetPIDs[pid] = struct{}{}
			if cpgid > 1 && cpgid != selfPID && cpgid != parentPID {
				targetPGIDs[cpgid] = struct{}{}
			}
		}
		for g := range targetPGIDs {
			_ = syscall.Kill(-g, syscall.SIGKILL)
		}
		for pid := range targetPIDs {
			_ = syscall.Kill(pid, syscall.SIGKILL)
		}
		return len(targetPIDs)
	}

	remaining := sweepOnce()
	if remaining == 0 || inSupervisor {
		return
	}
	deadline := time.Now().Add(1500 * time.Millisecond)
	for time.Now().Before(deadline) {
		time.Sleep(15 * time.Millisecond)
		if sweepOnce() == 0 {
			return
		}
	}
}
