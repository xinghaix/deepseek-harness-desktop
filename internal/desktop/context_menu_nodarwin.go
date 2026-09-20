//go:build wails && !darwin

package desktop

import "github.com/wailsapp/wails/v3/pkg/application"

func installNativeContextMenu() {}

func attachNativeContextMenu(window application.Window) bool { return true }
