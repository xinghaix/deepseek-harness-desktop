//go:build wails && darwin && cgo

package desktop

/*
#cgo CFLAGS: -x objective-c -fblocks
#cgo LDFLAGS: -framework Foundation -framework UserNotifications
#import <Foundation/Foundation.h>
#import <UserNotifications/UserNotifications.h>
#import <dispatch/dispatch.h>

static int dshNotificationStatus(void) {
    @autoreleasepool {
        if (@available(macOS 10.14, *)) {
            dispatch_semaphore_t done = dispatch_semaphore_create(0);
            __block int status = -1;
            dispatch_retain(done);
            [[UNUserNotificationCenter currentNotificationCenter] getNotificationSettingsWithCompletionHandler:^(UNNotificationSettings *settings) {
                status = (int)settings.authorizationStatus;
                dispatch_semaphore_signal(done);
                dispatch_release(done);
            }];
            long timedOut = dispatch_semaphore_wait(done, dispatch_time(DISPATCH_TIME_NOW, 800 * NSEC_PER_MSEC));
            dispatch_release(done);
            return timedOut == 0 ? status : -1;
        }
        return -1;
    }
}
*/
import "C"

func platformNotificationStatus() string {
	switch C.dshNotificationStatus() {
	case 0: // UNAuthorizationStatusNotDetermined
		return "permission"
	case 1: // UNAuthorizationStatusDenied
		return "denied"
	case 2, 3: // UNAuthorizationStatusAuthorized / Provisional
		return "available"
	default:
		return "unavailable"
	}
}
