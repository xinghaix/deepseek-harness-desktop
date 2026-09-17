package dsh

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestLoopbackHTTPAdapterReadyAndChatURL(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "/", http.StatusSeeOther)
	}))
	defer server.Close()
	adapter := NewLoopbackHTTPAdapter()
	announced := server.URL + "/?token=one-time"
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	endpoint, err := adapter.Ready(ctx, announced, 0)
	if err != nil {
		t.Fatal(err)
	}
	entry, err := adapter.ChatEntryPoint(endpoint, true)
	if err != nil || entry.LogicalURL != "dsh-app://chat/" || entry.LoadURL != announced || !entry.FirstLoad {
		t.Fatalf("unexpected Chat entry point: %+v, err=%v", entry, err)
	}
	if endpoint.URL != announced || endpoint.BaseURL != server.URL || endpoint.Port == 0 {
		t.Fatalf("unexpected endpoint: %+v", endpoint)
	}
	first, err := adapter.ChatURL(endpoint, true)
	if err != nil || first != announced {
		t.Fatalf("first URL = %q, err=%v", first, err)
	}
	later, err := adapter.ChatURL(endpoint, false)
	if err != nil || later != server.URL+"/" {
		t.Fatalf("later URL = %q, err=%v", later, err)
	}
	if got, ok := adapter.Endpoint(); !ok || got.BaseURL != endpoint.BaseURL {
		t.Fatalf("stored endpoint = %+v, ok=%v", got, ok)
	}
	if err := adapter.Cleanup(); err != nil {
		t.Fatal(err)
	}
	if _, ok := adapter.Endpoint(); ok {
		t.Fatal("cleanup retained endpoint")
	}
}

func TestLoopbackHTTPAdapterRejectsNonLoopbackAndPortMismatch(t *testing.T) {
	adapter := NewLoopbackHTTPAdapter()
	for _, announced := range []string{
		"https://127.0.0.1:1234/?token=x",
		"http://localhost:1234/?token=x",
		"http://127.0.0.1:1234/path?token=x",
		"http://127.0.0.1:1234/?token=x#fragment",
	} {
		if _, err := adapter.Ready(context.Background(), announced, 0); !errors.Is(err, ErrTransportEndpoint) {
			t.Fatalf("%q error = %v, want ErrTransportEndpoint", announced, err)
		}
	}
	if _, err := adapter.Ready(context.Background(), "http://127.0.0.1:1234/?token=x", 1235); !errors.Is(err, ErrTransportEndpoint) {
		t.Fatalf("port mismatch error = %v", err)
	}
}

func TestLoopbackHTTPAdapterRejectsOtherLoopbackPortRedirect(t *testing.T) {
	foreign := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer foreign.Close()
	owned := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, foreign.URL+"/", http.StatusSeeOther)
	}))
	defer owned.Close()
	adapter := NewLoopbackHTTPAdapter()
	if _, err := adapter.Ready(context.Background(), owned.URL+"/?token=x", 0); !errors.Is(err, ErrTransportRedirect) {
		t.Fatalf("other-port redirect error = %v, want ErrTransportRedirect", err)
	}
}

func TestValidateLoopbackRedirectIsExact(t *testing.T) {
	endpoint := TransportEndpoint{Port: 43123}
	for _, location := range []string{"/", "http://127.0.0.1:43123/"} {
		if err := validateLoopbackRedirect(location, endpoint); err != nil {
			t.Fatalf("valid redirect %q: %v", location, err)
		}
	}
	for _, location := range []string{
		"https://127.0.0.1:43123/",
		"http://127.0.0.1:43124/",
		"http://127.0.0.1.evil:43123/",
		"/other",
		"/?token=secret",
		"http://user@127.0.0.1:43123/",
	} {
		if err := validateLoopbackRedirect(location, endpoint); !errors.Is(err, ErrTransportRedirect) {
			t.Fatalf("redirect %q error = %v, want ErrTransportRedirect", location, err)
		}
	}
}

func TestNegotiateCapabilitiesHTTPFallback(t *testing.T) {
	server := CurrentCapabilities(NewLoopbackHTTPAdapter())
	response := NegotiateCapabilities(server, HandshakeRequest{
		Schema:   server.Schema,
		Protocol: server.Protocol,
		Transport: TransportCapabilities{
			Selected:   "pipe",
			Candidates: []string{"pipe", LoopbackHTTPTransport},
		},
	})
	if !response.Compatible || !response.Fallback || response.Transport.Selected != LoopbackHTTPTransport {
		t.Fatalf("unexpected fallback response: %+v", response)
	}
	if response.Capabilities.Transport.Selected != LoopbackHTTPTransport {
		t.Fatal("response leaked a non-selected transport")
	}
}
