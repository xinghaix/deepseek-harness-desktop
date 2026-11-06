package dsh

import (
	"fmt"
	"os"
	"os/exec"
	"os/signal"
	"syscall"
	"time"
)

// RunSupervisorIfRequested starts a parent-death watchdog around dsh web.
// The desktop process remains the owner; if it crashes, this helper kills the
// DSH process group so the CLI cannot leak.
func RunSupervisorIfRequested() bool {
	if len(os.Args) < 3 || os.Args[1] != "-dsh-supervise" {
		return false
	}
	runSupervisor(os.Args[2], os.Args[3:])
	return true
}

func runSupervisor(executable string, args []string) {
	parent := os.Getppid()
	selfPGID := os.Getpid()
	_ = os.Setenv("DSHD_SUPERVISE", "1")
	cmd := exec.Command(executable, args...)
	cmd.Stdin, cmd.Stdout, cmd.Stderr = os.Stdin, os.Stdout, os.Stderr
	cmd.Env = append(
		os.Environ(),
		"DSHD_SUPERVISE=1",
		fmt.Sprintf("DSHD_SUPERVISE_PGID=%d", selfPGID),
	)
	if err := cmd.Start(); err != nil {
		_, _ = os.Stderr.WriteString(err.Error() + "\n")
		os.Exit(1)
	}
	// 捕获发给 supervisor 的 SIGTERM/SIGINT 并转发给 dsh web 子进程，
	// 避免 supervisor 先行被信号终止导致 dsh web 未执行插件 dispose 就被 SIGKILL，
	// 进而遗留独立进程组的后台 worker 使 macOS Dock 在退出后仍显示“正在后台运行”。
	sigCh := make(chan os.Signal, 2)
	signal.Notify(sigCh, syscall.SIGTERM, syscall.SIGINT)
	done := make(chan struct{})
	go func() {
		for {
			select {
			case <-done:
				return
			case sig := <-sigCh:
				if cmd.Process != nil {
					_ = cmd.Process.Signal(sig)
				}
			}
		}
	}()
	go watchParent(parent, selfPGID, cmd, done)
	err := cmd.Wait()
	close(done)
	signal.Stop(sigCh)
	killSupervisedDetachedChildren(selfPGID)
	if err == nil {
		os.Exit(0)
	}
	if ee, ok := err.(*exec.ExitError); ok {
		os.Exit(ee.ExitCode())
	}
	os.Exit(1)
}

func watchParent(parent, selfPGID int, cmd *exec.Cmd, done <-chan struct{}) {
	ticker := time.NewTicker(400 * time.Millisecond)
	defer ticker.Stop()
	for {
		select {
		case <-done:
			return
		case <-ticker.C:
			if os.Getppid() == parent {
				continue
			}
			if cmd.Process != nil {
				_ = cmd.Process.Signal(syscall.SIGTERM)
			}
			killSupervisedDetachedChildren(selfPGID)
			killApplicationCoalitionChildren(selfPGID)
			killProcessGroupByID(selfPGID)
			os.Exit(1)
		}
	}
}
