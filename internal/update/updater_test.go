package update

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestCompareAndAssets(t *testing.T) {
	if CompareVersions("0.1.0", "v0.1.0") != 0 || CompareVersions("0.1.0", "0.1.1") >= 0 {
		t.Fatal("compare")
	}
	if AssetName("darwin", "arm64") != "deepseek-harness-desktop-darwin-arm64.zip" {
		t.Fatal(AssetName("darwin", "arm64"))
	}
}

func TestParseChecksums(t *testing.T) {
	m := parseChecksums("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa  foo.zip\n")
	if m["foo.zip"] != "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" {
		t.Fatalf("%v", m)
	}
}

func TestRejectNonGitHubURL(t *testing.T) {
	if err := allowedDownloadURL("https://evil.example/a"); err == nil {
		t.Fatal("accepted")
	}
}

func TestCheckNoReleases(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))
	defer srv.Close()
	u := New()
	u.client = srv.Client()
	u.apiBase = srv.URL
	snap, err := u.Check(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if snap.State != StateUnavailable {
		t.Fatalf("%+v", snap)
	}
}

func TestCheckAndDownload(t *testing.T) {
	payload := []byte("desktop-update-bytes")
	sum := hex.EncodeToString(sha256Sum(payload))
	want := AssetName("darwin", "arm64")
	var srvURL string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/repos/xinghaix/deepseek-harness-desktop/releases/latest":
			_, _ = fmt.Fprintf(w, `{"tag_name":"v9.9.9","body":"hello","html_url":"https://github.com/xinghaix/deepseek-harness-desktop/releases/tag/v9.9.9","assets":[{"name":"%s","browser_download_url":"%s/file.bin","size":%d},{"name":"SHA256SUMS","browser_download_url":"%s/SHA256SUMS","size":80}]}`, want, srvURL, len(payload), srvURL)
		case "/SHA256SUMS":
			_, _ = fmt.Fprintf(w, "%s  %s\n", sum, want)
		case "/file.bin":
			_, _ = w.Write(payload)
		default:
			w.WriteHeader(404)
		}
	}))
	srvURL = srv.URL
	defer srv.Close()
	u := New()
	u.client = srv.Client()
	u.apiBase = srv.URL
	u.current = "0.1.0"
	u.goos, u.goarch = "darwin", "arm64"
	u.allowURL = func(string) error { return nil }
	t.Setenv("HOME", t.TempDir())
	os.Setenv("XDG_CACHE_HOME", t.TempDir())
	snap, err := u.Check(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if snap.State != StateAvailable || snap.LatestVersion != "9.9.9" {
		t.Fatalf("%+v", snap)
	}
	if err := u.Download(context.Background()); err != nil {
		t.Fatal(err)
	}
	snap = u.Snapshot()
	if snap.State != StateReady {
		t.Fatalf("%+v", snap)
	}
	data, err := os.ReadFile(u.file)
	if err != nil {
		t.Fatal(err)
	}
	if string(data) != string(payload) {
		t.Fatal(filepath.Base(u.file))
	}
}

func sha256Sum(p []byte) []byte {
	s := sha256.Sum256(p)
	return s[:]
}
