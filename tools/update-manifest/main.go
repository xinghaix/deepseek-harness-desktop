// Command update-manifest creates a canonical Ed25519-signed release manifest.
// It is intended for the release pipeline; the private key never belongs in the
// application and is supplied through DSH_UPDATE_MANIFEST_PRIVATE_KEY_FILE.
package main

import (
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"deepseek-harness-desktop/internal/update"
)

func main() {
	var (
		artifact = flag.String("artifact", "", "artifact file")
		out      = flag.String("out", "", "manifest output path")
		appID    = flag.String("app-id", update.DefaultAppID, "application id")
		channel  = flag.String("channel", "stable", "release channel")
		version  = flag.String("version", "", "release version")
		goos     = flag.String("goos", "", "target GOOS")
		goarch   = flag.String("goarch", "", "target GOARCH")
		commit   = flag.String("commit", os.Getenv("GITHUB_SHA"), "source commit")
		signer   = flag.String("signer", os.Getenv("DSH_UPDATE_MANIFEST_SIGNER"), "publisher key id")
		keyFile  = flag.String("key-file", "", "Ed25519 private key file (raw 64 bytes or base64/hex)")
	)
	flag.Parse()
	if *artifact == "" || *out == "" || *version == "" || *goos == "" || *goarch == "" || *keyFile == "" {
		flag.Usage()
		os.Exit(2)
	}
	body, err := os.ReadFile(*artifact)
	if err != nil {
		fatal(err)
	}
	key, err := readPrivateKey(*keyFile)
	if err != nil {
		fatal(err)
	}
	hash := sha256.Sum256(body)
	manifest := update.Manifest{
		SchemaVersion: update.ManifestSchemaVersion,
		AppID:         *appID, Channel: *channel, Version: *version, ReleaseTag: "v" + strings.TrimPrefix(*version, "v"),
		Commit: *commit, Signer: *signer, GOOS: *goos, GOARCH: *goarch,
		Artifact: update.ManifestArtifact{Name: filepath.Base(*artifact), Size: int64(len(body)), SHA256: hex.EncodeToString(hash[:])},
	}
	signed, err := update.SignManifest(manifest, key)
	if err != nil {
		fatal(err)
	}
	if err := os.WriteFile(*out, signed, 0o644); err != nil {
		fatal(err)
	}
}

func readPrivateKey(path string) (ed25519.PrivateKey, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	data = []byte(strings.TrimSpace(string(data)))
	if len(data) == ed25519.PrivateKeySize {
		return ed25519.PrivateKey(data), nil
	}
	for _, enc := range []*base64.Encoding{base64.StdEncoding, base64.RawStdEncoding} {
		decoded, decodeErr := enc.DecodeString(string(data))
		if decodeErr == nil && len(decoded) == ed25519.PrivateKeySize {
			return ed25519.PrivateKey(decoded), nil
		}
	}
	if decoded, decodeErr := hex.DecodeString(string(data)); decodeErr == nil && len(decoded) == ed25519.PrivateKeySize {
		return ed25519.PrivateKey(decoded), nil
	}
	return nil, fmt.Errorf("private key must encode %d bytes", ed25519.PrivateKeySize)
}

func fatal(err error) { fmt.Fprintln(os.Stderr, err); os.Exit(1) }
