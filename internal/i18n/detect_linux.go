//go:build linux

package i18n

func systemTag() string {
	return envLanguageTag()
}
