package update

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestPrefsRoundTrip(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("DSH_DESKTOP_STATE_DIR", dir)
	u := New()
	if !u.AutoCheckEnabled() {
		t.Fatal("default auto-check")
	}
	if err := u.SetAutoCheck(false); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(dir, prefsFileName)); err != nil {
		t.Fatal(err)
	}
	u2 := New()
	if u2.AutoCheckEnabled() {
		t.Fatal("expected persisted off")
	}
}

func TestRunPeriodicCancelledBeforeFirstCheck(t *testing.T) {
	prevDelay, prevInterval := autoCheckFirstDelay, autoCheckInterval
	autoCheckFirstDelay = time.Hour
	autoCheckInterval = 24 * time.Hour
	defer func() {
		autoCheckFirstDelay, autoCheckInterval = prevDelay, prevInterval
	}()
	u := New()
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		u.RunPeriodic(ctx)
		close(done)
	}()
	cancel()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("periodic loop did not stop")
	}
	if u.Snapshot().State != StateIdle {
		t.Fatalf("startup must not check updates: %+v", u.Snapshot())
	}
}
