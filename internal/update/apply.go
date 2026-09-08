package update

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

func (u *Updater) ApplyAndRelaunch() error {
	file, name, err := u.stagedFile()
	if err != nil {
		return err
	}
	u.mu.Lock()
	u.state = StateApplying
	u.errMsg = ""
	u.mu.Unlock()
	if err := applyAndRelaunch(file, name); err != nil {
		return u.fail(err)
	}
	return nil
}

func CleanupLeftovers() {
	exe, err := os.Executable()
	if err != nil {
		return
	}
	exe, err = filepath.EvalSymlinks(exe)
	if err != nil {
		exe, _ = os.Executable()
	}
	_ = os.Remove(exe + ".old")
	if bundle, err := bundleFromExecutable(exe); err == nil {
		_ = os.RemoveAll(bundle + ".old")
	}
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
	_ = os.Remove(old)
	if err := os.Rename(dest, old); err != nil && !os.IsNotExist(err) {
		return err
	}
	info, err := os.Stat(src)
	if err != nil {
		_ = os.Rename(old, dest)
		return err
	}
	if err := copyFile(src, dest, info.Mode()|0o111); err != nil {
		_ = os.Rename(old, dest)
		return err
	}
	return nil
}
