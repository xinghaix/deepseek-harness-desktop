//go:build wails

package desktop

import (
	"context"
	"errors"

	"deepseek-harness-desktop/internal/dsh"
	"deepseek-harness-desktop/internal/update"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// WailsFacade is the narrow binding surface exposed to Wails renderers. Every
// bound method receives the originating WebView context. Management methods are
// accepted only from the management/config windows; Chat receives only the
// small chrome actions that cannot be routed through the authenticated bridge.
type WailsFacade struct{ service *Service }

func NewWailsFacade(service *Service) *WailsFacade { return &WailsFacade{service: service} }

func (f *WailsFacade) allow(ctx context.Context, operation string, windows ...string) error {
	window, ok := ctx.Value(application.WindowKey).(application.Window)
	if !ok || window == nil {
		return errors.New("desktop binding rejected: missing renderer window")
	}
	for _, name := range windows {
		if window.Name() == name {
			return nil
		}
	}
	return errors.New("desktop binding rejected: operation " + operation + " is not allowed from " + window.Name())
}

func (f *WailsFacade) management(ctx context.Context, operation string) error {
	return f.allow(ctx, operation, setupWindowName, configWindowName)
}

func (f *WailsFacade) Defaults(ctx context.Context) (dsh.Options, error) {
	if err := f.management(ctx, "Defaults"); err != nil {
		return dsh.Options{}, err
	}
	return f.service.Defaults()
}
func (f *WailsFacade) PersistedLaunch(ctx context.Context) (dsh.PersistedLaunch, error) {
	if err := f.management(ctx, "PersistedLaunch"); err != nil {
		return dsh.PersistedLaunch{}, err
	}
	return f.service.PersistedLaunch()
}
func (f *WailsFacade) SaveLaunchOptions(ctx context.Context, o dsh.Options, ok bool) error {
	if err := f.management(ctx, "SaveLaunchOptions"); err != nil {
		return err
	}
	return f.service.SaveLaunchOptions(o, ok)
}
func (f *WailsFacade) DiscoverCLI(ctx context.Context) (dsh.DiscoveryResult, error) {
	if err := f.management(ctx, "DiscoverCLI"); err != nil {
		return dsh.DiscoveryResult{}, err
	}
	return f.service.DiscoverCLI()
}
func (f *WailsFacade) CheckCLI(ctx context.Context, o dsh.Options) (dsh.CheckResult, error) {
	if err := f.management(ctx, "CheckCLI"); err != nil {
		return dsh.CheckResult{}, err
	}
	return f.service.CheckCLI(o)
}
func (f *WailsFacade) InstallGuide(ctx context.Context) dsh.InstallGuide {
	if f.management(ctx, "InstallGuide") != nil {
		return dsh.InstallGuide{}
	}
	return f.service.InstallGuide()
}
func (f *WailsFacade) Status(ctx context.Context) dsh.Status {
	if f.management(ctx, "Status") != nil {
		return dsh.Status{}
	}
	return f.service.Status()
}
func (f *WailsFacade) Start(ctx context.Context, o dsh.Options) error {
	if err := f.management(ctx, "Start"); err != nil {
		return err
	}
	return f.service.Start(o)
}
func (f *WailsFacade) Stop(ctx context.Context) error {
	if err := f.management(ctx, "Stop"); err != nil {
		return err
	}
	return f.service.Stop()
}
func (f *WailsFacade) OpenDSH(ctx context.Context) error {
	if err := f.management(ctx, "OpenDSH"); err != nil {
		return err
	}
	return f.service.OpenDSH()
}
func (f *WailsFacade) OpenChat(ctx context.Context) error {
	if err := f.management(ctx, "OpenChat"); err != nil {
		return err
	}
	return f.service.OpenChat()
}
func (f *WailsFacade) OpenManagement(ctx context.Context) error {
	if err := f.allow(ctx, "OpenManagement", setupWindowName, configWindowName, chatWindowName); err != nil {
		return err
	}
	return f.service.OpenManagement()
}
func (f *WailsFacade) ToggleChatZoom(ctx context.Context) {
	if f.allow(ctx, "ToggleChatZoom", chatWindowName) == nil {
		f.service.ToggleChatZoom()
	}
}
func (f *WailsFacade) ReloadChat(ctx context.Context, o dsh.Options) error {
	if err := f.management(ctx, "ReloadChat"); err != nil {
		return err
	}
	return f.service.ReloadChat(o)
}
func (f *WailsFacade) ChooseExecutable(ctx context.Context) (string, error) {
	if err := f.management(ctx, "ChooseExecutable"); err != nil {
		return "", err
	}
	return f.service.ChooseExecutable()
}
func (f *WailsFacade) ChooseHome(ctx context.Context) (string, error) {
	if err := f.management(ctx, "ChooseHome"); err != nil {
		return "", err
	}
	return f.service.ChooseHome()
}
func (f *WailsFacade) ChooseWorkspace(ctx context.Context) (string, error) {
	if err := f.management(ctx, "ChooseWorkspace"); err != nil {
		return "", err
	}
	return f.service.ChooseWorkspace()
}
func (f *WailsFacade) OpenHome(ctx context.Context, o dsh.Options) error {
	if err := f.management(ctx, "OpenHome"); err != nil {
		return err
	}
	return f.service.OpenHome(o)
}
func (f *WailsFacade) OpenWorkspace(ctx context.Context, o dsh.Options) error {
	if err := f.management(ctx, "OpenWorkspace"); err != nil {
		return err
	}
	return f.service.OpenWorkspace(o)
}
func (f *WailsFacade) OpenSettings(ctx context.Context, o dsh.Options) error {
	if err := f.management(ctx, "OpenSettings"); err != nil {
		return err
	}
	return f.service.OpenSettings(o)
}
func (f *WailsFacade) SetConfigDirty(ctx context.Context, dirty bool) {
	if f.management(ctx, "SetConfigDirty") == nil {
		f.service.SetConfigDirty(dirty)
	}
}
func (f *WailsFacade) TryDismissConfig(ctx context.Context) error {
	if err := f.allow(ctx, "TryDismissConfig", setupWindowName, configWindowName, chatWindowName); err != nil {
		return err
	}
	return f.service.TryDismissConfig()
}
func (f *WailsFacade) DismissConfig(ctx context.Context) error {
	if err := f.allow(ctx, "DismissConfig", setupWindowName, configWindowName); err != nil {
		return err
	}
	return f.service.DismissConfig()
}
func (f *WailsFacade) DesktopPrefs(ctx context.Context) DesktopPrefs {
	if f.management(ctx, "DesktopPrefs") != nil {
		return DesktopPrefs{}
	}
	return f.service.DesktopPrefs()
}
func (f *WailsFacade) SetLanguage(ctx context.Context, code string) (LocaleBundle, error) {
	if err := f.management(ctx, "SetLanguage"); err != nil {
		return LocaleBundle{}, err
	}
	return f.service.SetLanguage(code)
}
func (f *WailsFacade) SetShortcuts(ctx context.Context, shortcuts map[string]string) (DesktopPrefs, error) {
	if err := f.management(ctx, "SetShortcuts"); err != nil {
		return DesktopPrefs{}, err
	}
	return f.service.SetShortcuts(shortcuts)
}
func (f *WailsFacade) SetConfirmQuitWhenBusy(ctx context.Context, enabled bool) (DesktopPrefs, error) {
	if err := f.management(ctx, "SetConfirmQuitWhenBusy"); err != nil {
		return DesktopPrefs{}, err
	}
	return f.service.SetConfirmQuitWhenBusy(enabled)
}
func (f *WailsFacade) SetTrayEnabled(ctx context.Context, enabled bool) (DesktopPrefs, error) {
	if err := f.management(ctx, "SetTrayEnabled"); err != nil {
		return DesktopPrefs{}, err
	}
	return f.service.SetTrayEnabled(enabled)
}
func (f *WailsFacade) SetCloseToTray(ctx context.Context, enabled bool) (DesktopPrefs, error) {
	if err := f.management(ctx, "SetCloseToTray"); err != nil {
		return DesktopPrefs{}, err
	}
	return f.service.SetCloseToTray(enabled)
}
func (f *WailsFacade) SetTraySessionLimit(ctx context.Context, limit int) (DesktopPrefs, error) {
	if err := f.management(ctx, "SetTraySessionLimit"); err != nil {
		return DesktopPrefs{}, err
	}
	return f.service.SetTraySessionLimit(limit)
}
func (f *WailsFacade) SetShowCopySessionId(ctx context.Context, enabled bool) (DesktopPrefs, error) {
	if err := f.management(ctx, "SetShowCopySessionId"); err != nil {
		return DesktopPrefs{}, err
	}
	return f.service.SetShowCopySessionId(enabled)
}
func (f *WailsFacade) SetChatContentVisibility(ctx context.Context, enabled bool) (DesktopPrefs, error) {
	if err := f.management(ctx, "SetChatContentVisibility"); err != nil {
		return DesktopPrefs{}, err
	}
	return f.service.SetChatContentVisibility(enabled)
}
func (f *WailsFacade) LocaleBundle(ctx context.Context) LocaleBundle {
	if f.management(ctx, "LocaleBundle") != nil {
		return LocaleBundle{}
	}
	return f.service.LocaleBundle()
}
func (f *WailsFacade) UpdateStatus(ctx context.Context) update.Snapshot {
	if f.management(ctx, "UpdateStatus") != nil {
		return update.Snapshot{}
	}
	return f.service.UpdateStatus()
}
func (f *WailsFacade) CheckUpdate(ctx context.Context) (update.Snapshot, error) {
	if err := f.management(ctx, "CheckUpdate"); err != nil {
		return update.Snapshot{}, err
	}
	return f.service.CheckUpdate()
}
func (f *WailsFacade) InstallUpdate(ctx context.Context) error {
	if err := f.management(ctx, "InstallUpdate"); err != nil {
		return err
	}
	return f.service.InstallUpdate()
}
func (f *WailsFacade) OpenReleasePage(ctx context.Context) error {
	if err := f.management(ctx, "OpenReleasePage"); err != nil {
		return err
	}
	return f.service.OpenReleasePage()
}
func (f *WailsFacade) SetAutoCheckUpdate(ctx context.Context, enabled bool) (update.Snapshot, error) {
	if err := f.management(ctx, "SetAutoCheckUpdate"); err != nil {
		return update.Snapshot{}, err
	}
	return f.service.SetAutoCheckUpdate(enabled)
}
func (f *WailsFacade) AppVersion(ctx context.Context) string {
	if f.management(ctx, "AppVersion") != nil {
		return ""
	}
	return f.service.AppVersion()
}
