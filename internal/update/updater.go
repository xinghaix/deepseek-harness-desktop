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

	"deepseek-harness-desktop/internal/i18n"
	"deepseek-harness-desktop/internal/version"
)

var errNoReleases = errors.New("no GitHub Release") // sentinel for errors.Is; UI uses update.no_releases

type Updater struct {
	mu        sync.Mutex
	client    *http.Client
	apiBase   string
	repo      string
	current   string
	goos      string
	goarch    string
	appID     string
	channel   string
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
	// manifestKey is intentionally a string so builds can inject it with
	// -ldflags and development/test callers can configure it explicitly.
	manifestKey      string
	manifestVerified bool
	legacyChecksum   bool
	// Explicit package-internal opt-in for historical release tests; never set by New.
	allowLegacy bool
}

func New() *Updater {
	repo := strings.TrimSpace(os.Getenv("DSH_DESKTOP_UPDATE_REPO"))
	if repo == "" {
		repo = DefaultRepo
	}
	channel := strings.TrimSpace(os.Getenv("DSH_DESKTOP_UPDATE_CHANNEL"))
	if channel == "" {
		channel = "stable"
	}
	// A production build pins the trust root with -ldflags. The environment
	// override is only a development/bootstrap escape hatch when no key was
	// compiled in; it cannot silently replace a pinned publisher key.
	manifestKey := strings.TrimSpace(ManifestPublicKey)
	if manifestKey == "" {
		manifestKey = strings.TrimSpace(os.Getenv(ManifestPublicKeyEnv))
	}
	u := &Updater{
		client:      &http.Client{Timeout: 15 * time.Second},
		apiBase:     "https://api.github.com",
		repo:        repo,
		current:     version.Version,
		goos:        runtime.GOOS,
		goarch:      runtime.GOARCH,
		appID:       DefaultAppID,
		channel:     channel,
		manifestKey: manifestKey,
		state:       StateIdle,
	}
	u.loadPrefs()
	return u
}

// NewWithManifestPublicKey is an explicit development/test configuration seam.
// Production builds should prefer ManifestPublicKey via -ldflags or the
// DSH_DESKTOP_UPDATE_PUBLIC_KEY environment override.
func NewWithManifestPublicKey(rawKey string) *Updater {
	u := New()
	u.manifestKey = strings.TrimSpace(rawKey)
	return u
}

// SetManifestPublicKey explicitly configures the key used for signed manifests.
// It is intended for development/test setup; changing it does not affect an
// already downloaded artifact until the next Check call.
func (u *Updater) SetManifestPublicKey(rawKey string) {
	u.mu.Lock()
	defer u.mu.Unlock()
	u.manifestKey = strings.TrimSpace(rawKey)
}

func (u *Updater) CurrentVersion() string { return NormalizeVersion(u.current) }

func (u *Updater) ReleasePageURL() string {
	u.mu.Lock()
	defer u.mu.Unlock()
	if AllowedReleasePageURL(u.release, u.repo) == nil {
		return u.release
	}
	return "https://github.com/" + strings.Trim(u.repo, "/") + "/releases"
}

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
		State:            u.state,
		CurrentVersion:   NormalizeVersion(u.current),
		LatestVersion:    u.latest,
		Notes:            u.notes,
		ReleaseURL:       u.release,
		AssetName:        u.asset.Name,
		BytesTotal:       total,
		BytesDone:        done,
		Progress:         progress,
		Error:            u.errMsg,
		AutoCheck:        u.autoCheck.Load(),
		ManifestVerified: u.manifestVerified,
		LegacyChecksum:   u.legacyChecksum,
	}
}

