//go:build wails

package desktop

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"deepseek-harness-desktop/internal/desktopstate"
	"deepseek-harness-desktop/internal/dsh"
	"deepseek-harness-desktop/internal/i18n"
	"deepseek-harness-desktop/internal/update"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

type Service struct {
	*dsh.Manager
	nativeOpenPath     func(string) error // optional native-dispatch seam for tests
	windowMu           sync.Mutex
	updater            *update.Updater
	stopAuto           context.CancelFunc
	prefs              desktopPrefs
	configHooked       bool
	chatHookedID       uint
	openedChatURL      string
	configDirty        bool
	configIsModal      bool
	allowQuit          atomic.Bool
	quitPromptOpen     atomic.Bool
	quitProbeSettled   atomic.Bool
	chatBusy           atomic.Bool
	chatBusyKnown      atomic.Bool
	icon               []byte
	trayMu             sync.Mutex
	tray               *application.SystemTray
	trayRebuildTimer   *time.Timer
	trayIconIdle       []byte
	trayIconBusyFrames [][]byte
	trayAnimTimer      *time.Ticker
	trayAnimStop       chan struct{}
	trayAnimFrame      int
	trayIconRunning    bool
	sessionsMu          sync.Mutex
	sessions            []dsh.BridgeSession
	trayErrorAcks       map[string]struct{} // local ack after tray click
	pendingOpen         pendingOpenSession
	statusEmitMu        sync.Mutex
	statusEmitTimer     *time.Timer
	windowStateMu       sync.Mutex
	windowStateTimer    *time.Timer
	cachedWindowState   *desktopstate.WindowState
	lastSessionMu       sync.Mutex
	lastSessionTimer    *time.Timer
	cachedLastSessionID string
}

func New(icon []byte) *Service {
	ctx, cancel := context.WithCancel(context.Background())
	s := &Service{Manager: dsh.New(), updater: update.New(), stopAuto: cancel, icon: icon}
	s.prefs.load()
	if ws, err := desktopstate.LoadWindowState(); err == nil && ws != nil {
		s.cachedWindowState = ws
	}
	if lastID, err := desktopstate.LoadLastSessionID(); err == nil && lastID != "" {
		s.cachedLastSessionID = lastID
	}
	i18n.SetActive(i18n.Resolve(s.prefs.getLanguage(), i18n.SystemTag()))
	s.SetBridgeHost(bridgeHostAdapter{service: s})
	s.SetStatusListener(s.emitStatusChanged)
	go s.updater.RunPeriodic(ctx)
	return s
}

func (d *Service) ReportChatBusy(busy bool) {
	d.chatBusy.Store(busy)
	d.chatBusyKnown.Store(true)
	d.scheduleTrayMenuRefresh()
}

// ToggleChatZoom toggles Chat work-area maximise/restore (not system fullscreen).
// Bound for JS fallbacks when window.wails.Window.ToggleMaximise is unavailable.
func (d *Service) ToggleChatZoom() {
	app := application.Get()
	if app == nil {
		return
	}
	if chat, ok := app.Window.GetByName(chatWindowName); ok && chat != nil {
		chat.ToggleMaximise()
	}
}

func (d *Service) ChatBusy() (busy bool, known bool) {
	return d.chatBusy.Load(), d.chatBusyKnown.Load()
}

func (d *Service) ChooseExecutable() (string, error) {
	app, err := desktopApp()
	if err != nil {
		return "", err
	}
	locale := d.resolvedLocale()
	path, err := app.Dialog.OpenFile().
		CanChooseFiles(true).
		CanChooseDirectories(false).
		SetTitle(i18n.T(locale, "dialog.choose_executable_title")).
		SetMessage(i18n.T(locale, "dialog.choose_executable_message")).
		PromptForSingleSelection()
	return normalizeFileDialogResult(runtime.GOOS, path, err)
}

func (d *Service) ChooseHome() (string, error) {
	locale := d.resolvedLocale()
	return d.chooseDirectory(i18n.T(locale, "dialog.choose_home_title"), i18n.T(locale, "dialog.choose_home_message"))
}

