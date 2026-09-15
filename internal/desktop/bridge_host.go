//go:build wails

package desktop

import (
	"deepseek-harness-desktop/internal/dsh"
	"deepseek-harness-desktop/internal/i18n"
	"deepseek-harness-desktop/internal/update"
)

// bridgeHostAdapter exposes desktop capabilities to the loopback bridge without
// colliding with Wails-bound Service method signatures.
type bridgeHostAdapter struct {
	service *Service
}

var _ dsh.BridgeHost = bridgeHostAdapter{}

func (a bridgeHostAdapter) OpenManagement() error {
	return a.service.OpenManagement()
}

func (a bridgeHostAdapter) OpenChat() error {
	return a.service.OpenChat()
}

func (a bridgeHostAdapter) PresentRecoverySettings() error {
	return a.service.PresentRecoverySettings()
}

func (a bridgeHostAdapter) ReloadChat(o dsh.Options) error {
	return a.service.ReloadChat(o)
}

func (a bridgeHostAdapter) ChooseExecutable() (string, error) {
	return a.service.ChooseExecutable()
}

func (a bridgeHostAdapter) ChooseHome() (string, error) {
	return a.service.ChooseHome()
}

func (a bridgeHostAdapter) ChooseWorkspace() (string, error) {
	return a.service.ChooseWorkspace()
}

func (a bridgeHostAdapter) OpenHome(o dsh.Options) error {
	return a.service.OpenHome(o)
}

func (a bridgeHostAdapter) OpenWorkspace(o dsh.Options) error {
	return a.service.OpenWorkspace(o)
}

func (a bridgeHostAdapter) OpenSettings(o dsh.Options) error {
	return a.service.OpenSettings(o)
}

func (a bridgeHostAdapter) BridgePrefs() dsh.BridgePrefs {
	prefs := a.service.DesktopPrefs()
	supported := make([]dsh.BridgeLocaleOption, 0, len(i18n.Supported()))
	for _, code := range i18n.Supported() {
		supported = append(supported, dsh.BridgeLocaleOption{Code: code, NativeName: i18n.NativeName(code)})
	}
	return dsh.BridgePrefs{
		ConfirmQuitWhenBusy: prefs.ConfirmQuitWhenBusy,
		TrayEnabled:         prefs.TrayEnabled,
		CloseToTray:         prefs.CloseToTray,
		TraySessionLimit:    prefs.TraySessionLimit,
		ShowCopySessionId:   prefs.ShowCopySessionId,
		Language:            prefs.Language,
		ResolvedLocale:      prefs.ResolvedLocale,
		SystemLocale:        prefs.SystemLocale,
		Source:              prefs.Source,
		Supported:           supported,
		Shortcuts:           prefs.Shortcuts,
	}
}

func (a bridgeHostAdapter) SetLanguage(code string) (dsh.BridgePrefs, error) {
	if _, err := a.service.SetLanguage(code); err != nil {
		return a.BridgePrefs(), err
	}
	return a.BridgePrefs(), nil
}

func (a bridgeHostAdapter) SetConfirmQuitWhenBusy(enabled bool) (dsh.BridgePrefs, error) {
	if _, err := a.service.SetConfirmQuitWhenBusy(enabled); err != nil {
		return a.BridgePrefs(), err
	}
	return a.BridgePrefs(), nil
}

func (a bridgeHostAdapter) SetTrayEnabled(enabled bool) (dsh.BridgePrefs, error) {
	if _, err := a.service.SetTrayEnabled(enabled); err != nil {
		return dsh.BridgePrefs{}, err
	}
	return a.BridgePrefs(), nil
}

func (a bridgeHostAdapter) SetCloseToTray(enabled bool) (dsh.BridgePrefs, error) {
	if _, err := a.service.SetCloseToTray(enabled); err != nil {
		return a.BridgePrefs(), err
	}
	return a.BridgePrefs(), nil
}

func (a bridgeHostAdapter) SetTraySessionLimit(n int) (dsh.BridgePrefs, error) {
	if _, err := a.service.SetTraySessionLimit(n); err != nil {
		return a.BridgePrefs(), err
	}
	return a.BridgePrefs(), nil
}

func (a bridgeHostAdapter) SetShowCopySessionId(enabled bool) (dsh.BridgePrefs, error) {
	if _, err := a.service.SetShowCopySessionId(enabled); err != nil {
		return a.BridgePrefs(), err
	}
	return a.BridgePrefs(), nil
}

func (a bridgeHostAdapter) SetShortcuts(shortcuts map[string]string) (dsh.BridgePrefs, error) {
	if _, err := a.service.SetShortcuts(shortcuts); err != nil {
		return a.BridgePrefs(), err
	}
	return a.BridgePrefs(), nil
}

func (a bridgeHostAdapter) ReportSessions(sessions []dsh.BridgeSession) {
	a.service.ReportSessions(sessions)
}

func (a bridgeHostAdapter) ClaimOpenSession() string {
	return a.service.claimOpenSession()
}

func snapshotToBridge(s update.Snapshot) dsh.BridgeUpdate {
	return dsh.BridgeUpdate{
		State:          s.State,
		CurrentVersion: s.CurrentVersion,
		LatestVersion:  s.LatestVersion,
		Notes:          s.Notes,
		ReleaseURL:     s.ReleaseURL,
		AssetName:      s.AssetName,
		BytesTotal:     s.BytesTotal,
		BytesDone:      s.BytesDone,
		Progress:       s.Progress,
		Error:          s.Error,
		AutoCheck:      s.AutoCheck,
	}
}

func (a bridgeHostAdapter) BridgeUpdateStatus() dsh.BridgeUpdate {
	return snapshotToBridge(a.service.UpdateStatus())
}

func (a bridgeHostAdapter) CheckUpdate() (dsh.BridgeUpdate, error) {
	snap, err := a.service.CheckUpdate()
	return snapshotToBridge(snap), err
}

func (a bridgeHostAdapter) InstallUpdate() error {
	return a.service.InstallUpdate()
}

func (a bridgeHostAdapter) OpenReleasePage() error {
	return a.service.OpenReleasePage()
}

func (a bridgeHostAdapter) SetAutoCheckUpdate(enabled bool) (dsh.BridgeUpdate, error) {
	snap, err := a.service.SetAutoCheckUpdate(enabled)
	return snapshotToBridge(snap), err
}

func (a bridgeHostAdapter) AppVersion() string {
	return a.service.AppVersion()
}

func (a bridgeHostAdapter) ReportChatBusy(busy bool) {
	a.service.ReportChatBusy(busy)
}
