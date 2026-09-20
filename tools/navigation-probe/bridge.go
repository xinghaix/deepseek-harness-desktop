//go:build wails

package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
)

// installClientFixture serves the production renderer client unchanged. The
// nonrendering Cordis context adapts RPC to real HTTP and a recording Go handler.
// It deliberately does NOT claim to test the production authentication path;
// internal/dsh/bridge_rpc_test.go covers the actual plugin and bridge server.
func installClientFixture(mux *http.ServeMux, service *DSH) error {
	client, err := os.ReadFile("internal/dsh/desktopbridge/lib/client.js")
	if err != nil {
		return fmt.Errorf("read production client (run from repository root): %w", err)
	}
	mux.HandleFunc("/client.js", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/javascript; charset=utf-8")
		_, _ = w.Write(client)
	})
	mux.HandleFunc("/client-bootstrap.js", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/javascript; charset=utf-8")
		fmt.Fprint(w, clientBootstrap)
	})
	mux.HandleFunc("/rpc", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "POST required", 405)
			return
		}
		var request struct {
			Channel  string `json:"channel"`
			Endpoint string `json:"endpoint"`
			Payload  struct {
				URL    string `json:"url"`
				Action string `json:"action"`
			} `json:"payload"`
		}
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&request); err != nil {
			http.Error(w, "invalid RPC", 400)
			return
		}
		if request.Channel != "/desktop-bridge" {
			http.Error(w, "unexpected channel", 400)
			return
		}
		if request.Endpoint == "openExternalURL" {
			if request.Payload.URL != "https://example.invalid/native-navigation-probe" {
				http.Error(w, "unexpected fixture URL", 400)
				return
			}
			_ = service.OpenExternalURL(request.Payload.URL)
		}
		if request.Endpoint == "chatWindowAction" {
			if err := service.RecordWindowAction(request.Payload.Action); err != nil {
				http.Error(w, err.Error(), 400)
				return
			}
		}
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{"ok":true,"value":{}}`)
	})
	return nil
}

const clientBootstrap = `
window.__NAV_PROBE_RPC_PENDING__ = new Set();
window.__ModuleLoader__ = {load(registration) {
 try {
   const client = registration.factory(name => {
     if (name === "react") return {};
     if (name === "react/jsx-runtime") return {jsx(){throw new Error("unexpected render");},jsxs(){throw new Error("unexpected render");},Fragment:Symbol("Fragment")};
     throw new Error("unexpected module " + name);
   });
   const ctx = {
     connection:{rpc:{call(channel,endpoint,payload,signal) {
       const pending = window.__NAV_PROBE_RPC_PENDING__;
       const request = fetch("/rpc", {method:"POST",signal,headers:{"Content-Type":"application/json"},body:JSON.stringify({channel,endpoint,payload})})
         .then(response => {if (!response.ok) throw new Error("fixture RPC HTTP " + response.status);return response.json();});
       const tracked = request.finally(() => pending.delete(tracked));
       pending.add(tracked);
       return tracked;
     }}},
     effect(fn){fn();},
     slots:{inject(name,fn){return fn();},register(){return ()=>{};}}
   };
   client.apply(ctx);
   window.__NAV_PROBE_CLIENT_READY__ = true;
 } catch(error) {window.__NAV_PROBE_CLIENT_ERROR__ = String(error);}
}};
`
