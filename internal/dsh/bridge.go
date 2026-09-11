package dsh

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"deepseek-harness-desktop/internal/i18n"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

const (
	desktopBridgeURLVar          = "DSH_DESKTOP_BRIDGE_URL"
	desktopBridgeTokenVar        = "DSH_DESKTOP_BRIDGE_TOKEN"
	desktopBridgeEndpointFileVar = "DSH_DESKTOP_BRIDGE_ENDPOINT_FILE"
	desktopBridgeTokenHeader     = "X-DSH-Desktop-Bridge-Token"
	desktopBridgeEndpointName    = "bridge-endpoint.json"
	maxBridgeBodyBytes           = 1 << 20
)

// BridgeHost is implemented by the desktop Service so Chat settings can drive
// native capabilities without pulling Wails into this package.
type BridgeHost interface {
	OpenManagement() error
	OpenChat() error
	PresentRecoverySettings() error
	ReloadChat(o Options) error
	ChooseExecutable() (string, error)
	ChooseHome() (string, error)
	ChooseWorkspace() (string, error)
	OpenHome(o Options) error
	OpenWorkspace(o Options) error
	OpenSettings(o Options) error
	BridgePrefs() BridgePrefs
	SetLanguage(code string) (BridgePrefs, error)
	SetConfirmQuitWhenBusy(enabled bool) (BridgePrefs, error)
	ReportChatBusy(busy bool)
	BridgeUpdateStatus() BridgeUpdate
	CheckUpdate() (BridgeUpdate, error)
	InstallUpdate() error
	OpenReleasePage() error
	SetAutoCheckUpdate(enabled bool) (BridgeUpdate, error)
	AppVersion() string
}

// BridgePrefs is the JSON shape returned on /v1/prefs.
type BridgePrefs struct {
	ConfirmQuitWhenBusy bool                 `json:"confirmQuitWhenBusy"`
	Language            string               `json:"language"`
	ResolvedLocale      string               `json:"resolvedLocale"`
	SystemLocale        string               `json:"systemLocale"`
	Source              string               `json:"source"`
	Supported           []BridgeLocaleOption `json:"supported"`
}

// BridgeLocaleOption is one language choice in BridgePrefs.
type BridgeLocaleOption struct {
	Code       string `json:"code"`
	NativeName string `json:"nativeName"`
}

// BridgeUpdate mirrors update.Snapshot for the bridge JSON surface.
type BridgeUpdate struct {
	State          string  `json:"state"`
	CurrentVersion string  `json:"currentVersion"`
	LatestVersion  string  `json:"latestVersion"`
	Notes          string  `json:"notes"`
	ReleaseURL     string  `json:"releaseURL"`
	AssetName      string  `json:"assetName"`
	BytesTotal     int64   `json:"bytesTotal"`
	BytesDone      int64   `json:"bytesDone"`
	Progress       float64 `json:"progress"`
	Error          string  `json:"error"`
	AutoCheck      bool    `json:"autoCheck"`
}

// desktopBridge is a loopback-only control plane. DSH plugins call it over
// authenticated RPC; the plane itself only accepts a random token and a
// whitelist of operations.
type desktopBridge struct {
	owner        *Manager
	mu           sync.Mutex
	listener     net.Listener
	server       *http.Server
	url          string
	token        string
	endpointFile string
	closed       bool
	closeOnce    sync.Once
	closeErr     error
}

func newDesktopBridge(owner *Manager, endpointFile string) (*desktopBridge, error) {
	bridge := &desktopBridge{owner: owner, endpointFile: endpointFile}
	if err := bridge.listen(); err != nil {
		return nil, err
	}
	return bridge, nil
}

func (b *desktopBridge) listen() error {
	var rawToken [32]byte
	if _, err := rand.Read(rawToken[:]); err != nil {
		return fmt.Errorf("%s: %w", i18n.TActive("err.bridge_token_gen"), err)
	}
	listener, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		return fmt.Errorf("%s: %w", i18n.TActive("err.bridge_listen"), err)
	}
	server := &http.Server{ReadHeaderTimeout: time.Second, Handler: http.HandlerFunc(b.serveHTTP)}
	url := "http://" + listener.Addr().String()
	token := hex.EncodeToString(rawToken[:])

	b.mu.Lock()
	b.listener = listener
	b.server = server
	b.url = url
	b.token = token
	b.mu.Unlock()

	if err := b.writeEndpointFile(); err != nil {
		_ = listener.Close()
		return err
	}

	go b.serve(listener, server, token)
	return nil
}

