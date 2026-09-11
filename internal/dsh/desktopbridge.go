package dsh

import (
	"deepseek-harness-desktop/internal/i18n"
	"embed"
	"fmt"
	"os"
	"path/filepath"
)

const desktopBridgeDirName = "desktop-bridge"

//go:embed desktopbridge/cordis.patch.yml desktopbridge/package.json desktopbridge/lib/index.js desktopbridge/lib/client.js
var desktopBridgeFiles embed.FS

func writeDesktopBridgeOverlay(desktopDir string) (string, error) {
	dir := filepath.Join(desktopDir, desktopBridgeDirName)
	if err := os.MkdirAll(filepath.Join(dir, "lib"), 0o700); err != nil {
		return "", fmt.Errorf("%s: %w", i18n.TActive("err.desktopbridge_mkdir"), err)
	}
	files := []struct {
		embedPath string
		outPath   string
	}{
		{"desktopbridge/cordis.patch.yml", "cordis.patch.yml"},
		{"desktopbridge/package.json", "package.json"},
		{"desktopbridge/lib/index.js", filepath.Join("lib", "index.js")},
		{"desktopbridge/lib/client.js", filepath.Join("lib", "client.js")},
	}
	for _, file := range files {
		data, err := desktopBridgeFiles.ReadFile(file.embedPath)
		if err != nil {
			return "", fmt.Errorf("%s: %w", i18n.TActive("err.desktopbridge_read", file.embedPath), err)
		}
		path := filepath.Join(dir, file.outPath)
		if err := os.WriteFile(path, data, 0o600); err != nil {
			return "", fmt.Errorf("%s: %w", i18n.TActive("err.desktopbridge_write", file.outPath), err)
		}
	}
	return filepath.Join(dir, "cordis.patch.yml"), nil
}
