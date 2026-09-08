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
	if !strings.Contains(script, "position: fixed") || !strings.Contains(script, "dsh-window-content") || !strings.Contains(script, "48px") || strings.Contains(script, "%!") {
		t.Fatal("窗口控制条样式未正确嵌入脚本")
	}
	if strings.Contains(script, "\n  color-scheme:") {
		t.Fatal("窗口控制条不应覆盖 Chat 页面全局主题")
	}
}

func TestDesktopChromeScriptNativeMacReservesTransparentTitlebarInset(t *testing.T) {
	script := desktopChromeScript(false, true)
	if !strings.Contains(desktopSidebarTransitionCSS, "grid-template-columns var(--ds-transition-duration-slow)") || !strings.Contains(desktopSidebarTransitionCSS, "padding-right var(--ds-transition-duration-slow)") {
		t.Fatal("Chat sidebar 必须同时保留列宽与右侧布局过渡")
	}
	if !strings.Contains(desktopSidebarTransitionCSS, "transition: none !important") {
		t.Fatal("Chat sidebar 拖拽和减少动效状态必须禁用过渡")
	}
	if !strings.Contains(script, "dsh-window-sidebar") || !strings.Contains(script, "data-slot='sidebar'") || !strings.Contains(script, "firstElementChild") || !strings.Contains(script, "const topInset = 36") {
		t.Fatal("macOS 左侧 sidebar 未预留原生标题栏安全区")
	}
	if !strings.Contains(desktopNativeWindowInsetCSS, "#root [data-slot=\"sidebar\"] > :first-child") || !strings.Contains(desktopNativeWindowInsetCSS, "84px") || !strings.Contains(desktopNativeWindowInsetCSS, "var(--dsh-window-top-inset, 36px)") {
		t.Fatal("macOS sidebar 缺少不依赖异步脚本的 CSS 兜底选择器")
	}
	if !strings.Contains(desktopNativeWindowInsetCSS, "var(--dsh-window-top-inset, 36px) + 6px") || !strings.Contains(desktopNativeWindowInsetCSS, "var(--dsh-window-top-inset, 36px) + 18px") {
		t.Fatal("macOS sidebar 未保留 DSH 展开/折叠原生顶部节奏")
	}
	if !strings.Contains(script, "dsh-window-wide-rail") || !strings.Contains(script, "gridTemplateColumns") || !strings.Contains(script, "84px") || strings.Contains(script, "dsh-native-sidebar-cap") {
		t.Fatal("macOS 原生折叠轨道未对齐交通灯安全区")
	}
	if !strings.Contains(script, "let actionPillEnabled = false") || !strings.Contains(script, "__dshDesktopActionPillSetEnabled") {
		t.Fatal("默认模式必须保留可动态切换的隐藏胶囊控制器")
	}
	if strings.Contains(script, ".dsh-window-content:not(.dsh-window-management)") {
		t.Fatal("macOS Chat 不应给整个 root 增加顶部内边距")
	}
	if strings.Contains(script, "margin-top:") || strings.Contains(script, "height: calc(100% -") {
		t.Fatal("macOS 页面不应通过外边距或减高度制造上下空白")
	}
	if strings.Contains(script, "dsh-desktop-chrome__controls") {
		t.Fatal("macOS 不应注入自绘控制按钮")
	}
}

func TestDesktopChromeScriptActionPillMode(t *testing.T) {
	script := desktopChromeScriptWithMode(false, true, true)
	for _, fragment := range []string{
		"dsh-desktop-action-pill", "data-sidebar-collapsed", "ResizeObserver",
		"findCenter", "展开侧边栏", "新建会话", "搜索会话", "OpenManagement",
		"let actionPillEnabled = true", "__dshDesktopActionPillSetEnabled",
	} {
		if !strings.Contains(script, fragment) {
			t.Fatalf("横向操作胶囊脚本缺少 %q", fragment)
		}
	}
	if !strings.Contains(script, "84px") || !strings.Contains(script, "dsh-window-wide-rail") || !strings.Contains(script, "gridTemplateColumns") {
		t.Fatal("横向操作胶囊模式的原生折叠轨道未保持交通灯安全区")
	}
	if !strings.Contains(desktopActionPillCSS, "#dsh-desktop-action-pill[data-visible=\"true\"]") {
		t.Fatal("横向操作胶囊缺少折叠态显示样式")
	}
}

func TestEscapeWailsCSS(t *testing.T) {
	got := escapeWailsCSS("a\\b'c\r\nd")
	if got != `a\\b\'c\r\nd` {
		t.Fatalf("escapeWailsCSS() = %q", got)
	}
}
