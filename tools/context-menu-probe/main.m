#ifndef DSH_CONTEXT_MENU_HEADER
#define DSH_CONTEXT_MENU_HEADER "../../internal/desktop/context_menu_darwin.h"
#endif
#import DSH_CONTEXT_MENU_HEADER

// Only the Go boundary is stubbed. WebKit, IPC, production cache/hook/menu and
// AppKit action dispatch below are real. Never launch a system browser here.
static NSString *openedURL, *searchedText;
static NSUInteger openCalls, searchCalls, trackingCalls, hookCalls;
static WKWebView *web;
static NSWindow *window;
static NSString *scenario;
static BOOL passed, injected;
static NSString *productionCapture;

static NSString *sourceSection(NSString *source, NSString *start, NSString *end, BOOL includeEnd) {
  NSRange first = [source rangeOfString:start];
  if (first.location == NSNotFound) { fprintf(stderr, "Missing production JS start marker\n"); exit(2); }
  NSRange last = [source rangeOfString:end options:0 range:NSMakeRange(NSMaxRange(first), source.length - NSMaxRange(first))];
  if (last.location == NSNotFound) { fprintf(stderr, "Missing production JS end marker\n"); exit(2); }
  return [source substringWithRange:NSMakeRange(first.location, last.location - first.location + (includeEnd ? last.length : 0))];
}

void dshGoOpenURL(char *url) { openCalls++; openedURL = [NSString stringWithUTF8String:url]; }
void dshGoSearch(char *query, char *hint) { searchCalls++; searchedText = [NSString stringWithUTF8String:query]; }
char *dshContextSearchTitle(void) { return strdup("Probe Search in system browser"); }
char *dshContextOpenTitle(void) { return strdup("Probe Open in system browser"); }

static void check(BOOL condition, NSString *label) {
  printf("CHECK %s %s\n", condition ? "PASS" : "FAIL", label.UTF8String);
  if (!condition) passed = NO;
}