func (b *desktopBridge) serve(listener net.Listener, server *http.Server, token string) {
	err := server.Serve(listener)
	if err == nil || errors.Is(err, http.ErrServerClosed) {
		return
	}
	b.mu.Lock()
	closed := b.closed
	same := b.token == token
	b.mu.Unlock()
	if closed || !same {
		return
	}
	// Listener died unexpectedly: recreate with a fresh token so the plugin
	// can reconnect via the endpoint file.
	_ = b.listen()
}

func (b *desktopBridge) writeEndpointFile() error {
	b.mu.Lock()
	path := b.endpointFile
	url := b.url
	token := b.token
	b.mu.Unlock()
	if strings.TrimSpace(path) == "" {
		return nil
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return fmt.Errorf("%s: %w", i18n.TActive("err.bridge_endpoint_mkdir"), err)
	}
	payload, err := json.Marshal(map[string]string{"url": url, "token": token})
	if err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, payload, 0o600); err != nil {
		return fmt.Errorf("%s: %w", i18n.TActive("err.bridge_endpoint_write"), err)
	}
	if err := os.Rename(tmp, path); err != nil {
		_ = os.Remove(tmp)
		return fmt.Errorf("%s: %w", i18n.TActive("err.bridge_endpoint_write"), err)
	}
	return nil
}

func (b *desktopBridge) close() error {
	b.closeOnce.Do(func() {
		b.mu.Lock()
		b.closed = true
		server := b.server
		path := b.endpointFile
		b.mu.Unlock()
		if path != "" {
			_ = os.Remove(path)
		}
		if server == nil {
			return
		}
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		b.closeErr = server.Shutdown(ctx)
	})
	return b.closeErr
}

func (b *desktopBridge) env(base []string) []string {
	b.mu.Lock()
	url := b.url
	token := b.token
	endpointFile := b.endpointFile
	b.mu.Unlock()
	result := make([]string, 0, len(base)+3)
	for _, entry := range base {
		key, _, _ := strings.Cut(entry, "=")
		if strings.EqualFold(key, desktopBridgeURLVar) ||
			strings.EqualFold(key, desktopBridgeTokenVar) ||
			strings.EqualFold(key, desktopBridgeEndpointFileVar) {
			continue
		}
		result = append(result, entry)
	}
	result = append(result,
		desktopBridgeURLVar+"="+url,
		desktopBridgeTokenVar+"="+token,
	)
	if endpointFile != "" {
		result = append(result, desktopBridgeEndpointFileVar+"="+endpointFile)
	}
	return result
}

func (b *desktopBridge) currentToken() string {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.token
}

