//go:build wails && darwin

package desktop

/*
#cgo CFLAGS: -mmacosx-version-min=10.13 -x objective-c
#cgo LDFLAGS: -framework Cocoa -framework WebKit -framework Foundation

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

static NSDictionary *dshReadContext(WKWebView *webView) {
  NSString *script = @"window.__DSH_CTX__ && JSON.stringify(window.__DSH_CTX__)";
  NSString *json = nil;
  SEL sel = NSSelectorFromString(@"_stringByEvaluatingJavaScriptFromString:");
  if ([webView respondsToSelector:sel]) {
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Warc-performSelector-leaks"
    json = [webView performSelector:sel withObject:script];
#pragma clang diagnostic pop
  }
  if (json.length == 0) {
    return @{};
  }
  NSData *data = [json dataUsingEncoding:NSUTF8StringEncoding];
  if (data == nil) {
    return @{};
  }
  id obj = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
  if (![obj isKindOfClass:[NSDictionary class]]) {
    return @{};
  }
  return obj;
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
*/
import "C"

import "unsafe"

func installNativeContextMenu() {
	C.dshInstallNativeContextMenu()
}

func init() {
	lookupDefaultBrowserName = func() string {
		c := C.dshCopyDefaultBrowserName()
		if c == nil {
			return ""
		}
		defer C.free(unsafe.Pointer(c))
		return C.GoString(c)
	}
}
