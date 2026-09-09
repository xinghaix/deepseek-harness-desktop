//go:build wails

package desktop

import (
	"github.com/wailsapp/wails/v3/pkg/application"
)

type DesktopPrefs struct {
	ConfirmQuitWhenBusy bool `json:"confirmQuitWhenBusy"`
}

func (d *Service) DesktopPrefs() DesktopPrefs {
	return DesktopPrefs{ConfirmQuitWhenBusy: d.prefs.confirmQuitWhenBusy.Load()}
}

func (d *Service) SetConfirmQuitWhenBusy(enabled bool) (DesktopPrefs, error) {
	d.prefs.confirmQuitWhenBusy.Store(enabled)
	if err := d.prefs.save(); err != nil {
		return d.DesktopPrefs(), err
	}
	return d.DesktopPrefs(), nil
}

func (d *Service) RequestQuit() error {
	if !d.prefs.confirmQuitWhenBusy.Load() {
		d.forceQuit()
		return nil
	}
	app, err := desktopApp()
	if err != nil {
		d.forceQuit()
		return nil
	}
	chat, ok := app.Window.GetByName("dsh")
	if !ok {
		d.forceQuit()
		return nil
	}
	if !d.quitPromptOpen.CompareAndSwap(false, true) {
		return nil
	}
	chat.ExecJS(probeChatBusyJS)
	return nil
}

func (d *Service) ConfirmQuitIfNeeded(busy bool) {
	if !d.prefs.confirmQuitWhenBusy.Load() || !busy {
		d.forceQuit()
		return
	}
	app, err := desktopApp()
	if err != nil {
		d.quitPromptOpen.Store(false)
		return
	}
	dialog := app.Dialog.Question()
	dialog.SetTitle("还有任务在执行")
	dialog.SetMessage("现在退出会打断正在跑的对话和工具调用，未完成的结果可能没写完。确定要退出吗？")
	stay := dialog.AddButton("继续等待")
	quit := dialog.AddButton("仍然退出")
	dialog.SetDefaultButton(stay)
	dialog.SetCancelButton(stay)
	stay.OnClick(func() { d.quitPromptOpen.Store(false) })
	quit.OnClick(func() { d.forceQuit() })
	if chat, ok := app.Window.GetByName("dsh"); ok {
		dialog.AttachToWindow(chat)
	}
	dialog.Show()
}

func (d *Service) forceQuit() {
	d.allowQuit.Store(true)
	d.quitPromptOpen.Store(false)
	d.configDirty = false
	app := application.Get()
	if app == nil {
		return
	}
	if config, ok := app.Window.GetByName("main"); ok {
		config.Close()
	}
	if chat, ok := app.Window.GetByName("dsh"); ok {
		chat.Close()
	}
	app.Quit()
}
