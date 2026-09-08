//go:build darwin

package update

import (
	"archive/zip"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
)

func applyAndRelaunch(staged, _ string) error {
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	exe, err = filepath.EvalSymlinks(exe)
	if err != nil {
		return err
	}
	dir, err := os.MkdirTemp("", "dsh-update-")
	if err != nil {
		return err
	}
	app, err := unzipApp(staged, dir)
	if err != nil {
		return err
	}
	if bundle, err := bundleFromExecutable(exe); err == nil {
		if err := replaceDir(bundle, app); err != nil {
			return err
		}
		return relaunchOpen(preferDisplayBundle(bundle))
	}
	inner := filepath.Join(app, "Contents", "MacOS", filepath.Base(exe))
	if _, err := os.Stat(inner); err != nil {
		return fmt.Errorf("更新包里找不到可执行文件")
	}
	if err := replaceFile(exe, inner); err != nil {
		return err
	}
	return relaunchWait(exe)
}

const macOSBundleName = "Deepseek Harness Desktop.app"

func preferDisplayBundle(bundle string) string {
	wanted := filepath.Join(filepath.Dir(bundle), macOSBundleName)
	if filepath.Clean(bundle) == filepath.Clean(wanted) {
		return bundle
	}
	_ = os.RemoveAll(wanted)
	if err := os.Rename(bundle, wanted); err != nil {
		return bundle
	}
	return wanted
}

func replaceDir(dest, src string) error {
	old := dest + ".old"
	_ = os.RemoveAll(old)
	if err := os.Rename(dest, old); err != nil {
		return err
	}
	if err := os.Rename(src, dest); err != nil {
		_ = os.Rename(old, dest)
		return err
	}
	return nil
}

func unzipApp(zipPath, dest string) (string, error) {
	r, err := zip.OpenReader(zipPath)
	if err != nil {
		return "", err
	}
	defer r.Close()
	var appRel string
	for _, f := range r.File {
		rel := filepath.Clean(f.Name)
		if rel == "." || strings.HasPrefix(rel, "..") {
			continue
		}
		target := filepath.Join(dest, rel)
		if !strings.HasPrefix(target, dest+string(os.PathSeparator)) && target != dest {
			return "", fmt.Errorf("非法更新包路径")
		}
		if f.FileInfo().IsDir() || strings.HasSuffix(f.Name, "/") {
			_ = os.MkdirAll(target, 0o755)
			continue
		}
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			return "", err
		}
		rc, err := f.Open()
		if err != nil {
			return "", err
		}
		out, err := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, f.Mode())
		if err != nil {
			rc.Close()
			return "", err
		}
		_, err = io.Copy(out, rc)
		_ = out.Close()
		_ = rc.Close()
		if err != nil {
			return "", err
		}
		if appRel == "" {
			appRel = appPrefix(rel)
		}
	}
	if appRel == "" {
		return "", fmt.Errorf("更新包里没有 .app")
	}
	return filepath.Join(dest, appRel), nil
}

func appPrefix(rel string) string {
	parts := strings.Split(rel, string(os.PathSeparator))
	for i, part := range parts {
		if strings.HasSuffix(part, ".app") {
			return filepath.Join(parts[:i+1]...)
		}
	}
	return ""
}

func relaunchOpen(bundle string) error {
	cmd := exec.Command("/bin/sh", "-c", fmt.Sprintf("while kill -0 %d 2>/dev/null; do sleep 0.2; done; exec /usr/bin/open %q", os.Getpid(), bundle))
	cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true}
	cmd.Stdin = nil
	cmd.Stdout = nil
	cmd.Stderr = nil
	return cmd.Start()
}

func relaunchWait(exe string) error {
	cmd := exec.Command("/bin/sh", "-c", fmt.Sprintf("while kill -0 %d 2>/dev/null; do sleep 0.2; done; exec %q", os.Getpid(), exe))
	cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true}
	return cmd.Start()
}
