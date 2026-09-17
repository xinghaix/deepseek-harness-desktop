package dsh

import (
	"deepseek-harness-desktop/internal/version"
	"runtime"
	"sort"
	"strings"
)

const (
	// CapabilitiesSchema identifies the JSON shape independently from the
	// transport used to deliver it.
	CapabilitiesSchema = "deepseek-harness-desktop/capabilities"
	// CapabilitiesProtocol is intentionally a small integer-like string.  A
	// schema change can be rejected without comparing application versions.
	CapabilitiesProtocol       = "1"
	BridgeProtocolVersion      = "1"
	WebviewBootProtocolVersion = "1"
	DesktopBridgePatchVersion  = "0.1.0"
	WebviewBootPatchVersion    = "0.1.0"
	UnknownVersion             = "unknown"
)

// TransportCapabilities records selection separately from candidates so a
// future pipe adapter can be advertised without making HTTP disappear.  The
// current default always selects loopback-http.
type TransportCapabilities struct {
	Selected   string   `json:"selected"`
	Candidates []string `json:"candidates"`
}

// Capabilities is the authenticated, non-secret compatibility manifest exposed
// by the desktop bridge.  It intentionally contains no URL, port, or token.
type Capabilities struct {
	Schema              string                `json:"schema"`
	Protocol            string                `json:"protocol"`
	DSHVersion          string                `json:"dshVersion"`
	BridgeProtocol      string                `json:"bridgeProtocol"`
	WebviewBootProtocol string                `json:"webviewBootProtocol"`
	DesktopBridgePatch  string                `json:"desktopBridgePatchVersion"`
	WebviewBootPatch    string                `json:"webviewBootPatchVersion"`
	Transport           TransportCapabilities `json:"transport"`
	RendererEntryPoint  string                `json:"rendererEntryPoint"`
	OS                  string                `json:"os"`
	Arch                string                `json:"arch"`
	WebviewRuntime      string                `json:"webviewRuntime"`
	Features            []string              `json:"features"`
}

// HandshakeRequest is the client declaration used during the first bridge
// call.  Capabilities is optional to keep the request forward-compatible with
// clients that send the fields flat.
type HandshakeRequest struct {
	Schema              string                `json:"schema,omitempty"`
	Protocol            string                `json:"protocol,omitempty"`
	DSHVersion          string                `json:"dshVersion,omitempty"`
	BridgeProtocol      string                `json:"bridgeProtocol,omitempty"`
	WebviewBootProtocol string                `json:"webviewBootProtocol,omitempty"`
	Transport           TransportCapabilities `json:"transport,omitempty"`
	Features            []string              `json:"features,omitempty"`
	Capabilities        *Capabilities         `json:"capabilities,omitempty"`
}

// HandshakeResponse contains the negotiated non-secret manifest.  Fallback is
// true when the request asked for a transport that this build does not select;
// the client must continue over the existing loopback HTTP bridge in that case.
type HandshakeResponse struct {
	Schema       string                `json:"schema"`
	Protocol     string                `json:"protocol"`
	Compatible   bool                  `json:"compatible"`
	Fallback     bool                  `json:"fallback"`
	Transport    TransportCapabilities `json:"transport"`
	Capabilities Capabilities          `json:"capabilities"`
	Issues       []string              `json:"issues,omitempty"`
}

