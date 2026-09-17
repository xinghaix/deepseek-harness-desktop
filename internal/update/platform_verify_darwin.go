//go:build darwin

package update

import (
	"fmt"
	"os"
	"os/exec"
	"strings"
)

// The downloaded macOS asset is a zip, so verification happens after unpacking
// and before the bundle is made live.
func verifyPlatformArtifact(path string) error { return nil }

func verifyPlatformBundle(path string) error {
	if !platformSignatureRequired() {
		return nil
	}
	codesign, err := exec.LookPath("codesign")
	if err != nil {
		return fmt.Errorf("update: required codesign verifier unavailable: %w", err)
	}
	if output, err := exec.Command(codesign, "--verify", "--deep", "--strict", "--verbose=2", path).CombinedOutput(); err != nil {
		return fmt.Errorf("update: macOS code signature verification failed: %w: %s", err, output)
	}
	if teamID := strings.TrimSpace(getenv("DSH_DESKTOP_EXPECTED_TEAM_ID")); teamID != "" {
		output, err := exec.Command(codesign, "-dv", "--verbose=4", path).CombinedOutput()
		if err != nil || !strings.Contains(string(output), "TeamIdentifier="+teamID) {
			return fmt.Errorf("update: macOS Team ID verification failed (want %s)", teamID)
		}
	}
	if strings.EqualFold(strings.TrimSpace(getenv("DSH_DESKTOP_REQUIRE_NOTARIZATION")), "1") {
		stapler, err := exec.LookPath("stapler")
		if err != nil {
			return fmt.Errorf("update: required stapler verifier unavailable: %w", err)
		}
		if output, err := exec.Command(stapler, "validate", path).CombinedOutput(); err != nil {
			return fmt.Errorf("update: macOS notarization validation failed: %w: %s", err, output)
		}
	}
	return nil
}

func getenv(key string) string { return os.Getenv(key) }
