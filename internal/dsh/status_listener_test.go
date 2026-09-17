package dsh

import (
	"path/filepath"
	"testing"
	"time"
)

func TestStatusListenerFiresWhenFailedClears(t *testing.T) {
	d := New()
	t.Cleanup(func() { _ = d.Close() })
	ch := make(chan struct{}, 1)
	d.SetStatusListener(func() { ch <- struct{}{} })
	d.mu.Lock()
	d.state = "failed"
	d.lastError = "boom"
	d.mu.Unlock()
	home := t.TempDir()
	d.commitCLIOptions(Options{Executable: "dsh", Home: home, Workspace: filepath.Join(home, "workspaces")})
	select {
	case <-ch:
	case <-time.After(time.Second):
		t.Fatal("status listener was not invoked after failed state cleared")
	}
	if got := d.Status().State; got != "stopped" {
		t.Fatalf("state=%s, want stopped", got)
	}
}

func TestStatusListenerOptional(t *testing.T) {
	d := New()
	t.Cleanup(func() { _ = d.Close() })
	d.notifyStatusLocked()
}
