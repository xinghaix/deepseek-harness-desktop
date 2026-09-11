package dsh

import (
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func TestWriteWebviewBootOverlay(t *testing.T) {
	dir := t.TempDir()
	patch, err := writeWebviewBootOverlay(dir)
	if err != nil {
		t.Fatal(err)
	}
	want := filepath.Join(dir, webviewBootDirName, "cordis.patch.yml")
	if patch != want {
		t.Fatalf("patch = %q, want %q", patch, want)
	}
	index := filepath.Join(dir, webviewBootDirName, "index.js")
	pkg := filepath.Join(dir, webviewBootDirName, "package.json")
	for _, path := range []string{patch, index, pkg} {
		if _, err := os.Stat(path); err != nil {
			t.Fatal(err)
		}
	}
	patchText, err := os.ReadFile(patch)
	if err != nil {
		t.Fatal(err)
	}
	for _, fragment := range []string{"desktop-webview-boot", "name: ./index.js"} {
		if !strings.Contains(string(patchText), fragment) {
			t.Fatalf("patch missing %q", fragment)
		}
	}
	indexText, err := os.ReadFile(index)
	if err != nil {
		t.Fatal(err)
	}
	for _, fragment := range []string{"__DSH_TRANSPORT__", "loadBundle", "script-preload", "(0, eval)"} {
		if !strings.Contains(string(indexText), fragment) {
			t.Fatalf("boot plugin missing %q", fragment)
		}
	}
}

func TestWebCLIArgs(t *testing.T) {
	got := webCLIArgs([]string{"/tmp/boot.patch.yml", "/tmp/bridge.patch.yml"}, 0)
	want := []string{"web", "--patch", "/tmp/boot.patch.yml", "--patch", "/tmp/bridge.patch.yml", "--host", "127.0.0.1", "--port", "0", "--no-open"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("%q", got)
	}
	if !reflect.DeepEqual(webCLIArgs(nil, 1), []string{"web", "--host", "127.0.0.1", "--port", "1", "--no-open"}) {
		t.Fatal("empty patches should omit --patch")
	}
	if !isWebSubcommand(got) {
		t.Fatal("patched web launch must still be recognized as web")
	}
	if isWebSubcommand([]string{"--version"}) {
		t.Fatal("version check is not a web launch")
	}
	if isWebSubcommand([]string{"--patch", "web.yml", "--help"}) {
		t.Fatal("patch value named web.yml is not the web subcommand")
	}
}

func TestWithNodeMaxHTTPHeaderSize(t *testing.T) {
	got := withNodeMaxHTTPHeaderSize(nil, 128<<10)
	if envValue(got, "NODE_OPTIONS") != "--max-http-header-size=131072" {
		t.Fatalf("%q", got)
	}
	kept := withNodeMaxHTTPHeaderSize([]string{"NODE_OPTIONS=--max-http-header-size=8192"}, 128<<10)
	if envValue(kept, "NODE_OPTIONS") != "--max-http-header-size=8192" {
		t.Fatalf("must preserve user value: %q", kept)
	}
	merged := withNodeMaxHTTPHeaderSize([]string{"NODE_OPTIONS=--enable-source-maps"}, 128<<10)
	if envValue(merged, "NODE_OPTIONS") != "--enable-source-maps --max-http-header-size=131072" {
		t.Fatalf("%q", merged)
	}
}
