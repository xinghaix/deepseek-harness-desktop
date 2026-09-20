//go:build wails

// Navigation probe is a manual native-WebView regression fixture.
// Run baseline: go run -tags wails,production ./tools/navigation-probe
// Run client path: go run -tags wails,production ./tools/navigation-probe -bridge
// It does not start DSH, touch user configuration, or open a system browser.
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"strings"
	"sync/atomic"
	"time"

	"deepseek-harness-desktop/internal/desktop"
	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

// DSH is a real registered native service, not a renderer bridge replacement.
// Only the final native side effect is recorded instead of opening a browser.
type DSH struct {
	controlPings  atomic.Int32
	remotePings   atomic.Int32
	externalCalls atomic.Int32
	windowActions [5]atomic.Int32
}

var probeWindowActions = [...]string{"minimize", "maximize", "close", "settings", "dismiss-config"}

// Record the real HTTP/native boundary; deliberately do not manipulate any window.
func (d *DSH) RecordWindowAction(action string) error {
	for index, allowed := range probeWindowActions {
		if action == allowed {
			d.windowActions[index].Add(1)
			return nil
		}
	}
	return fmt.Errorf("unexpected fixture action %q", action)
}

func (d *DSH) actionSnapshot() map[string]int32 {
	counts := make(map[string]int32, len(probeWindowActions))
	for index, action := range probeWindowActions {
		counts[action] = d.windowActions[index].Load()
	}
	return counts
}

func (d *DSH) Ping(source string) string {
	if source == "control" {
		d.controlPings.Add(1)
	} else {
		d.remotePings.Add(1)
	}
	return "native-pong"
}

func (d *DSH) OpenExternalURL(raw string) error {
	d.externalCalls.Add(1)
	return nil
}

type report struct {
	NativeActions map[string]int32 `json:"nativeActions,omitempty"`
	Queued        int              `json:"queued"`
	BeforeReady   int              `json:"beforeReady"`
	RuntimeStatus string           `json:"runtimeStatus"`
	Callbacks     int              `json:"callbacks"`
	JSErrors      []string         `json:"jsErrors,omitempty"`
	Stage         string           `json:"stage"`
	Origin        string           `json:"origin"`
	Wails         string           `json:"wails"`
	Call          string           `json:"call"`
	Invoke        string           `json:"invoke"`
	Pong          string           `json:"pong"`
	Error         string           `json:"error"`
	Alerts        []string         `json:"alerts,omitempty"`
	ClientReady   bool             `json:"clientReady"`
}

const remoteProbe = `
;setTimeout(async () => {
 const reload = sessionStorage.getItem("readinessReload") === "1";
 const result = {stage:reload ? "remote-reload" : "remote",origin:location.origin,wails:typeof window.wails,
   call:typeof window.wails?.Call?.ByName,invoke:typeof window._wails?.invoke};
 try {
   if (window.__NAV_PROBE_READINESS__) {
     await fetch("/queue", {method:"POST"});
     await new Promise(resolve => setTimeout(resolve, 50));
     result.beforeReady = window.__NAV_PROBE_QUEUED__ || 0;
     if (window.__NAV_PROBE_START_READY__) window.__NAV_PROBE_START_READY__();
     await new Promise(resolve => setTimeout(resolve, 200));
     result.queued = window.__NAV_PROBE_QUEUED__ || 0;
     if (window.__NAV_PROBE_START_READY__) {
       await fetch("/callbacks", {method:"POST"});
       await new Promise(resolve => setTimeout(resolve, 50));
     }
     result.callbacks = window.__NAV_PROBE_CALLBACKS__ || 0;
     result.jsErrors = window.__NAV_PROBE_JS_ERRORS__;
     result.runtimeStatus = window.__DSH_DESKTOP_CHAT_RUNTIME__?.status || "absent";
   }
   if (window.__NAV_PROBE_CLIENT_ERROR__) throw new Error(window.__NAV_PROBE_CLIENT_ERROR__);
   result.clientReady = window.__NAV_PROBE_CLIENT_READY__ === true;
   if (result.clientReady) {
     for (const action of ["minimize", "maximize", "close", "settings", "dismiss-config"]) {
       window.__DSH_DESKTOP_REQUEST_WINDOW_ACTION__(action);
     }
   }
   if (typeof window.wails?.Call?.ByName === "function") {
     result.pong = await window.wails.Call.ByName("main.DSH.Ping", "remote");
   }
   const link = document.createElement("a");
   link.href = "https://example.invalid/native-navigation-probe";
   link.textContent = "Native external navigation probe";
   document.body.append(link);
   link.click();
   window.open("https://example.invalid/native-navigation-probe", "_blank");
 } catch (error) { result.error = String(error); }
 await new Promise(resolve => setTimeout(resolve, 150));
 if (window.__NAV_PROBE_RPC_PENDING__) await Promise.allSettled([...window.__NAV_PROBE_RPC_PENDING__]);
 result.origin = location.origin;
 result.alerts = window.__NAV_PROBE_ALERTS__;
 await fetch("/report", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(result)});
 if (window.__NAV_PROBE_READINESS__ && !reload) {sessionStorage.setItem("readinessReload", "1");location.reload();}
}, 250);
`

