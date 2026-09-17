package update

import (
	"bytes"
	"crypto/ed25519"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"golang.org/x/mod/semver"
	"io"
	"strings"
)

// ManifestPublicKey is the release-signing Ed25519 public key injected into a
// production build with -ldflags. It intentionally has no default value: a
// build which consumes signed manifests must opt in to a specific publisher
// identity. DSH_DESKTOP_UPDATE_PUBLIC_KEY overrides it for development and
// tests.
var ManifestPublicKey string

const (
	ManifestPublicKeyEnv  = "DSH_DESKTOP_UPDATE_PUBLIC_KEY"
	ManifestSchemaVersion = "1"
	DefaultAppID          = "com.deepseek.harness.desktop"

	// MaxManifestArtifactSize bounds both the signed metadata and downloads.
	// Release artifacts for this application are substantially smaller; the
	// bound is deliberately generous while still preventing an unbounded
	// Content-Length/body from exhausting disk space.
	MaxManifestArtifactSize int64 = 2 << 30
)

// Manifest describes one release artifact. The signature is over the
// canonical JSON object formed by all fields except Signature.
//
// The object is deliberately small and versioned by the schema's exact field
// set. Unknown fields are rejected so a future producer cannot silently add a
// security-sensitive option that an older client ignores.
type Manifest struct {
	SchemaVersion string           `json:"schemaVersion"`
	AppID         string           `json:"appId"`
	Channel       string           `json:"channel"`
	Version       string           `json:"version"`
	ReleaseTag    string           `json:"releaseTag"`
	Commit        string           `json:"commit,omitempty"`
	GOOS          string           `json:"goos"`
	GOARCH        string           `json:"goarch"`
	MinOS         string           `json:"minOS,omitempty"`
	MinUpdater    string           `json:"minUpdater,omitempty"`
	Signer        string           `json:"signer,omitempty"`
	Artifact      ManifestArtifact `json:"artifact"`
	Signature     string           `json:"signature"`
}

type ManifestArtifact struct {
	Name   string `json:"name"`
	Size   int64  `json:"size"`
	SHA256 string `json:"sha256"`
}

// ManifestExpectation contains the release context in which a manifest is
// acceptable. Empty expectation fields are not checked, which makes the core
// verifier useful to a manifest-generation/inspection tool; the updater fills
// every field.
type ManifestExpectation struct {
	AppID          string
	Channel        string
	Version        string
	GOOS           string
	GOARCH         string
	ArtifactName   string
	ArtifactSize   int64
	ArtifactSHA    string
	UpdaterVersion string
}

// CanonicalManifestPayload returns the exact bytes covered by Signature.
// Callers should use this function rather than re-marshalling a Manifest when
// producing a release manifest.
func CanonicalManifestPayload(m Manifest) ([]byte, error) {
	m = normalizeManifest(m)
	m.Signature = ""
	if err := validateManifestShape(m); err != nil {
		return nil, err
	}
	return canonicalManifestJSON(m, false)
}

// CanonicalManifestJSON returns canonical JSON for the complete manifest,
// including its signature. It is useful for deterministic release generation
// and is also the representation accepted by VerifyManifest.
func CanonicalManifestJSON(m Manifest) ([]byte, error) {
	m = normalizeManifest(m)
	if err := validateManifestShape(m); err != nil {
		return nil, err
	}
	if strings.TrimSpace(m.Signature) == "" {
		return nil, errors.New("update manifest: missing signature")
	}
	return canonicalManifestJSON(m, true)
}

// SignManifest signs m's canonical payload and returns canonical manifest JSON.
// This is a small generation seam for release tooling; it does not establish a
// trust root (verification always uses the caller-supplied public key).
func SignManifest(m Manifest, privateKey ed25519.PrivateKey) ([]byte, error) {
	if len(privateKey) != ed25519.PrivateKeySize {
		return nil, errors.New("update manifest: invalid Ed25519 private key")
	}
	payload, err := CanonicalManifestPayload(m)
	if err != nil {
		return nil, err
	}
	m.Signature = base64.StdEncoding.EncodeToString(ed25519.Sign(privateKey, payload))
	return CanonicalManifestJSON(m)
}

// VerifyManifest strictly parses, canonicalizes, checks the release context,
// and verifies the Ed25519 signature with publicKey. The key is supplied by
// the application build/configuration, never by the manifest itself.
func VerifyManifest(data []byte, publicKey ed25519.PublicKey, expected ManifestExpectation) (Manifest, error) {
	m, err := decodeCanonicalManifest(data)
	if err != nil {
		return Manifest{}, err
	}
	if len(publicKey) != ed25519.PublicKeySize {
		return Manifest{}, errors.New("update manifest: invalid Ed25519 public key")
	}
	if err := checkManifestExpectation(m, expected); err != nil {
		return Manifest{}, err
	}
	payload, err := CanonicalManifestPayload(m)
	if err != nil {
		return Manifest{}, err
	}
	sig, err := decodeSignature(m.Signature)
	if err != nil {
		return Manifest{}, err
	}
	if !ed25519.Verify(publicKey, payload, sig) {
		return Manifest{}, errors.New("update manifest: signature verification failed")
	}
	return m, nil
}

