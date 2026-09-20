package desktop

import (
	"deepseek-harness-desktop/internal/dsh"
	"encoding/json"
	"strings"
	"testing"
)

func TestChatContextMenuSanitizesBeforeNativeMenu(t *testing.T) {
	for _, tc := range []struct{ text, href, wantID, wantText, wantHref string }{
		{" selection ", "", contextMenuSearch, "selection", ""},
		{"", "https://example.com", contextMenuLink, "", "https://example.com"},
		{"selection", "https://example.com", contextMenuBoth, "selection", "https://example.com"},
		{"selection", "javascript:alert(1)", contextMenuSearch, "selection", ""},
		{"selection", "http://127.0.0.1/?token=secret", contextMenuSearch, "selection", ""},
		{strings.Repeat("x", 3000), "", contextMenuSearch, strings.Repeat("x", 2048), ""},
	} {
		t.Run(tc.wantID, func(t *testing.T) {
			calls := 0
			err := runChatContextMenu(dsh.ChatContextMenuRequest{X: 12, Y: 34, Text: tc.text, Href: tc.href}, func(id string, x, y int, data string) error {
				calls++
				var p contextPayload
				if err := json.Unmarshal([]byte(data), &p); err != nil {
					t.Fatal(err)
				}
				if id != tc.wantID || x != 12 || y != 34 || p.Text != tc.wantText || p.Href != tc.wantHref {
					t.Fatalf("menu=%s (%d,%d) data=%s", id, x, y, data)
				}
				return nil
			})
			if err != nil || calls != 1 {
				t.Fatalf("calls=%d err=%v", calls, err)
			}
		})
	}
}
func TestChatContextMenuRejectsBeforeNativeMenu(t *testing.T) {
	for _, r := range []dsh.ChatContextMenuRequest{{X: -1, Text: "selected"}, {Y: 100001, Text: "selected"}, {Text: strings.Repeat("x", 8193)}, {Href: strings.Repeat("x", 8193)}, {Text: " "}, {Href: "file:///tmp/private"}} {
		if err := runChatContextMenu(r, func(string, int, int, string) error { t.Fatal("invalid menu reached native API"); return nil }); err == nil {
			t.Fatalf("accepted request=%+v", r)
		}
	}
}
