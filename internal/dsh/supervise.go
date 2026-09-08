package dsh

import (
	"os"
	"os/exec"
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
	cmd := exec.Command(executable, args...)
	cmd.Stdin, cmd.Stdout, cmd.Stderr = os.Stdin, os.Stdout, os.Stderr
	cmd.Env = append(os.Environ(), "DSHD_SUPERVISE=1")
	if err := cmd.Start(); err != nil {
		_, _ = os.Stderr.WriteString(err.Error() + "\n")
		os.Exit(1)
	}
	done := make(chan struct{})
	go watchParent(parent, cmd, done)
	err := cmd.Wait()
	close(done)
	if err == nil {
		os.Exit(0)
	}
	if ee, ok := err.(*exec.ExitError); ok {
		os.Exit(ee.ExitCode())
	}
	os.Exit(1)
}

func watchParent(parent int, cmd *exec.Cmd, done <-chan struct{}) {
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
				_ = killOwnedProcessTree(nil, cmd)
			}
			os.Exit(1)
		}
	}
}
