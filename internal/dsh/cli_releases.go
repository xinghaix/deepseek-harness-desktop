package dsh

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"sync"
	"time"

	"golang.org/x/mod/semver"
)

const (
	cliRegistryURL = "https://registry.npmjs.org/@deepseek-ai%2fdsh"
	cliGitHubAPI   = "https://api.github.com/repos/deepseek-ai/deepseek-harness/releases/tags/"
	cliRegistryTTL = 5 * time.Minute
	cliRefreshGap  = 2 * time.Second
)

var cliDistTags = [...]string{"latest", "next", "alpha"}

var cliReleaseHTTP = &http.Client{
	Timeout:       8 * time.Second,
	CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
}

// cliReleases 仅查询 npm 版本元数据和 GitHub 发布说明，不涉及桌面更新器或 CLI 安装。
// 版本元数据由所有标签共用，重复打开设置不会反复访问 npm。
type cliReleases struct {
	client *http.Client
	mu     sync.Mutex
	flight chan struct{}
	lastAt time.Time
	last   cliRegistry
	err    error
}

type cliRegistry struct {
	Tags     map[string]string          `json:"dist-tags"`
	Versions map[string]json.RawMessage `json:"versions"`
	Time     map[string]string          `json:"time"`
	Name     string                     `json:"name"`
}

type cliReleaseVersion struct {
	Version     string `json:"version"`
	PublishedAt string `json:"publishedAt,omitempty"`
	Published   bool   `json:"published"`
	Current     bool   `json:"current,omitempty"`
}

type cliReleaseChannel struct {
	Target   string              `json:"target,omitempty"`
	State    string              `json:"state"`
	Versions []cliReleaseVersion `json:"versions,omitempty"`
}

type cliReleaseCheck struct {
	Current  string                       `json:"current"`
	Channels map[string]cliReleaseChannel `json:"channels"`
}

type cliReleaseNotes struct {
	Body string `json:"body,omitempty"`
}

func fullCLISemver(version string) string {
	if len(version) > 128 {
		return ""
	}
	v := "v" + version
	core, _, _ := strings.Cut(v, "+")
	if !semver.IsValid(v) || semver.Canonical(v) != core {
		return ""
	}
	return v
}

func (s *cliReleases) request(ctx context.Context, endpoint string, dst any, limit int64) (int, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return 0, err
	}
	req.Header.Set("Accept", "application/json")
	client := s.client
	if client == nil {
		client = cliReleaseHTTP
	}
	res, err := client.Do(req)
	if err != nil {
		return 0, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return res.StatusCode, fmt.Errorf("upstream HTTP status %d", res.StatusCode)
	}
	data, err := io.ReadAll(io.LimitReader(res.Body, limit+1))
	if err != nil {
		return res.StatusCode, err
	}
	if int64(len(data)) > limit {
		return res.StatusCode, errors.New("CLI release response too large")
	}
	return res.StatusCode, json.Unmarshal(data, dst)
}

func (s *cliReleases) registry(ctx context.Context, refresh bool) (cliRegistry, error) {
	s.mu.Lock()
	if flight := s.flight; flight != nil {
		s.mu.Unlock()
		select {
		case <-ctx.Done():
			return cliRegistry{}, ctx.Err()
		case <-flight:
			s.mu.Lock()
			defer s.mu.Unlock()
			return s.last, s.err
		}
	}
	ttl := cliRegistryTTL
	if refresh || s.err != nil {
		ttl = cliRefreshGap
	}
	if time.Since(s.lastAt) < ttl {
		last, err := s.last, s.err
		s.mu.Unlock()
		return last, err
	}
	s.flight = make(chan struct{})
	s.mu.Unlock()

	var registry cliRegistry
	_, err := s.request(ctx, cliRegistryURL, &registry, 4<<20)
	if err == nil && (registry.Name != "@deepseek-ai/dsh" || registry.Tags == nil || len(registry.Versions) == 0) {
		err = errors.New("invalid CLI package metadata")
	}

	s.mu.Lock()
	s.last, s.err, s.lastAt = registry, err, time.Now()
	close(s.flight)
	s.flight = nil
	s.mu.Unlock()
	return registry, err
}

func (s *cliReleases) check(ctx context.Context, current string, refresh bool) (cliReleaseCheck, error) {
	registry, err := s.registry(ctx, refresh)
	if err != nil {
		return cliReleaseCheck{}, err
	}
	current = strings.TrimPrefix(strings.TrimSpace(current), "v")
	local := fullCLISemver(current)
	result := cliReleaseCheck{Current: current, Channels: make(map[string]cliReleaseChannel, len(cliDistTags))}
	published := make([]cliReleaseVersion, 0, len(registry.Versions))
	for version := range registry.Versions {
		if fullCLISemver(version) == "" {
			continue
		}
		var date string
		if parsed, err := time.Parse(time.RFC3339Nano, registry.Time[version]); err == nil {
			date = parsed.UTC().Format(time.RFC3339)
		}
		published = append(published, cliReleaseVersion{Version: version, PublishedAt: date, Published: true})
	}
	sort.Slice(published, func(i, j int) bool {
		a, b := published[i].Version, published[j].Version
		if order := semver.Compare("v"+a, "v"+b); order != 0 {
			return order > 0
		}
		return a < b
	})
	for _, tag := range cliDistTags {
		target := registry.Tags[tag]
		remote := fullCLISemver(target)
		if _, ok := registry.Versions[target]; !ok || remote == "" {
			result.Channels[tag] = cliReleaseChannel{State: "missing"}
			continue
		}
		channel := cliReleaseChannel{Target: target, State: "unknown"}
		if local != "" {
			switch semver.Compare(remote, local) {
			case 1:
				channel.State = "available"
			case 0:
				channel.State = "current"
			case -1:
				channel.State = "ahead"
			}
		}
		for _, row := range published {
			v := "v" + row.Version
			if row.Version != target && (channel.State != "available" || semver.Compare(v, remote) >= 0 || semver.Compare(v, local) <= 0 && row.Version != current) {
				continue
			}
			row.Current = row.Version == current || (row.Version == target && channel.State == "current")
			channel.Versions = append(channel.Versions, row)
		}
		if _, ok := registry.Versions[current]; !ok && channel.State == "available" {
			channel.Versions = append(channel.Versions, cliReleaseVersion{Version: current, Current: true})
		}
		result.Channels[tag] = channel
	}
	return result, nil
}

func (s *cliReleases) notes(ctx context.Context, version string) (cliReleaseNotes, error) {
	if fullCLISemver(version) == "" {
		return cliReleaseNotes{}, errors.New("invalid CLI version")
	}
	tag := "dsh-v" + version
	var release struct {
		Tag   string `json:"tag_name"`
		Draft bool   `json:"draft"`
		Body  string `json:"body"`
	}
	status, err := s.request(ctx, cliGitHubAPI+url.PathEscape(tag), &release, 256<<10)
	if status == http.StatusNotFound {
		return cliReleaseNotes{}, nil
	}
	if err != nil {
		return cliReleaseNotes{}, err
	}
	if release.Tag != tag || release.Draft {
		return cliReleaseNotes{}, errors.New("unexpected CLI release")
	}
	return cliReleaseNotes{Body: strings.TrimSpace(release.Body)}, nil
}