// VerifyManifestWithKey is the string-key convenience form used by the
// updater's environment/ldflags configuration.
func VerifyManifestWithKey(data []byte, rawKey string, expected ManifestExpectation) (Manifest, error) {
	key, err := ParseManifestPublicKey(rawKey)
	if err != nil {
		return Manifest{}, err
	}
	return VerifyManifest(data, key, expected)
}

// ParseManifestPublicKey accepts base64 (standard or URL-safe) and hex
// encodings. A "base64:" or "hex:" prefix may be used to disambiguate a
// development setting.
func ParseManifestPublicKey(raw string) (ed25519.PublicKey, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, errors.New("update manifest: signing public key is not configured")
	}
	encodingHint := ""
	if i := strings.IndexByte(raw, ':'); i > 0 {
		encodingHint, raw = strings.ToLower(strings.TrimSpace(raw[:i])), strings.TrimSpace(raw[i+1:])
	}
	var candidates [][]byte
	if encodingHint == "" || encodingHint == "hex" {
		if decoded, err := hex.DecodeString(raw); err == nil {
			candidates = append(candidates, decoded)
		}
	}
	if encodingHint == "" || encodingHint == "base64" {
		for _, enc := range []*base64.Encoding{
			base64.StdEncoding,
			base64.RawStdEncoding,
			base64.URLEncoding,
			base64.RawURLEncoding,
		} {
			if decoded, err := enc.DecodeString(raw); err == nil {
				candidates = append(candidates, decoded)
			}
		}
	}
	for _, decoded := range candidates {
		if len(decoded) == ed25519.PublicKeySize {
			return ed25519.PublicKey(decoded), nil
		}
	}
	return nil, errors.New("update manifest: public key must encode 32 bytes")
}

func decodeCanonicalManifest(data []byte) (Manifest, error) {
	if len(data) == 0 {
		return Manifest{}, errors.New("update manifest: empty document")
	}
	if err := rejectDuplicateKeys(data); err != nil {
		return Manifest{}, err
	}
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.DisallowUnknownFields()
	var m Manifest
	if err := dec.Decode(&m); err != nil {
		return Manifest{}, fmt.Errorf("update manifest: invalid JSON: %w", err)
	}
	var extra any
	if err := dec.Decode(&extra); !errors.Is(err, io.EOF) {
		if err == nil {
			return Manifest{}, errors.New("update manifest: multiple JSON values")
		}
		return Manifest{}, fmt.Errorf("update manifest: invalid trailing data: %w", err)
	}
	m = normalizeManifest(m)
	if err := validateManifestShape(m); err != nil {
		return Manifest{}, err
	}
	canonical, err := canonicalManifestJSON(m, true)
	if err != nil {
		return Manifest{}, err
	}
	if !bytes.Equal(data, canonical) {
		return Manifest{}, errors.New("update manifest: JSON is not canonical")
	}
	return m, nil
}

func normalizeManifest(m Manifest) Manifest {
	if strings.TrimSpace(m.SchemaVersion) == "" {
		m.SchemaVersion = ManifestSchemaVersion
	}
	if strings.TrimSpace(m.ReleaseTag) == "" {
		m.ReleaseTag = m.Version
	}
	return m
}

func canonicalManifestJSON(m Manifest, includeSignature bool) ([]byte, error) {
	m = normalizeManifest(m)
	artifact := map[string]any{
		"name":   m.Artifact.Name,
		"sha256": m.Artifact.SHA256,
		"size":   m.Artifact.Size,
	}
	root := map[string]any{
		"appId":         m.AppID,
		"artifact":      artifact,
		"channel":       m.Channel,
		"goarch":        m.GOARCH,
		"goos":          m.GOOS,
		"releaseTag":    m.ReleaseTag,
		"schemaVersion": m.SchemaVersion,
		"version":       m.Version,
	}
	if m.Commit != "" {
		root["commit"] = m.Commit
	}
	if m.MinOS != "" {
		root["minOS"] = m.MinOS
	}
	if m.MinUpdater != "" {
		root["minUpdater"] = m.MinUpdater
	}
	if m.Signer != "" {
		root["signer"] = m.Signer
	}
	if includeSignature {
		root["signature"] = m.Signature
	}
	return json.Marshal(root)
}

