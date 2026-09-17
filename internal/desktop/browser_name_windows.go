//go:build wails && windows

package desktop

import (
	"golang.org/x/sys/windows/registry"
)

func init() {
	lookupDefaultBrowserName = windowsDefaultBrowserName
}

func windowsDefaultBrowserName() string {
	key, err := registry.OpenKey(registry.CURRENT_USER, `Software\Microsoft\Windows\Shell\Associations\UrlAssociations\http\UserChoice`, registry.QUERY_VALUE)
	if err != nil {
		return ""
	}
	defer key.Close()
	progID, _, err := key.GetStringValue("ProgId")
	if err != nil {
		return ""
	}
	return browserNameFromProgID(progID)
}
