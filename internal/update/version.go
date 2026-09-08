package update

import "strings"

const (
	StateIdle        = "idle"
	StateChecking    = "checking"
	StateUpToDate    = "upToDate"
	StateUnavailable = "unavailable"
	StateAvailable   = "available"
	StateDownloading = "downloading"
	StateReady       = "ready"
	StateApplying    = "applying"
	StateFailed      = "failed"
)

type Snapshot struct {
	State          string  `json:"state"`
	CurrentVersion string  `json:"currentVersion"`
	LatestVersion  string  `json:"latestVersion"`
	Notes          string  `json:"notes"`
	ReleaseURL     string  `json:"releaseURL"`
	AssetName      string  `json:"assetName"`
	BytesTotal     int64   `json:"bytesTotal"`
	BytesDone      int64   `json:"bytesDone"`
	Progress       float64 `json:"progress"`
	Error          string  `json:"error"`
}

func NormalizeVersion(v string) string {
	v = strings.TrimSpace(v)
	v = strings.TrimPrefix(v, "v")
	v = strings.TrimPrefix(v, "V")
	return v
}

func CompareVersions(a, b string) int {
	ap, bp := versionParts(NormalizeVersion(a)), versionParts(NormalizeVersion(b))
	for i := 0; i < 3; i++ {
		if ap[i] < bp[i] {
			return -1
		}
		if ap[i] > bp[i] {
			return 1
		}
	}
	return 0
}

func versionParts(v string) [3]int {
	var out [3]int
	fields := strings.Split(v, ".")
	for i := 0; i < 3 && i < len(fields); i++ {
		n := 0
		for _, r := range fields[i] {
			if r < '0' || r > '9' {
				break
			}
			n = n*10 + int(r-'0')
		}
		out[i] = n
	}
	return out
}

func AssetName(goos, goarch string) string {
	switch goos {
	case "darwin":
		return "deepseek-harness-desktop-darwin-" + goarch + ".zip"
	case "windows":
		return "deepseek-harness-desktop-windows-" + goarch + ".exe"
	default:
		return "deepseek-harness-desktop-linux-" + goarch
	}
}
