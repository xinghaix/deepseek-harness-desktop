//go:build wails

package desktop

import (
	"log"

	"deepseek-harness-desktop/internal/i18n"

	"github.com/wailsapp/wails/v3/pkg/application"
)

func (d *Service) RequestQuit() error {
	if d.quitStarted.Load() || d.allowQuit.Load() {
		return nil
	}
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
	dialog := d.quitDialog(app.Dialog)
	if chat, ok := app.Window.GetByName(chatWindowName); ok {
		dialog.AttachToWindow(chat)
	}
	dialog.Show()
}

func (d *Service) quitDialog(dialogs *application.DialogManager) *application.MessageDialog {
	locale := d.resolvedLocale()
	dialog := dialogs.Question()
	dialog.SetTitle(i18n.T(locale, "quit.title"))
	dialog.SetMessage(i18n.T(locale, "quit.message"))
	stay := dialog.AddButton(i18n.T(locale, "quit.stay"))
	quit := dialog.AddButton(i18n.T(locale, "quit.exit"))
	dialog.SetDefaultButton(stay)
	dialog.SetCancelButton(stay)
	stay.OnClick(func() { d.quitPromptOpen.Store(false) })
	quit.OnClick(func() { d.forceQuit() })
	return dialog
}

// ShouldQuit 收口 Dock、系统菜单等框架原生退出入口；清理完成后才放行。
func (d *Service) ShouldQuit() bool {
	if d.allowQuit.Load() {
		return true
	}
	// 原生退出回调必须快速返回，弹窗和清理都交回应用退出路径执行。
	go func() { _ = d.RequestQuit() }()
	return false
}

func (d *Service) forceQuit() {
	if !d.quitStarted.CompareAndSwap(false, true) {
		return
	}
	d.quitPromptOpen.Store(false)
	d.quitProbeSettled.Store(true)
	// macOS 的确认按钮在原生 UI 线程回调；空闲退出和关窗也必须立即返回。
	// 保持事件循环可用，让同步窗口查询和桥接 RPC 能在清理期间完成。
	go func() {
		if err := d.Close(); err != nil {
			log.Printf("关闭 DSH 进程失败: %v", err)
		}
		d.allowQuit.Store(true)
		if d.nativeQuit != nil {
			d.nativeQuit()
			return
		}
		if app := application.Get(); app != nil {
			// 窗口由 Wails 统一销毁，避免逐窗 Close 触发重复退出及窗口表锁重入。
			app.Quit()
		}
	}()
}
