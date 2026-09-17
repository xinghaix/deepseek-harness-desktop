package dsh

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	// LoopbackHTTPTransport is the stable capability name for the current dsh web
	// adapter. It deliberately describes the transport, not a particular port.
	LoopbackHTTPTransport = "loopback-http"
	// RendererAppScheme is the transport-independent logical renderer entry point.
	// Wails v3.0.0-beta.22 does not expose a portable native custom-scheme handler, so the
	// current adapter resolves this logical name to its authenticated HTTP URL.
	RendererAppScheme = "dsh-app"
)

var (
	ErrTransportNotReady = errors.New("transport endpoint is not ready")
	ErrTransportEndpoint = errors.New("invalid transport endpoint")
	ErrTransportRedirect = errors.New("transport endpoint redirected off loopback")
)

// TransportEndpoint is the endpoint announced by dsh web after it starts.
// URL is the one-time browser URL (and may contain the dsh login token). BaseURL
// is the credential-free origin used only for readiness probes and status.
// Neither value is included in capabilities or bridge responses.
type TransportEndpoint struct {
	URL     string
	BaseURL string
	Port    int
}

// ChatEntryPoint is the logical renderer seam plus the concrete URL selected by
// the adapter. A future native dsh-app handler can consume LogicalURL directly;
// the installed-CLI HTTP adapter keeps LoadURL on loopback for compatibility.
type ChatEntryPoint struct {
	LogicalURL string `json:"logicalUrl"`
	LoadURL    string `json:"loadUrl"`
	Transport  string `json:"transport"`
	FirstLoad  bool   `json:"firstLoad"`
}

// HostTransport is the host-side seam between process readiness and the
// transport used by Chat.  Implementations own endpoint validation and probing;
// Manager never needs to know whether readiness is HTTP, a pipe, or a future
// platform-specific adapter.
type HostTransport interface {
	Name() string
	Candidates() []string
	Ready(context.Context, string, int) (TransportEndpoint, error)
	Endpoint() (TransportEndpoint, bool)
	Cleanup() error
}

// ChatTransport is the renderer-facing half of the transport seam.  The first
// load may use a one-time credential-bearing URL; subsequent navigations use a
// credential-free origin so the WebView keeps its first-party cookie session.
type ChatTransport interface {
	ChatURL(TransportEndpoint, bool) (string, error)
	ChatEntryPoint(TransportEndpoint, bool) (ChatEntryPoint, error)
}

// LoopbackHTTPAdapter is the default adapter for an installed dsh CLI.  It
// probes the existing dsh web HTTP server and never creates a profile, copies
// DSH_HOME, or owns a listener of its own.
type LoopbackHTTPAdapter struct {
	mu       sync.RWMutex
	endpoint TransportEndpoint
	client   *http.Client
}

