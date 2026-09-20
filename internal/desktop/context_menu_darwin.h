#ifndef DSH_CONTEXT_MENU_DARWIN_H
#define DSH_CONTEXT_MENU_DARWIN_H

// Shared by the desktop cgo adapter and the actual WebKit/NSMenu regression probe.
#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>
#import <objc/runtime.h>
#include <stdlib.h>
#include <string.h>

extern void dshGoOpenURL(char* url);
extern void dshGoSearch(char* query, char* hint);
extern char* dshContextSearchTitle(void);
extern char* dshContextOpenTitle(void);

enum {
  DSHMenuTagSearch = 0x44534801,
  DSHMenuTagOpen = 0x44534802
};

static NSString *dshTakeGoString(char *c) {
  if (c == NULL) {
    return @"";
  }
  NSString *s = [NSString stringWithUTF8String:c];
  free(c);
  return s ?: @"";
}

@interface DSHContextMenuTarget : NSObject
@end

@implementation DSHContextMenuTarget
- (void)dshOpenURL:(NSMenuItem *)sender {
  id obj = sender.representedObject;
  if (![obj isKindOfClass:[NSString class]]) {
    return;
  }
  const char *c = [(NSString *)obj UTF8String];
  if (c != NULL) {
    dshGoOpenURL((char *)c);
  }
}
- (void)dshSearch:(NSMenuItem *)sender {
  id obj = sender.representedObject;
  if (![obj isKindOfClass:[NSString class]]) {
    return;
  }
  NSString *hint = sender.toolTip ?: @"";
  const char *query = [(NSString *)obj UTF8String];
  const char *hintC = [hint UTF8String];
  if (query != NULL) {
    dshGoSearch((char *)query, (char *)hintC);
  }
}
@end

static DSHContextMenuTarget *dshMenuTarget(void) {
  static DSHContextMenuTarget *target;
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    target = [DSHContextMenuTarget new];
  });
  return target;
}

static NSString *dshMenuHint(NSMenu *menu) {
  NSMutableString *hint = [NSMutableString string];
  for (NSMenuItem *item in menu.itemArray) {
    if (item.title.length > 0) {
      [hint appendString:item.title];
      [hint appendString:@" "];
    }
  }
  return hint;
}

// Public WKScriptMessageHandler replaces the removed private synchronous JS API.
#define DSH_CONTEXT_MENU_PUBLIC_MESSAGE_CACHE 1
static char dshContextCacheKey;
static char dshContextTimeKey;
static char dshContextControllerKey;

@interface DSHContextMessageHandler : NSObject <WKScriptMessageHandler>
@end

