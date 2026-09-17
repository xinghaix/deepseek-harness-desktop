package update

import (
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type updateIdentity struct {
	Executable string
	Target     string
	Backup     string
}

func (u *Updater) ApplyAndRelaunch() error {
	file, name, err := u.stagedFile()
	if err != nil {
		return err
	}
	if err := u.verifyStagedArtifact(file); err != nil {
		return u.fail(err)
	}
	identity, err := currentUpdateIdentity()
	if err != nil {
		return u.fail(err)
	}
	if _, err := beginTransaction(identity.Target, identity.Backup, identity.Executable, file); err != nil {
		return u.fail(err)
	}
	if err := ensureCurrentTransactionIdentity(identity); err != nil {
		return u.fail(err)
	}
	u.mu.Lock()
	u.state = StateApplying
	u.errMsg = ""
	u.mu.Unlock()
	if err := applyAndRelaunch(file, name); err != nil {
		rollbackErr := RollbackTransaction()
		if rollbackErr != nil {
			return u.fail(fmt.Errorf("%w (rollback failed: %v)", err, rollbackErr))
		}
		return u.fail(err)
	}
	// The platform helper has successfully spawned the relaunch command. A
	// later process startup must call MarkHealthy before this backup is deleted.
	if _, err := UpdateTransactionPhase(TransactionLaunched); err != nil {
		rollbackErr := RollbackTransaction()
		if rollbackErr != nil {
			return u.fail(fmt.Errorf("%w (rollback failed: %v)", err, rollbackErr))
		}
		return u.fail(err)
	}
	return nil
}

func CleanupLeftovers() {
	// Never infer health from process start alone. Legacy .old files without a
	// transaction marker are intentionally retained for manual recovery.
	cleanupTransactionLeftovers()
}

func currentUpdateTarget() (string, string, error) {
	identity, err := currentUpdateIdentity()
	if err != nil {
		return "", "", err
	}
	return identity.Target, identity.Backup, nil
}

func currentUpdateIdentity() (updateIdentity, error) {
	exe, err := os.Executable()
	if err != nil {
		return updateIdentity{}, err
	}
	resolved, err := filepath.EvalSymlinks(exe)
	if err != nil {
		return updateIdentity{}, fmt.Errorf("update: resolve current executable: %w", err)
	}
	exe = filepath.Clean(resolved)
	target := exe
	if bundle, err := bundleFromExecutable(exe); err == nil {
		target = filepath.Clean(bundle)
	}
	return updateIdentity{Executable: exe, Target: target, Backup: target + ".old"}, nil
}

func bundleFromExecutable(exe string) (string, error) {
	macOSDir := filepath.Dir(exe)
	contents := filepath.Dir(macOSDir)
	bundle := filepath.Dir(contents)
	if filepath.Base(macOSDir) == "MacOS" && filepath.Base(contents) == "Contents" && strings.HasSuffix(bundle, ".app") {
		return bundle, nil
	}
	return "", fmt.Errorf("not a macOS app bundle")
}

func copyFile(src, dest string, mode os.FileMode) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.OpenFile(dest, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, mode)
	if err != nil {
		return err
	}
	_, err = io.Copy(out, in)
	closeErr := out.Close()
	if err != nil {
		return err
	}
	return closeErr
}

func replaceFile(dest, src string) error {
	old := dest + ".old"
	if _, err := os.Lstat(old); err == nil {
		return fmt.Errorf("%w: %s", ErrBackupExists, old)
	} else if !os.IsNotExist(err) {
		return err
	}
	info, err := os.Stat(src)
	if err != nil {
		return err
	}
	if !info.Mode().IsRegular() {
		return fmt.Errorf("update: staged file is not regular: %s", src)
	}

	// Materialize and fsync the new bytes beside the destination first. The
	// installed path is never truncated or partially copied in place.
	tmp, err := os.CreateTemp(filepath.Dir(dest), ".update-new-*")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	cleanupTemp := true
	defer func() {
		if cleanupTemp {
			_ = os.Remove(tmpPath)
		}
	}()
	if err := tmp.Chmod(info.Mode() | 0o111); err != nil {
		_ = tmp.Close()
		return err
	}
	in, err := os.Open(src)
	if err != nil {
		_ = tmp.Close()
		return err
	}
	_, copyErr := io.Copy(tmp, in)
	closeInErr := in.Close()
	if copyErr != nil {
		_ = tmp.Close()
		return copyErr
	}
	if closeInErr != nil {
		_ = tmp.Close()
		return closeInErr
	}
	if err := tmp.Sync(); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}

	// Rename the old installation out of the way, then atomically publish the
	// complete temporary file. Existing .old is never deleted or overwritten.
	if err := os.Rename(dest, old); err != nil && !os.IsNotExist(err) {
		return err
	}
	if err := os.Rename(tmpPath, dest); err != nil {
		if restoreErr := restorePath(dest, old, true); restoreErr != nil {
			return fmt.Errorf("%w (restore failed: %v)", err, restoreErr)
		}
		return err
	}
	cleanupTemp = false
	return nil
}

// restoreFile restores dest.old without deleting it first. If no backup was
// created (the destination did not exist), any partially copied destination is
// removed instead.
func restorePath(target, backup string, targetExisted bool) error {
	if filepath.Clean(backup) != filepath.Clean(target+".old") {
		return errors.New("update: restore paths are not a target/.old pair")
	}
	if _, err := os.Lstat(backup); err != nil {
		return err
	}
	quarantine := fmt.Sprintf("%s.failed-%d", target, time.Now().UnixNano())
	if _, err := os.Lstat(target); err == nil {
		if err := os.Rename(target, quarantine); err != nil {
			return err
		}
	} else if !os.IsNotExist(err) {
		return err
	} else if targetExisted {
		// Keep restoring the backup even if the recorded target is already gone.
	}
	if err := os.Rename(backup, target); err != nil {
		if _, statErr := os.Lstat(quarantine); statErr == nil {
			_ = os.Rename(quarantine, target)
		}
		return err
	}
	_ = os.RemoveAll(quarantine)
	return nil
}

func restoreFile(dest string) error {
	old := dest + ".old"
	if _, err := os.Lstat(old); err != nil {
		if os.IsNotExist(err) {
			if removeErr := os.Remove(dest); removeErr != nil && !os.IsNotExist(removeErr) {
				return removeErr
			}
			return nil
		}
		return err
	}
	return restorePath(dest, old, true)
}
