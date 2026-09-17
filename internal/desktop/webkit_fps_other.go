//go:build wails && !darwin

package desktop

import "github.com/wailsapp/wails/v3/pkg/application"

func unlockWebKitDisplayRefresh(application.Window) {}
