package update

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

func testManifest(t *testing.T, payload []byte) (Manifest, []byte, ed25519.PublicKey, ed25519.PrivateKey) {
	t.Helper()
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	sum := sha256Sum(payload)
	m := Manifest{
		AppID:   DefaultAppID,
		Channel: "stable",
		Version: "9.9.9",
		GOOS:    "darwin",
		GOARCH:  "arm64",
		Artifact: ManifestArtifact{
			Name:   AssetName("darwin", "arm64"),
			Size:   int64(len(payload)),
			SHA256: hex.EncodeToString(sum),
		},
	}
	data, err := SignManifest(m, priv)
	if err != nil {
		t.Fatal(err)
	}
	m.Signature = ""
	return m, data, pub, priv
}

func TestManifestSignVerifyCanonical(t *testing.T) {
	payload := []byte("signed-update")
	m, data, pub, _ := testManifest(t, payload)
	got, err := VerifyManifest(data, pub, ManifestExpectation{
		AppID:        DefaultAppID,
		Channel:      "stable",
		Version:      "v9.9.9",
		GOOS:         "darwin",
		GOARCH:       "arm64",
		ArtifactName: m.Artifact.Name,
		ArtifactSize: m.Artifact.Size,
		ArtifactSHA:  m.Artifact.SHA256,
	})
	if err != nil {
		t.Fatal(err)
	}
	if got.AppID != DefaultAppID || got.Artifact.Size != int64(len(payload)) {
		t.Fatalf("unexpected manifest: %+v", got)
	}
	if _, err := VerifyManifest(append(data, '\n'), pub, ManifestExpectation{}); err == nil {
		t.Fatal("accepted non-canonical trailing whitespace")
	}
	if _, err := VerifyManifest([]byte(`{"appId":"`+DefaultAppID+`","channel":"stable","version":"9.9.9","goos":"darwin","goarch":"arm64","artifact":{"name":"`+m.Artifact.Name+`","size":13,"sha256":"`+m.Artifact.SHA256+`"},"signature":"`+m.Signature+`"}`), pub, ManifestExpectation{}); err == nil {
		t.Fatal("accepted malformed signature manifest")
	}
}

func TestManifestRejectsTamperDuplicateAndWrongContext(t *testing.T) {
	m, data, pub, priv := testManifest(t, []byte("signed-update"))
	if _, err := VerifyManifest(data, pub, ManifestExpectation{Version: "9.9.8"}); err == nil {
		t.Fatal("accepted wrong version")
	}
	otherPub, _, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := VerifyManifest(data, otherPub, ManifestExpectation{}); err == nil {
		t.Fatal("accepted wrong public key")
	}
	m.Signature = ""
	payload, err := CanonicalManifestPayload(m)
	if err != nil {
		t.Fatal(err)
	}
	m.Signature = base64.StdEncoding.EncodeToString(ed25519.Sign(priv, payload))
	canonical, err := CanonicalManifestJSON(m)
	if err != nil {
		t.Fatal(err)
	}
	duplicate := strings.TrimSuffix(string(canonical), "}") + `,"appId":"` + DefaultAppID + `"}`
	if _, err := VerifyManifest([]byte(duplicate), pub, ManifestExpectation{}); err == nil {
		t.Fatal("accepted duplicate object key")
	}
}

func TestManifestPublicKeyEncodings(t *testing.T) {
	pub, _, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	for _, raw := range []string{
		base64.StdEncoding.EncodeToString(pub),
		base64.RawURLEncoding.EncodeToString(pub),
		"hex:" + hex.EncodeToString(pub),
	} {
		got, err := ParseManifestPublicKey(raw)
		if err != nil || string(got) != string(pub) {
			t.Fatalf("parse %q: %v", raw, err)
		}
	}
}

func TestUpdaterUsesSignedManifestWithoutSHA256SUMS(t *testing.T) {
	payload := []byte("signed-update-bytes")
	m, manifestBytes, pub, _ := testManifest(t, payload)
	want := m.Artifact.Name
	var srvURL string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/repos/xinghaix/deepseek-harness-desktop/releases/latest":
			_, _ = fmt.Fprintf(w, `{"tag_name":"v9.9.9","body":"signed","html_url":"https://github.com/xinghaix/deepseek-harness-desktop/releases/tag/v9.9.9","assets":[{"name":"%s","browser_download_url":"%s/file.bin","size":%d},{"name":"manifest-darwin-arm64.json","browser_download_url":"%s/manifest.json","size":%d}]}`, want, srvURL, len(payload), srvURL, len(manifestBytes))
		case "/manifest.json":
			_, _ = w.Write(manifestBytes)
		case "/file.bin":
			_, _ = w.Write(payload)
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer srv.Close()
	srvURL = srv.URL
	u := NewWithManifestPublicKey(base64.StdEncoding.EncodeToString(pub))
	u.client = srv.Client()
	u.apiBase = srv.URL
	u.current = "0.1.0"
	u.goos, u.goarch = "darwin", "arm64"
	u.allowURL = func(string) error { return nil }
	t.Setenv("HOME", t.TempDir())
	t.Setenv("XDG_CACHE_HOME", t.TempDir())
	snap, err := u.Check(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if snap.State != StateAvailable || !u.manifestVerified || u.legacyChecksum {
		t.Fatalf("unexpected signed state: %+v verified=%v legacy=%v", snap, u.manifestVerified, u.legacyChecksum)
	}
	if err := u.Download(context.Background()); err != nil {
		t.Fatal(err)
	}
	if got, err := os.ReadFile(u.file); err != nil || string(got) != string(payload) {
		t.Fatalf("downloaded payload: %q err=%v", got, err)
	}
}
