package update

import (
	"context"
	"crypto/sha256"
	"deepseek-harness-desktop/internal/i18n"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"sync/atomic"
	"time"
)

func (u *Updater) Download(ctx context.Context) error {
	u.mu.Lock()
	if u.state != StateAvailable && u.state != StateReady && u.state != StateFailed {
		state := u.state
		u.mu.Unlock()
		if state == StateReady {
			return nil
		}
		return fmt.Errorf("%s", i18n.TActive("update.download_not_allowed", state))
	}
	asset, sum := u.asset, u.sum
	u.state = StateDownloading
	u.errMsg = ""
	u.done.Store(0)
	u.total.Store(asset.Size)
	u.mu.Unlock()

	dir, err := os.UserCacheDir()
	if err != nil {
		return u.fail(err)
	}
	dir = filepath.Join(dir, "deepseek-harness-desktop", "updates")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return u.fail(err)
	}
	dest := filepath.Join(dir, asset.Name)
	if fileChecksum(dest) == sum {
		return u.ready(dest)
	}
	if err := u.checkDownloadURL(asset.BrowserDownloadURL); err != nil {
		return u.fail(err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, asset.BrowserDownloadURL, nil)
	if err != nil {
		return u.fail(err)
	}
	req.Header.Set("User-Agent", "Deepseek-Harness-Desktop/"+u.current)
	res, err := downloadClient(u.client).Do(req)
	if err != nil {
		return u.fail(err)
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode > 299 {
		return u.fail(fmt.Errorf("%s", i18n.TActive("update.download_http", strconv.Itoa(res.StatusCode))))
	}
	if res.ContentLength > 0 {
		u.total.Store(res.ContentLength)
	}
	tmp := dest + ".partial"
	f, err := os.OpenFile(tmp, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o600)
	if err != nil {
		return u.fail(err)
	}
	hash := sha256.New()
	w := io.MultiWriter(f, hash, countWriter{n: &u.done})
	_, copyErr := io.Copy(w, res.Body)
	closeErr := f.Close()
	if copyErr != nil {
		_ = os.Remove(tmp)
		return u.fail(copyErr)
	}
	if closeErr != nil {
		_ = os.Remove(tmp)
		return u.fail(closeErr)
	}
	got := hex.EncodeToString(hash.Sum(nil))
	if got != sum {
		_ = os.Remove(tmp)
		return u.fail(i18n.ErrorfActive("update.checksum_mismatch"))
	}
	_ = os.Remove(dest)
	if err := os.Rename(tmp, dest); err != nil {
		return u.fail(err)
	}
	return u.ready(dest)
}

func (u *Updater) fail(err error) error {
	u.mu.Lock()
	defer u.mu.Unlock()
	u.state = StateFailed
	u.errMsg = err.Error()
	return err
}

func (u *Updater) ready(path string) error {
	u.mu.Lock()
	defer u.mu.Unlock()
	u.file = path
	u.state = StateReady
	u.errMsg = ""
	return nil
}

func (u *Updater) stagedFile() (string, string, error) {
	u.mu.Lock()
	defer u.mu.Unlock()
	if u.state != StateReady || u.file == "" {
		return "", "", i18n.ErrorfActive("update.no_verified_package")
	}
	return u.file, u.asset.Name, nil
}

type countWriter struct{ n *atomic.Int64 }

func (c countWriter) Write(p []byte) (int, error) {
	c.n.Add(int64(len(p)))
	return len(p), nil
}

func downloadClient(base *http.Client) *http.Client {
	client := &http.Client{Timeout: 20 * time.Minute}
	if base != nil {
		client.Transport = base.Transport
		client.CheckRedirect = base.CheckRedirect
		client.Jar = base.Jar
	}
	return client
}

func fileChecksum(path string) string {
	f, err := os.Open(path)
	if err != nil {
		return ""
	}
	defer f.Close()
	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return ""
	}
	return hex.EncodeToString(h.Sum(nil))
}
