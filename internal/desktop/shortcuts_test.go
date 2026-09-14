package desktop

import "testing"

func TestNormalizeShortcutOverridesSemantics(t *testing.T) {
	if NormalizeShortcutOverrides(nil) != nil {
		t.Fatal("nil overrides should stay nil")
	}
	got := NormalizeShortcutOverrides(map[string]string{
		ShortcutCloseChat: "",
		ShortcutQuit:      "CmdOrCtrl+q", // default → omit
		"unknown":         "x",
		ShortcutHide:      " CmdOrCtrl+h ", // default after trim → omit
	})
	if got == nil || got[ShortcutCloseChat] != "" {
		t.Fatalf("cleared closeChat missing: %+v", got)
	}
	if _, ok := got[ShortcutQuit]; ok {
		t.Fatalf("default quit must be omitted: %+v", got)
	}
	if _, ok := got[ShortcutHide]; ok {
		t.Fatalf("default hide must be omitted: %+v", got)
	}
	if _, ok := got["unknown"]; ok {
		t.Fatalf("unknown key must be dropped: %+v", got)
	}
}

func TestEffectiveAndResolveShortcuts(t *testing.T) {
	eff := EffectiveShortcuts(map[string]string{ShortcutQuit: ""})
	if eff[ShortcutQuit] != "" {
		t.Fatalf("quit = %q, want cleared", eff[ShortcutQuit])
	}
	if eff[ShortcutCloseChat] != "CmdOrCtrl+w" {
		t.Fatalf("closeChat = %q", eff[ShortcutCloseChat])
	}
	if ResolveShortcut(map[string]string{ShortcutOpenSettings: ""}, ShortcutOpenSettings) != "" {
		t.Fatal("ResolveShortcut cleared openSettings")
	}
	if ResolveShortcut(nil, ShortcutOpenSettings) != "CmdOrCtrl+," {
		t.Fatal("ResolveShortcut default openSettings")
	}
}
