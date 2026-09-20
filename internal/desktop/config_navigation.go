package desktop

// dismissCleanConfig preserves the existing outside-click policy: dirty config
// stays open and receives focus; only a clean config may be dismissed implicitly.
// Explicit user-confirmed discard is handled separately by DismissConfig.
func dismissCleanConfig(dirty bool, focusConfig, dismiss func()) bool {
	if dirty {
		focusConfig()
		return false
	}
	dismiss()
	return true
}
