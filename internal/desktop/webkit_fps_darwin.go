//go:build wails && darwin

package desktop

/*
#cgo CFLAGS: -mmacosx-version-min=10.13 -x objective-c
#cgo LDFLAGS: -framework Cocoa -framework WebKit -framework Foundation

#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>

static void dshApplyDisplayRefreshToWebView(WKWebView *webView) {
	if (webView == nil) {
		return;
	}
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
	dshWalkViews([window contentView]);
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
