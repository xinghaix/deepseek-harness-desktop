package i18n

import "embed"

//go:embed locales/*.json
var localeFiles embed.FS

func readLocaleFile(name string) ([]byte, error) {
	return localeFiles.ReadFile("locales/" + name)
}