func validateManifestShape(m Manifest) error {
	m = normalizeManifest(m)
	for label, value := range map[string]string{
		"schemaVersion": m.SchemaVersion,
		"appId":         m.AppID,
		"channel":       m.Channel,
		"version":       m.Version,
		"releaseTag":    m.ReleaseTag,
		"goos":          m.GOOS,
		"goarch":        m.GOARCH,
		"artifact name": m.Artifact.Name,
	} {
		if value == "" || strings.TrimSpace(value) != value {
			return fmt.Errorf("update manifest: invalid %s", label)
		}
	}
	if m.SchemaVersion != ManifestSchemaVersion {
		return errors.New("update manifest: unsupported schema version")
	}
	if m.MinUpdater != "" && (!semver.IsValid("v"+m.MinUpdater) || semver.Canonical("v"+m.MinUpdater) != "v"+m.MinUpdater) {
		return errors.New("update manifest: invalid minUpdater version")
	}
	if NormalizeVersion(m.ReleaseTag) != NormalizeVersion(m.Version) {
		return errors.New("update manifest: releaseTag does not match version")
	}
	if m.Artifact.Size <= 0 || m.Artifact.Size > MaxManifestArtifactSize {
		return errors.New("update manifest: artifact size is out of bounds")
	}
	if len(m.Artifact.SHA256) != 64 || strings.ToLower(m.Artifact.SHA256) != m.Artifact.SHA256 {
		return errors.New("update manifest: invalid artifact sha256")
	}
	if _, err := hex.DecodeString(m.Artifact.SHA256); err != nil {
		return errors.New("update manifest: invalid artifact sha256")
	}
	return nil
}

func checkManifestExpectation(m Manifest, expected ManifestExpectation) error {
	if m.MinUpdater != "" {
		current := "v" + NormalizeVersion(expected.UpdaterVersion)
		if !semver.IsValid(current) || semver.Compare(current, "v"+m.MinUpdater) < 0 {
			return errors.New("update manifest: unsupported minimum updater version")
		}
	}
	checks := []struct {
		label, got, want string
	}{
		{"appId", m.AppID, expected.AppID},
		{"channel", m.Channel, expected.Channel},
		{"version", NormalizeVersion(m.Version), NormalizeVersion(expected.Version)},
		{"goos", m.GOOS, expected.GOOS},
		{"goarch", m.GOARCH, expected.GOARCH},
		{"artifact name", m.Artifact.Name, expected.ArtifactName},
		{"artifact sha256", m.Artifact.SHA256, strings.ToLower(expected.ArtifactSHA)},
	}
	for _, check := range checks {
		if check.want != "" && check.got != check.want {
			return fmt.Errorf("update manifest: %s mismatch (got %q, want %q)", check.label, check.got, check.want)
		}
	}
	if expected.ArtifactSize > 0 && m.Artifact.Size != expected.ArtifactSize {
		return fmt.Errorf("update manifest: artifact size mismatch (got %d, want %d)", m.Artifact.Size, expected.ArtifactSize)
	}
	return nil
}

func decodeSignature(raw string) ([]byte, error) {
	var candidates [][]byte
	for _, enc := range []*base64.Encoding{
		base64.StdEncoding,
		base64.RawStdEncoding,
		base64.URLEncoding,
		base64.RawURLEncoding,
	} {
		if decoded, err := enc.DecodeString(raw); err == nil {
			candidates = append(candidates, decoded)
		}
	}
	if decoded, err := hex.DecodeString(raw); err == nil {
		candidates = append(candidates, decoded)
	}
	for _, decoded := range candidates {
		if len(decoded) == ed25519.SignatureSize {
			return decoded, nil
		}
	}
	return nil, errors.New("update manifest: signature must encode 64 bytes")
}

// rejectDuplicateKeys rejects duplicate object members before decoding into a
// Go struct (encoding/json otherwise keeps only the last member). This is part
// of the canonical-JSON contract, not merely a parser nicety.
func rejectDuplicateKeys(data []byte) error {
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.UseNumber()
	if err := walkJSON(dec); err != nil {
		return fmt.Errorf("update manifest: invalid JSON: %w", err)
	}
	var extra any
	if err := dec.Decode(&extra); !errors.Is(err, io.EOF) {
		if err == nil {
			return errors.New("update manifest: multiple JSON values")
		}
		return fmt.Errorf("update manifest: invalid trailing data: %w", err)
	}
	return nil
}

func walkJSON(dec *json.Decoder) error {
	tok, err := dec.Token()
	if err != nil {
		return err
	}
	delim, ok := tok.(json.Delim)
	if !ok {
		return nil
	}
	switch delim {
	case '{':
		seen := make(map[string]struct{})
		for dec.More() {
			keyToken, err := dec.Token()
			if err != nil {
				return err
			}
			key, ok := keyToken.(string)
			if !ok {
				return errors.New("object key is not a string")
			}
			if _, exists := seen[key]; exists {
				return fmt.Errorf("duplicate object key %q", key)
			}
			seen[key] = struct{}{}
			if err := walkJSON(dec); err != nil {
				return err
			}
		}
		end, err := dec.Token()
		if err != nil {
			return err
		}
		if end != json.Delim('}') {
			return errors.New("unterminated object")
		}
	case '[':
		for dec.More() {
			if err := walkJSON(dec); err != nil {
				return err
			}
		}
		end, err := dec.Token()
		if err != nil {
			return err
		}
		if end != json.Delim(']') {
			return errors.New("unterminated array")
		}
	default:
		return errors.New("unexpected delimiter")
	}
	return nil
}

// constantTimeEqual is kept local to the manifest module for callers that need
// to compare a configured key fingerprint without exposing key material.
func constantTimeEqual(a, b []byte) bool {
	return len(a) == len(b) && subtle.ConstantTimeCompare(a, b) == 1
}
