package desktop

import "strings"

// Shortcut preference keys (desktop-state.json prefs.shortcuts).
const (
	ShortcutOpenSettings = "openSettings"
	ShortcutCloseChat    = "closeChat"
	ShortcutQuit         = "quit"
	ShortcutHide         = "hide"
	ShortcutHideOthers   = "hideOthers"
)

// DefaultAccelerators are the built-in Wails accelerators.
func DefaultAccelerators() map[string]string {
	return map[string]string{
		ShortcutOpenSettings: "CmdOrCtrl+,",
		ShortcutCloseChat:    "CmdOrCtrl+w",
		ShortcutQuit:         "CmdOrCtrl+q",
		ShortcutHide:         "CmdOrCtrl+h",
		ShortcutHideOthers:   "CmdOrCtrl+OptionOrAlt+h",
	}
}

// KnownShortcutIDs returns shortcut keys in UI/menu order.
func KnownShortcutIDs() []string {
	return []string{
		ShortcutOpenSettings,
		ShortcutCloseChat,
		ShortcutQuit,
		ShortcutHide,
		ShortcutHideOthers,
	}
}

func isKnownShortcut(id string) bool {
	_, ok := DefaultAccelerators()[id]
	return ok
}

// NormalizeShortcutOverrides keeps only known keys.
// Semantics on disk:
//   - key absent → use default
//   - "" → cleared (no accelerator)
//   - non-empty → that accelerator string
// Values equal to the default are omitted so absent continues to mean default.
func NormalizeShortcutOverrides(raw map[string]string) map[string]string {
	if len(raw) == 0 {
		return nil
	}
	defaults := DefaultAccelerators()
	out := make(map[string]string)
	for _, id := range KnownShortcutIDs() {
		v, ok := raw[id]
		if !ok {
			continue
		}
		v = strings.TrimSpace(v)
		if v == "" {
			out[id] = ""
			continue
		}
		if v == defaults[id] {
			continue
		}
		out[id] = v
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

// EffectiveShortcuts returns a full map for UI/menu: missing keys filled with
// defaults; cleared keys present as "".
func EffectiveShortcuts(overrides map[string]string) map[string]string {
	out := DefaultAccelerators()
	for _, id := range KnownShortcutIDs() {
		if overrides == nil {
			continue
		}
		if v, ok := overrides[id]; ok {
			out[id] = v
		}
	}
	return out
}

// ResolveShortcut returns the effective accelerator for id ("" means cleared).
func ResolveShortcut(overrides map[string]string, id string) string {
	if !isKnownShortcut(id) {
		return ""
	}
	if overrides != nil {
		if v, ok := overrides[id]; ok {
			return v
		}
	}
	return DefaultAccelerators()[id]
}

// cloneShortcutMap returns a shallow copy (nil stays nil).
func cloneShortcutMap(in map[string]string) map[string]string {
	if in == nil {
		return nil
	}
	out := make(map[string]string, len(in))
	for k, v := range in {
		out[k] = v
	}
	return out
}
