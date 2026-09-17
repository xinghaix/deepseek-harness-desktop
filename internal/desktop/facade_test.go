//go:build wails

package desktop

import (
	"context"
	"reflect"
	"testing"
)

func TestWailsFacadeMethodsReceiveRendererContext(t *testing.T) {
	facadeType := reflect.TypeOf((*WailsFacade)(nil))
	contextType := reflect.TypeOf((*context.Context)(nil)).Elem()
	for index := 0; index < facadeType.NumMethod(); index++ {
		method := facadeType.Method(index)
		if method.Type.NumIn() < 2 || method.Type.In(1) != contextType {
			t.Fatalf("WailsFacade.%s must receive context.Context as its first argument", method.Name)
		}
	}
}
