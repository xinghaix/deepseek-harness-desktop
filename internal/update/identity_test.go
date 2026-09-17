package update

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestAppIdentityMatchesPackagingInputs(t *testing.T) {
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("missing caller path")
	}
	root := filepath.Join(filepath.Dir(file), "..", "..")
	plist, err := os.ReadFile(filepath.Join(root, "assets", "darwin", "Info.plist"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(plist), "<string>"+DefaultAppID+"</string>") {
		t.Fatalf("Info.plist does not use app id %s", DefaultAppID)
	}
	mainSrc, err := os.ReadFile(filepath.Join(root, "main.go"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(mainSrc), `UniqueID: "`+DefaultAppID+`"`) {
		t.Fatalf("main.go UniqueID does not use app id %s", DefaultAppID)
	}
}
