//go:build !wails

package main

import "errors"

func (d *DSH) openManagement() error {
	return errors.New("桌面配置窗口仅在 Wails 桌面应用中可用")
}
