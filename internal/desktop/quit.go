//go:build wails

package desktop

import (
	"deepseek-harness-desktop/internal/i18n"

	"github.com/wailsapp/wails/v3/pkg/application"
)

func (d *Service) RequestQuit() error {
	if !d.prefs.confirmQuitWhenBusy.Load() {
		d.forceQuit()
		return nil
	}
	if !d.quitPromptOpen.CompareAndSwap(false, true) {
		return nil
	}
	d.quitProbeSettled.Store(false)
	// Official source: Chat bridge reports SessionSummary.running via
	// /v1/report-chat-busy. Unknown (no feed yet) ⇒ treat as not busy.
	busy := d.chatBusyKnown.Load() && d.chatBusy.Load()
	d.ConfirmQuitIfNeeded(busy)
	return nil
}

func (d *Service) ConfirmQuitIfNeeded(busy bool) {
	if !d.quitProbeSettled.CompareAndSwap(false, true) {
		return
	}
	if !d.prefs.confirmQuitWhenBusy.Load() || !busy {
		d.forceQuit()
		return
	}
	app, err := desktopApp()
	if err != nil {
		d.quitPromptOpen.Store(false)
		return
	}
	locale := d.resolvedLocale()
	dialog := app.Dialog.Question()
	dialog.SetTitle(i18n.T(locale, "quit.title"))
	dialog.SetMessage(i18n.T(locale, "quit.message"))
	stay := dialog.AddButton(i18n.T(locale, "quit.stay"))
	quit := dialog.AddButton(i18n.T(locale, "quit.exit"))
	dialog.SetDefaultButton(stay)
	dialog.SetCancelButton(stay)
	stay.OnClick(func() { d.quitPromptOpen.Store(false) })
	quit.OnClick(func() { d.forceQuit() })
	if chat, ok := app.Window.GetByName(chatWindowName); ok {
		dialog.AttachToWindow(chat)
	}
	dialog.Show()
}

func (d *Service) forceQuit() {
	d.allowQuit.Store(true)
	d.quitPromptOpen.Store(false)
	d.quitProbeSettled.Store(true)
	d.configDirty = false
	// Stop the owned DSH tree before tearing down windows so a force-quit
	// cannot leave an orphaned process group that blocks the next Start.
	if d.Manager != nil {
		if err := d.Close(); err != nil {
			_ = err
		}
	}
	app := application.Get()
	if app == nil {
		return
	}
	if config, ok := app.Window.GetByName(configWindowName); ok {
		config.Close()
	}
	if setup, ok := app.Window.GetByName(setupWindowName); ok {
		setup.Close()
	}
	if chat, ok := app.Window.GetByName(chatWindowName); ok {
		chat.Close()
	}
	app.Quit()
}
