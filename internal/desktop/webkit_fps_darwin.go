//go:build wails && darwin

package desktop

/*
#cgo CFLAGS: -mmacosx-version-min=10.13 -x objective-c
#cgo LDFLAGS: -framework Cocoa -framework WebKit -framework Foundation

#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>
#import <objc/runtime.h>
#include <libproc.h>
#include <string.h>
#include <sys/proc_info.h>
#include <unistd.h>

static char dshWindowBridgeControllerKey;

static void dshApplyWindowBackgroundColorToView(NSView *view, NSColor *colour) {
	if (view == nil || colour == nil) {
		return;
	}
	if ([view isKindOfClass:[WKWebView class]]) {
		WKWebView *webView = (WKWebView *)view;
#if MAC_OS_X_VERSION_MAX_ALLOWED >= 120000
		if (@available(macOS 12.0, *)) {
			webView.underPageBackgroundColor = colour;
		}
#endif
		webView.wantsLayer = YES;
		if (webView.layer != nil) {
			webView.layer.backgroundColor = colour.CGColor;
		}
		@try {
			[webView setValue:colour forKey:@"backgroundColor"];
		} @catch (NSException *ex) {
		}
		// 关闭 WKWebView 内部默认的纯白底色填充（drawsBackground=NO），
		// 使放大/拖拽调整窗口大小时未完成分块光栅化的右下角直接透出同色原生背景，不再闪白。
		@try {
			[webView setValue:@NO forKey:@"drawsBackground"];
		} @catch (NSException *ex) {
		}
		return;
	}
	for (NSView *child in view.subviews) {
		dshApplyWindowBackgroundColorToView(child, colour);
	}
}

static void dshApplyWindowBackgroundColorToWindow(NSWindow *window, int r, int g, int b) {
	if (window == nil) {
		return;
	}
	int clampedR = r < 0 ? 0 : (r > 255 ? 255 : r);
	int clampedG = g < 0 ? 0 : (g > 255 ? 255 : g);
	int clampedB = b < 0 ? 0 : (b > 255 ? 255 : b);
	NSColor *colour = [NSColor colorWithSRGBRed:(clampedR / 255.0)
	                                      green:(clampedG / 255.0)
	                                       blue:(clampedB / 255.0)
	                                      alpha:1.0];
	[window setBackgroundColor:colour];
	[window setOpaque:YES];
	NSView *contentView = [window contentView];
	if (contentView != nil) {
		contentView.wantsLayer = YES;
		if (contentView.layer != nil) {
			contentView.layer.backgroundColor = colour.CGColor;
		}
		dshApplyWindowBackgroundColorToView(contentView, colour);
	}
}

@interface DSHWindowBridgeMessageHandler : NSObject <WKScriptMessageHandler>
@end

@implementation DSHWindowBridgeMessageHandler
- (void)userContentController:(WKUserContentController *)controller didReceiveScriptMessage:(WKScriptMessage *)message {
	WKWebView *webView = message.webView;
	if (webView == nil || webView.window == nil) {
		return;
	}
	NSWindow *window = webView.window;
	if ([message.name isEqualToString:@"dshWindowAction"]) {
		if (![message.body isKindOfClass:[NSString class]]) {
			return;
		}
		NSString *action = (NSString *)message.body;
		if ([action isEqualToString:@"maximize"]) {
			if (!([window styleMask] & NSWindowStyleMaskFullScreen)) {
				[window zoom:nil];
			}
		} else if ([action isEqualToString:@"minimize"]) {
			if (![window isMiniaturized]) {
				[window miniaturize:nil];
			}
		}
		return;
	}
	if ([message.name isEqualToString:@"dshWindowBackground"]) {
		if (![message.body isKindOfClass:[NSDictionary class]]) {
			return;
		}
		NSDictionary *body = (NSDictionary *)message.body;
		NSNumber *r = [body[@"r"] isKindOfClass:[NSNumber class]] ? body[@"r"] : nil;
		NSNumber *g = [body[@"g"] isKindOfClass:[NSNumber class]] ? body[@"g"] : nil;
		NSNumber *b = [body[@"b"] isKindOfClass:[NSNumber class]] ? body[@"b"] : nil;
		if (r != nil && g != nil && b != nil) {
			dshApplyWindowBackgroundColorToWindow(window, r.intValue, g.intValue, b.intValue);
		}
		return;
	}
}
@end

static DSHWindowBridgeMessageHandler *dshWindowBridgeMessageHandler(void) {
	static DSHWindowBridgeMessageHandler *handler;
	static dispatch_once_t once;
	dispatch_once(&once, ^{
		handler = [DSHWindowBridgeMessageHandler new];
	});
	return handler;
}

static void dshAttachWindowBridgeToWebView(WKWebView *webView) {
	if (webView == nil) {
		return;
	}
	WKUserContentController *controller = webView.configuration.userContentController;
	if (controller == nil) {
		return;
	}
	if (objc_getAssociatedObject(controller, &dshWindowBridgeControllerKey) != nil) {
		return;
	}
	@try {
		DSHWindowBridgeMessageHandler *handler = dshWindowBridgeMessageHandler();
		[controller addScriptMessageHandler:handler name:@"dshWindowAction"];
		[controller addScriptMessageHandler:handler name:@"dshWindowBackground"];
		objc_setAssociatedObject(controller, &dshWindowBridgeControllerKey, @YES, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
	} @catch (NSException *ex) {
	}
}

static char dshWebViewFrameUpdatesDisabledKey;
static char dshWebViewInZoomLiveResizeKey;
static IMP dshOrigSetFrameDisplayIMP = NULL;
static IMP dshOrigSetFrameDisplayAnimateIMP = NULL;
static IMP dshOrigStartZoomAnimationDriverIMP = NULL;
static IMP dshOrigCancelZoomAnimationIMP = NULL;

static WKWebView *dshFindWebViewInView(NSView *view) {
	if (view == nil) {
		return nil;
	}
	if ([view isKindOfClass:[WKWebView class]]) {
		return (WKWebView *)view;
	}
	for (NSView *child in view.subviews) {
		WKWebView *found = dshFindWebViewInView(child);
		if (found != nil) {
			return found;
		}
	}
	return nil;
}

static BOOL dshBoolValueForKey(id obj, NSString *key) {
	if (obj == nil || key == nil) {
		return NO;
	}
	@try {
		id val = [obj valueForKey:key];
		if ([val respondsToSelector:@selector(boolValue)]) {
			return [val boolValue];
		}
	} @catch (NSException *ex) {
	}
	return NO;
}

static void dshSetWebViewFrameUpdatesDisabled(WKWebView *webView, BOOL disabled) {
	if (webView == nil) {
		return;
	}
	BOOL currentlyDisabled = [objc_getAssociatedObject(webView, &dshWebViewFrameUpdatesDisabledKey) boolValue];
	if (disabled == currentlyDisabled) {
		return;
	}
	SEL sel = NSSelectorFromString(disabled ? @"_disableFrameSizeUpdates" : @"_enableFrameSizeUpdates");
	if ([webView respondsToSelector:sel]) {
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Warc-performSelector-leaks"
		[webView performSelector:sel];
#pragma clang diagnostic pop
		objc_setAssociatedObject(webView, &dshWebViewFrameUpdatesDisabledKey, @(disabled), OBJC_ASSOCIATION_RETAIN_NONATOMIC);
	}
}

static void dshSetWebViewZoomLiveResize(WKWebView *webView, BOOL active) {
	if (webView == nil) {
		return;
	}
	BOOL currentlyActive = [objc_getAssociatedObject(webView, &dshWebViewInZoomLiveResizeKey) boolValue];
	if (active == currentlyActive) {
		return;
	}
	objc_setAssociatedObject(webView, &dshWebViewInZoomLiveResizeKey, @(active), OBJC_ASSOCIATION_RETAIN_NONATOMIC);
	if (active) {
		[webView viewWillStartLiveResize];
	} else {
		[webView viewDidEndLiveResize];
	}
}

// 消除 Wails v3 -zoom: 在探测 targetFrame 时用 display:YES 先跳到目标尺寸再跳回 startFrame 造成的首帧闪跳与双重重排，
// 并在 CADisplayLink 缩放动画期间开启 WKWebView 原生 liveResize 模式；动画时长保持 Wails 从 AppKit 获取的原值。
static void dshSwizzledSetFrameDisplay(id self, SEL _cmd, NSRect frameRect, BOOL displayFlag) {
	NSWindow *window = (NSWindow *)self;
	WKWebView *webView = dshFindWebViewInView([window contentView]);
	BOOL preparing = dshBoolValueForKey(self, @"preparingZoomAnimationTarget");
	if (preparing) {
		dshSetWebViewFrameUpdatesDisabled(webView, YES);
		displayFlag = NO;
	}
	((void (*)(id, SEL, NSRect, BOOL))dshOrigSetFrameDisplayIMP)(self, _cmd, frameRect, displayFlag);
	if (!preparing && webView != nil) {
		dshSetWebViewFrameUpdatesDisabled(webView, NO);
	}
}

static void dshSwizzledSetFrameDisplayAnimate(id self, SEL _cmd, NSRect frameRect, BOOL displayFlag, BOOL animateFlag) {
	NSWindow *window = (NSWindow *)self;
	WKWebView *webView = dshFindWebViewInView([window contentView]);
	BOOL preparing = dshBoolValueForKey(self, @"preparingZoomAnimationTarget");
	if (preparing) {
		dshSetWebViewFrameUpdatesDisabled(webView, YES);
		displayFlag = NO;
		animateFlag = NO;
	} else if (webView != nil && [objc_getAssociatedObject(webView, &dshWebViewFrameUpdatesDisabledKey) boolValue]) {
		// preparingZoomAnimationTarget 结束后的首個还原 startFrame 调用：不向屏幕刷新中间态，随后恢复 WebView 尺寸同步
		displayFlag = NO;
	}
	((void (*)(id, SEL, NSRect, BOOL, BOOL))dshOrigSetFrameDisplayAnimateIMP)(self, _cmd, frameRect, displayFlag, animateFlag);
	if (!preparing && webView != nil) {
		dshSetWebViewFrameUpdatesDisabled(webView, NO);
	}
}

static void dshSwizzledStartZoomAnimationDriver(id self, SEL _cmd) {
	NSWindow *window = (NSWindow *)self;
	WKWebView *webView = dshFindWebViewInView([window contentView]);
	if (webView != nil) {
		dshSetWebViewFrameUpdatesDisabled(webView, NO);
		dshSetWebViewZoomLiveResize(webView, YES);
	}
	// Do not override zoomAnimationDuration: Wails uses AppKit animationResizeTime:
	// for the native zoom/restore cadence. Rendering fixes must not shorten it.
	((void (*)(id, SEL))dshOrigStartZoomAnimationDriverIMP)(self, _cmd);
}

static void dshSwizzledCancelZoomAnimation(id self, SEL _cmd) {
	((void (*)(id, SEL))dshOrigCancelZoomAnimationIMP)(self, _cmd);
	NSWindow *window = (NSWindow *)self;
	WKWebView *webView = dshFindWebViewInView([window contentView]);
	if (webView != nil) {
		dshSetWebViewFrameUpdatesDisabled(webView, NO);
		dshSetWebViewZoomLiveResize(webView, NO);
	}
}

static void dshInstallSmoothWindowZoom(NSWindow *window) {
	if (window == nil) {
		return;
	}
	Class cls = [window class];
	if (cls == nil || ![NSStringFromClass(cls) isEqualToString:@"WebviewWindow"]) {
		return;
	}
	static dispatch_once_t once;
	dispatch_once(&once, ^{
		Method mSetFrame = class_getInstanceMethod(cls, @selector(setFrame:display:));
		if (mSetFrame != NULL) {
			dshOrigSetFrameDisplayIMP = method_setImplementation(mSetFrame, (IMP)dshSwizzledSetFrameDisplay);
		}
		Method mSetFrameAnim = class_getInstanceMethod(cls, @selector(setFrame:display:animate:));
		if (mSetFrameAnim != NULL) {
			dshOrigSetFrameDisplayAnimateIMP = method_setImplementation(mSetFrameAnim, (IMP)dshSwizzledSetFrameDisplayAnimate);
		}
		Method mStartDriver = class_getInstanceMethod(cls, NSSelectorFromString(@"startZoomAnimationDriver"));
		if (mStartDriver != NULL) {
			dshOrigStartZoomAnimationDriverIMP = method_setImplementation(mStartDriver, (IMP)dshSwizzledStartZoomAnimationDriver);
		}
		Method mCancelZoom = class_getInstanceMethod(cls, NSSelectorFromString(@"cancelZoomAnimation"));
		if (mCancelZoom != NULL) {
			dshOrigCancelZoomAnimationIMP = method_setImplementation(mCancelZoom, (IMP)dshSwizzledCancelZoomAnimation);
		}
	});
}

static const char dshSuppressTerminateReloadKey = 0;
static IMP dshOrigWebContentDidTerminateIMP = NULL;
static IMP dshOrigWebViewReloadIMP = NULL;

static WKNavigation *dshSwizzledWebViewReload(id self, SEL _cmd) {
	if ([objc_getAssociatedObject(self, &dshSuppressTerminateReloadKey) boolValue]) {
		return nil;
	}
	return ((WKNavigation *(*)(id, SEL))dshOrigWebViewReloadIMP)(self, _cmd);
}

static void dshSwizzledWebContentDidTerminate(id self, SEL _cmd, WKWebView *webView) {
	NSString *host = webView != nil && webView.URL != nil ? webView.URL.host : nil;
	BOOL isLoopbackChat = host != nil && ([host isEqualToString:@"127.0.0.1"] || [host isEqualToString:@"localhost"] || [host isEqualToString:@"::1"]);
	if (isLoopbackChat) {
		objc_setAssociatedObject(webView, &dshSuppressTerminateReloadKey, @YES, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
	}
	((void (*)(id, SEL, WKWebView *))dshOrigWebContentDidTerminateIMP)(self, _cmd, webView);
	if (isLoopbackChat) {
		objc_setAssociatedObject(webView, &dshSuppressTerminateReloadKey, nil, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
	}
}

// 拦截 Wails WebviewWindowDelegate 在 WebContent 崩溃时的盲目 [webView reload]：
// Chat 窗口使用 SameSite=Strict 认证 Cookie，崩溃后从新进程初始 about:blank 直接 reload 无 token URL
// 会被 WebKit 剥离 SameSite=Strict Cookie 导致 401；此处保留事件派发由 Go 侧 recoverChatWebView
// 统一使用带 ?token= 的入口 URL 重新建立 SameSite=Strict 会话。
static void dshInstallTerminateReloadGuard(WKWebView *webView) {
	if (webView == nil || webView.navigationDelegate == nil) {
		return;
	}
	Class delegateCls = [webView.navigationDelegate class];
	if (delegateCls == nil || ![NSStringFromClass(delegateCls) isEqualToString:@"WebviewWindowDelegate"]) {
		return;
	}
	static dispatch_once_t once;
	dispatch_once(&once, ^{
		Method mReload = class_getInstanceMethod([WKWebView class], @selector(reload));
		if (mReload != NULL) {
			dshOrigWebViewReloadIMP = method_setImplementation(mReload, (IMP)dshSwizzledWebViewReload);
		}
		Method mTerminate = class_getInstanceMethod(delegateCls, @selector(webViewWebContentProcessDidTerminate:));
		if (mTerminate != NULL) {
			dshOrigWebContentDidTerminateIMP = method_setImplementation(mTerminate, (IMP)dshSwizzledWebContentDidTerminate);
		}
	});
}

static void dshApplyDisplayRefreshToWebView(WKWebView *webView) {
	if (webView == nil) {
		return;
	}
	dshAttachWindowBridgeToWebView(webView);
	dshInstallTerminateReloadGuard(webView);
	WKPreferences *preferences = webView.configuration.preferences;
	if (preferences == nil) {
		return;
	}
	SEL featuresSel = NSSelectorFromString(@"_features");
	Class prefsClass = [WKPreferences class];
	if (![prefsClass respondsToSelector:featuresSel]) {
		return;
	}
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Warc-performSelector-leaks"
	NSArray *features = [prefsClass performSelector:featuresSel];
#pragma clang diagnostic pop
	if (features == nil) {
		return;
	}
	SEL setEnabledSel = NSSelectorFromString(@"_setEnabled:forFeature:");
	if (![preferences respondsToSelector:setEnabledSel]) {
		return;
	}
	for (id feature in features) {
		NSString *key = nil;
		@try {
			key = [feature valueForKey:@"key"];
		} @catch (NSException *ex) {
			continue;
		}
		if (![key isEqualToString:@"PreferPageRenderingUpdatesNear60FPSEnabled"]) {
			continue;
		}
		NSMethodSignature *sig = [preferences methodSignatureForSelector:setEnabledSel];
		if (sig == nil) {
			return;
		}
		NSInvocation *inv = [NSInvocation invocationWithMethodSignature:sig];
		[inv setSelector:setEnabledSel];
		[inv setTarget:preferences];
		BOOL enabled = NO;
		[inv setArgument:&enabled atIndex:2];
		[inv setArgument:&feature atIndex:3];
		[inv invoke];
		return;
	}
}

static void dshWalkViews(NSView *view) {
	if (view == nil) {
		return;
	}
	if ([view isKindOfClass:[WKWebView class]]) {
		dshApplyDisplayRefreshToWebView((WKWebView *)view);
		return;
	}
	for (NSView *child in view.subviews) {
		dshWalkViews(child);
	}
}

void dshUnlockWebKitDisplayRefresh(void *nsWindow) {
	if (nsWindow == NULL) {
		return;
	}
	if (![NSThread isMainThread]) {
		dispatch_sync(dispatch_get_main_queue(), ^{
			dshUnlockWebKitDisplayRefresh(nsWindow);
		});
		return;
	}
	NSWindow *window = (NSWindow *)nsWindow;
	dshInstallSmoothWindowZoom(window);
	dshWalkViews([window contentView]);
}

void dshApplyWindowBackground(void *nsWindow, int r, int g, int b) {
	if (nsWindow == NULL) {
		return;
	}
	if (![NSThread isMainThread]) {
		dispatch_async(dispatch_get_main_queue(), ^{
			dshApplyWindowBackgroundColorToWindow((NSWindow *)nsWindow, r, g, b);
		});
		return;
	}
	dshApplyWindowBackgroundColorToWindow((NSWindow *)nsWindow, r, g, b);
}

int dshIsSystemDarkMode(void) {
#if MAC_OS_X_VERSION_MAX_ALLOWED >= 101400
	if (@available(macOS 10.14, *)) {
		__block BOOL isDark = NO;
		void (^check)(void) = ^{
			NSAppearance *appearance = [NSApp effectiveAppearance];
			if (appearance == nil) {
				appearance = [NSAppearance currentAppearance];
			}
			if (appearance != nil) {
				NSAppearanceName match = [appearance bestMatchFromAppearancesWithNames:@[
					NSAppearanceNameAqua,
					NSAppearanceNameDarkAqua
				]];
				isDark = [match isEqualToString:NSAppearanceNameDarkAqua];
			}
		};
		if ([NSThread isMainThread]) {
			check();
		} else {
			NSString *style = [[NSUserDefaults standardUserDefaults] stringForKey:@"AppleInterfaceStyle"];
			isDark = (style != nil && [style caseInsensitiveCompare:@"Dark"] == NSOrderedSame);
		}
		return isDark ? 1 : 0;
	}
#endif
	return 0;
}

// 查询当前进程名下最大的 com.apple.WebKit.WebContent 子进程物理内存占用（ri_phys_footprint，字节）。
// 直接通过内核 proc_listchildpids + proc_pid_rusage 读取，无需切回 UI 主线程。
unsigned long long dshMaxWebContentPhysFootprint(void) {
	pid_t selfPid = getpid();
	pid_t childPids[128];
	int bytes = proc_listchildpids(selfPid, childPids, (int)sizeof(childPids));
	if (bytes <= 0) {
		return 0;
	}
	int count = bytes / (int)sizeof(pid_t);
	unsigned long long maxFootprint = 0;
	for (int i = 0; i < count; i++) {
		pid_t pid = childPids[i];
		if (pid <= 0) {
			continue;
		}
		char pathBuf[PROC_PIDPATHINFO_MAXSIZE];
		int pathLen = proc_pidpath(pid, pathBuf, sizeof(pathBuf));
		if (pathLen <= 0 || strstr(pathBuf, "WebContent") == NULL) {
			continue;
		}
		struct rusage_info_v4 ri;
		if (proc_pid_rusage(pid, RUSAGE_INFO_V4, (rusage_info_t *)&ri) == 0) {
			if (ri.ri_phys_footprint > maxFootprint) {
				maxFootprint = (unsigned long long)ri.ri_phys_footprint;
			}
		}
	}
	return maxFootprint;
}

// 异步清理 WKWebsiteDataStore 的内存态资源缓存（仅 WKWebsiteDataTypeMemoryCache，不触碰 Cookie 与存储）。
void dshPurgeWebViewMemoryCache(void) {
	dispatch_async(dispatch_get_main_queue(), ^{
		WKWebsiteDataStore *store = [WKWebsiteDataStore defaultDataStore];
		if (store == nil) {
			return;
		}
		NSSet *types = [NSSet setWithObject:WKWebsiteDataTypeMemoryCache];
		[store removeDataOfTypes:types
		           modifiedSince:[NSDate distantPast]
		       completionHandler:^{}];
	});
}
*/
import "C"

import "github.com/wailsapp/wails/v3/pkg/application"

func unlockWebKitDisplayRefresh(window application.Window) {
	if window == nil {
		return
	}
	ptr := window.NativeWindow()
	if ptr == nil {
		return
	}
	C.dshUnlockWebKitDisplayRefresh(ptr)
}

func applyNativeWindowBackground(window application.Window, colour application.RGBA) {
	if window == nil {
		return
	}
	ptr := window.NativeWindow()
	if ptr == nil {
		return
	}
	C.dshApplyWindowBackground(ptr, C.int(colour.Red), C.int(colour.Green), C.int(colour.Blue))
}

func isPlatformDarkMode() bool {
	return C.dshIsSystemDarkMode() != 0
}

func maxWebContentPhysFootprint() uint64 {
	return uint64(C.dshMaxWebContentPhysFootprint())
}

func purgeWebViewMemoryCache() {
	C.dshPurgeWebViewMemoryCache()
}
