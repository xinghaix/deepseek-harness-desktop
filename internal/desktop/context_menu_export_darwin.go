//go:build wails && darwin

package desktop

/*
#include <stdlib.h>
*/
import "C"

import "deepseek-harness-desktop/internal/i18n"

//export dshGoOpenURL
func dshGoOpenURL(url *C.char) {
	if url == nil {
		return
	}
	_ = openExternalURL(C.GoString(url))
}

//export dshGoSearch
func dshGoSearch(query, hint *C.char) {
	q := ""
	h := ""
	if query != nil {
		q = C.GoString(query)
	}
	if hint != nil {
		h = C.GoString(hint)
	}
	_ = searchInBrowserWithHint(q, h)
}

//export dshContextSearchTitle
func dshContextSearchTitle() *C.char {
	return C.CString(i18n.TActive("chrome.search_in_browser", defaultBrowserDisplayName()))
}

//export dshContextOpenTitle
func dshContextOpenTitle() *C.char {
	return C.CString(i18n.TActive("chrome.open_link_in_browser", defaultBrowserDisplayName()))
}