func capabilitiesFor(dshVersion string, transport HostTransport) Capabilities {
	if strings.TrimSpace(dshVersion) == "" {
		dshVersion = UnknownVersion
	}
	selected := LoopbackHTTPTransport
	candidates := []string{LoopbackHTTPTransport}
	if transport != nil {
		if name := strings.TrimSpace(transport.Name()); name != "" {
			selected = name
		}
		if values := transport.Candidates(); len(values) != 0 {
			candidates = uniqueStrings(values)
		}
	}
	if !containsString(candidates, selected) {
		candidates = append(candidates, selected)
	}
	features := []string{
		"authenticated-bridge",
		"capability-handshake",
		"loopback-http",
		"renderer-logical-entrypoint",
		"webview-boot",
	}
	if selected != LoopbackHTTPTransport {
		features = append(features, "transport-custom")
	}
	sort.Strings(features)
	return Capabilities{
		Schema:              CapabilitiesSchema,
		Protocol:            CapabilitiesProtocol,
		DSHVersion:          dshVersion,
		BridgeProtocol:      BridgeProtocolVersion,
		WebviewBootProtocol: WebviewBootProtocolVersion,
		DesktopBridgePatch:  DesktopBridgePatchVersion,
		WebviewBootPatch:    WebviewBootPatchVersion,
		Transport: TransportCapabilities{
			Selected:   selected,
			Candidates: candidates,
		},
		RendererEntryPoint: RendererAppScheme + "://chat/",
		OS:                 runtime.GOOS,
		Arch:               runtime.GOARCH,
		WebviewRuntime:     UnknownVersion,
		Features:           features,
	}
}

func uniqueStrings(values []string) []string {
	seen := make(map[string]struct{}, len(values))
	result := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		result = append(result, value)
	}
	return result
}

// CurrentCapabilities builds a manifest for callers outside Manager.  Manager
// adds its discovered dsh version through capabilitiesFor.
func CurrentCapabilities(transport HostTransport) Capabilities {
	value := strings.TrimSpace(version.Version)
	if value == "" {
		value = UnknownVersion
	}
	return capabilitiesFor(value, transport)
}

func NegotiateCapabilities(server Capabilities, request HandshakeRequest) HandshakeResponse {
	if request.Capabilities != nil {
		request = mergeHandshakeRequest(request, *request.Capabilities)
	}
	response := HandshakeResponse{
		Schema:       server.Schema,
		Protocol:     server.Protocol,
		Compatible:   true,
		Transport:    server.Transport,
		Capabilities: server,
	}
	if request.Schema != "" && request.Schema != server.Schema {
		response.Compatible = false
		response.Issues = append(response.Issues, "schema-mismatch")
	}
	if request.Protocol != "" && request.Protocol != server.Protocol {
		response.Compatible = false
		response.Issues = append(response.Issues, "protocol-mismatch")
	}
	if request.BridgeProtocol != "" && request.BridgeProtocol != server.BridgeProtocol {
		response.Compatible = false
		response.Issues = append(response.Issues, "bridge-protocol-mismatch")
	}
	if request.WebviewBootProtocol != "" && request.WebviewBootProtocol != server.WebviewBootProtocol {
		response.Compatible = false
		response.Issues = append(response.Issues, "webview-boot-protocol-mismatch")
	}
	requested := strings.TrimSpace(request.Transport.Selected)
	if requested != "" && requested != server.Transport.Selected {
		if containsString(request.Transport.Candidates, server.Transport.Selected) || containsString(server.Transport.Candidates, requested) {
			response.Fallback = true
		} else {
			response.Compatible = false
			response.Issues = append(response.Issues, "transport-mismatch")
			response.Fallback = true
		}
	}
	return response
}

func mergeHandshakeRequest(request HandshakeRequest, nested Capabilities) HandshakeRequest {
	if request.Schema == "" {
		request.Schema = nested.Schema
	}
	if request.Protocol == "" {
		request.Protocol = nested.Protocol
	}
	if request.DSHVersion == "" {
		request.DSHVersion = nested.DSHVersion
	}
	if request.BridgeProtocol == "" {
		request.BridgeProtocol = nested.BridgeProtocol
	}
	if request.WebviewBootProtocol == "" {
		request.WebviewBootProtocol = nested.WebviewBootProtocol
	}
	if request.Transport.Selected == "" {
		request.Transport = nested.Transport
	}
	if len(request.Features) == 0 {
		request.Features = nested.Features
	}
	return request
}

func containsString(values []string, wanted string) bool {
	for _, value := range values {
		if strings.TrimSpace(value) == wanted {
			return true
		}
	}
	return false
}
