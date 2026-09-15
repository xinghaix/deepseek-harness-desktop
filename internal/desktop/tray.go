//go:build wails

package desktop

import (
	"log"
	"runtime"
	"strings"
	"time"

	"deepseek-harness-desktop/internal/dsh"
	"deepseek-harness-desktop/internal/i18n"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// StartTrayIfEnabled creates the system tray when trayEnabled is already on at launch.
// Linux tray visibility depends on the desktop environment (StatusNotifierItem / AppIndicator).
func (d *Service) StartTrayIfEnabled() {
	if d.prefs.trayEnabled.Load() {
		d.ensureTray()
	}
}

func (d *Service) ensureTray() {
	if !d.prefs.trayEnabled.Load() {
		return
	}
	d.createTrayIfNeeded()
}

// ensureTrayForHide creates the tray for Cmd/Ctrl+W hide only when tray is enabled.
// With tray off, the window still hides (dock/taskbar) but no status-item is created.
func (d *Service) ensureTrayForHide() {
	if !d.prefs.trayEnabled.Load() {
		return
	}
	d.createTrayIfNeeded()
}

func (d *Service) createTrayIfNeeded() {
	app := application.Get()
	if app == nil {
		return
	}
	running := d.anyTrayRunning()
	d.trayMu.Lock()
	defer d.trayMu.Unlock()
	if d.tray != nil {
		return
	}
	tray := app.SystemTray.New()
	// Colorful app icon + top-right emerald (翠绿) running badge. Never SetTemplateIcon — template/monochrome
	// washes out the activity indicator on macOS menu bar.
	d.tray = tray
	d.applyTrayAppearanceLocked(true, running)
	// macOS menu-bar extras open the menu on left click when OnClick is unset.
	// Windows/Linux: left click reveals Chat; right click / context shows the menu.
	if runtime.GOOS != "darwin" {
		tray.OnClick(func() { d.revealChatFromTray() })
	}
	tray.SetMenu(d.newTrayMenu(app))
}

// CloseChatToTray hides Chat (and overlays) without quitting.
// Always hides — Cmd/Ctrl+W ≠ quit. Tray icon is created only when trayEnabled.
// The window X button keeps closeToTray semantics via hookChatWindow.
func (d *Service) CloseChatToTray() error {
	app := application.Get()
	if app == nil {
		return nil
	}
	chat, ok := app.Window.GetByName(chatWindowName)
	if !ok || chat == nil {
		return nil
	}
	// Hide before ensuring tray so "last window" logic sees a hidden window.
	d.hideToTray(app, chat)
	d.ensureTrayForHide()
	return nil
}

func (d *Service) destroyTray() {
	d.trayMu.Lock()
	if d.trayRebuildTimer != nil {
		d.trayRebuildTimer.Stop()
		d.trayRebuildTimer = nil
	}
	d.stopTrayAnimationLocked()
	tray := d.tray
	d.tray = nil
	d.trayIconRunning = false
	d.trayAnimFrame = 0
	d.trayMu.Unlock()
	if tray != nil {
		tray.Destroy()
	}
}

func (d *Service) refreshTrayMenu() {
	app := application.Get()
	if app == nil {
		return
	}
	running := d.anyTrayRunning()
	d.trayMu.Lock()
	tray := d.tray
	if tray == nil {
		d.trayMu.Unlock()
		return
	}
	d.applyTrayAppearanceLocked(false, running)
	d.trayMu.Unlock()
	tray.SetMenu(d.newTrayMenu(app))
}

// anyTrayRunning prefers live SessionSummary.running rows, then the busy bit.
// Must not run while holding trayMu (sessionsMu lock order).
func (d *Service) anyTrayRunning() bool {
	if d.chatBusy.Load() {
		return true
	}
	d.sessionsMu.Lock()
	defer d.sessionsMu.Unlock()
	for _, session := range d.sessions {
		if session.Running {
			return true
		}
	}
	return false
}

// applyTrayAppearanceLocked updates icon + tooltip. Caller holds trayMu.
func (d *Service) applyTrayAppearanceLocked(force bool, running bool) {
	tray := d.tray
	if tray == nil {
		return
	}
	locale := d.resolvedLocale()
	if running {
		tray.SetTooltip(i18n.T(locale, "tray.tooltip_running"))
	} else {
		tray.SetTooltip(i18n.T(locale, "tray.tooltip"))
	}
	if len(d.icon) == 0 {
		d.stopTrayAnimationLocked()
		d.trayIconRunning = running
		return
	}
	if len(d.trayIconIdle) == 0 {
		if idle, err := trayIconIdleCanvas(d.icon); err == nil && len(idle) > 0 {
			d.trayIconIdle = idle
		} else {
			d.trayIconIdle = d.icon
		}
	}
	if running {
		if len(d.trayIconBusyFrames) == 0 {
			if frames, err := trayIconBusyFrames(d.icon); err == nil && len(frames) >= 1 {
				d.trayIconBusyFrames = frames
			} else if still, err := trayIconWithRunningBadge(d.icon, true); err == nil && len(still) > 0 {
				d.trayIconBusyFrames = [][]byte{still}
			} else {
				d.trayIconBusyFrames = [][]byte{d.icon}
			}
		}
		if force || !d.trayIconRunning {
			d.trayAnimFrame = 0
			tray.SetIcon(d.trayIconBusyFrames[0])
			d.startTrayAnimationLocked()
		} else if d.trayAnimTimer == nil {
			// Keep a badged static icon even when animation cannot start (<2 frames).
			tray.SetIcon(d.trayIconBusyFrames[d.trayAnimFrame%len(d.trayIconBusyFrames)])
			d.startTrayAnimationLocked()
		}
	} else {
		d.stopTrayAnimationLocked()
		if force || d.trayIconRunning {
			tray.SetIcon(d.trayIconIdle)
		}
	}
	d.trayIconRunning = running
}

func (d *Service) startTrayAnimationLocked() {
	if d.tray == nil || len(d.trayIconBusyFrames) < 2 {
		return
	}
	if d.trayAnimTimer != nil {
		return
	}
	stop := make(chan struct{})
	d.trayAnimStop = stop
	ticker := time.NewTicker(time.Duration(trayBusyFramePeriod) * time.Millisecond)
	d.trayAnimTimer = ticker
	go func() {
		for {
			select {
			case <-stop:
				return
			case <-ticker.C:
				d.advanceTrayAnimationFrame()
			}
		}
	}()
}

func (d *Service) stopTrayAnimationLocked() {
	if d.trayAnimTimer != nil {
		d.trayAnimTimer.Stop()
		d.trayAnimTimer = nil
	}
	if d.trayAnimStop != nil {
		close(d.trayAnimStop)
		d.trayAnimStop = nil
	}
}

func (d *Service) advanceTrayAnimationFrame() {
	d.trayMu.Lock()
	defer d.trayMu.Unlock()
	tray := d.tray
	frames := d.trayIconBusyFrames
	if tray == nil || !d.trayIconRunning || len(frames) == 0 {
		return
	}
	d.trayAnimFrame = (d.trayAnimFrame + 1) % len(frames)
	tray.SetIcon(frames[d.trayAnimFrame])
}

func (d *Service) scheduleTrayMenuRefresh() {
	d.trayMu.Lock()
	defer d.trayMu.Unlock()
	if d.tray == nil {
		return
	}
	if d.trayRebuildTimer != nil {
		d.trayRebuildTimer.Stop()
	}
	d.trayRebuildTimer = time.AfterFunc(250*time.Millisecond, d.refreshTrayMenu)
}

func (d *Service) newTrayMenu(app *application.App) *application.Menu {
	locale := d.resolvedLocale()
	menu := app.NewMenu()
	menu.Add(i18n.T(locale, "tray.open_chat")).OnClick(func(*application.Context) {
		d.revealChatFromTray()
	})
	menu.Add(i18n.T(locale, "tray.open_settings")).OnClick(func(*application.Context) {
		if err := d.OpenManagement(); err != nil {
			log.Printf("open management from tray failed: %v", err)
		}
	})

	d.sessionsMu.Lock()
	sessions := selectTraySessions(d.sessions, int(d.prefs.traySessionLimit.Load()))
	d.sessionsMu.Unlock()
	if len(sessions) > 0 {
		menu.AddSeparator()
		menu.Add(i18n.T(locale, "tray.recent_sessions")).SetEnabled(false)
		untitled := i18n.T(locale, "tray.session_untitled")
		runningL := i18n.T(locale, "tray.session_running")
		errorL := i18n.T(locale, "tray.session_error")
		for _, session := range sessions {
			sess := session
			full := fullTraySessionTitle(sess, untitled)
			short := traySessionTitle(sess, untitled)
			status := traySessionStatus(sess.Running, sess.Error && !d.trayErrorAcked(sess.ID))
			label := traySessionMenuLabel(short, status)
			item := menu.Add(label).OnClick(func(*application.Context) {
				d.acknowledgeTraySessionError(sess.ID)
				d.openChatSession(sess.ID)
			})
			tip := full
			switch status {
			case "running":
				if runningL != "" {
					tip = full + " · " + runningL
				}
			case "error":
				if errorL != "" {
					tip = full + " · " + errorL
				}
			}
			if tip != short || status != "idle" {
				item.SetTooltip(tip)
			}
		}
	}

	menu.AddSeparator()
	menu.Add(i18n.T(locale, "tray.quit")).OnClick(func(*application.Context) {
		if err := d.RequestQuit(); err != nil {
			log.Printf("quit from tray failed: %v", err)
		}
	})
	return menu
}

func (d *Service) openChatSession(id string) {
	id = normalizeSessionID(id)
	if id != "" {
		d.pendingOpen.set(id)
	}
	d.revealChatFromTray()
	if id == "" {
		return
	}
	d.dispatchOpenSession(id)
}

func (d *Service) dispatchOpenSession(id string) {
	script := openChatSessionJS(id)
	if script == "" {
		return
	}
	app := application.Get()
	if app == nil {
		return
	}
	chat, ok := app.Window.GetByName(chatWindowName)
	if !ok || chat == nil {
		return
	}
	chat.ExecJS(script)
}

func (d *Service) claimOpenSession() string {
	return d.pendingOpen.claim()
}

func (d *Service) revealChatFromTray() {
	app := application.Get()
	if app == nil {
		return
	}
	if chat, ok := app.Window.GetByName(chatWindowName); ok {
		chat.Show()
		chat.Focus()
		return
	}
	if err := d.OpenDSH(); err != nil {
		if err2 := d.OpenChat(); err2 != nil {
			log.Printf("tray reveal chat failed: %v / %v", err, err2)
		}
	}
}

func (d *Service) revealHiddenChat() {
	app := application.Get()
	if app == nil {
		return
	}
	if chat, ok := app.Window.GetByName(chatWindowName); ok {
		chat.Show()
		chat.Focus()
	}
}

func (d *Service) hideToTray(app *application.App, chat application.Window) {
	// Called from WindowClosing; avoid windowMu — OpenDSH may already hold it.
	if config, ok := app.Window.GetByName(configWindowName); ok {
		config.SetAlwaysOnTop(false)
		config.Hide()
	}
	if chat != nil {
		chat.ExecJS(undimChatJS)
		chat.Hide()
	}
	if setup, ok := app.Window.GetByName(setupWindowName); ok {
		setup.Hide()
	}
}

func (d *Service) ReportSessions(sessions []dsh.BridgeSession) {
	cp := append([]dsh.BridgeSession(nil), sessions...)
	d.sessionsMu.Lock()
	d.sessions = cp
	// Drop local ack once the bridge no longer reports error for that id.
	if d.trayErrorAcks != nil {
		for id := range d.trayErrorAcks {
			still := false
			for _, s := range cp {
				if s.ID == id && s.Error && !s.Running {
					still = true
					break
				}
			}
			if !still {
				delete(d.trayErrorAcks, id)
			}
		}
	}
	d.sessionsMu.Unlock()
	d.scheduleTrayMenuRefresh()
}

func (d *Service) trayErrorAcked(id string) bool {
	d.sessionsMu.Lock()
	defer d.sessionsMu.Unlock()
	_, ok := d.trayErrorAcks[id]
	return ok
}

func (d *Service) acknowledgeTraySessionError(id string) {
	id = strings.TrimSpace(id)
	if id == "" {
		return
	}
	d.sessionsMu.Lock()
	if d.trayErrorAcks == nil {
		d.trayErrorAcks = map[string]struct{}{}
	}
	d.trayErrorAcks[id] = struct{}{}
	d.sessionsMu.Unlock()
	d.scheduleTrayMenuRefresh()
}
