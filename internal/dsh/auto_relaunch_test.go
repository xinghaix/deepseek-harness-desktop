//go:build linux || darwin

package dsh

import (
	"os"
	"sync/atomic"
	"syscall"
	"testing"
	"time"
)

func TestAutoRelaunchDelay(t *testing.T) {
	cases := []struct {
		attempt int
		want    time.Duration
	}{
		{0, time.Second},
		{1, time.Second},
		{2, 2 * time.Second},
		{3, 4 * time.Second},
		{4, 8 * time.Second},
		{5, 16 * time.Second},
		{6, 30 * time.Second},
		{10, 30 * time.Second},
	}
	for _, tc := range cases {
		if got := autoRelaunchDelay(tc.attempt); got != tc.want {
			t.Fatalf("attempt %d: delay = %v, want %v", tc.attempt, got, tc.want)
		}
	}
}

type recordingBridgeHost struct {
	openChat atomic.Int32
	recovery atomic.Int32
}

func (h *recordingBridgeHost) OpenManagement() error             { return nil }
func (h *recordingBridgeHost) OpenChat() error                   { h.openChat.Add(1); return nil }
func (h *recordingBridgeHost) PresentRecoverySettings() error    { h.recovery.Add(1); return nil }
func (h *recordingBridgeHost) ReloadChat(Options) error          { return nil }
func (h *recordingBridgeHost) ChooseExecutable() (string, error) { return "", nil }
func (h *recordingBridgeHost) ChooseHome() (string, error)       { return "", nil }
func (h *recordingBridgeHost) ChooseWorkspace() (string, error)  { return "", nil }
func (h *recordingBridgeHost) OpenHome(Options) error            { return nil }
func (h *recordingBridgeHost) OpenWorkspace(Options) error       { return nil }
func (h *recordingBridgeHost) OpenSettings(Options) error        { return nil }
func (h *recordingBridgeHost) BridgePrefs() BridgePrefs          { return BridgePrefs{} }
func (h *recordingBridgeHost) SetLanguage(string) (BridgePrefs, error) {
	return BridgePrefs{}, nil
}
func (h *recordingBridgeHost) ReportChatBusy(bool) {}
func (h *recordingBridgeHost) SetConfirmQuitWhenBusy(bool) (BridgePrefs, error) {
	return BridgePrefs{}, nil
}
func (h *recordingBridgeHost) BridgeUpdateStatus() BridgeUpdate { return BridgeUpdate{} }
func (h *recordingBridgeHost) CheckUpdate() (BridgeUpdate, error) {
	return BridgeUpdate{}, nil
}
func (h *recordingBridgeHost) InstallUpdate() error   { return nil }
func (h *recordingBridgeHost) OpenReleasePage() error { return nil }
func (h *recordingBridgeHost) SetAutoCheckUpdate(bool) (BridgeUpdate, error) {
	return BridgeUpdate{}, nil
}
func (h *recordingBridgeHost) AppVersion() string { return "test" }

func TestAutoRelaunchOnUnexpectedExit(t *testing.T) {
	executable, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	t.Setenv("DSHD_TEST_CHILD", "dynamic")
	o := Options{Executable: executable, Home: t.TempDir(), Workspace: t.TempDir(), Port: freePort(t)}
	d := New()
	host := &recordingBridgeHost{}
	d.SetBridgeHost(host)
	t.Cleanup(func() { _ = d.Close() })

	if err := d.Start(o); err != nil {
		t.Fatal(err)
	}
	await(t, 8*time.Second, func() bool { return d.Status().State == "running" })

	d.mu.Lock()
	pid := d.cmd.Process.Pid
	d.mu.Unlock()
	if err := syscall.Kill(pid, syscall.SIGKILL); err != nil {
		t.Fatal(err)
	}

	await(t, 8*time.Second, func() bool {
		d.mu.Lock()
		attempts := d.autoRelaunchAttempts
		d.mu.Unlock()
		return attempts >= 1
	})
	await(t, 12*time.Second, func() bool {
		s := d.Status()
		return s.State == "running" && s.URL != ""
	})
	await(t, 3*time.Second, func() bool { return host.openChat.Load() >= 1 })

	if err := d.Stop(); err != nil {
		t.Fatal(err)
	}
	time.Sleep(1500 * time.Millisecond)
	if s := d.Status(); s.State != "stopped" {
		t.Fatalf("auto-relaunched after user Stop: %+v", s)
	}
	if host.recovery.Load() != 0 {
		t.Fatalf("unexpected PresentRecoverySettings: %d", host.recovery.Load())
	}
}

func TestUserStopSkipsAutoRelaunch(t *testing.T) {
	executable, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	t.Setenv("DSHD_TEST_CHILD", "dynamic")
	o := Options{Executable: executable, Home: t.TempDir(), Workspace: t.TempDir(), Port: freePort(t)}
	d := New()
	host := &recordingBridgeHost{}
	d.SetBridgeHost(host)
	t.Cleanup(func() { _ = d.Close() })
	if err := d.Start(o); err != nil {
		t.Fatal(err)
	}
	await(t, 8*time.Second, func() bool { return d.Status().State == "running" })
	if err := d.Stop(); err != nil {
		t.Fatal(err)
	}
	time.Sleep(1500 * time.Millisecond)
	if s := d.Status(); s.State != "stopped" {
		t.Fatalf("state after Stop = %+v", s)
	}
	d.mu.Lock()
	attempts := d.autoRelaunchAttempts
	enabled := d.autoRelaunch
	d.mu.Unlock()
	if attempts != 0 || enabled {
		t.Fatalf("auto-relaunch should stay idle after user Stop: attempts=%d enabled=%v", attempts, enabled)
	}
}


func TestWaitRunningThenOpenChat(t *testing.T) {
	d := New()
	host := &recordingBridgeHost{}
	d.SetBridgeHost(host)
	t.Cleanup(func() { _ = d.Close() })

	// After Restart(), state is starting — not stopped (helper exits on stopped/failed).
	d.mu.Lock()
	d.state = "starting"
	d.mu.Unlock()

	done := make(chan struct{})
	go func() {
		defer close(done)
		d.waitRunningThenOpenChat(2 * time.Second)
	}()

	time.Sleep(50 * time.Millisecond)
	if host.openChat.Load() != 0 {
		t.Fatal("OpenChat called before running+URL")
	}

	d.mu.Lock()
	d.state = "running"
	d.url = "http://127.0.0.1:12345/"
	d.mu.Unlock()

	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("waitRunningThenOpenChat did not finish")
	}
	if host.openChat.Load() != 1 {
		t.Fatalf("OpenChat calls = %d, want 1", host.openChat.Load())
	}
}

func TestWaitRunningThenOpenChatStopsOnFailed(t *testing.T) {
	d := New()
	host := &recordingBridgeHost{}
	d.SetBridgeHost(host)
	t.Cleanup(func() { _ = d.Close() })

	d.mu.Lock()
	d.state = "failed"
	d.mu.Unlock()

	d.waitRunningThenOpenChat(500 * time.Millisecond)
	if host.openChat.Load() != 0 {
		t.Fatalf("OpenChat should not run on failed: %d", host.openChat.Load())
	}
}
