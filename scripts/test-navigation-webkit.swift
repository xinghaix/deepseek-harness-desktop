import AppKit
import WebKit

// Run from the repository root: swift scripts/test-navigation-webkit.swift
// Tests real WKWebView DOM/JSC; OS browser dispatch is mocked, not desktop E2E.
let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let goSource = try String(contentsOf: root.appendingPathComponent("internal/desktop/chrome.go"), encoding: .utf8)
let marker = "const desktopExternalJSTemplate = " + String(UnicodeScalar(96))
let policy = goSource.components(separatedBy: marker)[1].components(separatedBy: "\n" + String(UnicodeScalar(96)))[0]
let fixture = try String(contentsOf: root.appendingPathComponent("internal/desktop/testdata/navigation_dom.js"), encoding: .utf8)
let encoded = String(data: try JSONSerialization.data(withJSONObject: [policy]), encoding: .utf8)!
let app = NSApplication.shared
app.setActivationPolicy(.prohibited)
final class Runner: NSObject, WKNavigationDelegate {
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        webView.evaluateJavaScript(fixture + "\nJSON.stringify(runDesktopNavigationDOMTest((" + encoded + ")[0]));") { result, error in
            if let error = error { fputs("WKWebView regression failed: \(error)\n", stderr); exit(1) }
            print(result as? String ?? "missing result")
            exit(result is String ? 0 : 1)
        }
    }
}
let runner = Runner()
let webView = WKWebView(frame: NSRect(x: 0, y: 0, width: 900, height: 600))
webView.navigationDelegate = runner
webView.loadHTMLString("<!doctype html><html><body></body></html>", baseURL: nil)
DispatchQueue.main.asyncAfter(deadline: .now() + 30) { fputs("WKWebView regression timeout\n", stderr); exit(1) }
app.run()
