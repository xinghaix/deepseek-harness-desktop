package desktopstate

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestMigrateAndRoundTrip(t *testing.T) {
	dir := t.TempDir()
	t.Setenv(StateDirEnv, dir)
	ResetCacheForTest()

	confirm := true
	closeToTray := true
	limit := 5
	lang := "zh-CN"
	auto := false
	mustWrite := func(name string, v any) {
		t.Helper()
		b, err := jsonMarshal(v)
		if err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(dir, name), b, 0o600); err != nil {
			t.Fatal(err)
		}
	}
	mustWrite(legacyDesktopPrefs, map[string]any{
		"confirmQuitWhenBusy": confirm,
		"trayEnabled":         closeToTray,
		"closeToTray":         closeToTray,
		"traySessionLimit":    limit,
		"language":            lang,
	})
	mustWrite(legacyLaunchOpts, map[string]any{
		"lastStartSucceeded": true,
		"options": map[string]any{
			"executable": "/bin/dsh",
			"home":       "/tmp/home",
			"workspace":  "/tmp/ws",
			"port":       0,
		},
	})
	mustWrite(legacyUpdatePrefs, map[string]any{"autoCheck": auto})

	f, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if f.Prefs.Language == nil || *f.Prefs.Language != lang {
		t.Fatalf("prefs: %+v", f.Prefs)
	}
	if f.Launch.Options.Workspace != "/tmp/ws" || !f.Launch.LastStartSucceeded {
		t.Fatalf("launch: %+v", f.Launch)
	}
	if f.Update.AutoCheck == nil || *f.Update.AutoCheck {
		t.Fatalf("update: %+v", f.Update)
	}
	if _, err := os.Stat(filepath.Join(dir, FileName)); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{legacyDesktopPrefs, legacyLaunchOpts, legacyUpdatePrefs} {
		if _, err := os.Stat(filepath.Join(dir, name)); !os.IsNotExist(err) {
			t.Fatalf("legacy %s still present: %v", name, err)
		}
	}

	ResetCacheForTest()
	if err := Update(func(f *File) {
		ws := "/tmp/ws2"
		f.Launch.Options.Workspace = ws
	}); err != nil {
		t.Fatal(err)
	}
	ResetCacheForTest()
	again, err := Load()
	if err != nil || again.Launch.Options.Workspace != "/tmp/ws2" {
		t.Fatalf("reload: %+v err=%v", again.Launch, err)
	}
}

func jsonMarshal(v any) ([]byte, error) {
	return json.MarshalIndent(v, "", "  ")
}

func TestDirUsesDSHHome(t *testing.T) {
	t.Setenv(StateDirEnv, "")
	t.Setenv("DSH_HOME", filepath.Join(t.TempDir(), "dsh-home"))
	ResetCacheForTest()
	dir, err := Dir()
	if err != nil {
		t.Fatal(err)
	}
	want := filepath.Join(os.Getenv("DSH_HOME"), StateDirName)
	if dir != want {
		t.Fatalf("Dir()=%q want %q", dir, want)
	}
}

func TestShortcutsRoundTripClearedEmptyString(t *testing.T) {
	dir := t.TempDir()
	t.Setenv(StateDirEnv, dir)
	ResetCacheForTest()
	if err := Update(func(f *File) {
		f.Prefs.Shortcuts = map[string]string{
			"closeChat": "",
			"quit":      "CmdOrCtrl+q",
		}
	}); err != nil {
		t.Fatal(err)
	}
	ResetCacheForTest()
	f, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if f.Prefs.Shortcuts == nil {
		t.Fatal("shortcuts missing")
	}
	if v, ok := f.Prefs.Shortcuts["closeChat"]; !ok || v != "" {
		t.Fatalf("closeChat = %q ok=%v, want present empty", v, ok)
	}
	if f.Prefs.Shortcuts["quit"] != "CmdOrCtrl+q" {
		t.Fatalf("quit = %q", f.Prefs.Shortcuts["quit"])
	}
}

func TestWindowStateAndLastSessionIDPersist(t *testing.T) {
	dir := t.TempDir()
	t.Setenv(StateDirEnv, dir)
	ResetCacheForTest()

	// Initial load should be empty
	ws, err := LoadWindowState()
	if err != nil {
		t.Fatal(err)
	}
	if ws != nil {
		t.Fatalf("expected nil window state, got %+v", ws)
	}
	lastID, err := LoadLastSessionID()
	if err != nil {
		t.Fatal(err)
	}
	if lastID != "" {
		t.Fatalf("expected empty last session id, got %q", lastID)
	}

	// Save WindowState
	saveWS := WindowState{
		Width:       1400,
		Height:      900,
		X:           150,
		Y:           120,
		Maximised:   true,
		DisplayID:   "disp-1",
		DisplayName: "External 4K",
	}
	if err := SaveWindowState(saveWS); err != nil {
		t.Fatal(err)
	}

	// Save LastSessionID
	sessID := "session-uuid-12345"
	if err := SaveLastSessionID(sessID); err != nil {
		t.Fatal(err)
	}

	ResetCacheForTest()

	loadedWS, err := LoadWindowState()
	if err != nil {
		t.Fatal(err)
	}
	if loadedWS == nil || *loadedWS != saveWS {
		t.Fatalf("loaded window state = %+v, want %+v", loadedWS, saveWS)
	}

	loadedID, err := LoadLastSessionID()
	if err != nil {
		t.Fatal(err)
	}
	if loadedID != sessID {
		t.Fatalf("loaded session id = %q, want %q", loadedID, sessID)
	}
}

