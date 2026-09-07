//go:build linux || darwin

package main

import (
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"reflect"
	"strconv"
	"strings"
	"sync/atomic"
	"syscall"
	"testing"
	"time"
)

// The test binary is a controlled child process, not a substitute for real DSH.
func TestMain(m *testing.M) {
	mode := os.Getenv("DSHD_TEST_CHILD")
	if mode == "" {
		os.Exit(m.Run())
	}
	if mode == "descendant" {
		signal.Ignore(syscall.SIGTERM)
		listener, err := net.Listen("tcp4", os.Getenv("DSHD_TEST_DESCENDANT"))
		if err != nil {
			os.Exit(30)
		}
		_ = http.Serve(listener, http.NotFoundHandler())
		os.Exit(0)
	}
	if len(os.Args) == 2 && os.Args[1] == "--version" {
		fmt.Println("test-fixture-dsh")
		os.Exit(0)
	}
	if len(os.Args) != 7 {
		os.Exit(21)
	}
	port := os.Args[5]
	want := []string{"web", "--host", "127.0.0.1", "--port", port, "--no-open"}
	if !reflect.DeepEqual(os.Args[1:], want) {
		os.Exit(22)
	}
	home := os.Getenv("DSH_HOME")
	cwd, _ := os.Getwd()
	_ = os.MkdirAll(home, 0700)
	observed, _ := json.Marshal(map[string]any{"args": os.Args[1:], "home": home, "cwd": cwd, "inherited": os.Getenv("DSHD_TEST_INHERITED")})
	_ = os.WriteFile(filepath.Join(home, "observed.json"), observed, 0600)
	if mode == "exit" {
		fmt.Fprintln(os.Stderr, "intentional startup failure")
		os.Exit(23)
	}
	if mode == "tree" {
		child := exec.Command(os.Args[0])
		child.Env = append(os.Environ(), "DSHD_TEST_CHILD=descendant")
		child.Stdout, child.Stderr = os.Stdout, os.Stderr
		if err := child.Start(); err != nil {
			os.Exit(24)
		}
	}
	listener, err := net.Listen("tcp4", "127.0.0.1:"+port)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(25)
	}
	signals := make(chan os.Signal, 1)
	signal.Notify(signals, syscall.SIGTERM, os.Interrupt)
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if mode == "redirect" {
			http.Redirect(w, r, os.Getenv("DSHD_TEST_REDIRECT"), http.StatusSeeOther)
			return
		}
		if r.URL.Query().Get("token") == "test-only-token" {
			http.SetCookie(w, &http.Cookie{Name: "dsh-test", Value: "yes", Path: "/"})
			http.Redirect(w, r, "/", http.StatusSeeOther)
			return
		}
		if c, err := r.Cookie("dsh-test"); err != nil || c.Value != "yes" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte("<!doctype html><title>Controlled CLI</title>"))
	})
	server := &http.Server{Handler: handler, ReadHeaderTimeout: time.Second}
	go func() { _ = server.Serve(listener) }()
	if mode == "loud" {
		fmt.Println(strings.Repeat("x", 256*1024))
	}
	url := "http://127.0.0.1:" + port + "/?token=test-only-token"
	if mode == "wrong-url" {
		url = "http://127.0.0.1:1/?token=test-only-token"
	}
	if mode != "no-url" {
		fmt.Print("dsh web: ") // Deliberately split the readiness line across writes.
		time.Sleep(time.Millisecond)
		fmt.Println(url)
	}
	<-signals
	_ = server.Close()
	os.Exit(0)
}

func freePort(t *testing.T) int {
	t.Helper()
	listener, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	port := listener.Addr().(*net.TCPAddr).Port
	_ = listener.Close()
	return port
}

