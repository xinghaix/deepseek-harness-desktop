package dsh

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

const (
	desktopBridgeURLVar      = "DSH_DESKTOP_BRIDGE_URL"
	desktopBridgeTokenVar    = "DSH_DESKTOP_BRIDGE_TOKEN"
	desktopBridgeTokenHeader = "X-DSH-Desktop-Bridge-Token"
)

// desktopBridge 是只监听回环地址的控制面。DSH 插件通过自己的认证 RPC
// 调用它，控制面本身只接受带随机令牌的有限操作。
type desktopBridge struct {
	owner    *Manager
	listener net.Listener
	server   *http.Server
	url      string
	token    string
	once     sync.Once
	closeErr error
}

func newDesktopBridge(owner *Manager) (*desktopBridge, error) {
	var rawToken [32]byte
	if _, err := rand.Read(rawToken[:]); err != nil {
		return nil, fmt.Errorf("生成桌面桥接令牌失败: %w", err)
	}
	listener, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		return nil, fmt.Errorf("启动桌面桥接控制面失败: %w", err)
	}

	bridge := &desktopBridge{
		owner:    owner,
		listener: listener,
		server:   &http.Server{ReadHeaderTimeout: time.Second},
		url:      "http://" + listener.Addr().String(),
		token:    hex.EncodeToString(rawToken[:]),
	}
	bridge.server.Handler = http.HandlerFunc(bridge.serveHTTP)
	go func() {
		if err := bridge.server.Serve(listener); err != nil && !errors.Is(err, http.ErrServerClosed) {
			// 控制面只是桌面端的辅助能力；异常会在下一次请求中体现，不能
			// 让它的 goroutine 直接终止宿主进程。
		}
	}()
	return bridge, nil
}

func (b *desktopBridge) close() error {
	b.once.Do(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		b.closeErr = b.server.Shutdown(ctx)
	})
	return b.closeErr
}

func (b *desktopBridge) env(base []string) []string {
	result := make([]string, 0, len(base)+2)
	for _, entry := range base {
		key, _, _ := strings.Cut(entry, "=")
		if strings.EqualFold(key, desktopBridgeURLVar) || strings.EqualFold(key, desktopBridgeTokenVar) {
			continue
		}
		result = append(result, entry)
	}
	return append(result, desktopBridgeURLVar+"="+b.url, desktopBridgeTokenVar+"="+b.token)
}

func (b *desktopBridge) serveHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if subtle.ConstantTimeCompare([]byte(r.Header.Get(desktopBridgeTokenHeader)), []byte(b.token)) != 1 {
		writeBridgeError(w, http.StatusUnauthorized, "桌面桥接令牌无效")
		return
	}
	if r.URL.RawQuery != "" {
		writeBridgeError(w, http.StatusBadRequest, "桌面桥接接口不接受查询参数")
		return
	}

	switch r.URL.Path {
	case "/v1/status":
		if r.Method != http.MethodGet {
			writeBridgeError(w, http.StatusMethodNotAllowed, "状态接口只接受 GET")
			return
		}
		writeBridgeJSON(w, http.StatusOK, b.owner.Status())
	case "/v1/restart":
		if r.Method != http.MethodPost {
			writeBridgeError(w, http.StatusMethodNotAllowed, "重启接口只接受 POST")
			return
		}
		if err := b.owner.Restart(); err != nil {
			writeBridgeError(w, http.StatusConflict, err.Error())
			return
		}
		writeBridgeJSON(w, http.StatusOK, b.owner.Status())
	case "/v1/stop":
		if r.Method != http.MethodPost {
			writeBridgeError(w, http.StatusMethodNotAllowed, "停止接口只接受 POST")
			return
		}
		if err := b.owner.Stop(); err != nil {
			writeBridgeError(w, http.StatusConflict, err.Error())
			return
		}
		writeBridgeJSON(w, http.StatusOK, b.owner.Status())
	case "/v1/open-management":
		if r.Method != http.MethodPost {
			writeBridgeError(w, http.StatusMethodNotAllowed, "打开桌面配置接口只接受 POST")
			return
		}
		if err := b.owner.callOpenManagement(); err != nil {
			writeBridgeError(w, http.StatusConflict, err.Error())
			return
		}
		writeBridgeJSON(w, http.StatusOK, map[string]any{"ok": true})
	default:
		writeBridgeError(w, http.StatusNotFound, "桌面桥接接口不存在")
	}
}

func writeBridgeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func writeBridgeError(w http.ResponseWriter, status int, message string) {
	writeBridgeJSON(w, status, map[string]string{"error": message})
}
