package desktop

import (
	"fmt"
	"strings"
	"unicode"
)

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

// namedAcceleratorKeys are Wails-style key tokens beyond single characters.
var namedAcceleratorKeys = map[string]string{
	"space":     "Space",
	"tab":       "Tab",
	"return":    "Return",
	"enter":     "Return",
	"backspace": "Backspace",
	"delete":    "Delete",
	"escape":    "Escape",
	"esc":       "Escape",
	"up":        "Up",
	"down":      "Down",
	"left":      "Left",
	"right":     "Right",
	"home":      "Home",
	"end":       "End",
	"pageup":    "PageUp",
	"pagedown":  "PageDown",
	"insert":    "Insert",
	"plus":      "Plus",
}

func init() {
	for i := 1; i <= 24; i++ {
		name := fmt.Sprintf("F%d", i)
		namedAcceleratorKeys[strings.ToLower(name)] = name
	}
}

// NormalizeAccelerator validates and canonicalizes a Wails accelerator string.
// Empty string means cleared and is valid. Invalid tokens return an error.
func NormalizeAccelerator(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", nil
	}
	parts := strings.Split(raw, "+")
	if len(parts) == 0 {
		return "", fmt.Errorf("invalid accelerator")
	}
	var hasCmdOrCtrl, hasControl, hasOption, hasShift bool
	var key string
	for i, part := range parts {
		part = strings.TrimSpace(part)
		if part == "" {
			return "", fmt.Errorf("empty accelerator token")
		}
		lower := strings.ToLower(part)
		isLast := i == len(parts)-1
		switch lower {
		case "cmdorctrl", "commandorcontrol":
			hasCmdOrCtrl = true
			continue
		case "command", "cmd":
			// Treat bare Command as CmdOrCtrl for cross-platform prefs.
			hasCmdOrCtrl = true
			continue
		case "control", "ctrl":
			hasControl = true
			continue
		case "optionoralt", "option", "alt":
			hasOption = true
			continue
		case "shift":
			hasShift = true
			continue
		}
		if !isLast {
			return "", fmt.Errorf("unknown modifier %q", part)
		}
		if named, ok := namedAcceleratorKeys[lower]; ok {
			key = named
			continue
		}
		if len(part) == 1 {
			r := []rune(part)[0]
			if unicode.IsLetter(r) {
				key = strings.ToLower(part)
				continue
			}
			if unicode.IsDigit(r) || strings.ContainsRune("`-=[]\\;',./", r) {
				key = part
				continue
			}
		}
		// Digits may arrive as multi-rune already trimmed single digit above.
		return "", fmt.Errorf("unknown key %q", part)
	}
	if key == "" {
		return "", fmt.Errorf("modifier-only accelerator")
	}
	var out []string
	if hasCmdOrCtrl {
		out = append(out, "CmdOrCtrl")
	}
	if hasControl && !hasCmdOrCtrl {
		// Control without CmdOrCtrl (e.g. Mac Ctrl-only remaps).
		out = append(out, "Control")
	} else if hasControl && hasCmdOrCtrl {
		// Both is unusual; keep Control after CmdOrCtrl.
		out = append(out, "Control")
	}
	if hasOption {
		out = append(out, "OptionOrAlt")
	}
	if hasShift {
		out = append(out, "Shift")
	}
	out = append(out, key)
	return strings.Join(out, "+"), nil
}

// NormalizeShortcutOverrides keeps only known keys.
// Semantics on disk:
//   - key absent → use default
//   - "" → cleared (no accelerator)
//   - non-empty → that accelerator string
// Values equal to the default are omitted so absent continues to mean default.
// Invalid non-empty accelerators are dropped (lenient load path).
func NormalizeShortcutOverrides(raw map[string]string) map[string]string {
	out, _ := normalizeShortcutOverrides(raw, false)
	return out
}

// ValidateShortcutOverrides is like NormalizeShortcutOverrides but returns an
// error if any known-id value is a non-empty invalid accelerator.
func ValidateShortcutOverrides(raw map[string]string) (map[string]string, error) {
	return normalizeShortcutOverrides(raw, true)
}

func normalizeShortcutOverrides(raw map[string]string, strict bool) (map[string]string, error) {
	if len(raw) == 0 {
		return nil, nil
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
		norm, err := NormalizeAccelerator(v)
		if err != nil {
			if strict {
				return nil, fmt.Errorf("shortcut %s: %w", id, err)
			}
			continue
		}
		if norm == defaults[id] {
			continue
		}
		out[id] = norm
	}
	if len(out) == 0 {
		return nil, nil
	}
	return out, nil
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