func (d *Service) ChooseWorkspace() (string, error) {
	locale := d.resolvedLocale()
	return d.chooseDirectory(i18n.T(locale, "dialog.choose_workspace_title"), i18n.T(locale, "dialog.choose_workspace_message"))
}

func (d *Service) chooseDirectory(title, message string) (string, error) {
	app, err := desktopApp()
	if err != nil {
		return "", err
	}
	path, err := app.Dialog.OpenFile().
		CanChooseDirectories(true).
		CanChooseFiles(false).
		SetTitle(title).
		SetMessage(message).
		PromptForSingleSelection()
	return normalizeFileDialogResult(runtime.GOOS, path, err)
}

func (d *Service) ReloadChat(o dsh.Options) error {
	o.Port = 0
	if err := d.RestartWithOptions(o); err != nil {
		return err
	}
	deadline := time.Now().Add(45 * time.Second)
	for time.Now().Before(deadline) {
		st := d.Status()
		switch st.State {
		case "running":
			if st.URL == "" {
				break
			}
			d.openedChatURL = ""
			d.NoteChatWindowURL("")
			return d.OpenDSH()
		case "failed":
			if st.Error != "" {
				return errors.New(st.Error)
			}
			return i18n.ErrorfActive("err.reopen_chat_failed")
		}
		time.Sleep(150 * time.Millisecond)
	}
	return i18n.ErrorfActive("err.reopen_chat_timeout")
}

func (d *Service) OpenDSH() error {
	entry, err := d.ChatEntryPoint()
	if err != nil {
		return err
	}
	chatURL := entry.LoadURL
	if err := validateChatURL(chatURL, entry.FirstLoad); err != nil {
		return fmt.Errorf("%s", i18n.TActive("err.untrusted_chat_url", err.Error()))
	}
	app, err := desktopApp()
	if err != nil {
		return err
	}
	d.windowMu.Lock()
	defer d.windowMu.Unlock()
	// dsh web cookies are SameSite=Strict. Navigating the config WebView
	// (wails://) to 127.0.0.1 drops the login cookie on the 303 to /. Chat
	// must be a separate WebView whose first load is the printed token URL.
	chat, ok := app.Window.GetByName(chatWindowName)
	if !ok {
		if d.prefs.getRestoreLastSession() && d.pendingOpen.peek() == "" {
			if lastID, err := desktopstate.LoadLastSessionID(); err == nil && lastID != "" {
				d.pendingOpen.set(lastID)
			}
		}
		chat = app.Window.NewWithOptions(ChatWindowOptions(chatURL))
		d.MarkBrowserOpened()
		d.openedChatURL = chatURL
		d.NoteChatWindowURL(chatURL)
	} else if sameHTTPOrigin(d.openedChatURL, chatURL) {
		// Keep the existing first-party session; do not SetURL.
	} else {
		chat.SetURL(chatURL)
		d.MarkBrowserOpened()
		d.openedChatURL = chatURL
		d.NoteChatWindowURL(chatURL)
	}
	// Always (re)bind close hooks — Chat can be recreated after a real close.
	d.hookChatWindow(app, chat)
	if !d.tryDismissConfigModal(app, chat) {
		return nil
	}
	chat.Show()
	chat.Focus()
	return nil
}

// OpenChat refreshes/opens Chat after a successful auto-relaunch (port may change).
func (d *Service) OpenChat() error {
	d.windowMu.Lock()
	d.openedChatURL = ""
	d.NoteChatWindowURL("")
	d.windowMu.Unlock()
	return d.OpenDSH()
}

// PresentRecoverySettings shows the standalone cold-start settings window after
// auto-relaunch is exhausted. Never uses the modal-over-chat path.
func (d *Service) PresentRecoverySettings() error {
	app, err := desktopApp()
	if err != nil {
		return err
	}
	d.windowMu.Lock()
	defer d.windowMu.Unlock()
	d.configHooked = false
	d.configIsModal = false
	d.configDirty = false
	if config, ok := app.Window.GetByName(configWindowName); ok {
		config.SetAlwaysOnTop(false)
		config.Close()
	}
	// Hide Chat (do not Close — that would trip the quit confirmation hook).
	if chat, ok := app.Window.GetByName(chatWindowName); ok {
		chat.ExecJS(undimChatJS)
		chat.Hide()
	}
	d.openedChatURL = ""
	d.NoteChatWindowURL("")
	const managementURL = "/?manage=1"
	window, ok := app.Window.GetByName(setupWindowName)
	if !ok {
		window = app.Window.NewWithOptions(ManagementWindowOptions(managementURL))
		d.NoteManagementWindowURL(managementURL)
	} else if d.NoteManagementWindowURL(managementURL) {
		window.SetURL(managementURL)
	}
	d.hookConfigWindow(window)
	window.Show()
	window.Focus()
	return nil
}

