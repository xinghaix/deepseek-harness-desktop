package update

import (
	"errors"
	"os"
	"strings"
)

var ErrUnsignedArtifact = errors.New("update: artifact is not covered by the configured publisher signature policy")

func platformSignatureRequired() bool {
	switch strings.ToLower(strings.TrimSpace(os.Getenv("DSH_DESKTOP_REQUIRE_PLATFORM_SIGNATURE"))) {
	case "1", "true", "yes", "on":
		return true
	default:
		return false
	}
}

func (u *Updater) verifyStagedArtifact(path string) error {
	u.mu.Lock()
	verified, legacy := u.manifestVerified, u.allowLegacy && u.legacyChecksum
	sum, size := u.sum, u.asset.Size
	u.mu.Unlock()
	if (!verified && !legacy) || (platformSignatureRequired() && !verified) {
		return ErrUnsignedArtifact
	}
	if size <= 0 || fileSize(path) != size || sum == "" || fileChecksum(path) != sum {
		return errors.New("update: staged artifact size or SHA-256 mismatch")
	}
	return verifyPlatformArtifact(path)
}
