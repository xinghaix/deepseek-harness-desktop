package dsh

import (
	"embed"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
)

const webviewBootDirName = "webview-boot"

//go:embed webviewboot/cordis.patch.yml webviewboot/index.js webviewboot/package.json
var webviewBootFiles embed.FS

func writeWebviewBootOverlay(desktopDir string) (string, error) {
	dir := filepath.Join(desktopDir, webviewBootDirName)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return "", fmt.Errorf("创建 WebView 启动补丁目录: %w", err)
	}
	for _, name := range []string{"cordis.patch.yml", "index.js", "package.json"} {
		data, err := webviewBootFiles.ReadFile("webviewboot/" + name)
		if err != nil {
			return "", fmt.Errorf("读取 WebView 启动补丁 %s: %w", name, err)
		}
		path := filepath.Join(dir, name)
		if err := os.WriteFile(path, data, 0o600); err != nil {
			return "", fmt.Errorf("写入 WebView 启动补丁 %s: %w", name, err)
		}
	}
	return filepath.Join(dir, "cordis.patch.yml"), nil
}

func webCLIArgs(patch string, port int) []string {
	args := []string{"web"}
	if patch != "" {
		args = append(args, "--patch", patch)
	}
	return append(args, "--host", "127.0.0.1", "--port", strconv.Itoa(port), "--no-open")
}

func isWebSubcommand(args []string) bool {
	skipValue := false
	for _, arg := range args {
		if skipValue {
			skipValue = false
			continue
		}
		if arg == "--patch" {
			skipValue = true
			continue
		}
		if arg == "web" {
			return true
		}
	}
	return false
}