static void instrumentProductionHook(void) {
  SEL selector = @selector(willOpenMenu:withEvent:);
  Method method = class_getInstanceMethod(WKWebView.class, selector);
  IMP production = method_getImplementation(method);
  class_replaceMethod(WKWebView.class, selector, imp_implementationWithBlock(^(WKWebView *view, NSMenu *menu, NSEvent *event) {
    if (view != web) { ((void (*)(id, SEL, id, id))production)(view, selector, menu, event); return; }
    hookCalls++;
    NSArray<NSMenuItem *> *originals = menu.itemArray;
    NSMutableArray *originalState = [NSMutableArray array];
    for (NSMenuItem *item in originals) {
      printf("ORIGINAL title=%s target=%s action=%s\n", item.title.UTF8String, object_getClassName(item.target), sel_getName(item.action));
      [originalState addObject:@[item.title, item.target ?: NSNull.null, NSStringFromSelector(item.action) ?: @"", item.submenu ?: NSNull.null]];
    }
    printf("PRODUCTION_HOOK receiver=%s originalItems=%lu\n", object_getClassName(view), (unsigned long)originals.count);
    ((void (*)(id, SEL, id, id))production)(view, selector, menu, event);
    passed = YES;
    check(injected && trackingCalls > 0, @"real native event and menu tracking observed");
    check(hookCalls == 1, @"exactly one production callback");
    BOOL intact = YES; NSInteger last = -1;
    for (NSUInteger i = 0; i < originals.count; i++) {
      NSMenuItem *item = originals[i]; NSInteger at = [menu indexOfItem:item];
      NSArray *state = originalState[i];
      if (at <= last || ![item.title isEqual:state[0]] || (item.target ?: NSNull.null) != state[1] || ![(NSStringFromSelector(item.action) ?: @"") isEqual:state[2]] || (item.submenu ?: NSNull.null) != state[3]) intact = NO;
      last = at;
    }
    check(intact, @"all original item identities/order/targets/actions/submenus retained");
    NSUInteger searches = 0, opens = 0;
    for (NSMenuItem *item in menu.itemArray) {
      printf("FINAL title=%s tag=%ld\n", item.title.UTF8String, (long)item.tag);
      if (item.tag == DSHMenuTagSearch) { searches++; check([NSApp sendAction:item.action to:item.target from:item], @"native Search action dispatched"); }
      if (item.tag == DSHMenuTagOpen) { opens++; check([NSApp sendAction:item.action to:item.target from:item], @"native Open action dispatched"); }
    }
    BOOL wantsSearch = [scenario isEqual:@"text"] || [scenario isEqual:@"both"];
    BOOL wantsOpen = [scenario isEqual:@"link"] || [scenario isEqual:@"both"];
    check(searches == (NSUInteger)wantsSearch && opens == (NSUInteger)wantsOpen, @"exact custom item counts");
    check(menu.numberOfItems == originals.count + searches + opens, @"only owned items appended");
    check(searchCalls == (NSUInteger)wantsSearch && openCalls == (NSUInteger)wantsOpen, @"exact Go-boundary action counts");
    if (wantsSearch) check([searchedText isEqual:@"Native probe selection"], @"Search payload is actual DOM selection");
    if (wantsOpen) check([openedURL isEqual:@"https://example.com/probe"], @"Open payload is actual DOM link");
    printf("RESULT %s scenario=%s originals=%lu final=%ld tracking=%lu hook=%lu searchCalls=%lu openCalls=%lu\n", passed ? "PASS" : "FAIL", scenario.UTF8String, (unsigned long)originals.count, (long)menu.numberOfItems, (unsigned long)trackingCalls, (unsigned long)hookCalls, (unsigned long)searchCalls, (unsigned long)openCalls);
    NSTimer *timer = [NSTimer timerWithTimeInterval:0.1 repeats:NO block:^(NSTimer *t) { [menu cancelTracking]; exit(passed ? 0 : 1); }];
    [NSRunLoop.mainRunLoop addTimer:timer forMode:NSEventTrackingRunLoopMode];
    [NSRunLoop.mainRunLoop addTimer:timer forMode:NSDefaultRunLoopMode];
  }), method_getTypeEncoding(method));
}

@interface ProbeDriver : NSObject <WKNavigationDelegate>
@end
@implementation ProbeDriver
- (void)webView:(WKWebView *)view didFinishNavigation:(WKNavigation *)navigation {
#if defined(DSH_CONTEXT_MENU_PUBLIC_MESSAGE_CACHE) && !defined(DSH_PROBE_LEGACY)
  // Attach after load too: this is the production installation seam, not a mock.
  if (!dshAttachNativeContextWindow((void *)window) || !dshAttachNativeContextWebView(view) || !dshAttachNativeContextWebView(view)) {
    fprintf(stderr, "FAIL production attachment/idempotence\n"); exit(2);
  }
#endif
  NSString *capture = productionCapture;
  if ([scenario isEqual:@"text"] || [scenario isEqual:@"both"]) capture = [capture stringByAppendingString:@"var r=document.createRange();r.selectNodeContents(document.getElementById('text'));getSelection().removeAllRanges();getSelection().addRange(r);"];
  [view evaluateJavaScript:capture completionHandler:^(id result, NSError *error) {
    if (error) { fprintf(stderr, "JS_SETUP_FAILED %s\n", error.description.UTF8String); exit(2); }
    printf("SYNC_JS_AVAILABLE %d\n", [view respondsToSelector:NSSelectorFromString(@"_stringByEvaluatingJavaScriptFromString:")]);
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 200 * NSEC_PER_MSEC), dispatch_get_main_queue(), ^{
      NSPoint point = NSMakePoint(80, window.contentView.bounds.size.height - 45);
      NSView *hit = [window.contentView hitTest:point];
      NSEvent *event = [NSEvent mouseEventWithType:NSEventTypeRightMouseDown location:point modifierFlags:0 timestamp:NSProcessInfo.processInfo.systemUptime windowNumber:window.windowNumber context:nil eventNumber:1 clickCount:1 pressure:1];
      printf("NATIVE_RIGHT_MOUSE receiver=%s\n", object_getClassName(hit)); injected = YES;
      [hit rightMouseDown:event];
    });
  }];
}
@end

