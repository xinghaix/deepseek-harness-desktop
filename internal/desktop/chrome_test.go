package desktop

import (
	"strings"
	"testing"
)

func TestDesktopChromeScriptEmbedsStylesBeforeMarkup(t *testing.T) {
	script := desktopChromeScript(false)
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
	for _, title := range []string{"Open desktop settings", "Minimize", "Maximize / Restore", "Close"} {
		if !strings.Contains(script, title) {
			t.Fatalf("chrome control title missing %q", title)
		}
	}
	if strings.Contains(script, "打开桌面设置") || strings.Contains(script, "最小化") {
		t.Fatal("chrome control titles must not stay hard-coded Chinese")
	}
	if strings.Contains(script, "dsh-desktop-native-drag") || strings.Contains(script, "ensureDragOverlay") || strings.Contains(script, "lastZoomClickTs") || strings.Contains(script, `drag.addEventListener("dblclick"`) {
		t.Fatal("非 macOS Chat 不应再绑定顶栏双击/命中带缩放")
	}
	if !strings.Contains(script, "dsh-desktop-chrome__drag") {
		t.Fatal("非 macOS Chat 必须保留自绘拖拽条")
	}
	if !strings.Contains(desktopChromeCSS, "--wails-draggable: drag") {
		t.Fatal("非 macOS 拖拽条必须保留 --wails-draggable: drag")
	}
	if !strings.Contains(desktopChromeCSS, "--wails-draggable: no-drag") {
		t.Fatal("非 macOS 窗控按钮必须标记 no-drag")
	}
	if !strings.Contains(script, "main.DSH.ToggleChatZoom") {
		t.Fatal("非 macOS 最大化按钮仍应走 Go ToggleChatZoom")
	}
	if !strings.Contains(script, "window.open") || !strings.Contains(script, "127.0.0.1") || !strings.Contains(script, "preventDefault") {
		t.Fatal("非 macOS Chat 必须注入 loopback 导航防护")
	}
}

func TestDesktopChromeScriptNativeMacReservesTransparentTitlebarInset(t *testing.T) {
	script := desktopChromeScript(true)
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
	if strings.Contains(script, "action-pill") || strings.Contains(script, "ActionPill") {
		t.Fatal("Chat 窗口不应注入已移除的操作胶囊")
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
	if strings.Contains(script, "dsh-desktop-native-drag") || strings.Contains(script, "lastZoomClickTs") || strings.Contains(script, "onZoomBandMouseDown") || strings.Contains(script, "ensureDragOverlay") {
		t.Fatal("macOS Chat 不应再注入顶栏双击缩放命中带")
	}
	if strings.Contains(desktopNativeWindowInsetCSS, "dsh-desktop-native-drag") {
		t.Fatal("macOS inset CSS 不应再包含缩放命中带")
	}
	if !strings.Contains(script, "InvisibleTitleBarHeight") && !strings.Contains(script, "Chat drag: InvisibleTitleBarHeight") {
		t.Fatal("macOS Chat 应保留原生拖拽说明（InvisibleTitleBarHeight）")
	}
	if !strings.Contains(script, "MutationObserver") {
		t.Fatal("macOS sidebar 折叠观察仍应保留 MutationObserver")
	}
	if !strings.Contains(script, "window.open") || !strings.Contains(script, "preventDefault") {
		t.Fatal("macOS Chat 必须注入 loopback 导航防护")
	}
}

func TestEscapeWailsCSS(t *testing.T) {
	got := escapeWailsCSS("a\\b'c\r\nd")
	if got != `a\\b\'c\r\nd` {
		t.Fatalf("escapeWailsCSS() = %q", got)
	}
}
