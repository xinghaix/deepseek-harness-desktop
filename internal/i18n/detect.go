package i18n

import (
	"os"
	"strings"
)

// SystemTag returns the best-effort system language tag for the current OS.
func SystemTag() string {
	return systemTag()
}

func envLanguageTag() string {
	for _, key := range []string{"LC_ALL", "LC_MESSAGES", "LANG"} {
		v := strings.TrimSpace(os.Getenv(key))
		if v == "" || strings.EqualFold(v, "C") || strings.EqualFold(v, "POSIX") {
			continue
		}
		return v
	}
	return ""
}
