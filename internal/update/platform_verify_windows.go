//go:build windows

package update

import (
	"fmt"
	"os/exec"
)

func verifyPlatformArtifact(path string) error {
	if !platformSignatureRequired() {
		return nil
	}
	signtool, err := exec.LookPath("signtool.exe")
	if err != nil {
		return fmt.Errorf("update: required Authenticode verifier unavailable: %w", err)
	}
	if output, err := exec.Command(signtool, "verify", "/pa", "/all", path).CombinedOutput(); err != nil {
		return fmt.Errorf("update: Authenticode verification failed: %w: %s", err, output)
	}
	return nil
}
