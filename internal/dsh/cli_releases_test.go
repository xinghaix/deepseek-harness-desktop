package dsh

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
	"time"

	"deepseek-harness-desktop/internal/desktopstate"
)

type cliRoundTripFunc func(*http.Request) (*http.Response, error)

func (f cliRoundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

const cliTestRegistry = `{
 "name":"@deepseek-ai/dsh", "dist-tags":{"latest":"0.2.2-rc.1","next":"0.2.2-rc.10","alpha":"0.2.2-alpha.3","other":"0.2.2"},
 "versions":{"0.2.1":{},"0.2.2-alpha.3":{},"0.2.2-rc.1":{},"0.2.2-rc.2":{},"0.2.2-rc.10":{},"0.2.2":{},"junk":{}},
 "time":{"0.2.2-rc.10":"2026-11-17T17:03:03.170Z"}
}`

func cliTestResponse(code int, body string) *http.Response {
	return &http.Response{StatusCode: code, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(body))}
}

func TestCLIReleaseCheckUsesRegistryTagsAndSemver(t *testing.T) {
	calls := 0
	service := cliReleases{client: &http.Client{Transport: cliRoundTripFunc(func(r *http.Request) (*http.Response, error) {
		calls++
		if r.URL.String() != cliRegistryURL || r.Method != http.MethodGet || r.Header.Get("Authorization") != "" {
			t.Fatalf("unexpected upstream request: %s %s", r.Method, r.URL)
		}
		return cliTestResponse(200, cliTestRegistry), nil
	})}}
	ctx := context.Background()
	res, err := service.check(ctx, "v0.2.2-rc.1", false)
	if err != nil {
		t.Fatal(err)
	}
	if res.Channels["latest"].State != "current" || res.Channels["alpha"].State != "ahead" || len(res.Channels) != 3 {
		t.Fatalf("unexpected channels: %+v", res.Channels)
	}
	next := res.Channels["next"]
	want := []cliReleaseVersion{
		{Version: "0.2.2-rc.10", Published: true, PublishedAt: "2026-11-17T17:03:03Z"},
		{Version: "0.2.2-rc.2", Published: true},
		{Version: "0.2.2-rc.1", Published: true, Current: true},
	}
	if next.State != "available" || next.Target != "0.2.2-rc.10" || !reflect.DeepEqual(next.Versions, want) {
		t.Fatalf("unexpected version range: %+v", next)
	}
	res, err = service.check(ctx, "0.2.2-rc.3+local", false)
	if err != nil || calls != 1 {
		t.Fatalf("expected shared registry cache, calls=%d, err=%v", calls, err)
	}
	if versions := res.Channels["next"].Versions; len(versions) != 2 || versions[1] != (cliReleaseVersion{Version: "0.2.2-rc.3+local", Current: true}) {
		t.Fatalf("expected unpublished local endpoint: %+v", versions)
	}
	res, err = service.check(ctx, "not-detected", false)
	if err != nil || res.Channels["latest"].State != "unknown" || len(res.Channels["latest"].Versions) != 1 {
		t.Fatalf("unexpected unknown state: %+v, %v", res, err)
	}
	service.lastAt = time.Now().Add(-3 * time.Second)
	if _, err := service.check(ctx, "0.2.2", true); err != nil || calls != 2 {
		t.Fatalf("manual refresh should bypass normal TTL: calls=%d, err=%v", calls, err)
	}
}

func TestCLIReleaseMissingTagAndNotes(t *testing.T) {
	calls := 0
	service := cliReleases{client: &http.Client{Transport: cliRoundTripFunc(func(r *http.Request) (*http.Response, error) {
		calls++
		switch r.URL.String() {
		case cliRegistryURL:
			return cliTestResponse(200, `{"name":"@deepseek-ai/dsh","dist-tags":{"latest":"0.2.2","alpha":"garbage"},"versions":{"0.2.1":{}}}`), nil
		case cliGitHubAPI + "dsh-v0.2.2-rc.10":
			return cliTestResponse(200, `{"tag_name":"dsh-v0.2.2-rc.10","body":"### Fixes\n- Item", "assets":[{"browser_download_url":"ignored"}]}`), nil
		case cliGitHubAPI + "dsh-v0.2.2-rc.2":
			return cliTestResponse(404, `{}`), nil
		case cliGitHubAPI + "dsh-v0.2.2-rc.1":
			return cliTestResponse(429, `{}`), nil
		default:
			t.Fatalf("unexpected request %s", r.URL)
			return nil, nil
		}
	})}}
	ctx := context.Background()
	res, err := service.check(ctx, "0.2.1", false)
	if err != nil || res.Channels["latest"].State != "missing" || res.Channels["next"].State != "missing" || res.Channels["alpha"].State != "missing" || calls != 1 {
		t.Fatalf("unexpected missing tags: %+v, %v, calls=%d", res, err, calls)
	}
	if n, err := service.notes(ctx, "0.2.2-rc.10"); err != nil || n.Body != "### Fixes\n- Item" {
		t.Fatalf("unexpected notes %+v, %v", n, err)
	}
	if n, err := service.notes(ctx, "0.2.2-rc.2"); err != nil || n.Body != "" {
		t.Fatalf("404 should mean notes are absent: %+v, %v", n, err)
	}
	if _, err := service.notes(ctx, "0.2.2-rc.1"); err == nil {
		t.Fatal("rate limit must not become an absent note")
	}
	for _, input := range []string{"../releases", "0.2", "v0.2.1", "0.2.2;command", strings.Repeat("9", 129)} {
		if _, err := service.notes(ctx, input); err == nil || calls != 4 {
			t.Fatalf("invalid version %q made an upstream request: calls=%d", input, calls)
		}
	}
}