int main(int argc, const char **argv) {
  @autoreleasepool {
    setbuf(stdout, NULL);
    scenario = argc > 1 ? [NSString stringWithUTF8String:argv[1]] : @"text";
    if (![@[@"text", @"link", @"both", @"blank"] containsObject:scenario]) return 2;
    NSString *chromePath = argc > 2 ? [NSString stringWithUTF8String:argv[2]] : @"internal/desktop/chrome.go";
    NSError *sourceError;
    NSString *source = [NSString stringWithContentsOfFile:chromePath encoding:NSUTF8StringEncoding error:&sourceError];
    if (!source) { fprintf(stderr, "Cannot read production chrome: %s\n", sourceError.description.UTF8String); return 2; }
    productionCapture = [NSString stringWithFormat:@"(()=>{const useCustomMenu=false;\n%@\n%@\n%@\n})();",
      sourceSection(source, @"  const allowed = ", @"  const reportOpenFailure = ", NO),
      sourceSection(source, @"  const contextPayload = ", @"  const originalOpen = ", NO),
      sourceSection(source, @"  document.addEventListener(\"contextmenu\", (event) => {", @"  }, true);", YES)];
    [NSApplication sharedApplication];
    [NSApp setActivationPolicy:NSApplicationActivationPolicyAccessory];
    dshInstallNativeContextMenu(); instrumentProductionHook();
    WKWebViewConfiguration *configuration = [WKWebViewConfiguration new];
    configuration.websiteDataStore = WKWebsiteDataStore.nonPersistentDataStore;
    web = [[WKWebView alloc] initWithFrame:NSMakeRect(0, 0, 600, 320) configuration:configuration];
    // Deliberately no preload attachment: exercise installation after load.
    ProbeDriver *driver = [ProbeDriver new]; web.navigationDelegate = driver;
    window = [[NSWindow alloc] initWithContentRect:NSMakeRect(100, 100, 600, 320) styleMask:NSWindowStyleMaskTitled backing:NSBackingStoreBuffered defer:NO];
    window.title = @"Standalone production context-menu regression"; window.contentView = web;
    [window makeKeyAndOrderFront:nil]; [NSApp activateIgnoringOtherApps:YES];
    [NSNotificationCenter.defaultCenter addObserverForName:NSMenuDidBeginTrackingNotification object:nil queue:nil usingBlock:^(NSNotification *notification) {
      trackingCalls++; printf("NATIVE_TRACK_BEGIN items=%ld\n", (long)[(NSMenu *)notification.object numberOfItems]);
    }];
    NSString *body = [scenario isEqual:@"blank"] ? @"<span id='text'></span>" : (([scenario isEqual:@"link"] || [scenario isEqual:@"both"]) ? @"<a id='text' href='https://example.com/probe'>Native probe selection</a>" : @"<span id='text'>Native probe selection</span>");
    // WebKit may select a word under a right-click. An unselectable anchor is
    // the genuine link-only fixture; do not overwrite the event payload.
    if ([scenario isEqual:@"link"]) body = [body stringByReplacingOccurrencesOfString:@"<a " withString:@"<a style='-webkit-user-select:none;user-select:none' "];
    [web loadHTMLString:[NSString stringWithFormat:@"<html><body style='font-size:24px;margin:30px'>%@</body></html>", body] baseURL:nil];
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 12 * NSEC_PER_SEC), dispatch_get_main_queue(), ^{ fprintf(stderr, "FAIL native menu timeout\n"); exit(2); });
    [NSApp run];
  }
  return 2;
}
