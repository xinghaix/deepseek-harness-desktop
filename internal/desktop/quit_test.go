//go:build wails

package desktop

import (
	"strconv"
	"sync"
	"sync/atomic"
	"testing"
	"time"
	"unsafe"

	"deepseek-harness-desktop/internal/desktopstate"
	"deepseek-harness-desktop/internal/dsh"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

// 用通道模拟 Wails 的同步主线程查询：原生退出回调返回后才能处理 GetScreen。
type quitBlockedGeometryWindow struct {
	application.Window
	queryStarted chan struct{}
	queryRelease chan struct{}
}

func (*quitBlockedGeometryWindow) IsVisible() bool      { return true }
func (*quitBlockedGeometryWindow) IsMinimised() bool    { return false }
func (*quitBlockedGeometryWindow) IsFullscreen() bool   { return false }
func (*quitBlockedGeometryWindow) IsMaximised() bool    { return false }
func (*quitBlockedGeometryWindow) Size() (int, int)     { return 1280, 860 }
func (*quitBlockedGeometryWindow) Position() (int, int) { return 100, 100 }
func (w *quitBlockedGeometryWindow) GetScreen() (*application.Screen, error) {
	close(w.queryStarted)
	<-w.queryRelease
	return nil, nil
}

func TestQuitCloseDoesNotWaitForPendingNativeGeometryQuery(t *testing.T) {
	t.Setenv("DSH_DESKTOP_STATE_DIR", t.TempDir())
	desktopstate.ResetCacheForTest()
	s := &Service{Manager: dsh.New()}
	w := &quitBlockedGeometryWindow{queryStarted: make(chan struct{}), queryRelease: make(chan struct{})}
	geometryDone := make(chan struct{})
	go func() {
		s.recordChatWindowState(w)
		close(geometryDone)
	}()
	<-w.queryStarted

	closed := make(chan error, 1)
	go func() { closed <- s.Close() }()
	select {
	case err := <-closed:
		if err != nil {
			t.Error(err)
		}
	case <-time.After(250 * time.Millisecond):
		t.Error("退出清理等待原生窗口查询，而原生主线程正等待退出回调返回：发生锁互等")
	}
	close(w.queryRelease)
	<-geometryDone
	if err := s.Close(); err != nil {
		t.Fatal(err)
	}
}

func TestQuitCallbacksReturnBeforeSlowCleanup(t *testing.T) {
	for _, entry := range []string{"idle", "known-idle", "confirmation", "confirmation-disabled", "busy-confirmation-disabled"} {
		t.Run(entry, func(t *testing.T) {
			t.Setenv("DSH_DESKTOP_STATE_DIR", t.TempDir())
			desktopstate.ResetCacheForTest()
			started := make(chan struct{})
			release := make(chan struct{})
			quitDone := make(chan struct{})
			var startedOnce sync.Once
			s := &Service{Manager: dsh.New(), nativeQuit: func() { close(quitDone) }, stopAuto: func() {
				startedOnce.Do(func() { close(started) })
				<-release
			}}
			s.prefs.confirmQuitWhenBusy.Store(entry != "confirmation-disabled" && entry != "busy-confirmation-disabled")
			if entry == "known-idle" || entry == "busy-confirmation-disabled" {
				s.ReportChatBusy(entry == "busy-confirmation-disabled")
			}
			returned := make(chan struct{})
			go func() {
				if entry == "confirmation" {
					dialog := s.quitDialog(new(application.DialogManager))
					dialog.Buttons[1].Callback()
				} else {
					_ = s.RequestQuit()
				}
				close(returned)
			}()
			<-started
			select {
			case <-returned:
			case <-time.After(250 * time.Millisecond):
				t.Error("退出回调同步等待慢清理，原生 UI 线程会失去响应")
			}
			if s.allowQuit.Load() {
				t.Error("进程清理尚未完成，不应允许框架销毁窗口")
			}
			close(release)
			<-returned
			if err := s.Close(); err != nil {
				t.Fatal(err)
			}
			<-quitDone
		})
	}
}

func TestQuitCloseRunsCleanupOnce(t *testing.T) {
	t.Setenv("DSH_DESKTOP_STATE_DIR", t.TempDir())
	desktopstate.ResetCacheForTest()
	var calls atomic.Int32
	s := &Service{Manager: dsh.New(), stopAuto: func() { calls.Add(1) }}
	var wg sync.WaitGroup
	for range 8 {
		wg.Go(func() {
			if err := s.Close(); err != nil {
				t.Error(err)
			}
		})
	}
	wg.Wait()
	if got := calls.Load(); got != 1 {
		t.Fatalf("退出与 OnShutdown 应共用一次清理，实际执行 %d 次", got)
	}
}

func TestQuitNativeEntryWaitsForCleanupBeforeAllowingTermination(t *testing.T) {
	t.Setenv("DSH_DESKTOP_STATE_DIR", t.TempDir())
	desktopstate.ResetCacheForTest()
	started, release, quitDone := make(chan struct{}), make(chan struct{}), make(chan struct{})
	s := &Service{Manager: dsh.New(), stopAuto: func() {
		close(started)
		<-release
	}}
	s.nativeQuit = func() {
		if !s.ShouldQuit() {
			t.Error("清理完成后应放行原生退出")
		}
		close(quitDone)
	}
	if s.ShouldQuit() {
		t.Fatal("系统退出入口不应在清理前直接放行")
	}
	<-started
	if s.ShouldQuit() {
		t.Error("清理未完成时重复退出不应提前销毁窗口")
	}
	close(release)
	<-quitDone
	if err := s.Close(); err != nil {
		t.Fatal(err)
	}
}

func TestQuitConcurrentRequestsOnlyTerminateOnce(t *testing.T) {
	t.Setenv("DSH_DESKTOP_STATE_DIR", t.TempDir())
	desktopstate.ResetCacheForTest()
	var cleanupCalls, quitCalls atomic.Int32
	quitDone := make(chan struct{}, 32)
	s := &Service{Manager: dsh.New(), stopAuto: func() { cleanupCalls.Add(1) }, nativeQuit: func() {
		quitCalls.Add(1)
		quitDone <- struct{}{}
	}}
	var wg sync.WaitGroup
	for range 32 {
		wg.Go(func() { _ = s.RequestQuit() })
	}
	wg.Wait()
	<-quitDone
	if got := cleanupCalls.Load(); got != 1 {
		t.Errorf("清理执行 %d 次，期望 1 次", got)
	}
	if got := quitCalls.Load(); got != 1 {
		t.Errorf("原生退出执行 %d 次，期望 1 次", got)
	}
}

func TestQuitCancelLeavesServiceRunningAndCanPromptAgain(t *testing.T) {
	s := &Service{}
	s.quitPromptOpen.Store(true)
	s.quitProbeSettled.Store(true)
	dialog := s.quitDialog(new(application.DialogManager))
	if len(dialog.Buttons) != 2 || !dialog.Buttons[0].IsDefault || !dialog.Buttons[0].IsCancel {
		t.Fatal("默认按钮和 Escape 都应取消退出")
	}
	dialog.Buttons[0].Callback()
	if s.quitStarted.Load() || s.closing.Load() || s.allowQuit.Load() {
		t.Fatal("取消退出不能启动清理或允许原生退出")
	}
	if !s.quitPromptOpen.CompareAndSwap(false, true) {
		t.Fatal("取消后必须允许下次退出重新确认")
	}
}

type quitHookWindow struct {
	application.Window
	hooks   map[events.WindowEventType]func(*application.WindowEvent)
	scripts int
}

func (*quitHookWindow) NativeWindow() unsafe.Pointer { return nil }
func (*quitHookWindow) ID() uint                     { return 42 }
func (w *quitHookWindow) ExecJS(string)              { w.scripts++ }
func (*quitHookWindow) OnWindowEvent(events.WindowEventType, func(*application.WindowEvent)) func() {
	return func() {}
}
func (w *quitHookWindow) RegisterHook(kind events.WindowEventType, callback func(*application.WindowEvent)) func() {
	if w.hooks == nil {
		w.hooks = make(map[events.WindowEventType]func(*application.WindowEvent))
	}
	w.hooks[kind] = callback
	return func() {}
}

func TestQuitWindowHooksDoNotReenterWindowLookupOrNativeQueries(t *testing.T) {
	for _, kind := range []string{"chat", "config"} {
		for _, ready := range []bool{false, true} {
			t.Run(kind+"/ready="+strconv.FormatBool(ready), func(t *testing.T) {
				s := &Service{configDirty: true}
				s.closing.Store(true)
				s.quitStarted.Store(true)
				s.allowQuit.Store(ready)
				w := &quitHookWindow{}
				if kind == "chat" {
					s.hookChatWindow(nil, w)
				} else {
					s.hookConfigWindow(w)
				}
				event := &application.WindowEvent{}
				// app 为空且原生查询未实现；任何重入都会立即 panic。
				w.hooks[events.Common.WindowClosing](event)
				if event.IsCancelled() == ready {
					t.Fatalf("清理完成=%v，窗口关闭取消=%v", ready, event.IsCancelled())
				}
				if w.scripts != 0 {
					t.Fatal("退出时不应再弹未保存确认或聚焦其它窗口")
				}
			})
		}
	}
}
