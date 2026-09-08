//go:build wails

package main

import (
	"strings"
	"testing"
)

func TestDesktopChromeScriptEmbedsStylesBeforeMarkup(t *testing.T) {
	script := desktopChromeScript(true, false)
	styleIndex := strings.Index(script, `style.textContent =`)
	markupIndex := strings.Index(script, `document.documentElement.appendChild(chrome)`)
	if styleIndex < 0 || markupIndex < 0 || styleIndex > markupIndex {
		t.Fatal("窗口控制条必须在创建 DOM 前内联注入样式")
	}
	if !strings.Contains(script, "position: fixed") || strings.Contains(script, "%!") {
		t.Fatal("窗口控制条样式未正确嵌入脚本")
	}
}
