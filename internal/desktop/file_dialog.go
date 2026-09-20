package desktop

// normalizeFileDialogResult keeps native cancellation consistent across platforms.
func normalizeFileDialogResult(goos, path string, err error) (string, error) {
	// Wails beta.22 forwards cfd.ErrorCancelled on Windows, but its internal
	// package cannot be imported. Match only that exact sentinel message and
	// platform; do not hide other dialog errors or cancellation-like messages.
	if goos == "windows" && err != nil && err.Error() == "cancelled by user" {
		return "", nil
	}
	return path, err
}