func (b *desktopBridge) serveHTTP(w http.ResponseWriter, r *http.Request) {
	defer func() {
		if recovered := recover(); recovered != nil {
			writeBridgeError(w, http.StatusInternalServerError, i18n.TActive("err.bridge_panic"))
		}
	}()
	w.Header().Set("Cache-Control", "no-store")
	token := b.currentToken()
	if subtle.ConstantTimeCompare([]byte(r.Header.Get(desktopBridgeTokenHeader)), []byte(token)) != 1 {
		writeBridgeError(w, http.StatusUnauthorized, i18n.TActive("err.bridge_invalid_token"))
		return
	}
	if r.URL.RawQuery != "" {
		writeBridgeError(w, http.StatusBadRequest, i18n.TActive("err.bridge_no_query"))
		return
	}

	switch r.URL.Path {
	case "/v1/ping":
		if r.Method != http.MethodGet {
			writeBridgeError(w, http.StatusMethodNotAllowed, i18n.TActive("err.bridge_method"))
			return
		}
		writeBridgeJSON(w, http.StatusOK, map[string]any{"ok": true})
	case "/v1/status":
		if r.Method != http.MethodGet {
			writeBridgeError(w, http.StatusMethodNotAllowed, i18n.TActive("err.bridge_status_get_only"))
			return
		}
		writeBridgeJSON(w, http.StatusOK, b.owner.Status())
	case "/v1/start":
		if r.Method != http.MethodPost {
			writeBridgeError(w, http.StatusMethodNotAllowed, i18n.TActive("err.bridge_method"))
			return
		}
		if err := b.owner.Restart(); err != nil {
			writeBridgeError(w, http.StatusConflict, err.Error())
			return
		}
		// Refresh Chat after DSH is ready (port may change); do not block the HTTP response.
		go b.owner.waitRunningThenOpenChat(45 * time.Second)
		writeBridgeJSON(w, http.StatusOK, b.owner.Status())
	case "/v1/restart":
		if r.Method != http.MethodPost {
			writeBridgeError(w, http.StatusMethodNotAllowed, i18n.TActive("err.bridge_restart_post_only"))
			return
		}
		if err := b.owner.Restart(); err != nil {
			writeBridgeError(w, http.StatusConflict, err.Error())
			return
		}
		// Refresh Chat after DSH is ready (port may change); do not block the HTTP response.
		go b.owner.waitRunningThenOpenChat(45 * time.Second)
		writeBridgeJSON(w, http.StatusOK, b.owner.Status())
	case "/v1/stop":
		if r.Method != http.MethodPost {
			writeBridgeError(w, http.StatusMethodNotAllowed, i18n.TActive("err.bridge_stop_post_only"))
			return
		}
		if err := b.owner.Stop(); err != nil {
			writeBridgeError(w, http.StatusConflict, err.Error())
			return
		}
		writeBridgeJSON(w, http.StatusOK, b.owner.Status())
	case "/v1/reload-chat":
		if r.Method != http.MethodPost {
			writeBridgeError(w, http.StatusMethodNotAllowed, i18n.TActive("err.bridge_method"))
			return
		}
		o, err := decodeBridgeOptions(r, b.owner.Status().Options)
		if err != nil {
			writeBridgeError(w, http.StatusBadRequest, err.Error())
			return
		}
		if err := b.owner.callReloadChat(o); err != nil {
			writeBridgeError(w, http.StatusConflict, err.Error())
			return
		}
		writeBridgeJSON(w, http.StatusOK, b.owner.Status())
	case "/v1/open-management":
		if r.Method != http.MethodPost {
			writeBridgeError(w, http.StatusMethodNotAllowed, i18n.TActive("err.bridge_open_mgmt_post_only"))
			return
		}
		if err := b.owner.callOpenManagement(); err != nil {
			writeBridgeError(w, http.StatusConflict, err.Error())
			return
		}
		writeBridgeJSON(w, http.StatusOK, map[string]any{"ok": true})
	case "/v1/choose-executable":
		b.handleChoose(w, r, func(host BridgeHost) (string, error) { return host.ChooseExecutable() })
	case "/v1/choose-home":
		b.handleChoose(w, r, func(host BridgeHost) (string, error) { return host.ChooseHome() })
	case "/v1/choose-workspace":
		b.handleChoose(w, r, func(host BridgeHost) (string, error) { return host.ChooseWorkspace() })
	case "/v1/open-home":
		b.handleOpenPath(w, r, func(host BridgeHost, o Options) error { return host.OpenHome(o) })
	case "/v1/open-workspace":
		b.handleOpenPath(w, r, func(host BridgeHost, o Options) error { return host.OpenWorkspace(o) })
	case "/v1/open-settings-yaml":
		b.handleOpenPath(w, r, func(host BridgeHost, o Options) error { return host.OpenSettings(o) })
	case "/v1/prefs":
		if r.Method != http.MethodGet {
			writeBridgeError(w, http.StatusMethodNotAllowed, i18n.TActive("err.bridge_method"))
			return
		}
		host, err := b.owner.getBridgeHost()
		if err != nil {
			writeBridgeError(w, http.StatusConflict, err.Error())
			return
		}
		writeBridgeJSON(w, http.StatusOK, host.BridgePrefs())
	case "/v1/set-language":
		if r.Method != http.MethodPost {
			writeBridgeError(w, http.StatusMethodNotAllowed, i18n.TActive("err.bridge_method"))
			return
		}
		var body struct {
			Language string `json:"language"`
		}
		if err := decodeBridgeJSON(r, &body); err != nil {
			writeBridgeError(w, http.StatusBadRequest, err.Error())
			return
		}
		host, err := b.owner.getBridgeHost()
		if err != nil {
			writeBridgeError(w, http.StatusConflict, err.Error())
			return
		}
		prefs, err := host.SetLanguage(body.Language)
		if err != nil {
			writeBridgeError(w, http.StatusConflict, err.Error())
			return
		}
		writeBridgeJSON(w, http.StatusOK, prefs)
	case "/v1/set-confirm-quit":
		if r.Method != http.MethodPost {
			writeBridgeError(w, http.StatusMethodNotAllowed, i18n.TActive("err.bridge_method"))
			return
		}
		var body struct {
			Enabled bool `json:"enabled"`
		}
		if err := decodeBridgeJSON(r, &body); err != nil {
			writeBridgeError(w, http.StatusBadRequest, err.Error())
			return
		}
		host, err := b.owner.getBridgeHost()
		if err != nil {
			writeBridgeError(w, http.StatusConflict, err.Error())
			return
		}
		prefs, err := host.SetConfirmQuitWhenBusy(body.Enabled)
		if err != nil {
			writeBridgeError(w, http.StatusConflict, err.Error())
			return
		}
		writeBridgeJSON(w, http.StatusOK, prefs)
	case "/v1/report-chat-busy":
		// Official SessionSummary.running feed from the Chat bridge client.
		if r.Method != http.MethodPost {
			writeBridgeError(w, http.StatusMethodNotAllowed, i18n.TActive("err.bridge_method"))
			return
		}
		var body struct {
			Busy bool `json:"busy"`
		}
		if err := decodeBridgeJSON(r, &body); err != nil {
			writeBridgeError(w, http.StatusBadRequest, err.Error())
			return
		}
		host, err := b.owner.getBridgeHost()
		if err != nil {
			writeBridgeError(w, http.StatusConflict, err.Error())
			return
		}
		host.ReportChatBusy(body.Busy)
		writeBridgeJSON(w, http.StatusOK, map[string]bool{"busy": body.Busy})
	case "/v1/update-status":
		if r.Method != http.MethodGet {
			writeBridgeError(w, http.StatusMethodNotAllowed, i18n.TActive("err.bridge_method"))
			return
		}
		host, err := b.owner.getBridgeHost()
		if err != nil {
			writeBridgeError(w, http.StatusConflict, err.Error())
			return
		}
		writeBridgeJSON(w, http.StatusOK, host.BridgeUpdateStatus())
	case "/v1/check-update":
		if r.Method != http.MethodPost {
			writeBridgeError(w, http.StatusMethodNotAllowed, i18n.TActive("err.bridge_method"))
			return
		}
		host, err := b.owner.getBridgeHost()
		if err != nil {
			writeBridgeError(w, http.StatusConflict, err.Error())
			return
		}
		snap, err := host.CheckUpdate()
		if err != nil {
			writeBridgeError(w, http.StatusConflict, err.Error())
			return
		}
		writeBridgeJSON(w, http.StatusOK, snap)
	case "/v1/install-update":
		if r.Method != http.MethodPost {
			writeBridgeError(w, http.StatusMethodNotAllowed, i18n.TActive("err.bridge_method"))
			return
		}
		host, err := b.owner.getBridgeHost()
		if err != nil {
			writeBridgeError(w, http.StatusConflict, err.Error())
			return
		}
		if err := host.InstallUpdate(); err != nil {
			writeBridgeError(w, http.StatusConflict, err.Error())
			return
		}
		writeBridgeJSON(w, http.StatusOK, map[string]any{"ok": true})
	case "/v1/open-release-page":
		if r.Method != http.MethodPost {
			writeBridgeError(w, http.StatusMethodNotAllowed, i18n.TActive("err.bridge_method"))
			return
		}
		host, err := b.owner.getBridgeHost()
		if err != nil {
			writeBridgeError(w, http.StatusConflict, err.Error())
			return
		}
		if err := host.OpenReleasePage(); err != nil {
			writeBridgeError(w, http.StatusConflict, err.Error())
			return
		}
		writeBridgeJSON(w, http.StatusOK, map[string]any{"ok": true})
	case "/v1/set-auto-check-update":
		if r.Method != http.MethodPost {
			writeBridgeError(w, http.StatusMethodNotAllowed, i18n.TActive("err.bridge_method"))
			return
		}
		var body struct {
			Enabled bool `json:"enabled"`
		}
		if err := decodeBridgeJSON(r, &body); err != nil {
			writeBridgeError(w, http.StatusBadRequest, err.Error())
			return
		}
		host, err := b.owner.getBridgeHost()
		if err != nil {
			writeBridgeError(w, http.StatusConflict, err.Error())
			return
		}
		snap, err := host.SetAutoCheckUpdate(body.Enabled)
		if err != nil {
			writeBridgeError(w, http.StatusConflict, err.Error())
			return
		}
		writeBridgeJSON(w, http.StatusOK, snap)
	case "/v1/app-version":
		if r.Method != http.MethodGet {
			writeBridgeError(w, http.StatusMethodNotAllowed, i18n.TActive("err.bridge_method"))
			return
		}
		host, err := b.owner.getBridgeHost()
		if err != nil {
			writeBridgeError(w, http.StatusConflict, err.Error())
			return
		}
		writeBridgeJSON(w, http.StatusOK, map[string]any{"version": host.AppVersion()})
	default:
		writeBridgeError(w, http.StatusNotFound, i18n.TActive("err.bridge_not_found"))
	}
}

