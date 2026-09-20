//go:build linux || darwin

package dsh

import (
	"os"
	"testing"
	"time"
)

func TestRunningDSHDoesNotSpawnDetectionCLI(t *testing.T) {
	t.Setenv("DSHD_TEST_CHILD", "dynamic")
	d := New()
	t.Cleanup(func() { _ = d.Close() })
	executable, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	o := Options{Executable: executable, Home: t.TempDir(), Workspace: t.TempDir(), Port: freePort(t)}
	if err := d.Start(o); err != nil {
		t.Fatal(err)
	}
	await(t, 8*time.Second, func() bool { return d.Status().State == "running" })

	next := o
	next.Workspace = t.TempDir()
	checked, err := d.CheckCLI(next)
	if err != nil {
		t.Fatalf("CheckCLI while running: %v", err)
	}
	if !checked.AlreadyRunning {
		t.Fatalf("unexpected running CheckCLI result: %+v", checked)
	}
	if checked.Options.Workspace != next.Workspace {
		t.Fatalf("CheckCLI while running discarded new workspace: %+v", checked.Options)
	}
	if d.Status().Options.Workspace == next.Workspace {
		t.Fatal("running instance must keep the old workspace until restart")
	}

	discovered, err := d.DiscoverCLI()
	if err != nil {
		t.Fatalf("DiscoverCLI while running: %v", err)
	}
	if !discovered.Found || discovered.Message == "" || len(discovered.Candidates) != 0 {
		t.Fatalf("unexpected running DiscoverCLI result: %+v", discovered)
	}
}

func TestSuccessfulCLICheckClearsConfirmedStartupFailure(t *testing.T) {
	t.Setenv("DSHD_TEST_CHILD", "dynamic")
	d := New()
	executable, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	o := Options{Executable: executable, Home: t.TempDir(), Workspace: t.TempDir(), Port: freePort(t)}
	d.mu.Lock()
	d.state = "failed"
	d.lastError = "上一次 dsh web 启动失败"
	d.mu.Unlock()
	if _, err := d.CheckCLI(o); err != nil {
		t.Fatalf("CheckCLI: %v", err)
	}
	status := d.Status()
	if status.State != "stopped" || status.Error != "" {
		t.Fatalf("successful CLI check kept stale failure: %+v", status)
	}
}

func TestStatusCLIVersionLifecycle(t *testing.T) {
	t.Setenv("DSHD_TEST_CHILD", "dynamic")
	d := New()
	t.Cleanup(func() { _ = d.Close() })

	if v := d.Status().CLIVersion; v != UnknownVersion {
		t.Fatalf("expected initial CLIVersion to be %q, got %q", UnknownVersion, v)
	}

	executable, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	o := Options{Executable: executable, Home: t.TempDir(), Workspace: t.TempDir(), Port: freePort(t)}

	checked, err := d.CheckCLI(o)
	if err != nil {
		t.Fatalf("CheckCLI: %v", err)
	}
	if checked.Version != "test-fixture-dsh" {
		t.Fatalf("unexpected version from CheckCLI: %q", checked.Version)
	}
	if v := d.Status().CLIVersion; v != "test-fixture-dsh" {
		t.Fatalf("Status().CLIVersion after CheckCLI = %q, want %q", v, "test-fixture-dsh")
	}

	// Invalidate executable via SaveLaunchOptions while stopped
	diffOpts := o
	diffOpts.Executable = "/non/existent/path"
	if err := d.SaveLaunchOptions(diffOpts, false); err != nil {
		t.Fatalf("SaveLaunchOptions: %v", err)
	}
	if v := d.Status().CLIVersion; v != UnknownVersion {
		t.Fatalf("Status().CLIVersion after changing executable = %q, want %q", v, UnknownVersion)
	}

	// Start with valid options (fast path, no prior CheckCLI)
	if err := d.Start(o); err != nil {
		t.Fatalf("Start: %v", err)
	}
	await(t, 8*time.Second, func() bool { return d.Status().State == "running" })
	if v := d.Status().CLIVersion; v != "test-fixture-dsh" {
		t.Fatalf("Status().CLIVersion after Start = %q, want %q", v, "test-fixture-dsh")
	}
	if err := d.Stop(); err != nil {
		t.Fatalf("Stop: %v", err)
	}
}
