//go:build wails

package desktop

import (
	"context"
	"errors"
	"time"

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
	ctx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
	defer cancel()
	return s.updater.Check(ctx)
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
	_ = s.Close()
	if err := s.updater.ApplyAndRelaunch(); err != nil {
		return err
	}
	app := application.Get()
	if app == nil {
		return errors.New("桌面应用尚未就绪")
	}
	app.Quit()
	return nil
}
