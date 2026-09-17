//go:build wails

package desktop

import (
	"runtime"

	"deepseek-harness-desktop/internal/i18n"

	"github.com/wailsapp/wails/v3/pkg/application"
)

func openExternalURL(raw string) error {
	url, err := sanitizeExternalURL(raw)
	if err != nil {
		return err
	}
	app, err := desktopApp()
	if err != nil {
		return err
	}
	return app.Browser.OpenURL(url)
}

func searchInBrowser(query string) error {
	return searchInBrowserWithHint(query, "")
}

func searchInBrowserWithHint(query, hint string) error {
	raw, err := webSearchURLWithHint(query, hint)
	if err != nil {
		return err
	}
	return openExternalURL(raw)
}

func registerExternalContextMenus() {
	if runtime.GOOS == "darwin" {
		return
	}
	app := application.Get()
	if app == nil {
		return
	}
	browser := defaultBrowserDisplayName()
	searchLabel := i18n.TActive("chrome.search_in_browser", browser)
	openLabel := i18n.TActive("chrome.open_link_in_browser", browser)
	copyLabel := i18n.TActive("chrome.copy")
	copyLinkLabel := i18n.TActive("chrome.copy_link")
	type spec struct {
		name             string
		copyText, search bool
		open, copyLink   bool
	}
	for _, item := range []spec{
		{contextMenuSearch, true, true, false, false},
		{contextMenuLink, false, false, true, true},
		{contextMenuBoth, true, true, true, true},
	} {
		app.ContextMenu.Remove(item.name)
		menu := application.NewContextMenu(item.name)
		if item.copyText {
			menu.Add(copyLabel).OnClick(func(ctx *application.Context) {
				p := parseContextPayload(ctx.ContextMenuData())
				if p.Text == "" {
					return
				}
				app.Clipboard.SetText(p.Text)
			})
		}
		if item.search {
			if item.copyText {
				menu.AddSeparator()
			}
			menu.Add(searchLabel).OnClick(func(ctx *application.Context) {
				p := parseContextPayload(ctx.ContextMenuData())
				_ = searchInBrowser(p.Text)
			})
		}
		if item.open {
			if item.copyText || item.search {
				menu.AddSeparator()
			}
			menu.Add(openLabel).OnClick(func(ctx *application.Context) {
				p := parseContextPayload(ctx.ContextMenuData())
				_ = openExternalURL(p.Href)
			})
		}
		if item.copyLink {
			menu.Add(copyLinkLabel).OnClick(func(ctx *application.Context) {
				p := parseContextPayload(ctx.ContextMenuData())
				if p.Href == "" {
					return
				}
				app.Clipboard.SetText(p.Href)
			})
		}
		menu.Update()
	}
}
