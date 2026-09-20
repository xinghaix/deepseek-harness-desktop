package dsh

import (
	"context"
	"errors"
	"os/exec"
	"path/filepath"
	"testing"
	"time"
)

// A minimal Cordis registration/auth harness hosts the real plugin handler.
// RPC envelopes, fetch, bridge authentication, and the HTTP route run their real
// code; the native launcher records calls instead of opening a browser.
type rpcExternalURLHost struct {
	routeTestBridgeHost
	calls chan string
}

func (h *rpcExternalURLHost) OpenExternalURL(url string) error {
	h.calls <- url
	if url == "https://example.com/failure" {
		return errors.New("launcher failed")
	}
	return nil
}

func TestDesktopBridgeOpenExternalURLPluginRPC(t *testing.T) {
	node, err := exec.LookPath("node")
	if err != nil {
		t.Skip("Node.js unavailable: skipping plugin RPC integration")
	}
	host := &rpcExternalURLHost{calls: make(chan string, 10)}
	owner := New()
	owner.SetBridgeHost(host)
	bridge, err := newDesktopBridge(owner, filepath.Join(t.TempDir(), desktopBridgeEndpointName))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = bridge.close() })
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, node, "--input-type=module", "-e", `
import assert from "node:assert/strict";
import http from "node:http";
import { apply } from "./desktopbridge/lib/index.js";
let handler;
apply({ inject(deps, callback) {
 if (!deps.includes("webServer")) return;
 callback({
  connection: { requestRejection(req) { return req.headers.authorization === "test-session" ? undefined : 401; } },
  effect(fn) { fn(); },
  webServer: { register(route) { assert.equal(route.path, "/desktop-bridge"); handler = route.handler; return () => {}; } }
 });
}});
assert.equal(typeof handler, "function");
const server = http.createServer(handler);
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
async function request(method, payload, authenticated = true) {
 const response = await fetch("http://127.0.0.1:" + server.address().port + "/desktop-bridge/" + method, {
  method: "POST", headers: { "content-type": "application/json", ...(authenticated ? { authorization: "test-session" } : {}) },
  body: JSON.stringify({ type: "client-request", rpcId: "external-url-test", method, payload })
 });
 const text = await response.text();
 assert.ok(!text.includes(process.env.DSH_DESKTOP_BRIDGE_TOKEN), "bridge token leaked to RPC response");
 return { status: response.status, text };
}
try {
 const unauthorized = await request("openExternalURL", { url: "https://example.com/unauthorized" }, false);
 assert.equal(unauthorized.status, 401);
 const valid = JSON.parse((await request("openExternalURL", { url: "https://example.com/docs" })).text);
 assert.deepEqual(valid, { type: "server-response", rpcId: "external-url-test", result: { ok: true, value: { ok: true } } });
 const failed = JSON.parse((await request("openExternalURL", { url: "https://example.com/failure" })).text);
 assert.equal(failed.result.ok, false);
 assert.equal(failed.result.error.message, "launcher failed");
 assert.equal(failed.result.error.details.status, 409);
 const invalid = JSON.parse((await request("openExternalURL", { url: 42 })).text);
 assert.equal(invalid.result.ok, false);
 assert.equal(invalid.result.error.details.status, 400);
 const forbidden = JSON.parse((await request("exec", { command: "echo forbidden" })).text);
 assert.equal(forbidden.result.error.code, "desktop-bridge/not-allowed");
} finally {
 server.closeAllConnections();
 await new Promise(resolve => server.close(resolve));
}
`)
	cmd.Env = bridge.env(cmd.Environ())
	if output, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("plugin RPC integration failed: %v\n%s", err, output)
	}
	for _, want := range []string{"https://example.com/docs", "https://example.com/failure"} {
		select {
		case got := <-host.calls:
			if got != want {
				t.Fatalf("native URL = %q, want %q", got, want)
			}
		default:
			t.Fatalf("missing native invocation for %q", want)
		}
	}
	select {
	case got := <-host.calls:
		t.Fatalf("unexpected native invocation: %q", got)
	default:
	}
}