func await(t *testing.T, timeout time.Duration, condition func() bool) {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if condition() {
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatal("condition did not become true before deadline")
}

func TestDSH(t *testing.T) {
	executable, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	options := func(t *testing.T) Options {
		return Options{Executable: executable, Home: filepath.Join(t.TempDir(), "new-home"), Workspace: t.TempDir(), Port: freePort(t)}
	}
	t.Setenv("DSHD_TEST_INHERITED", "kept")
	t.Setenv("DSH_HOME", "  ")
	t.Run("empty-home-is-omitted", func(t *testing.T) {
		for _, entry := range childEnv("") {
			if strings.EqualFold(entry, "DSH_HOME=") {
				t.Fatal("empty DSH_HOME override leaked to child")
			}
		}
	})
	t.Run("paths-and-validation", func(t *testing.T) {
		defaults, err := defaultOptions()
		if err != nil {
			t.Fatal(err)
		}
		home, _ := os.UserHomeDir()
		if defaults.Home != filepath.Join(home, ".dsh") {
			t.Fatal(defaults.Home)
		}
		o := options(t)
		normalized, err := normalizeOptions(o)
		if err != nil || !filepath.IsAbs(normalized.Home) {
			t.Fatalf("%+v: %v", normalized, err)
		}
		if _, err := os.Stat(o.Home); !os.IsNotExist(err) {
			t.Fatal("normalization created Home")
		}
		o.Port = 0
		if _, err := normalizeOptions(o); err == nil {
			t.Fatal("accepted port zero")
		}
		o.Port = 3080
		o.Executable = filepath.Join(t.TempDir(), "missing")
		if _, err := normalizeOptions(o); err == nil {
			t.Fatal("accepted missing executable")
		}
	})
	t.Run("auth-argv-env-cwd-restart-and-log-bound", func(t *testing.T) {
		t.Setenv("DSHD_TEST_CHILD", "loud")
		o := options(t)
		d := newDSH()
		t.Cleanup(func() { _ = d.Close() })
		version, err := checkCLI(o)
		if err != nil || version != "test-fixture-dsh" {
			t.Fatalf("%q: %v", version, err)
		}
		if err := d.Start(o); err != nil {
			t.Fatal(err)
		}
		if err := d.Start(o); err == nil {
			t.Fatal("accepted a second start")
		}
		await(t, 8*time.Second, func() bool { return d.Status().State == "running" })
		s := d.Status()
		if len(s.Logs) > maxLogBytes || strings.Contains(s.Logs, "test-only-token") || strings.Contains(s.URL, "?") {
			t.Fatalf("unbounded or unredacted status: %+v", s)
		}
		raw, err := os.ReadFile(filepath.Join(o.Home, "observed.json"))
		if err != nil {
			t.Fatal(err)
		}
		var observed struct {
			Args                 []string
			Home, Cwd, Inherited string
		}
		if err := json.Unmarshal(raw, &observed); err != nil {
			t.Fatal(err)
		}
		want := []string{"web", "--host", "127.0.0.1", "--port", strconv.Itoa(o.Port), "--no-open"}
		if !reflect.DeepEqual(observed.Args, want) || observed.Home != o.Home || observed.Cwd != o.Workspace || observed.Inherited != "kept" {
			t.Fatalf("%+v", observed)
		}
		if os.Getenv("DSH_HOME") != "  " {
			t.Fatal("mutated parent environment")
		}
		if err := d.Stop(); err != nil {
			t.Fatal(err)
		}
		if d.Status().State != "stopped" {
			t.Fatalf("%+v", d.Status())
		}
		if err := d.Start(o); err != nil {
			t.Fatal(err)
		}
		await(t, 8*time.Second, func() bool { return d.Status().State == "running" })
		if err := d.Close(); err != nil {
			t.Fatal(err)
		}
		if err := d.Close(); err != nil {
			t.Fatal(err)
		}
		if err := d.Start(o); err == nil {
			t.Fatal("start after close")
		}
	})
	t.Run("foreign-port-and-untrusted-redirect", func(t *testing.T) {
		var hits atomic.Int32
		foreign := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { hits.Add(1); w.WriteHeader(200) }))
		defer foreign.Close()
		d := newDSH()
		t.Cleanup(func() { _ = d.Close() })
		o := options(t)
		o.Port = foreign.Listener.Addr().(*net.TCPAddr).Port
		if err := d.Start(o); err == nil {
			t.Fatal("accepted occupied port")
		}
		if hits.Load() != 0 {
			t.Fatal("contacted a foreign server")
		}
		t.Setenv("DSHD_TEST_CHILD", "redirect")
		t.Setenv("DSHD_TEST_REDIRECT", foreign.URL)
		o.Port = freePort(t)
		if err := d.Start(o); err != nil {
			t.Fatal(err)
		}
		time.Sleep(600 * time.Millisecond)
		if d.Status().State == "running" || hits.Load() != 0 {
			t.Fatal("accepted/followed foreign redirect")
		}
		if err := d.Stop(); err != nil {
			t.Fatal(err)
		}
	})
	t.Run("startup-failures", func(t *testing.T) {
		for _, mode := range []string{"exit", "wrong-url", "no-url"} {
			t.Setenv("DSHD_TEST_CHILD", mode)
			d := newDSH()
			t.Cleanup(func() { _ = d.Close() })
			if err := d.Start(options(t)); err != nil {
				t.Fatal(err)
			}
			if mode == "no-url" {
				time.Sleep(300 * time.Millisecond)
				if d.Status().State != "starting" {
					t.Fatalf("%s: %+v", mode, d.Status())
				}
			} else {
				await(t, 8*time.Second, func() bool { return d.Status().State == "failed" })
				if d.Status().Error == "" {
					t.Fatal("lost startup error")
				}
			}
			if err := d.Close(); err != nil {
				t.Fatal(err)
			}
		}
	})
	t.Run("owned-descendants", func(t *testing.T) {
		t.Setenv("DSHD_TEST_CHILD", "tree")
		address := "127.0.0.1:" + strconv.Itoa(freePort(t))
		t.Setenv("DSHD_TEST_DESCENDANT", address)
		d := newDSH()
		t.Cleanup(func() { _ = d.Close() })
		if err := d.Start(options(t)); err != nil {
			t.Fatal(err)
		}
		await(t, 8*time.Second, func() bool { return d.Status().State == "running" })
		await(t, 8*time.Second, func() bool {
			conn, err := net.DialTimeout("tcp4", address, 100*time.Millisecond)
			if err != nil {
				return false
			}
			_ = conn.Close()
			return true
		})
		if err := d.Stop(); err != nil {
			t.Fatal(err)
		}
		listener, err := net.Listen("tcp4", address)
		if err != nil {
			t.Fatalf("owned descendant still listening: %v", err)
		}
		_ = listener.Close()
	})
}