@implementation DSHContextMessageHandler
- (void)userContentController:(WKUserContentController *)controller didReceiveScriptMessage:(WKScriptMessage *)message {
  WKWebView *webView = message.webView;
  if (webView == nil || ![message.name isEqualToString:@"dshContextMenu"]) return;
  NSDictionary *body = [message.body isKindOfClass:[NSDictionary class]] ? message.body : @{};
  NSString *text = [body[@"text"] isKindOfClass:[NSString class]] ? body[@"text"] : @"";
  NSString *href = [body[@"href"] isKindOfClass:[NSString class]] ? body[@"href"] : @"";
  if (text.length > 2048) {
    NSRange range = [text rangeOfComposedCharacterSequencesForRange:NSMakeRange(0, 2048)];
    text = range.length <= 8192 ? [text substringWithRange:range] : @"";
  }
  if (href.length > 8192) href = @"";
  // Store empty contexts too: a subsequent blank right-click must not reuse a link.
  objc_setAssociatedObject(webView, &dshContextCacheKey, @{@"text": text, @"href": href}, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
  objc_setAssociatedObject(webView, &dshContextTimeKey, @([NSProcessInfo processInfo].systemUptime), OBJC_ASSOCIATION_RETAIN_NONATOMIC);
}
@end

static DSHContextMessageHandler *dshContextMessageHandler(void) {
  static DSHContextMessageHandler *handler;
  static dispatch_once_t once;
  dispatch_once(&once, ^{ handler = [DSHContextMessageHandler new]; });
  return handler;
}

static BOOL dshAttachNativeContextWebView(WKWebView *webView) {
  if (webView == nil) return NO;
  WKUserContentController *controller = webView.configuration.userContentController;
  if (controller == nil) return NO;
  if (objc_getAssociatedObject(controller, &dshContextControllerKey) != nil) return YES;
  @try {
    [controller addScriptMessageHandler:dshContextMessageHandler() name:@"dshContextMenu"];
    objc_setAssociatedObject(controller, &dshContextControllerKey, @YES, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
    return YES;
  } @catch (NSException *exception) {
    // Do not replace an existing handler belonging to another integration.
    return NO;
  }
}

static BOOL dshAttachContextViews(NSView *view) {
  if ([view isKindOfClass:[WKWebView class]]) return dshAttachNativeContextWebView((WKWebView *)view);
  BOOL attached = NO;
  for (NSView *child in view.subviews) attached = dshAttachContextViews(child) || attached;
  return attached;
}

int dshAttachNativeContextWindow(void *nsWindow) {
  if (nsWindow == NULL) return 0;
  __block BOOL attached = NO;
  void (^attach)(void) = ^{ attached = dshAttachContextViews([(NSWindow *)nsWindow contentView]); };
  if ([NSThread isMainThread]) attach();
  else dispatch_sync(dispatch_get_main_queue(), attach);
  return attached ? 1 : 0;
}

static NSDictionary *dshReadContext(WKWebView *webView) {
  NSDictionary *context = objc_getAssociatedObject(webView, &dshContextCacheKey);
  NSNumber *timestamp = objc_getAssociatedObject(webView, &dshContextTimeKey);
  // Fail closed when no current DOM context event preceded this native menu.
  if (context == nil || timestamp == nil || [NSProcessInfo processInfo].systemUptime - timestamp.doubleValue > 3.0) return @{};
  return context;
}

static BOOL dshIsSearchItem(NSMenuItem *item) {
  if (item.isSeparatorItem) {
    return NO;
  }
  SEL action = item.action;
  if (action != NULL) {
    NSString *name = NSStringFromSelector(action);
    if ([name localizedCaseInsensitiveContainsString:@"searchWeb"] ||
        [name localizedCaseInsensitiveContainsString:@"searchWith"]) {
      return YES;
    }
  }
  NSString *title = item.title;
  return [title localizedCaseInsensitiveContainsString:@"Search with"] ||
         [title localizedCaseInsensitiveContainsString:@"Search the Web"] ||
         [title containsString:@"搜索"] ||
         [title containsString:@"検索"];
}

static BOOL dshIsOpenLinkItem(NSMenuItem *item) {
  if (item.isSeparatorItem) {
    return NO;
  }
  NSString *title = item.title;
  if ([title localizedCaseInsensitiveContainsString:@"Copy Link"] ||
      [title containsString:@"拷贝链接"] ||
      [title containsString:@"复制链接"] ||
      [title containsString:@"リンクをコピー"]) {
    return NO;
  }
  SEL action = item.action;
  if (action != NULL) {
    NSString *name = NSStringFromSelector(action);
    if ([name localizedCaseInsensitiveContainsString:@"openLink"]) {
      return YES;
    }
  }
  return [title localizedCaseInsensitiveContainsString:@"Open Link"] ||
         [title hasPrefix:@"打开链接"] ||
         [title hasPrefix:@"リンクを開く"];
}

static NSString *dshHrefFromMenu(NSMenu *menu) {
  for (NSMenuItem *item in menu.itemArray) {
    id obj = item.representedObject;
    if ([obj isKindOfClass:[NSURL class]]) {
      return [(NSURL *)obj absoluteString];
    }
    if ([obj isKindOfClass:[NSString class]] && [(NSString *)obj hasPrefix:@"http"]) {
      return obj;
    }
  }
  return nil;
}

static void dshAugmentMenu(WKWebView *webView, NSMenu *menu) {
  if (menu == nil) {
    return;
  }
  NSMutableArray<NSMenuItem *> *remove = [NSMutableArray array];
  NSInteger searchAt = NSNotFound;
  NSInteger openAt = NSNotFound;
  NSInteger i = 0;
  for (NSMenuItem *item in menu.itemArray) {
    if (item.tag == DSHMenuTagSearch || item.tag == DSHMenuTagOpen) {
      [remove addObject:item];
    } else if (dshIsSearchItem(item) && searchAt == NSNotFound) {
      searchAt = i;
    } else if (dshIsOpenLinkItem(item)) {
      if (openAt == NSNotFound) {
        openAt = i;
      }
    }
    i++;
  }
  for (NSMenuItem *item in remove) {
    [menu removeItem:item];
  }
  NSDictionary *ctx = dshReadContext(webView);
  NSString *text = [ctx[@"text"] isKindOfClass:[NSString class]] ? ctx[@"text"] : @"";
  NSString *href = [ctx[@"href"] isKindOfClass:[NSString class]] ? ctx[@"href"] : @"";
  if (href.length == 0) {
    href = dshHrefFromMenu(menu) ?: @"";
  }
  DSHContextMenuTarget *target = dshMenuTarget();
  NSString *hint = dshMenuHint(menu);
  if (text.length > 0) {
    NSMenuItem *search = [[NSMenuItem alloc] initWithTitle:dshTakeGoString(dshContextSearchTitle())
                                                   action:@selector(dshSearch:)
                                            keyEquivalent:@""];
    search.tag = DSHMenuTagSearch;
    search.target = target;
    search.representedObject = text;
    search.toolTip = hint;
    NSInteger at = searchAt == NSNotFound ? 0 : searchAt + 1;
    if (at > menu.numberOfItems) {
      at = menu.numberOfItems;
    }
    [menu insertItem:search atIndex:at];
    if (openAt != NSNotFound && openAt >= at) {
      openAt++;
    }
  }
  if (href.length > 0) {
    for (NSMenuItem *item in menu.itemArray) {
      if (item.tag != DSHMenuTagOpen && dshIsOpenLinkItem(item)) {
        item.enabled = NO;
      }
    }
    NSMenuItem *open = [[NSMenuItem alloc] initWithTitle:dshTakeGoString(dshContextOpenTitle())
                                                 action:@selector(dshOpenURL:)
                                          keyEquivalent:@""];
    open.tag = DSHMenuTagOpen;
    open.target = target;
    open.representedObject = href;
    NSInteger at = openAt == NSNotFound ? 0 : openAt + 1;
    if (at > menu.numberOfItems) {
      at = menu.numberOfItems;
    }
    [menu insertItem:open atIndex:at];
  }
}

static void (*dshOrigWillOpenMenu)(id, SEL, NSMenu *, NSEvent *);

static void dshWillOpenMenu(id self, SEL sel, NSMenu *menu, NSEvent *event) {
  if (dshOrigWillOpenMenu != NULL) {
    dshOrigWillOpenMenu(self, sel, menu, event);
  }
  if ([self isKindOfClass:[WKWebView class]]) {
    dshAugmentMenu((WKWebView *)self, menu);
  }
}

void dshInstallNativeContextMenu(void) {
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    Class cls = [WKWebView class];
    SEL sel = @selector(willOpenMenu:withEvent:);
    Method method = class_getInstanceMethod(cls, sel);
    if (method == NULL) {
      class_addMethod(cls, sel, (IMP)dshWillOpenMenu, "v@:@@");
      return;
    }
    IMP orig = method_getImplementation(method);
    const char *types = method_getTypeEncoding(method);
    if (class_addMethod(cls, sel, (IMP)dshWillOpenMenu, types)) {
      dshOrigWillOpenMenu = (void (*)(id, SEL, NSMenu *, NSEvent *))orig;
      return;
    }
    dshOrigWillOpenMenu = (void (*)(id, SEL, NSMenu *, NSEvent *))method_setImplementation(method, (IMP)dshWillOpenMenu);
  });
}

char *dshCopyDefaultBrowserName(void) {
  NSURL *url = [NSURL URLWithString:@"https://example.com"];
  NSURL *appURL = nil;
  if (@available(macOS 10.15, *)) {
    appURL = [[NSWorkspace sharedWorkspace] URLForApplicationToOpenURL:url];
  }
  if (appURL == nil) {
    return NULL;
  }
  NSString *name = [[NSFileManager defaultManager] displayNameAtPath:appURL.path];
  if ([name hasSuffix:@".app"]) {
    name = [name substringToIndex:name.length - 4];
  }
  if (name.length == 0) {
    return NULL;
  }
  return strdup(name.UTF8String);
}

#endif
