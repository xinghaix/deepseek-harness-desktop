package desktop

import (
	"os/exec"
	"strings"
	"testing"
)

func TestDesktopClipboardScriptContainsFallback(t *testing.T) {
	for _, nativeMac := range []bool{false, true} {
		script := desktopChromeScript(nativeMac)
		for _, fragment := range []string{
			"installClipboardFallback",
			"document.execCommand",
			"robustWriteText",
			"__DSH_DESKTOP_COPY_TEXT__",
		} {
			if !strings.Contains(script, fragment) {
				t.Fatalf("nativeMac=%v: missing clipboard fragment %q", nativeMac, fragment)
			}
		}
	}
}

func TestDesktopClipboardScriptReplay(t *testing.T) {
	node, err := exec.LookPath("node")
	if err != nil {
		t.Skip("node unavailable")
	}

	nodeScript := `
const vm = require("node:vm");
const assert = require("node:assert/strict");
const fs = require("node:fs");

let execCommandCalled = false;
let execCommandVal = "";
let nativeBridgeCalled = false;
let nativeBridgeVal = "";

const document = {
  querySelector: () => null,
  getElementById: () => null,
  addEventListener: () => {},
  createElement: (tag) => {
    return {
      tagName: tag.toUpperCase(),
      setAttribute: () => {},
      dataset: {},
      style: {},
      append: () => {},
      appendChild: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      focus: () => {},
      select: () => {},
      setSelectionRange: () => {},
      remove: () => {},
      value: "",
    };
  },
  documentElement: {
    appendChild: () => {},
    classList: { toggle: () => {} },
  },
  head: {
    appendChild: () => {},
  },
  body: {
    appendChild: (el) => {
      execCommandVal = el.value;
      return el;
    },
  },
  execCommand: (cmd) => {
    if (cmd === "copy") {
      execCommandCalled = true;
      return true;
    }
    return false;
  },
};

const navigator = {
  clipboard: {
    writeText: () => Promise.reject(new Error("NotAllowedError: user gesture expired")),
  },
};

const window = {
  navigator,
  setTimeout: () => {},
  clearTimeout: () => {},
  __DSH_DESKTOP_COPY_TEXT__: (text) => {
    nativeBridgeCalled = true;
    nativeBridgeVal = text;
    return Promise.resolve();
  },
};

const scriptSource = fs.readFileSync(0, "utf8");
vm.runInNewContext(scriptSource, {
  document,
  window,
  navigator,
  URL,
  DOMException: class extends Error {
    constructor(msg, name) {
      super(msg);
      this.name = name;
    }
  },
  location: new URL("http://127.0.0.1:3080/"),
});

(async () => {
  // Replay the official code-block copy contract: writeText success controls the UI state.
  let copiedState = false;
  const copyCodeBlock = async () => {
    try {
      await navigator.clipboard.writeText("code block copy test");
      copiedState = true;
      return true;
    } catch (_) {
      return false;
    }
  };
  assert.equal(await copyCodeBlock(), true, "the copy button handler must resolve successfully");
  assert.equal(copiedState, true, "the copy button must show its copied state");
  assert.equal(execCommandCalled, true, "execCommand must be called after browser clipboard rejection");
  assert.equal(execCommandVal, "code block copy test", "textarea must receive the copied text");

  // If the synchronous fallback is blocked too, use the authenticated native bridge.
  document.execCommand = () => false;
  await navigator.clipboard.writeText("bridge fallback test");
  assert.equal(nativeBridgeCalled, true, "native bridge must be called when execCommand fails");
  assert.equal(nativeBridgeVal, "bridge fallback test", "native bridge must receive copied text");
})();
`

	cmd := exec.Command(node, "--input-type=commonjs", "-e", nodeScript)
	cmd.Stdin = strings.NewReader(desktopChromeScript(false))
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("clipboard replay failed: %v: %s", err, string(out))
	}
}
