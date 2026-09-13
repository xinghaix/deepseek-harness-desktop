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
	if !strings.Contains(script, "zoomBand") || !strings.Contains(script, "lastZoomClickTs") || !strings.Contains(script, "onZoomBandMouseDown") {
		t.Fatal("非 macOS Chat 必须用顶栏 click-timing 触发缩放")
	}
	if !strings.Contains(script, `drag.addEventListener("dblclick"`) || !strings.Contains(script, "ToggleMaximise") {
		t.Fatal("非 macOS Chat 仍应保留 dblclick + ToggleMaximise 回退")
	}
	if !strings.Contains(script, "main.DSH.ToggleChatZoom") {
		t.Fatal("非 macOS Chat 缩放必须优先走 Go ToggleChatZoom")
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
	if !strings.Contains(script, "trafficLightClearance") || !strings.Contains(script, "dsh-desktop-native-drag") {
		t.Fatal("macOS Chat 必须保留顶栏缩放命中带（避让交通灯）")
	}
	if !strings.Contains(script, "lastZoomClickTs") || !strings.Contains(script, "onZoomBandMouseDown") || !strings.Contains(script, "400") {
		t.Fatal("macOS Chat 必须用 click-timing 缩放（不依赖 WebKit dblclick / AppleActionOnDoubleClick）")
	}
	if !strings.Contains(script, `setProperty("--wails-draggable", "no-drag")`) {
		t.Fatal("macOS 缩放命中带必须 no-drag，避免 Wails drag.ts 劫持为 AppleActionOnDoubleClick")
	}
	if strings.Contains(script, `setProperty("--wails-draggable", "drag")`) {
		t.Fatal("macOS 缩放命中带不得再设 --wails-draggable: drag（会走系统双击偏好）")
	}
	if !strings.Contains(script, "ensureDragOverlay") || !strings.Contains(script, "MutationObserver") || !strings.Contains(script, "setInterval") {
		t.Fatal("macOS 命中带必须在 SPA 移除后可重建（MutationObserver / 周期检查）")
	}
	if !strings.Contains(script, "main.DSH.ToggleChatZoom") {
		t.Fatal("macOS Chat 缩放必须优先走 Go ToggleChatZoom")
	}
	if !strings.Contains(desktopNativeWindowInsetCSS, "dsh-desktop-native-drag") || !strings.Contains(desktopNativeWindowInsetCSS, "--wails-draggable: no-drag") {
		t.Fatal("macOS 必须注入 no-drag 缩放命中带 CSS")
	}
	if !strings.Contains(desktopNativeWindowInsetCSS, "height: 52px") {
		t.Fatal("macOS 命中带高度应对齐实用顶栏 zoomBand")
	}
}

func TestEscapeWailsCSS(t *testing.T) {
	got := escapeWailsCSS("a\\b'c\r\nd")
	if got != `a\\b\'c\r\nd` {
		t.Fatalf("escapeWailsCSS() = %q", got)
	}
}
