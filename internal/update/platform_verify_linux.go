//go:build linux

package update

import "errors"

// Linux release artifacts use the Ed25519 manifest as the publisher identity;
// distro package signatures are outside the raw-binary updater's scope.
func verifyPlatformArtifact(path string) error {
	if platformSignatureRequired() && path == "" {
		return errors.New("update: Linux artifact path is empty")
	}
	return nil
}
