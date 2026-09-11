package dsh

import (
	"deepseek-harness-desktop/internal/i18n"
	"strconv"
	"strings"
	"time"
)

func autoRelaunchDelay(attempt int) time.Duration {
	if attempt < 1 {
		attempt = 1
	}
	delay := autoRelaunchBaseDelay
	for i := 1; i < attempt; i++ {
		if delay >= autoRelaunchMaxDelay/2 {
			return autoRelaunchMaxDelay
		}
		delay *= 2
	}
	if delay > autoRelaunchMaxDelay {
		return autoRelaunchMaxDelay
	}
	return delay
}

func (d *Manager) scheduleAutoRelaunch(gen uint64) {
	d.mu.Lock()
	if d.closed || !d.autoRelaunch || d.userStop || d.autoRelaunchGen != gen {
		d.mu.Unlock()
		return
	}
	d.autoRelaunchAttempts++
	attempt := d.autoRelaunchAttempts
	if attempt > autoRelaunchMaxAttempts {
		d.state = "failed"
		d.lastError = i18n.TActive("err.auto_relaunch_exhausted", strconv.Itoa(autoRelaunchMaxAttempts))
		d.autoRelaunch = false
		d.mu.Unlock()
		d.callPresentRecoverySettings()
		return
	}
	// Prefer a clear recovery message over pretending the process is still running.
	d.state = "failed"
	d.lastError = i18n.TActive("msg.auto_relaunching", strconv.Itoa(attempt), strconv.Itoa(autoRelaunchMaxAttempts))
	o := d.launchOptions
	delay := autoRelaunchDelay(attempt)
	d.mu.Unlock()

	timer := time.NewTimer(delay)
	defer timer.Stop()
	<-timer.C

	d.mu.Lock()
	if d.closed || !d.autoRelaunch || d.userStop || d.autoRelaunchGen != gen {
		d.mu.Unlock()
		return
	}
	if strings.TrimSpace(o.Executable) == "" {
		d.autoRelaunch = false
		d.mu.Unlock()
		return
	}
	d.mu.Unlock()

	d.lifecycleMu.Lock()
	err := d.start(o)
	d.lifecycleMu.Unlock()
	if err != nil {
		go d.scheduleAutoRelaunch(gen)
		return
	}
	go d.watchAutoRelaunchReady(gen)
}

// waitRunningThenOpenChat polls until DSH is running with a URL, then opens/refreshes Chat.
// Used after bridge /v1/start and /v1/restart so the named Chat window picks up a new port.
// Stops early on failed/stopped/closed. Non-blocking callers should invoke via go.
func (d *Manager) waitRunningThenOpenChat(timeout time.Duration) {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		d.mu.Lock()
		if d.closed {
			d.mu.Unlock()
			return
		}
		state, url := d.state, d.url
		d.mu.Unlock()
		switch state {
		case "running":
			if url != "" {
				d.callOpenChat()
				return
			}
		case "failed", "stopped":
			return
		}
		time.Sleep(100 * time.Millisecond)
	}
}

func (d *Manager) watchAutoRelaunchReady(gen uint64) {
	deadline := time.Now().Add(autoRelaunchReadyWait)
	for time.Now().Before(deadline) {
		d.mu.Lock()
		if d.closed || d.userStop || !d.autoRelaunch || d.autoRelaunchGen != gen {
			d.mu.Unlock()
			return
		}
		if d.state == "running" && d.url != "" {
			d.autoRelaunchAttempts = 0
			d.mu.Unlock()
			d.callOpenChat()
			return
		}
		// Child died again: finalizeProcess will schedule the next attempt.
		if d.cmd == nil && d.state != "starting" {
			d.mu.Unlock()
			return
		}
		d.mu.Unlock()
		time.Sleep(100 * time.Millisecond)
	}
}

func (d *Manager) callOpenChat() {
	host, err := d.getBridgeHost()
	if err != nil {
		return
	}
	_ = host.OpenChat()
}

func (d *Manager) callPresentRecoverySettings() {
	host, err := d.getBridgeHost()
	if err != nil {
		return
	}
	_ = host.PresentRecoverySettings()
}
