package dsh

import (
	"strings"

	"deepseek-harness-desktop/internal/desktopstate"
)

// PersistedLaunch is the cold-start config exposed to the management WebView.
type PersistedLaunch struct {
	Present            bool    `json:"present"`
	LastStartSucceeded bool    `json:"lastStartSucceeded"`
	Options            Options `json:"options"`
}

func optionsFromState(o desktopstate.LaunchOptions) Options {
	out := Options{
		Executable: o.Executable,
		Home:       o.Home,
		DesktopDir: o.DesktopDir,
		Workspace:  o.Workspace,
		Port:       o.Port,
	}
	if out.Home != "" && out.DesktopDir == "" {
		out.DesktopDir = desktopDataDirPath(out.Home)
	}
	return out
}

func optionsToState(o Options) desktopstate.LaunchOptions {
	o.Port = 0
	if o.Home != "" {
		o.DesktopDir = desktopDataDirPath(o.Home)
	}
	return desktopstate.LaunchOptions{
		Executable: o.Executable,
		Home:       o.Home,
		DesktopDir: o.DesktopDir,
		Workspace:  o.Workspace,
		Port:       o.Port,
	}
}

func loadPersistedLaunchOptions() (lastStartSucceeded bool, options Options, ok bool, err error) {
	file, err := desktopstate.Load()
	if err != nil {
		return false, Options{}, false, err
	}
	o := optionsFromState(file.Launch.Options)
	if strings.TrimSpace(o.Executable) == "" && strings.TrimSpace(o.Home) == "" && strings.TrimSpace(o.Workspace) == "" {
		return false, Options{}, false, nil
	}
	return file.Launch.LastStartSucceeded, o, true, nil
}

func savePersistedLaunchOptions(o Options, lastStartSucceeded bool) error {
	return desktopstate.Update(func(f *desktopstate.File) {
		f.Launch.LastStartSucceeded = lastStartSucceeded
		f.Launch.Options = optionsToState(o)
	})
}

// PersistedLaunch returns the cold-start launch config from disk, if any.
func (d *Manager) PersistedLaunch() (PersistedLaunch, error) {
	succeeded, options, ok, err := loadPersistedLaunchOptions()
	if err != nil {
		return PersistedLaunch{}, err
	}
	if !ok {
		return PersistedLaunch{}, nil
	}
	return PersistedLaunch{
		Present:            true,
		LastStartSucceeded: succeeded,
		Options:            options,
	}, nil
}

// SaveLaunchOptions persists cold-start paths (also called from the management WebView).
func (d *Manager) SaveLaunchOptions(o Options, lastStartSucceeded bool) error {
	if strings.TrimSpace(o.Home) != "" || strings.TrimSpace(o.Workspace) != "" || strings.TrimSpace(o.Executable) != "" {
		normalized, err := normalizeOptions(o)
		if err == nil {
			o = normalized
		} else {
			if o.Home != "" {
				if abs, absErr := absolutePath(o.Home); absErr == nil {
					o.Home = abs
					o.DesktopDir = desktopDataDirPath(abs)
				}
			}
			if o.Workspace != "" {
				if abs, absErr := absolutePath(o.Workspace); absErr == nil {
					o.Workspace = abs
				}
			}
		}
	}
	if err := savePersistedLaunchOptions(o, lastStartSucceeded); err != nil {
		return err
	}
	d.mu.Lock()
	defer d.mu.Unlock()
	if d.cmd == nil {
		d.options, d.launchOptions = o, o
	} else {
		d.launchOptions = o
	}
	return nil
}

func applyPersistedToDefaults(defaults Options) Options {
	_, o, ok, err := loadPersistedLaunchOptions()
	if err != nil || !ok {
		return defaults
	}
	if strings.TrimSpace(o.Executable) != "" {
		defaults.Executable = o.Executable
	}
	if strings.TrimSpace(o.Home) != "" {
		defaults.Home = o.Home
		defaults.DesktopDir = desktopDataDirPath(o.Home)
	}
	if strings.TrimSpace(o.Workspace) != "" {
		defaults.Workspace = o.Workspace
	}
	return defaults
}