const controlHTML = `<!doctype html><html><body>Embedded native runtime control
<script type="module">
 import {Call} from "/wails/runtime.js";
 const result = {stage:"control",origin:location.origin,wails:typeof window.wails,
   call:typeof window.wails?.Call?.ByName,invoke:typeof window._wails?.invoke};
 try { result.pong = await Call.ByName("main.DSH.Ping", "control"); }
 catch(error) { result.error = String(error); }
 await fetch("/report", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(result)});
</script></body></html>`

func main() {
	bridge := flag.Bool("bridge", false, "load unchanged production client and test real HTTP RPC to recording Go handler")
	readiness := flag.String("readiness", "", "queue probe: baseline or minimal")
	flag.Parse()
	if err := run(*bridge, *readiness); err != nil {
		fmt.Fprintln(os.Stderr, "FAIL:", err)
		os.Exit(1)
	}
}

func run(bridge bool, readiness string) error {
	if readiness != "" && readiness != "baseline" && readiness != "minimal" {
		return fmt.Errorf("invalid readiness mode %q", readiness)
	}
	var remoteWindow *application.WebviewWindow
	var runtimeReady atomic.Int32
	service := &DSH{}
	reports := make(chan report, 4)
	reportHandler := func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "POST required", 405)
			return
		}
		var item report
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&item); err != nil {
			http.Error(w, "invalid report", 400)
			return
		}
		if item.Stage != "control" {
			item.NativeActions = service.actionSnapshot()
		}
		select {
		case reports <- item:
			w.WriteHeader(http.StatusNoContent)
		default:
			http.Error(w, "too many reports", 429)
		}
	}
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return err
	}
	remoteOrigin := "http://" + listener.Addr().String()
	remote := http.NewServeMux()
	remote.HandleFunc("/report", reportHandler)
	remote.HandleFunc("/callbacks", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "POST required", 405)
			return
		}
		remoteWindow.ExecJS(`try {
   const w = window._wails;
   w.dispatchWailsEvent({name:"probe:callback"});
   w.setResizable(true);
   w.handleDragEnter();w.handleDragOver(1,2);w.handleDragLeave();
   w.handlePlatformFileDrop([],1,2);
   window.__NAV_PROBE_CALLBACKS__ = 1;
  } catch(error) {window.__NAV_PROBE_JS_ERRORS__.push(String(error));}`)
		w.WriteHeader(http.StatusNoContent)
	})
	remote.HandleFunc("/queue", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "POST required", 405)
			return
		}
		remoteWindow.ExecJS(`window.__NAV_PROBE_QUEUED__ = (window.__NAV_PROBE_QUEUED__ || 0) + 1;`)
		w.WriteHeader(http.StatusNoContent)
	})
	if bridge {
		if err := installClientFixture(remote, service); err != nil {
			listener.Close()
			return err
		}
	}
	remote.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		fmt.Fprint(w, "<!doctype html><html><body><h1>Remote native navigation probe</h1>")
		if bridge {
			fmt.Fprint(w, `<script src="/client-bootstrap.js"></script><script src="/client.js"></script>`)
		}
		fmt.Fprint(w, "</body></html>")
	})
	server := &http.Server{Handler: remote, ReadHeaderTimeout: 2 * time.Second}
	defer server.Close()
	go func() {
		if err := server.Serve(listener); err != nil && err != http.ErrServerClosed {
			log.Printf("fixture HTTP: %v", err)
		}
	}()
	assets := http.NewServeMux()
	assets.HandleFunc("/report", reportHandler)
	assets.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		fmt.Fprint(w, controlHTML)
	})
	app := application.New(application.Options{
		Name:     "DSH isolated navigation probe",
		Services: []application.Service{application.NewService(service)},
		Assets:   application.AssetOptions{Handler: assets},
		Mac:      application.MacOptions{ApplicationShouldTerminateAfterLastWindowClosed: false},
	})
	options := desktop.ChatWindowOptions(remoteOrigin + "/")
	options.Title = "Isolated remote navigation probe"
	if readiness != "" {
		const begin = "/* DSH_CHAT_RUNTIME_BEGIN */"
		const end = "/* DSH_CHAT_RUNTIME_END */"
		start, finish := strings.Index(options.JS, begin), strings.Index(options.JS, end)
		if start < 0 || finish < start {
			return fmt.Errorf("production Chat runtime helper missing from options.JS")
		}
		finish += len(end)
		bootstrap := options.JS[start:finish]
		options.JS = options.JS[:start] + options.JS[finish:]
		if readiness == "minimal" {
			// Execute the exact production helper twice: same-document reinjection must not signal twice.
			options.JS += `;window.__NAV_PROBE_START_READY__=()=>{` + bootstrap + bootstrap + `};`
		}
	}
	// Capture only modal presentation; the native Wails bridge remains untouched.
	options.JS = `window.__NAV_PROBE_ALERTS__=[];window.alert=(message)=>window.__NAV_PROBE_ALERTS__.push(String(message));` + options.JS + remoteProbe
	if readiness != "" {
		options.JS = `window.__NAV_PROBE_READINESS__=true;window.__NAV_PROBE_JS_ERRORS__=[];window.addEventListener("error",event=>window.__NAV_PROBE_JS_ERRORS__.push(event.message));` + options.JS
	}

	remoteWindow = app.Window.NewWithOptions(options)
	remoteWindow.RegisterHook(events.Common.WindowRuntimeReady, func(*application.WindowEvent) { runtimeReady.Add(1) })
	app.Window.NewWithOptions(application.WebviewWindowOptions{
		Name: "control", Title: "Isolated embedded native control", URL: "/", Width: 500, Height: 250,
	})
	outcome := make(chan error, 1)
	go func() {
		timer := time.NewTimer(12 * time.Second)
		defer timer.Stop()
		seen := make(map[string]report)
		var failure error
		expectedReports := 2
		if readiness != "" {
			expectedReports = 3
		}
	collect:
		for len(seen) < expectedReports {
			select {
			case item := <-reports:
				if item.Stage != "remote" && item.Stage != "control" && item.Stage != "remote-reload" {
					failure = fmt.Errorf("unknown report stage %q", item.Stage)
					break collect
				}
				seen[item.Stage] = item
				encoded, _ := json.Marshal(item)
				fmt.Println(string(encoded))
			case <-timer.C:
				failure = fmt.Errorf("native fixture timed out: received %d/%d reports", len(seen), expectedReports)
				break collect
			}
		}
		if failure == nil {
			remote, control := seen["remote"], seen["control"]
			externalWant := int32(2)
			if readiness != "" {
				externalWant = 4
			}
			if remote.Origin != remoteOrigin || remote.Call != "undefined" || remote.Invoke != "function" || remote.Error != "" {
				failure = fmt.Errorf("remote runtime differs from missing-Call baseline: %+v", remote)
			} else if control.Pong != "native-pong" || control.Error != "" || service.controlPings.Load() != 1 {
				failure = fmt.Errorf("embedded control did not reach real Go service: %+v", control)
			} else if service.remotePings.Load() != 0 {
				failure = fmt.Errorf("baseline unexpectedly reached native Go: remotePing=%d external=%d", service.remotePings.Load(), service.externalCalls.Load())
			} else if bridge && (!remote.ClientReady || service.externalCalls.Load() != externalWant || len(remote.Alerts) != 0) {
				failure = fmt.Errorf("client bridge path failed: ready=%t externalCalls=%d alerts=%v", remote.ClientReady, service.externalCalls.Load(), remote.Alerts)
			} else if !bridge && (remote.ClientReady || service.externalCalls.Load() != 0 || len(remote.Alerts) != 2) {
				failure = fmt.Errorf("no-client fallback failed: ready=%t externalCalls=%d alerts=%v", remote.ClientReady, service.externalCalls.Load(), remote.Alerts)
			} else {
				fmt.Printf("PASS: bridge=%t; remote Call missing; remote Ping=0; external native calls=%d; alerts=%d; embedded native Ping=1\n", bridge, service.externalCalls.Load(), len(remote.Alerts))
			}
		}
		if failure == nil && bridge {
			for _, stage := range []string{"remote", "remote-reload"} {
				item, exists := seen[stage]
				if !exists {
					continue
				}
				want := int32(1)
				if stage == "remote-reload" {
					want = 2
				}
				for _, action := range probeWindowActions {
					if item.NativeActions[action] != want {
						failure = fmt.Errorf("%s action %s count=%d want=%d", stage, action, item.NativeActions[action], want)
					}
				}
			}
			if failure == nil {
				fmt.Printf("PASS: production window-action helper -> client -> HTTP -> recording Go handler, counts=%v\n", service.actionSnapshot())
			}
		}
		if failure == nil && readiness != "" {
			want := int32(0)
			status := "absent"
			if readiness == "minimal" {
				want = 1
				status = "ready"
			}
			if runtimeReady.Load() != want*2 {
				failure = fmt.Errorf("readiness=%s hostReady=%d want=%d", readiness, runtimeReady.Load(), want*2)
			}
			for _, stage := range []string{"remote", "remote-reload"} {
				item := seen[stage]
				beforeWant := 0
				if stage == "remote-reload" {
					beforeWant = int(want)
				}
				if item.BeforeReady != beforeWant || item.Queued != int(want) || item.Callbacks != int(want) || len(item.JSErrors) != 0 || item.RuntimeStatus != status || item.Call != "undefined" || item.Error != "" || item.Origin != remoteOrigin {
					failure = fmt.Errorf("readiness=%s stage=%s unexpected report: %+v", readiness, stage, item)
				}
			}
			if failure == nil {
				fmt.Printf("PASS: readiness=%s hostReady=%d queued=%d each document; initial/reload; repeated bootstrap idempotent; no JS errors\n", readiness, runtimeReady.Load(), want)
			}
		}
		outcome <- failure
		app.Quit()
	}()
	if err := app.Run(); err != nil {
		return err
	}
	select {
	case err := <-outcome:
		return err
	default:
		return fmt.Errorf("probe windows closed before results")
	}
}