// OpenManagement 把配置作为 Chat 上的模态打开，不隐藏 Chat。
func (d *Service) OpenManagement() error {
	app, err := desktopApp()
	if err != nil {
		return err
	}
	d.windowMu.Lock()
	defer d.windowMu.Unlock()
	chat, chatOK := app.Window.GetByName(chatWindowName)
	if chatOK {
		chat.Show()
		const modalURL = "/?manage=1&modal=1"
		window, ok := app.Window.GetByName(configWindowName)
		if !ok {
			window = app.Window.NewWithOptions(ConfigModalWindowOptions(modalURL, d.resolvedLocale()))
			d.configIsModal = true
			d.configHooked = false
			d.NoteManagementWindowURL(modalURL)
		}
		if setup, setupOK := app.Window.GetByName(setupWindowName); setupOK {
			setup.Hide()
		}
		d.hookConfigWindow(window)
		presentConfigModal(chat, window)
		return nil
	}
	const managementURL = "/?manage=1"
	window, ok := app.Window.GetByName(setupWindowName)
	if !ok {
		window = app.Window.NewWithOptions(ManagementWindowOptions(managementURL))
		d.NoteManagementWindowURL(managementURL)
	} else if d.NoteManagementWindowURL(managementURL) {
		window.SetURL(managementURL)
	}
	d.hookConfigWindow(window)
	window.Show()
	window.Focus()
	return nil
}

func presentConfigModal(chat, config application.Window) {
	if chat == nil || config == nil {
		return
	}
	config.SetAlwaysOnTop(true)
	config.SetCloseButtonState(application.ButtonHidden)
	config.SetMinimiseButtonState(application.ButtonHidden)
	config.SetMaximiseButtonState(application.ButtonHidden)
	config.SetFullscreenButtonState(application.ButtonHidden)
	config.SetSize(720, 680)
	config.SetMinSize(560, 480)
	chat.ExecJS(dimChatJS)
	config.Show()
	config.Center()
	config.Focus()
}

// Called with windowMu held. Implicit navigation must never clear dirty edits.
func (d *Service) tryDismissConfigModal(app *application.App, chat application.Window) bool {
	return dismissCleanConfig(d.configDirty, func() {
		if config, ok := app.Window.GetByName(configWindowName); ok {
			config.Show()
			config.Focus()
		} else if setup, ok := app.Window.GetByName(setupWindowName); ok {
			setup.Show()
			setup.Focus()
		}
	}, func() { d.dismissConfigModal(app, chat) })
}

func (d *Service) dismissConfigModal(app *application.App, chat application.Window) {
	if chat != nil {
		chat.ExecJS(undimChatJS)
	}
	d.configHooked = false
	d.configIsModal = false
	d.configDirty = false
	if config, ok := app.Window.GetByName(configWindowName); ok {
		config.SetAlwaysOnTop(false)
		config.Close()
	}
	if setup, ok := app.Window.GetByName(setupWindowName); ok {
		setup.Close()
	}
}

func (d *Service) hookConfigWindow(window application.Window) {
	if window == nil {
		return
	}
	TuneNativeWebView(window)
	if d.configHooked {
		return
	}
	d.configHooked = true
	window.RegisterHook(events.Common.WindowClosing, func(event *application.WindowEvent) {
		if d.configDirty {
			event.Cancel()
			window.ExecJS(showDiscardConfigJS)
			return
		}
		d.configHooked = false
		app, err := desktopApp()
		if err != nil {
			return
		}
		if chat, ok := app.Window.GetByName(chatWindowName); ok {
			chat.ExecJS(undimChatJS)
			chat.Focus()
		}
	})
}

