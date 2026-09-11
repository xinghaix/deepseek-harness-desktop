//go:build wails

package desktop

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"
	"time"

	"deepseek-harness-desktop/internal/dsh"
	"deepseek-harness-desktop/internal/i18n"
	"deepseek-harness-desktop/internal/update"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

type Service struct {
	*dsh.Manager
	windowMu       sync.Mutex
	updater        *update.Updater
	stopAuto       context.CancelFunc
	prefs          desktopPrefs
	configHooked   bool
	chatHooked     bool
	openedChatURL  string
	configDirty    bool
	configIsModal  bool
	allowQuit      atomic.Bool
	quitPromptOpen   atomic.Bool
	quitProbeSettled atomic.Bool
	chatBusy         atomic.Bool
	chatBusyKnown    atomic.Bool
}

func New() *Service {
	ctx, cancel := context.WithCancel(context.Background())
	s := &Service{Manager: dsh.New(), updater: update.New(), stopAuto: cancel}
	s.prefs.load()
	i18n.SetActive(i18n.Resolve(s.prefs.getLanguage(), i18n.SystemTag()))
	s.SetBridgeHost(bridgeHostAdapter{service: s})
	go s.updater.RunPeriodic(ctx)
	return s
}

func (d *Service) ReportChatBusy(busy bool) {
	d.chatBusy.Store(busy)
	d.chatBusyKnown.Store(true)
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
	return app.Dialog.OpenFile().
		CanChooseFiles(true).
		CanChooseDirectories(false).
		SetTitle(i18n.T(locale, "dialog.choose_executable_title")).
		SetMessage(i18n.T(locale, "dialog.choose_executable_message")).
		PromptForSingleSelection()
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
	return app.Dialog.OpenFile().
		CanChooseDirectories(true).
		CanChooseFiles(false).
		SetTitle(title).
		SetMessage(message).
		PromptForSingleSelection()
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
	chatURL, err := d.BrowserURL()
	if err != nil {
		return err
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
		chat = app.Window.NewWithOptions(ChatWindowOptions(chatURL))
		d.hookChatWindow(app, chat)
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
	d.dismissConfigModal(app, chat)
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
	if d.configHooked || window == nil {
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
	if d.configDirty {
		if config, ok := app.Window.GetByName(configWindowName); ok {
			config.Focus()
		}
		return nil
	}
	chat, _ := app.Window.GetByName(chatWindowName)
	d.dismissConfigModal(app, chat)
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
	if d.chatHooked || window == nil {
		return
	}
	d.chatHooked = true
	window.RegisterHook(events.Common.WindowClosing, func(event *application.WindowEvent) {
		if d.allowQuit.Load() {
			d.configDirty = false
			if config, ok := app.Window.GetByName(configWindowName); ok {
				config.Close()
			}
			if setup, ok := app.Window.GetByName(setupWindowName); ok {
				setup.Close()
			}
			return
		}
		event.Cancel()
		_ = d.RequestQuit()
	})
}

func sameHTTPOrigin(a, b string) bool {
	oa, ob := httpOrigin(a), httpOrigin(b)
	return oa != "" && oa == ob
}

func httpOrigin(raw string) string {
	u, err := url.Parse(raw)
	if err != nil || u.Host == "" {
		return ""
	}
	return u.Scheme + "://" + u.Host
}

func (d *Service) OpenHome(o dsh.Options) error {
	o, err := dsh.NormalizeLocationOptions(o)
	if err != nil {
		return err
	}
	if err := requireDirectory(o.Home, "DSH Home"); err != nil {
		return err
	}
	app, err := desktopApp()
	if err != nil {
		return err
	}
	return app.Env.OpenFileManager(o.Home, false)
}

func (d *Service) OpenWorkspace(o dsh.Options) error {
	o, err := dsh.NormalizeLocationOptions(o)
	if err != nil {
		return err
	}
	if err := requireDirectory(o.Workspace, i18n.TActive("label.workspace")); err != nil {
		return err
	}
	app, err := desktopApp()
	if err != nil {
		return err
	}
	return app.Env.OpenFileManager(o.Workspace, false)
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
