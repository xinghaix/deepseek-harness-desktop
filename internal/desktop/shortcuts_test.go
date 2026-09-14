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

func TestNormalizeAccelerator(t *testing.T) {
	cases := []struct {
		in, want string
		ok       bool
	}{
		{"", "", true},
		{"CmdOrCtrl+w", "CmdOrCtrl+w", true},
		{"cmdorctrl+W", "CmdOrCtrl+w", true},
		{"CommandOrControl+OptionOrAlt+h", "CmdOrCtrl+OptionOrAlt+h", true},
		{"CmdOrCtrl+Shift+,", "CmdOrCtrl+Shift+,", true},
		{"CmdOrCtrl+F12", "CmdOrCtrl+F12", true},
		{"CmdOrCtrl", "", false},
		{"Shift+", "", false},
		{"CmdOrCtrl+NotAKey", "", false},
		{"Ctrl+q", "Control+q", true},
		{"Control+q", "Control+q", true},
	}
	for _, tc := range cases {
		got, err := NormalizeAccelerator(tc.in)
		if tc.ok {
			if err != nil {
				t.Fatalf("%q: unexpected err %v", tc.in, err)
			}
			if got != tc.want {
				t.Fatalf("%q: got %q want %q", tc.in, got, tc.want)
			}
		} else if err == nil {
			t.Fatalf("%q: expected error, got %q", tc.in, got)
		}
	}
}

func TestValidateShortcutOverridesRejectsInvalid(t *testing.T) {
	_, err := ValidateShortcutOverrides(map[string]string{
		ShortcutQuit: "CmdOrCtrl+NotReal",
	})
	if err == nil {
		t.Fatal("expected invalid accelerator error")
	}
	got, err := ValidateShortcutOverrides(map[string]string{
		ShortcutQuit:      "cmdorctrl+E",
		ShortcutCloseChat: "",
	})
	if err != nil {
		t.Fatal(err)
	}
	if got[ShortcutQuit] != "CmdOrCtrl+e" {
		t.Fatalf("quit = %q", got[ShortcutQuit])
	}
	if got[ShortcutCloseChat] != "" {
		t.Fatalf("closeChat = %q", got[ShortcutCloseChat])
	}
}

func TestNormalizeShortcutOverridesDropsInvalidLenient(t *testing.T) {
	got := NormalizeShortcutOverrides(map[string]string{
		ShortcutQuit:      "CmdOrCtrl+Nope",
		ShortcutCloseChat: "",
	})
	if _, ok := got[ShortcutQuit]; ok {
		t.Fatalf("invalid quit should be dropped: %+v", got)
	}
	if got[ShortcutCloseChat] != "" {
		t.Fatalf("cleared closeChat missing: %+v", got)
	}
}
