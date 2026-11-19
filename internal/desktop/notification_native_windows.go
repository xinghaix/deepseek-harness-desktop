//go:build wails && windows

package desktop

// Windows 的 Wails 授权检查是桩实现，不能把它当成已授权。
func platformNotificationStatus() string { return "unknown" }
