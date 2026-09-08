package update

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
)

const DefaultRepo = "xinghaix/deepseek-harness-desktop"

type githubRelease struct {
	TagName    string        `json:"tag_name"`
	Body       string        `json:"body"`
	HTMLURL    string        `json:"html_url"`
	Draft      bool          `json:"draft"`
	Prerelease bool          `json:"prerelease"`
	Assets     []githubAsset `json:"assets"`
}

type githubAsset struct {
	Name               string `json:"name"`
	BrowserDownloadURL string `json:"browser_download_url"`
	Size               int64  `json:"size"`
}

func parseChecksums(text string) map[string]string {
	out := make(map[string]string)
	for _, line := range strings.Split(text, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 2 || len(fields[0]) != 64 {
			continue
		}
		name := strings.TrimPrefix(fields[len(fields)-1], "*")
		out[name] = strings.ToLower(fields[0])
	}
	return out
}

func (u *Updater) checkDownloadURL(raw string) error {
	if u.allowURL != nil {
		return u.allowURL(raw)
	}
	return allowedDownloadURL(raw)
}

func allowedDownloadURL(raw string) error {
	u, err := url.Parse(raw)
	if err != nil {
		return err
	}
	if u.Scheme != "https" {
		return fmt.Errorf("更新地址必须是 HTTPS")
	}
	host := strings.ToLower(u.Hostname())
	switch host {
	case "github.com", "objects.githubusercontent.com", "release-assets.githubusercontent.com", "github-releases.githubusercontent.com":
		return nil
	default:
		return fmt.Errorf("拒绝非 GitHub 更新地址：%s", host)
	}
}

func (u *Updater) getJSON(ctx context.Context, raw string, dest any) error {
	body, err := u.getBytes(ctx, raw)
	if err != nil {
		return err
	}
	return json.Unmarshal(body, dest)
}

func (u *Updater) getBytes(ctx context.Context, raw string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, raw, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Deepseek-Harness-Desktop/"+u.current)
	req.Header.Set("Accept", "application/vnd.github+json")
	res, err := u.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	body, err := io.ReadAll(io.LimitReader(res.Body, 8<<20))
	if err != nil {
		return nil, err
	}
	if res.StatusCode == http.StatusNotFound {
		return nil, errNoReleases
	}
	if res.StatusCode < 200 || res.StatusCode > 299 {
		return nil, fmt.Errorf("GitHub 返回 HTTP %d", res.StatusCode)
	}
	return body, nil
}
