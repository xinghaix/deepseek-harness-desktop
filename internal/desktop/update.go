//go:build wails

package desktop

import (
	"context"
	"time"

	"deepseek-harness-desktop/internal/i18n"
	"deepseek-harness-desktop/internal/update"
	"deepseek-harness-desktop/internal/version"

	"github.com/wailsapp/wails/v3/pkg/application"
)

func (s *Service) AppVersion() string {
	return version.Version
}

func (s *Service) UpdateStatus() update.Snapshot {
	return s.updater.Snapshot()
}

func (s *Service) CheckUpdate() (update.Snapshot, error) {
	s.updater.KickCheck()
	return s.updater.Snapshot(), nil
}

func (s *Service) SetAutoCheckUpdate(enabled bool) (update.Snapshot, error) {
	if err := s.updater.SetAutoCheck(enabled); err != nil {
		return s.updater.Snapshot(), err
	}
	return s.updater.Snapshot(), nil
}

func (s *Service) Close() error {
	if s.stopAuto != nil {
		s.stopAuto()
	}
	return s.Manager.Close()
}

func (s *Service) OpenReleasePage() error {
	url := s.updater.Snapshot().ReleaseURL
	if url == "" {
		url = "https://github.com/" + update.DefaultRepo + "/releases"
	}
	app, err := desktopApp()
	if err != nil {
		return err
	}
	return app.Browser.OpenURL(url)
}

func (s *Service) InstallUpdate() error {
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Minute)
	defer cancel()
	if err := s.updater.Prepare(ctx); err != nil {
		return err
	}
	s.allowQuit.Store(true)
	_ = s.Close()
	if err := s.updater.ApplyAndRelaunch(); err != nil {
		return err
	}
	app := application.Get()
	if app == nil {
		return i18n.ErrorfActive("err.app_not_ready")
	}
	app.Quit()
	return nil
}