func (u *Updater) Check(ctx context.Context) (Snapshot, error) {
	u.mu.Lock()
	u.state = StateChecking
	u.errMsg = ""
	u.mu.Unlock()
	rel, err := u.fetchLatest(ctx)
	u.mu.Lock()
	if errors.Is(err, errNoReleases) {
		u.state = StateUnavailable
		u.errMsg = i18n.TActive("update.no_releases")
		snapshot := u.snapshotLocked()
		u.mu.Unlock()
		return snapshot, nil
	}
	if err != nil {
		u.state = StateFailed
		u.errMsg = err.Error()
		snapshot := u.snapshotLocked()
		u.mu.Unlock()
		return snapshot, err
	}
	u.latest = NormalizeVersion(rel.TagName)
	u.notes = strings.TrimSpace(rel.Body)
	u.release = rel.HTMLURL
	if CompareVersions(u.current, u.latest) >= 0 {
		u.state = StateUpToDate
		u.asset = githubAsset{}
		u.sum = ""
		u.file = ""
		u.manifestVerified = false
		u.legacyChecksum = false
		snapshot := u.snapshotLocked()
		u.mu.Unlock()
		return snapshot, nil
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
	manifestAsset := findManifestAsset(rel.Assets, u.goos, u.goarch)
	if asset.Name == "" {
		u.state = StateFailed
		u.errMsg = i18n.TActive("update.no_asset_for_platform", want)
		msg := u.errMsg
		snapshot := u.snapshotLocked()
		u.mu.Unlock()
		return snapshot, errors.New(msg)
	}
	if manifestAsset.Name == "" && !u.allowLegacy {
		u.state = StateFailed
		u.errMsg = "update: signed platform manifest is required"
		snapshot := u.snapshotLocked()
		u.mu.Unlock()
		return snapshot, errors.New(snapshot.Error)
	}
	if manifestAsset.Name == "" && sumsURL == "" {
		u.state = StateFailed
		u.errMsg = i18n.TActive("update.missing_sha256sums")
		msg := u.errMsg
		snapshot := u.snapshotLocked()
		u.mu.Unlock()
		return snapshot, errors.New(msg)
	}
	manifestKey := u.manifestKey
	expected := ManifestExpectation{
		AppID:          u.appID,
		Channel:        u.channel,
		Version:        rel.TagName,
		UpdaterVersion: u.current,
		GOOS:           u.goos,
		GOARCH:         u.goarch,
		ArtifactName:   want,
		ArtifactSize:   asset.Size,
	}
	u.mu.Unlock()
	var sum string
	manifestVerified := false
	var sumErr error
	if manifestAsset.Name != "" {
		var manifest Manifest
		manifest, sumErr = u.fetchAndVerifyManifest(ctx, manifestAsset, manifestKey, expected)
		if sumErr == nil {
			sum = manifest.Artifact.SHA256
			// GitHub's asset metadata is not a trust root. The signed size is
			// authoritative when the API omits size, and a mismatch is rejected
			// by ManifestExpectation when it is present.
			asset.Size = manifest.Artifact.Size
			manifestVerified = true
		}
	} else {
		var sumsBody []byte
		sumsBody, sumErr = u.getBytesChecked(ctx, sumsURL, maxManifestBytes, u.checkDownloadURL)
		if sumErr == nil {
			var ok bool
			sum, ok = parseChecksums(string(sumsBody))[want]
			if !ok {
				sumErr = errors.New(i18n.TActive("update.sha256sums_missing_file", want))
			}
		}
	}
	u.mu.Lock()
	defer u.mu.Unlock()
	if sumErr != nil {
		u.state = StateFailed
		if manifestAsset.Name != "" {
			u.errMsg = sumErr.Error()
		} else if errors.Is(sumErr, errNoReleases) {
			u.errMsg = i18n.TActive("update.read_sha256sums_failed", sumErr.Error())
		} else {
			u.errMsg = i18n.TActive("update.read_sha256sums_failed", sumErr.Error())
		}
		return u.snapshotLocked(), sumErr
	}
	if err := u.checkDownloadURL(asset.BrowserDownloadURL); err != nil {
		u.state = StateFailed
		u.errMsg = err.Error()
		return u.snapshotLocked(), err
	}
	u.asset = asset
	u.sum = sum
	u.manifestVerified = manifestVerified
	u.legacyChecksum = !manifestVerified
	u.total.Store(asset.Size)
	if u.file != "" && fileChecksum(u.file) == sum && fileSize(u.file) == asset.Size {
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
		State:            u.state,
		CurrentVersion:   NormalizeVersion(u.current),
		LatestVersion:    u.latest,
		Notes:            u.notes,
		ReleaseURL:       u.release,
		AssetName:        u.asset.Name,
		BytesTotal:       total,
		BytesDone:        done,
		Progress:         progress,
		Error:            u.errMsg,
		AutoCheck:        u.autoCheck.Load(),
		ManifestVerified: u.manifestVerified,
		LegacyChecksum:   u.legacyChecksum,
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
		return i18n.TActive("update.already_latest", s.CurrentVersion)
	case StateUnavailable:
		return s.Error
	default:
		return s.Error
	}
}