func (d *Service) SetConfigDirty(dirty bool) {
	d.windowMu.Lock()
	defer d.windowMu.Unlock()
	d.configDirty = dirty
}

func (d *Service) TryDismissConfig() error {
	d.windowMu.Lock()
	defer d.windowMu.Unlock()
	app, err := desktopApp()
	if err != nil {
		return err
	}
	chat, _ := app.Window.GetByName(chatWindowName)
	if !d.tryDismissConfigModal(app, chat) {
		return nil
	}
	if chat != nil {
		chat.Show()
		chat.Focus()
	}
	return nil
}

func (d *Service) DismissConfig() error {
	d.windowMu.Lock()
	defer d.windowMu.Unlock()
	app, err := desktopApp()
	if err != nil {
		return err
	}
	d.configDirty = false
	chat, _ := app.Window.GetByName(chatWindowName)
	d.dismissConfigModal(app, chat)
	if chat != nil {
		chat.Show()
		chat.Focus()
	}
	return nil
}

func (d *Service) hookChatWindow(app *application.App, window application.Window) {
	if window == nil {
		return
	}
	TuneNativeWebView(window)
	wid := window.ID()
	if d.chatHookedID == wid {
		return
	}
	d.chatHookedID = wid

	onResizeOrMove := func(event *application.WindowEvent) {
		if !d.prefs.getRememberWindowSize() {
			return
		}
		d.recordChatWindowState(window)
	}
	window.RegisterHook(events.Common.WindowDidResize, onResizeOrMove)
	window.RegisterHook(events.Common.WindowDidMove, onResizeOrMove)
	window.RegisterHook(events.Common.WindowMaximise, onResizeOrMove)
	window.RegisterHook(events.Common.WindowUnMaximise, onResizeOrMove)
	window.RegisterHook(events.Common.WindowRestore, onResizeOrMove)

	onClosing := func(event *application.WindowEvent) {
		d.flushPendingWindowState()
		d.flushPendingLastSession()
		if d.allowQuit.Load() {
			d.configDirty = false
			d.chatHookedID = 0
			if config, ok := app.Window.GetByName(configWindowName); ok {
				config.Close()
			}
			if setup, ok := app.Window.GetByName(setupWindowName); ok {
				setup.Close()
			}
			return
		}
		// Always cancel the native close; either hide-to-tray or confirm quit.
		event.Cancel()
		if d.prefs.closeToTray.Load() {
			// Hide before ensuring tray so "last window" logic sees a hidden window.
			d.hideToTray(app, window)
			d.ensureTray()
			return
		}
		_ = d.RequestQuit()
	}
	// Bind Common + platform-native close signals so Cancel cannot race the
	// mapped async listener (same pattern on macOS / Windows / Linux).
	window.RegisterHook(events.Common.WindowClosing, onClosing)
	switch runtime.GOOS {
	case "darwin":
		window.RegisterHook(events.Mac.WindowShouldClose, onClosing)
	case "windows":
		window.RegisterHook(events.Windows.WindowClosing, onClosing)
	case "linux":
		window.RegisterHook(events.Linux.WindowDeleteEvent, onClosing)
	}
}

func (d *Service) recordChatWindowState(window application.Window) {
	if window == nil {
		return
	}
	d.windowStateMu.Lock()
	defer d.windowStateMu.Unlock()

	if window.IsMinimised() || window.IsFullscreen() {
		return
	}

	screen, _ := window.GetScreen()
	var dispID, dispName string
	if screen != nil {
		dispID = screen.ID
		dispName = screen.Name
	}

	if window.IsMaximised() {
		if d.cachedWindowState == nil {
			d.cachedWindowState = &desktopstate.WindowState{
				Width:  DefaultChatWidth,
				Height: DefaultChatHeight,
			}
		}
		d.cachedWindowState.Maximised = true
		if dispID != "" {
			d.cachedWindowState.DisplayID = dispID
			d.cachedWindowState.DisplayName = dispName
		}
	} else {
		w, h := window.Size()
		if w < MinChatWidth {
			w = MinChatWidth
		}
		if h < MinChatHeight {
			h = MinChatHeight
		}
		rx, ry := window.RelativePosition()
		d.cachedWindowState = &desktopstate.WindowState{
			Width:       w,
			Height:      h,
			X:           rx,
			Y:           ry,
			Maximised:   false,
			DisplayID:   dispID,
			DisplayName: dispName,
		}
	}

	if d.windowStateTimer != nil {
		d.windowStateTimer.Stop()
	}
	stateToSave := *d.cachedWindowState
	d.windowStateTimer = time.AfterFunc(500*time.Millisecond, func() {
		_ = desktopstate.SaveWindowState(stateToSave)
	})
}