func (b *desktopBridge) handleChoose(w http.ResponseWriter, r *http.Request, fn func(BridgeHost) (string, error)) {
	if r.Method != http.MethodPost {
		writeBridgeError(w, http.StatusMethodNotAllowed, i18n.TActive("err.bridge_method"))
		return
	}
	host, err := b.owner.getBridgeHost()
	if err != nil {
		writeBridgeError(w, http.StatusConflict, err.Error())
		return
	}
	path, err := fn(host)
	if err != nil {
		writeBridgeError(w, http.StatusConflict, err.Error())
		return
	}
	writeBridgeJSON(w, http.StatusOK, map[string]any{"path": path})
}

func (b *desktopBridge) handleOpenPath(w http.ResponseWriter, r *http.Request, fn func(BridgeHost, Options) error) {
	if r.Method != http.MethodPost {
		writeBridgeError(w, http.StatusMethodNotAllowed, i18n.TActive("err.bridge_method"))
		return
	}
	o, err := decodeBridgeOptions(r, b.owner.Status().Options)
	if err != nil {
		writeBridgeError(w, http.StatusBadRequest, err.Error())
		return
	}
	host, err := b.owner.getBridgeHost()
	if err != nil {
		writeBridgeError(w, http.StatusConflict, err.Error())
		return
	}
	if err := fn(host, o); err != nil {
		writeBridgeError(w, http.StatusConflict, err.Error())
		return
	}
	writeBridgeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func decodeBridgeJSON(r *http.Request, dest any) error {
	defer r.Body.Close()
	limited := io.LimitReader(r.Body, maxBridgeBodyBytes+1)
	data, err := io.ReadAll(limited)
	if err != nil {
		return err
	}
	if len(data) > maxBridgeBodyBytes {
		return errors.New(i18n.TActive("err.bridge_body_too_large"))
	}
	if len(strings.TrimSpace(string(data))) == 0 {
		return nil
	}
	return json.Unmarshal(data, dest)
}

func decodeBridgeOptions(r *http.Request, fallback Options) (Options, error) {
	var body struct {
		Executable string `json:"executable"`
		Home       string `json:"home"`
		Workspace  string `json:"workspace"`
	}
	if err := decodeBridgeJSON(r, &body); err != nil {
		return Options{}, err
	}
	o := fallback
	if strings.TrimSpace(body.Executable) != "" {
		o.Executable = body.Executable
	}
	if strings.TrimSpace(body.Home) != "" {
		o.Home = body.Home
	}
	if strings.TrimSpace(body.Workspace) != "" {
		o.Workspace = body.Workspace
	}
	o.Port = 0
	return o, nil
}

func writeBridgeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func writeBridgeError(w http.ResponseWriter, status int, message string) {
	writeBridgeJSON(w, status, map[string]string{"error": message})
}

func bridgeEndpointPath(desktopDir string) string {
	return filepath.Join(desktopDir, desktopBridgeEndpointName)
}
