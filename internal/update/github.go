package update

import (
	"context"
	"deepseek-harness-desktop/internal/i18n"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
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

func AllowedReleasePageURL(raw, repo string) error {
	parsed, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || parsed == nil || parsed.Scheme != "https" || parsed.Hostname() != "github.com" || parsed.User != nil || parsed.Fragment != "" {
		return errors.New("update: release page URL is not an allowed GitHub URL")
	}
	prefix := "/" + strings.Trim(repo, "/") + "/releases"
	if parsed.Path != prefix && !strings.HasPrefix(parsed.Path, prefix+"/") {
		return errors.New("update: release page URL is not for the configured repository")
	}
	return nil
}

func allowedDownloadURL(raw string) error {
	u, err := url.Parse(raw)
	if err != nil {
		return err
	}
	if u.Scheme != "https" {
		return i18n.ErrorfActive("update.url_must_https")
	}
	if port := u.Port(); port != "" && port != "443" {
		return fmt.Errorf("update: rejected non-default HTTPS port %q", port)
	}
	host := strings.ToLower(u.Hostname())
	switch host {
	case "github.com", "objects.githubusercontent.com", "release-assets.githubusercontent.com", "github-releases.githubusercontent.com":
		return nil
	default:
		return fmt.Errorf("%s", i18n.TActive("update.reject_non_github", host))
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
		return nil, fmt.Errorf("%s", i18n.TActive("update.github_http", strconv.Itoa(res.StatusCode)))
	}
	return body, nil
}

func (u *Updater) getBytesChecked(ctx context.Context, raw string, maxBytes int64, validate func(string) error) ([]byte, error) {
	if maxBytes <= 0 {
		return nil, errors.New("update: invalid response size limit")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, raw, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Deepseek-Harness-Desktop/"+u.current)
	client := downloadClientWithValidation(u.client, validate)
	res, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if validate != nil && res.Request != nil {
		if err := validate(res.Request.URL.String()); err != nil {
			return nil, fmt.Errorf("update: rejected final URL: %w", err)
		}
	}
	if res.ContentLength > maxBytes {
		return nil, fmt.Errorf("update: response exceeds %d bytes", maxBytes)
	}
	body, err := io.ReadAll(io.LimitReader(res.Body, maxBytes+1))
	if err != nil {
		return nil, err
	}
	if int64(len(body)) > maxBytes {
		return nil, fmt.Errorf("update: response exceeds %d bytes", maxBytes)
	}
	if res.StatusCode == http.StatusNotFound {
		return nil, errNoReleases
	}
	if res.StatusCode < 200 || res.StatusCode > 299 {
		return nil, fmt.Errorf("%s", i18n.TActive("update.github_http", strconv.Itoa(res.StatusCode)))
	}
	return body, nil
}

const maxManifestBytes int64 = 8 << 20

// findManifestAsset recognizes the stable manifest names used by release
// tooling. A manifest takes precedence over SHA256SUMS; the latter remains a
// compatibility path for releases produced before signed manifests existed.
func findManifestAsset(assets []githubAsset, goos, goarch string) githubAsset {
	want := "manifest-" + goos + "-" + goarch + ".json"
	var found githubAsset
	for _, asset := range assets {
		if asset.Name == want {
			if found.Name != "" {
				return githubAsset{} // Ambiguous release metadata fails closed.
			}
			found = asset
		}
	}
	return found
}

func (u *Updater) fetchAndVerifyManifest(ctx context.Context, asset githubAsset, rawKey string, expected ManifestExpectation) (Manifest, error) {
	if asset.BrowserDownloadURL == "" {
		return Manifest{}, errors.New("update manifest: manifest URL is empty")
	}
	if err := u.checkDownloadURL(asset.BrowserDownloadURL); err != nil {
		return Manifest{}, err
	}
	body, err := u.getBytesChecked(ctx, asset.BrowserDownloadURL, maxManifestBytes, u.checkDownloadURL)
	if err != nil {
		return Manifest{}, err
	}
	if asset.Size > 0 && int64(len(body)) != asset.Size {
		return Manifest{}, fmt.Errorf("update manifest: manifest size mismatch (got %d, want %d)", len(body), asset.Size)
	}
	return VerifyManifestWithKey(body, rawKey, expected)
}