func TestCLIReleaseTagPersistsAcrossBridgeRestart(t *testing.T) {
	t.Setenv(desktopstate.StateDirEnv, t.TempDir())
	desktopstate.ResetCacheForTest()
	t.Cleanup(desktopstate.ResetCacheForTest)
	bridge := desktopBridge{token: "first"}
	invoke := func(method, token, data string, wantCode int, wantTag string) {
		t.Helper()
		r := httptest.NewRequest(method, "/v1/cli-release-tag", strings.NewReader(data))
		r.Header.Set(desktopBridgeTokenHeader, token)
		out := httptest.NewRecorder()
		bridge.serveHTTP(out, r)
		if out.Code != wantCode {
			t.Fatalf("%s: status %d, want %d, body %s", method, out.Code, wantCode, out.Body)
		}
		if wantTag != "" {
			var result struct{ Tag string }
			if err := json.Unmarshal(out.Body.Bytes(), &result); err != nil || result.Tag != wantTag {
				t.Fatalf("%s: %s, want %s", method, out.Body, wantTag)
			}
		}
	}
	if err := desktopstate.Update(func(f *desktopstate.File) { f.LastSessionID = "keep-me" }); err != nil {
		t.Fatal(err)
	}
	invoke("GET", "first", "", 200, "latest")
	invoke("POST", "first", `{"tag":"next"}`, 200, "next")
	invoke("POST", "wrong", `{"tag":"alpha"}`, 401, "")
	invoke("POST", "first", `{"tag":"beta"}`, 400, "")
	invoke("PUT", "first", `{"tag":"alpha"}`, 405, "")
	desktopstate.ResetCacheForTest()
	bridge.token = "restarted"
	invoke("GET", "restarted", "", 200, "next")
	invoke("POST", "restarted", `{"tag":"alpha"}`, 200, "alpha")
	file, err := desktopstate.Load()
	if err != nil || file.Prefs.CLIReleaseTag != "alpha" || file.LastSessionID != "keep-me" {
		t.Fatalf("unexpected state after saving tag: %+v: %v", file, err)
	}
	if err := desktopstate.Update(func(f *desktopstate.File) { f.Prefs.CLIReleaseTag = "unsupported" }); err != nil {
		t.Fatal(err)
	}
	invoke("GET", "restarted", "", 200, "latest")
}

func TestCLIReleaseBridgeReadOnlyRoutes(t *testing.T) {
	owner := New()
	owner.dshVersion = "0.2.2-rc.1"
	calls := 0
	bridge := desktopBridge{owner: owner, token: "test-token", cliReleases: cliReleases{client: &http.Client{Transport: cliRoundTripFunc(func(r *http.Request) (*http.Response, error) {
		calls++
		if r.Header.Get(desktopBridgeTokenHeader) != "" || r.Body != nil {
			t.Fatal("bridge request data reached upstream")
		}
		if r.URL.String() == cliRegistryURL {
			return cliTestResponse(200, cliTestRegistry), nil
		}
		return cliTestResponse(404, ""), nil
	})}}}
	invoke := func(method, path, token, body string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(method, path, strings.NewReader(body))
		r.Header.Set(desktopBridgeTokenHeader, token)
		out := httptest.NewRecorder()
		bridge.serveHTTP(out, r)
		return out
	}
	for _, tc := range []struct {
		method, path, token, body string
		want                      int
	}{
		{"POST", "/v1/cli-versions", "wrong", `{}`, 401},
		{"GET", "/v1/cli-versions", bridge.token, ``, 405},
		{"POST", "/v1/cli-release-notes", bridge.token, `{"version":"../"}`, 400},
		{"POST", "/v1/cli-versions?extra=1", bridge.token, `{}`, 400},
		{"POST", "/v1/cli-install", bridge.token, `{}`, 404},
	} {
		if got := invoke(tc.method, tc.path, tc.token, tc.body); got.Code != tc.want {
			t.Fatalf("%s %s: got %d wanted %d", tc.method, tc.path, got.Code, tc.want)
		}
	}
	if calls != 0 {
		t.Fatalf("invalid requests reached upstream: %d", calls)
	}
	got := invoke("POST", "/v1/cli-versions", bridge.token, `{"refresh":false}`)
	var decoded cliReleaseCheck
	if got.Code != 200 || json.Unmarshal(got.Body.Bytes(), &decoded) != nil || decoded.Current != owner.dshVersion {
		t.Fatalf("CLI versions: %d %s", got.Code, got.Body)
	}
	got = invoke("POST", "/v1/cli-release-notes", bridge.token, `{"version":"0.2.2-rc.10"}`)
	if got.Code != 200 || got.Body.String() != "{}\n" || calls != 2 {
		t.Fatalf("CLI notes: %d %s, calls=%d", got.Code, got.Body, calls)
	}
}
