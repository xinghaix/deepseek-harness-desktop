//go:build darwin

package i18n

import (
	"os/exec"
	"strings"
)

func systemTag() string {
	if t := envLanguageTag(); t != "" {
		return t
	}
	// GUI apps often lack LANG; fall back to AppleLocale (e.g. zh_CN).
	out, err := exec.Command("defaults", "read", "-g", "AppleLocale").Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}