func TestRealDSH(t *testing.T) {
	executable := os.Getenv("DSH_DESKTOP_INTEGRATION")
	if executable == "" {
		t.Skip("set DSH_DESKTOP_INTEGRATION to an installed DSH executable")
	}
	t.Setenv("DSHD_TEST_CHILD", "")
	o := Options{Executable: executable, Home: t.TempDir(), Workspace: t.TempDir(), Port: freePort(t)}
	patchPath := filepath.Join(o.Home, "cordis.patch.yml")
	patch := []byte("# Preserve user comments; desktop does not rewrite YAML.\n[]\n")
	if err := os.WriteFile(patchPath, patch, 0600); err != nil {
		t.Fatal(err)
	}
	version, err := checkCLI(o)
	if err != nil {
		t.Fatal(err)
	}
	d := newDSH()
	t.Cleanup(func() { _ = d.Close() })
	for range 2 {
		if err := d.Start(o); err != nil {
			t.Fatal(err)
		}
		await(t, 55*time.Second, func() bool {
			s := d.Status()
			if s.State == "failed" {
				t.Fatalf("real DSH failed: %s\n%s", s.Error, s.Logs)
			}
			return s.State == "running"
		})
		if strings.Contains(d.Status().Logs, "?token=") {
			t.Fatal("launch token exposed in logs")
		}
		if err := d.Stop(); err != nil {
			t.Fatal(err)
		}
		after, err := os.ReadFile(patchPath)
		if err != nil || string(after) != string(patch) {
			t.Fatalf("patch changed: %v", err)
		}
		listener, err := net.Listen("tcp4", "127.0.0.1:"+strconv.Itoa(o.Port))
		if err != nil {
			t.Fatalf("DSH port was not released: %v", err)
		}
		_ = listener.Close()
	}
	t.Logf("real DSH version %s: authenticated readiness, stop/restart and byte-for-byte Home patch preservation passed", version)
}
