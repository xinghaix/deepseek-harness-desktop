//go:build wails && darwin

package desktop

/*
#cgo CFLAGS: -mmacosx-version-min=10.13 -x objective-c
#cgo LDFLAGS: -framework Cocoa -framework WebKit -framework Foundation
#include "context_menu_darwin.h"
*/
import "C"

import (
	"unsafe"

	"github.com/wailsapp/wails/v3/pkg/application"
)

func installNativeContextMenu() {
	C.dshInstallNativeContextMenu()
}

func attachNativeContextMenu(window application.Window) bool {
	if window == nil || window.NativeWindow() == nil {
		return false
	}
	return C.dshAttachNativeContextWindow(window.NativeWindow()) != 0
}

func init() {
	lookupDefaultBrowserName = func() string {
		c := C.dshCopyDefaultBrowserName()
		if c == nil {
			return ""
		}
		defer C.free(unsafe.Pointer(c))
		return C.GoString(c)
	}
}
