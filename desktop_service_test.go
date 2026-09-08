//go:build wails && (linux || darwin)

package main

import (
	"os"
	"strings"
	"testing"
	"time"
)

func TestRunningDSHDoesNotSpawnDetectionCLI(t *testing.T) {
	t.Setenv("DSHD_TEST_CHILD", "dynamic")
	d := newDSH()
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

	checked, err := d.CheckCLI(o)
	if err != nil {
		t.Fatalf("CheckCLI while running: %v", err)
	}
	if checked.Version != "DSH 已运行" || checked.Options.Home != d.Status().Options.Home {
		t.Fatalf("unexpected running CheckCLI result: %+v", checked)
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
	d := newDSH()
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

func TestApplicationMenuProvidesSystemEditShortcuts(t *testing.T) {
	raw, err := os.ReadFile("main.go")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(raw), "menu.AddRole(application.EditMenu)") {
		t.Fatal("application menu must expose the system Edit role")
	}
}
