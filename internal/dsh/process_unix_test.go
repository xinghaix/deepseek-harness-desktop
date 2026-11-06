//go:build linux || darwin

package dsh

import (
	"slices"
	"testing"
)

func TestParsePSHierarchyDetachedChildren(t *testing.T) {
	psOut := `
 1938     1  1938
 1952  1938  1952
 1953  1952  1952
 1971  1953  1952
 2100  1953  2100
 2105  2100  2100
 9999     1  9999
`
	pids, pgids := parsePSHierarchyDetachedChildren(psOut, 1952, 1938)
	for _, wantPID := range []int{1953, 1971, 2100, 2105} {
		if !slices.Contains(pids, wantPID) {
			t.Fatalf("expected descendant pid %d in %v", wantPID, pids)
		}
	}
	if slices.Contains(pids, 1952) || slices.Contains(pids, 1938) || slices.Contains(pids, 9999) {
		t.Fatalf("unexpected pid in %v", pids)
	}
	if !slices.Contains(pgids, 2100) {
		t.Fatalf("expected detached pgid 2100 in %v", pgids)
	}
	if slices.Contains(pgids, 1952) || slices.Contains(pgids, 9999) {
		t.Fatalf("unexpected pgid in %v", pgids)
	}
}

func TestParsePSEnvDetachedChildren(t *testing.T) {
	psEnvOut := `
 1763     1  1763 /opt/homebrew/bin/node /Users/u/.dsh/profiles/web/node_modules/dsh-ego-browser/bin/ego-cast-worker.mjs {} __CFBundleIdentifier=com.deepseek.harness.desktop DSHD_SUPERVISE=1
 2040     1  2040 /opt/homebrew/bin/node /Users/u/.dsh/profiles/web/node_modules/dsh-ego-browser/bin/ego-cast-worker.mjs {} DSHD_SUPERVISE=1 DSHD_SUPERVISE_PGID=1952
 2088     1  2088 /opt/homebrew/bin/node /Users/u/.dsh/profiles/web/node_modules/dsh-ego-browser/bin/ego-cast-worker.mjs {} DSHD_SUPERVISE=1 DSHD_SUPERVISE_PGID=19520
 3001     1  3001 /usr/bin/python3 worker.py DSHD_SUPERVISE=1
`
	pids, pgids := parsePSEnvDetachedChildren(psEnvOut, 1952, 1938)
	if !slices.Contains(pids, 1763) || !slices.Contains(pids, 2040) {
		t.Fatalf("expected pids 1763 and 2040 in %v", pids)
	}
	if slices.Contains(pids, 2088) || slices.Contains(pids, 3001) {
		t.Fatalf("unexpected pid in %v", pids)
	}
	if !slices.Contains(pgids, 1763) || !slices.Contains(pgids, 2040) {
		t.Fatalf("expected pgids 1763 and 2040 in %v", pgids)
	}
}
