package update

import (
	"context"
	"errors"
	"net/http"
	"os"
	"runtime"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"deepseek-harness-desktop/internal/version"
)

var errNoReleases = errors.New("还没有 GitHub Release")

type Updater struct {
	mu        sync.Mutex
	client    *http.Client
	apiBase   string
	repo      string
	current   string
	goos      string
	goarch    string
	state     string
	latest    string
	notes     string
	release   string
	asset     githubAsset
	sum       string
	file      string
	errMsg    string
	done      atomic.Int64
	total     atomic.Int64
	autoCheck atomic.Bool
	allowURL  func(string) error
}

func New() *Updater {
	repo := strings.TrimSpace(os.Getenv("DSH_DESKTOP_UPDATE_REPO"))
	if repo == "" {
		repo = DefaultRepo
	}
	u := &Updater{
		client:  &http.Client{Timeout: 15 * time.Second},
		apiBase: "https://api.github.com",
		repo:    repo,
		current: version.Version,
		goos:    runtime.GOOS,
		goarch:  runtime.GOARCH,
		state:   StateIdle,
	}
	u.loadPrefs()
	return u
}

func (u *Updater) CurrentVersion() string { return NormalizeVersion(u.current) }

// KickCheck starts a GitHub check in the background so Wails bindings never block on the network.
func (u *Updater) KickCheck() {
	u.mu.Lock()
	if u.state == StateChecking || u.state == StateDownloading || u.state == StateApplying {
		u.mu.Unlock()
		return
	}
	u.state = StateChecking
	u.errMsg = ""
	u.mu.Unlock()
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		defer cancel()
		_, _ = u.Check(ctx)
	}()
}

func (u *Updater) Snapshot() Snapshot {
	u.mu.Lock()
	defer u.mu.Unlock()
	done, total := u.done.Load(), u.total.Load()
	progress := 0.0
	if total > 0 {
		progress = float64(done) / float64(total)
	}
	return Snapshot{
		State:          u.state,
		CurrentVersion: NormalizeVersion(u.current),
		LatestVersion:  u.latest,
		Notes:          u.notes,
		ReleaseURL:     u.release,
		AssetName:      u.asset.Name,
		BytesTotal:     total,
		BytesDone:      done,
		Progress:       progress,
		Error:          u.errMsg,
		AutoCheck:      u.autoCheck.Load(),
	}
}

func (u *Updater) Check(ctx context.Context) (Snapshot, error) {
	u.mu.Lock()
	u.state = StateChecking
	u.errMsg = ""
	u.mu.Unlock()
	rel, err := u.fetchLatest(ctx)
	u.mu.Lock()
	defer u.mu.Unlock()
	if errors.Is(err, errNoReleases) {
		u.state = StateUnavailable
		u.errMsg = err.Error()
		return u.snapshotLocked(), nil
	}
	if err != nil {
		u.state = StateFailed
		u.errMsg = err.Error()
		return u.snapshotLocked(), err
	}
	u.latest = NormalizeVersion(rel.TagName)
	u.notes = strings.TrimSpace(rel.Body)
	u.release = rel.HTMLURL
	if CompareVersions(u.current, u.latest) >= 0 {
		u.state = StateUpToDate
		u.asset = githubAsset{}
		u.sum = ""
		u.file = ""
		return u.snapshotLocked(), nil
	}
	want := AssetName(u.goos, u.goarch)
	var asset githubAsset
	var sumsURL string
	for _, item := range rel.Assets {
		switch item.Name {
		case want:
			asset = item
		case "SHA256SUMS":
			sumsURL = item.BrowserDownloadURL
		}
	}
	if asset.Name == "" {
		u.state = StateFailed
		u.errMsg = "此平台还没有对应的 Release 产物（" + want + "）"
		return u.snapshotLocked(), errors.New(u.errMsg)
	}
	if sumsURL == "" {
		u.state = StateFailed
		u.errMsg = "Release 缺少 SHA256SUMS，拒绝安装"
		return u.snapshotLocked(), errors.New(u.errMsg)
	}
	u.mu.Unlock()
	sumsBody, sumErr := u.getBytes(ctx, sumsURL)
	u.mu.Lock()
	if sumErr != nil {
		u.state = StateFailed
		u.errMsg = "读取 SHA256SUMS 失败: " + sumErr.Error()
		return u.snapshotLocked(), sumErr
	}
	sum, ok := parseChecksums(string(sumsBody))[want]
	if !ok {
		u.state = StateFailed
		u.errMsg = "SHA256SUMS 中没有 " + want
		return u.snapshotLocked(), errors.New(u.errMsg)
	}
	if err := u.checkDownloadURL(asset.BrowserDownloadURL); err != nil {
		u.state = StateFailed
		u.errMsg = err.Error()
		return u.snapshotLocked(), err
	}
	u.asset = asset
	u.sum = sum
	u.total.Store(asset.Size)
	if u.file != "" && fileChecksum(u.file) == sum {
		u.state = StateReady
	} else {
		u.file = ""
		u.state = StateAvailable
	}
	return u.snapshotLocked(), nil
}

func (u *Updater) snapshotLocked() Snapshot {
	done, total := u.done.Load(), u.total.Load()
	progress := 0.0
	if total > 0 {
		progress = float64(done) / float64(total)
	}
	return Snapshot{
		State:          u.state,
		CurrentVersion: NormalizeVersion(u.current),
		LatestVersion:  u.latest,
		Notes:          u.notes,
		ReleaseURL:     u.release,
		AssetName:      u.asset.Name,
		BytesTotal:     total,
		BytesDone:      done,
		Progress:       progress,
		Error:          u.errMsg,
		AutoCheck:      u.autoCheck.Load(),
	}
}

func (u *Updater) fetchLatest(ctx context.Context) (githubRelease, error) {
	var rel githubRelease
	err := u.getJSON(ctx, strings.TrimRight(u.apiBase, "/")+"/repos/"+u.repo+"/releases/latest", &rel)
	if err != nil {
		return githubRelease{}, err
	}
	if rel.Draft || rel.Prerelease || strings.TrimSpace(rel.TagName) == "" {
		return githubRelease{}, errNoReleases
	}
	return rel, nil
}

func (u *Updater) Prepare(ctx context.Context) error {
	snap, err := u.Check(ctx)
	if err != nil {
		return err
	}
	if snap.State == StateUpToDate || snap.State == StateUnavailable {
		return errors.New(messageFor(snap))
	}
	if snap.State == StateReady {
		return nil
	}
	return u.Download(ctx)
}

func messageFor(s Snapshot) string {
	switch s.State {
	case StateUpToDate:
		return "已经是最新版本 " + s.CurrentVersion
	case StateUnavailable:
		return s.Error
	default:
		return s.Error
	}
}