func TestTamperedStateFileValidation(t *testing.T) {
	dir := t.TempDir()
	t.Setenv(StateDirEnv, dir)
	ResetCacheForTest()

	// Write maliciously tampered JSON directly to desktop-state.json
	tamperedJSON := []byte(`{
  "version": 1,
  "prefs": {
    "traySessionLimit": 99999,
    "promptOverlayMaxLines": -100,
    "language": "zh-CN",
    "closeToTray": true,
    "trayEnabled": false,
    "restoreLastSession": true,
    "rememberWindowSize": true
  },
  "lastSessionId": "<script>alert('xss')</script>",
  "windowState": {
    "width": 99999999,
    "height": -500,
    "x": -9999999,
    "y": 9999999,
    "displayId": "disp-evil",
    "displayName": "LG UltraFine 4K"
  },
  "launch": {
    "options": {
      "port": 99999,
      "executable": "/bin/dsh",
      "home": "/home/dsh",
      "workspace": "/home/dsh/workspaces"
    }
  }
}`)

	if err := os.WriteFile(filepath.Join(dir, FileName), tamperedJSON, 0o600); err != nil {
		t.Fatal(err)
	}

	f, err := Load()
	if err != nil {
		t.Fatalf("Load should succeed with sanitization, got error: %v", err)
	}

	// Verify lastSessionId is sanitized to empty because of illegal characters
	if f.LastSessionID != "" {
		t.Fatalf("expected tampered lastSessionId to be rejected, got %q", f.LastSessionID)
	}

	// Verify WindowState clamping
	if f.WindowState == nil {
		t.Fatal("expected non-nil WindowState")
	}
	if f.WindowState.Width != MaxSavedChatWidth {
		t.Fatalf("expected width clamped to %d, got %d", MaxSavedChatWidth, f.WindowState.Width)
	}
	if f.WindowState.Height != 860 { // negative height resets to default
		t.Fatalf("expected height reset to 860, got %d", f.WindowState.Height)
	}
	if f.WindowState.X != 0 || f.WindowState.Y != 0 {
		t.Fatalf("expected out-of-bound X,Y reset to 0,0, got %d,%d", f.WindowState.X, f.WindowState.Y)
	}

	// Verify Prefs clamping
	if f.Prefs.TraySessionLimit == nil || *f.Prefs.TraySessionLimit != 20 {
		t.Fatalf("expected traySessionLimit clamped to 20, got %v", f.Prefs.TraySessionLimit)
	}
	if f.Prefs.PromptOverlayMaxLines == nil || *f.Prefs.PromptOverlayMaxLines != 2 {
		t.Fatalf("expected promptOverlayMaxLines clamped to 2, got %v", f.Prefs.PromptOverlayMaxLines)
	}
	if f.Prefs.CloseToTray != nil {
		t.Fatalf("expected closeToTray to be nil when trayEnabled is false, got %v", *f.Prefs.CloseToTray)
	}

	// Verify Launch options clamping
	if f.Launch.Options.Port != 0 {
		t.Fatalf("expected out-of-range port to be reset to 0, got %d", f.Launch.Options.Port)
	}
}

func TestValidateSessionIDCases(t *testing.T) {
	validCases := []string{
		"session-1",
		"session-4514df73-e4a8-4326-a8c7-747860b4a4de",
		"session_123.abc",
		"A",
		"123",
	}
	for _, id := range validCases {
		if !ValidateSessionID(id) {
			t.Errorf("expected valid session ID for %q", id)
		}
		if SanitizeSessionID(id) != id {
			t.Errorf("expected %q, got %q", id, SanitizeSessionID(id))
		}
	}

	invalidCases := []string{
		"",
		" ",
		"-session",
		".session",
		"_session",
		"<script>alert(1)</script>",
		"session/123",
		"session\\123",
		"session\n123",
		"session\"id",
		"session'id",
		"session;drop table",
		strings.Repeat("a", 129),
	}
	for _, id := range invalidCases {
		if ValidateSessionID(id) {
			t.Errorf("expected invalid session ID for %q", id)
		}
		if SanitizeSessionID(id) != "" {
			t.Errorf("expected empty sanitized ID for %q, got %q", id, SanitizeSessionID(id))
		}
	}
}

