//go:build wails

package desktop

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
	raw, err := webSearchURL(query)
	if err != nil {
		return err
	}
	return openExternalURL(raw)
}
