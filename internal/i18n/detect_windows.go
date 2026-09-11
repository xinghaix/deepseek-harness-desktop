//go:build windows

package i18n

import (
	"strings"
	"syscall"
	"unsafe"
)

var (
	modKernel32              = syscall.NewLazyDLL("kernel32.dll")
	procGetUserDefaultLocale = modKernel32.NewProc("GetUserDefaultLocaleName")
)

func systemTag() string {
	if t := windowsLocaleName(); t != "" {
		return t
	}
	return envLanguageTag()
}

func windowsLocaleName() string {
	const maxLen = 85
	buf := make([]uint16, maxLen)
	r1, _, _ := procGetUserDefaultLocale.Call(uintptr(unsafe.Pointer(&buf[0])), uintptr(maxLen))
	if r1 == 0 {
		return ""
	}
	return strings.TrimSpace(syscall.UTF16ToString(buf))
}