func NewLoopbackHTTPAdapter() *LoopbackHTTPAdapter {
	return &LoopbackHTTPAdapter{client: &http.Client{
		Timeout:   time.Second,
		Transport: &http.Transport{Proxy: nil, DisableKeepAlives: true},
		CheckRedirect: func(*http.Request, []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}}
}

func (a *LoopbackHTTPAdapter) Name() string { return LoopbackHTTPTransport }

func (a *LoopbackHTTPAdapter) Candidates() []string { return []string{LoopbackHTTPTransport} }

// Ready validates an announced dsh URL and waits for its HTTP origin to answer.
// The token URL is never requested: dsh treats that URL as a one-time login and
// only the Chat WebView is allowed to redeem it.
func (a *LoopbackHTTPAdapter) Ready(ctx context.Context, announced string, requestedPort int) (TransportEndpoint, error) {
	endpoint, err := parseLoopbackEndpoint(announced, requestedPort)
	if err != nil {
		return TransportEndpoint{}, err
	}
	client := a.httpClient()
	if client == nil {
		return TransportEndpoint{}, ErrTransportNotReady
	}
	for {
		req, requestErr := http.NewRequestWithContext(ctx, http.MethodGet, endpoint.BaseURL+"/", nil)
		if requestErr != nil {
			return TransportEndpoint{}, fmt.Errorf("%w: %v", ErrTransportEndpoint, requestErr)
		}
		response, requestErr := client.Do(req)
		if requestErr == nil {
			location := response.Header.Get("Location")
			_ = response.Body.Close()
			if err := validateLoopbackRedirect(location, endpoint); err != nil {
				return TransportEndpoint{}, err
			}
			a.mu.Lock()
			a.endpoint = endpoint
			a.mu.Unlock()
			return endpoint, nil
		}
		if ctx.Err() != nil {
			return TransportEndpoint{}, ctx.Err()
		}
		timer := time.NewTimer(50 * time.Millisecond)
		select {
		case <-ctx.Done():
			if !timer.Stop() {
				<-timer.C
			}
			return TransportEndpoint{}, ctx.Err()
		case <-timer.C:
		}
	}
}

func (a *LoopbackHTTPAdapter) httpClient() *http.Client {
	a.mu.RLock()
	client := a.client
	a.mu.RUnlock()
	if client != nil {
		return client
	}
	// A zero-value adapter remains useful in tests and for dependency injection.
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.client == nil {
		a.client = NewLoopbackHTTPAdapter().client
	}
	return a.client
}

func (a *LoopbackHTTPAdapter) Endpoint() (TransportEndpoint, bool) {
	a.mu.RLock()
	defer a.mu.RUnlock()
	if a.endpoint.BaseURL == "" {
		return TransportEndpoint{}, false
	}
	return a.endpoint, true
}

// ChatURL implements ChatTransport.  It returns a token URL only for the first
// navigation and never exposes the token through a capability or status shape.
func (a *LoopbackHTTPAdapter) ChatURL(endpoint TransportEndpoint, firstLoad bool) (string, error) {
	if strings.TrimSpace(endpoint.BaseURL) == "" {
		return "", ErrTransportNotReady
	}
	if firstLoad && strings.TrimSpace(endpoint.URL) != "" {
		return endpoint.URL, nil
	}
	return strings.TrimRight(endpoint.BaseURL, "/") + "/", nil
}

func (a *LoopbackHTTPAdapter) ChatEntryPoint(endpoint TransportEndpoint, firstLoad bool) (ChatEntryPoint, error) {
	loadURL, err := a.ChatURL(endpoint, firstLoad)
	if err != nil {
		return ChatEntryPoint{}, err
	}
	return ChatEntryPoint{
		LogicalURL: RendererAppScheme + "://chat/",
		LoadURL:    loadURL,
		Transport:  a.Name(),
		FirstLoad:  firstLoad,
	}, nil
}

func (a *LoopbackHTTPAdapter) Cleanup() error {
	a.mu.Lock()
	a.endpoint = TransportEndpoint{}
	client := a.client
	a.mu.Unlock()
	if client != nil {
		client.CloseIdleConnections()
	}
	return nil
}

// Close is an explicit alias for callers that own an adapter independently of
// Manager.  It does not stop dsh web; Manager owns that process tree.
func (a *LoopbackHTTPAdapter) Close() error { return a.Cleanup() }

func parseLoopbackEndpoint(announced string, requestedPort int) (TransportEndpoint, error) {
	parsed, err := url.Parse(strings.TrimSpace(announced))
	if err != nil || parsed == nil {
		return TransportEndpoint{}, fmt.Errorf("%w: %q", ErrTransportEndpoint, announced)
	}
	actualPort, portErr := strconv.Atoi(parsed.Port())
	portMatches := requestedPort == 0 || actualPort == requestedPort
	if parsed.Scheme != "http" || parsed.Hostname() != "127.0.0.1" || parsed.Port() == "" || portErr != nil || actualPort < 1 || actualPort > 65535 || !portMatches || parsed.User != nil || parsed.Fragment != "" || (parsed.Path != "" && parsed.Path != "/") {
		return TransportEndpoint{}, fmt.Errorf("%w: %q", ErrTransportEndpoint, announced)
	}
	return TransportEndpoint{
		URL:     announced,
		BaseURL: "http://" + parsed.Host,
		Port:    actualPort,
	}, nil
}

func validateLoopbackRedirect(location string, endpoint TransportEndpoint) error {
	if err := validateReadinessRedirect(location); err != nil {
		return err
	}
	if strings.TrimSpace(location) == "" {
		return nil
	}
	redirect, err := url.Parse(location)
	if err != nil || redirect == nil || redirect.Host == "" {
		return nil
	}
	if redirect.Port() != strconv.Itoa(endpoint.Port) {
		return fmt.Errorf("%w: %q", ErrTransportRedirect, location)
	}
	return nil
}

// validateReadinessRedirect rejects off-loopback Location values. Ready() uses
// validateLoopbackRedirect so a redirect must stay on the announced port; this
// helper remains for relative-path checks inside that function.
func validateReadinessRedirect(location string) error {
	if strings.TrimSpace(location) == "" {
		return nil
	}
	redirect, err := url.Parse(location)
	if err != nil || redirect == nil || redirect.User != nil || redirect.Fragment != "" || redirect.RawQuery != "" || (redirect.Path != "" && redirect.Path != "/") {
		return fmt.Errorf("%w: %q", ErrTransportRedirect, location)
	}
	if redirect.Host == "" {
		return nil
	}
	if redirect.Scheme != "http" || !loopbackHost(redirect.Hostname()) {
		return fmt.Errorf("%w: %q", ErrTransportRedirect, location)
	}
	return nil
}
