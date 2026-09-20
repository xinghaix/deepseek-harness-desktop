package desktop

import (
	"errors"
	"reflect"
	"testing"
)

func TestChatWindowActionsNativeCallbacks(t *testing.T) {
	for _, action := range []string{"minimize", "maximize", "close", "settings", "dismiss-config"} {
		t.Run(action, func(t *testing.T) {
			var calls []string
			record := func(s string) func() { return func() { calls = append(calls, s) } }
			lookup := func() (chatWindowCallbacks, error) {
				return chatWindowCallbacks{minimise: record("minimize"), toggleMaximise: record("maximize"), close: record("close")}, nil
			}
			err := runChatWindowAction(action, lookup, func() error { calls = append(calls, "settings"); return nil }, func() error { calls = append(calls, "dismiss-config"); return nil })
			if err != nil || !reflect.DeepEqual(calls, []string{action}) {
				t.Fatalf("action=%s calls=%v err=%v", action, calls, err)
			}
		})
	}
}

func TestChatWindowActionsRejectBeforeNativeLookup(t *testing.T) {
	for _, action := range []string{"", "Close", " close ", "hide", "quit", "call", "shell", "main.close"} {
		if err := runChatWindowAction(action, func() (chatWindowCallbacks, error) {
			t.Fatal("invalid action reached native lookup")
			return chatWindowCallbacks{}, nil
		}, nil, nil); err == nil {
			t.Fatalf("accepted %q", action)
		}
	}
}

func TestChatWindowActionsMissingWindowAndServiceErrors(t *testing.T) {
	unavailable := errors.New("Chat unavailable: reopen Chat")
	for _, action := range []string{"minimize", "maximize", "close", "settings", "dismiss-config"} {
		err := runChatWindowAction(action, func() (chatWindowCallbacks, error) { return chatWindowCallbacks{}, unavailable }, nil, nil)
		if !errors.Is(err, unavailable) {
			t.Fatalf("%s error=%v", action, err)
		}
	}
	for _, action := range []string{"settings", "dismiss-config"} {
		fail := func() error { return unavailable }
		err := runChatWindowAction(action, func() (chatWindowCallbacks, error) { return chatWindowCallbacks{}, nil }, fail, fail)
		if !errors.Is(err, unavailable) {
			t.Fatalf("%s service error=%v", action, err)
		}
	}
}