func (d *Service) flushPendingWindowState() {
	d.windowStateMu.Lock()
	if d.windowStateTimer != nil {
		d.windowStateTimer.Stop()
		d.windowStateTimer = nil
	}
	state := d.cachedWindowState
	d.windowStateMu.Unlock()
	if state != nil {
		_ = desktopstate.SaveWindowState(*state)
	}
}

func (d *Service) ReportCurrentSession(sessionID string) {
	sessionID = strings.TrimSpace(sessionID)
	if !d.prefs.getRestoreLastSession() {
		return
	}
	if sessionID != "" && !desktopstate.ValidateSessionID(sessionID) {
		return
	}
	d.lastSessionMu.Lock()
	if d.cachedLastSessionID == sessionID {
		d.lastSessionMu.Unlock()
		return
	}
	d.cachedLastSessionID = sessionID
	if d.lastSessionTimer != nil {
		d.lastSessionTimer.Stop()
		d.lastSessionTimer = nil
	}
	d.lastSessionMu.Unlock()

	_ = desktopstate.SaveLastSessionID(sessionID)
}

func (d *Service) flushPendingLastSession() {
	d.lastSessionMu.Lock()
	if d.lastSessionTimer != nil {
		d.lastSessionTimer.Stop()
		d.lastSessionTimer = nil
	}
	id := d.cachedLastSessionID
	d.lastSessionMu.Unlock()
	_ = desktopstate.SaveLastSessionID(id)
}

func (d *Service) OpenHome(o dsh.Options) error {
	o, err := dsh.NormalizeLocationOptions(o)
	if err != nil {
		return err
	}
	if err := requireDirectory(o.Home, "DSH Home"); err != nil {
		return err
	}
	return d.openLocalPath(o.Home)
}

func (d *Service) OpenWorkspace(o dsh.Options) error {
	o, err := dsh.NormalizeLocationOptions(o)
	if err != nil {
		return err
	}
	if err := requireDirectory(o.Workspace, i18n.TActive("label.workspace")); err != nil {
		return err
	}
	return d.openLocalPath(o.Workspace)
}

func (d *Service) OpenSettings(o dsh.Options) error {
	o, err := dsh.NormalizeLocationOptions(o)
	if err != nil {
		return err
	}
	path := filepath.Join(o.Home, "settings.yaml")
	if err := requireFile(path, "settings.yaml"); err != nil {
		return err
	}
	return d.openLocalPath(path)
}

// openLocalPath uses a single literal argument for both files and directories.
// Wails OpenFileManager expands environment variables on all platforms and its
// Linux desktop-entry parser splits space-containing paths into separate arguments.
func (d *Service) openLocalPath(path string) error {
	if d.nativeOpenPath != nil {
		return d.nativeOpenPath(path)
	}
	app, err := desktopApp()
	if err != nil {
		return err
	}
	return app.Browser.OpenFile(path)
}

func desktopApp() (*application.App, error) {
	app := application.Get()
	if app == nil {
		return nil, i18n.ErrorfActive("err.app_not_ready")
	}
	return app, nil
}

func requireDirectory(path, label string) error {
	info, err := os.Stat(path)
	if err != nil {
		return fmt.Errorf("%s", i18n.TActive("err.path_missing", label, err.Error()))
	}
	if !info.IsDir() {
		return fmt.Errorf("%s", i18n.TActive("err.not_directory", label, path))
	}
	return nil
}

func requireFile(path, label string) error {
	info, err := os.Stat(path)
	if err != nil {
		return fmt.Errorf("%s", i18n.TActive("err.file_not_found", label, path))
	}
	if info.IsDir() {
		return fmt.Errorf("%s", i18n.TActive("err.is_directory_not_file", label, path))
	}
	return nil
}
