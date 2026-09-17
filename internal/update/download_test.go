package update

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func newDownloadTestUpdater(t *testing.T, serverURL string, payload []byte, size int64) *Updater {
	t.Helper()
	sum := sha256.Sum256(payload)
	u := New()
	u.client = &http.Client{}
	u.allowURL = func(raw string) error {
		if strings.HasPrefix(raw, serverURL) {
			return nil
		}
		return errors.New("unexpected download host")
	}
	u.state = StateAvailable
	u.asset = githubAsset{
		Name:               "deepseek-harness-desktop-linux-amd64",
		BrowserDownloadURL: serverURL + "/artifact",
		Size:               size,
	}
	u.sum = hex.EncodeToString(sum[:])
	t.Setenv("XDG_CACHE_HOME", t.TempDir())
	return u
}

func TestDownloadRejectsRedirectFinalURL(t *testing.T) {
	payload := []byte("payload")
	evil := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write(payload)
	}))
	defer evil.Close()
	var source *httptest.Server
	source = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, evil.URL+"/artifact", http.StatusFound)
	}))
	defer source.Close()
	u := newDownloadTestUpdater(t, source.URL, payload, int64(len(payload)))
	if err := u.Download(t.Context()); err == nil {
		t.Fatal("accepted redirect to a different final URL")
	}
}

func TestDownloadRequiresExactActualSize(t *testing.T) {
	payload := []byte("payload")
	source := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = fmt.Fprint(w, string(payload))
	}))
	defer source.Close()
	u := newDownloadTestUpdater(t, source.URL, payload, int64(len(payload)-1))
	if err := u.Download(t.Context()); err == nil {
		t.Fatal("accepted a body larger than the expected artifact size")
	}
}

func TestDownloadRequiresExactSizeWhenBodyShort(t *testing.T) {
	payload := []byte("payload")
	short := payload[:len(payload)-1]
	source := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = fmt.Fprint(w, string(short))
	}))
	defer source.Close()
	u := newDownloadTestUpdater(t, source.URL, payload, int64(len(payload)))
	if err := u.Download(t.Context()); err == nil {
		t.Fatal("accepted a body smaller than the expected artifact size")
	}
}
