package update

import (
	"errors"
	"os"
	"path/filepath"
	"testing"

	"deepseek-harness-desktop/internal/desktopstate"
)

func TestFileTransactionStoreRoundTripAndValidation(t *testing.T) {
	store := NewFileTransactionStore(filepath.Join(t.TempDir(), "update-transaction.json"))
	tx := TransactionState{
		Version:  1,
		ID:       "tx-1",
		Phase:    TransactionApplying,
		Target:   "/tmp/target",
		Backup:   "/tmp/target.old",
		Artifact: "desktop.bin",
	}
	if err := store.Save(tx); err != nil {
		t.Fatal(err)
	}
	got, err := store.Load()
	if err != nil {
		t.Fatal(err)
	}
	if got.ID != tx.ID || got.Phase != TransactionApplying || got.Target != tx.Target {
		t.Fatalf("round trip: %+v", got)
	}
	if err := store.Save(TransactionState{Version: 1, ID: "bad", Phase: "nope", Target: "/tmp/t", Backup: "/tmp/t.old"}); err == nil {
		t.Fatal("accepted invalid phase")
	}
	if err := store.Clear(); err != nil {
		t.Fatal(err)
	}
	if _, err := store.Load(); !errors.Is(err, ErrNoTransaction) {
		t.Fatalf("load after clear: %v", err)
	}
}

func TestRollbackTransactionRestoresBackup(t *testing.T) {
	stateDir := t.TempDir()
	t.Setenv(desktopstate.StateDirEnv, stateDir)
	desktopstate.ResetCacheForTest()

	target := filepath.Join(t.TempDir(), "desktop")
	backup := target + ".old"
	if err := os.WriteFile(target, []byte("new"), 0o700); err != nil {
		t.Fatal(err)
	}
	if _, err := BeginTransaction(target, backup, "desktop.bin"); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(backup, []byte("old"), 0o700); err != nil {
		t.Fatal(err)
	}
	if _, err := UpdateTransactionPhase(TransactionReplaced); err != nil {
		t.Fatal(err)
	}
	if err := RollbackTransaction(); err != nil {
		t.Fatal(err)
	}
	got, err := os.ReadFile(target)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != "old" {
		t.Fatalf("restored content %q", got)
	}
	tx, err := LoadTransaction()
	if err != nil {
		t.Fatal(err)
	}
	if tx.Phase != TransactionRolledBack {
		t.Fatalf("rollback phase: %+v", tx)
	}
}

func TestBeginTransactionRejectsExistingBackup(t *testing.T) {
	stateDir := t.TempDir()
	t.Setenv(desktopstate.StateDirEnv, stateDir)
	desktopstate.ResetCacheForTest()
	target := filepath.Join(t.TempDir(), "desktop")
	backup := target + ".old"
	if err := os.WriteFile(backup, []byte("old"), 0o700); err != nil {
		t.Fatal(err)
	}
	if _, err := BeginTransaction(target, backup, "desktop.bin"); !errors.Is(err, ErrBackupExists) {
		t.Fatalf("existing backup error = %v", err)
	}
}

func TestCleanupLeftoversRequiresHealthyMarker(t *testing.T) {
	stateDir := t.TempDir()
	t.Setenv(desktopstate.StateDirEnv, stateDir)
	desktopstate.ResetCacheForTest()

	target := filepath.Join(t.TempDir(), "desktop")
	backup := target + ".old"
	if _, err := BeginTransaction(target, backup, "desktop.bin"); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(backup, []byte("old"), 0o600); err != nil {
		t.Fatal(err)
	}
	CleanupLeftovers()
	if _, err := os.Stat(backup); err != nil {
		t.Fatalf("backup removed before healthy marker: %v", err)
	}
	if _, err := UpdateTransactionPhase(TransactionReplaced); err != nil {
		t.Fatal(err)
	}
	if _, err := UpdateTransactionPhase(TransactionLaunched); err != nil {
		t.Fatal(err)
	}
	if err := MarkHealthy(); err != nil {
		t.Fatal(err)
	}
	CleanupLeftovers()
	if _, err := os.Stat(backup); !os.IsNotExist(err) {
		t.Fatalf("backup remains after healthy cleanup: %v", err)
	}
	if _, err := LoadTransaction(); !errors.Is(err, ErrNoTransaction) {
		t.Fatalf("transaction remains after cleanup: %v", err)
	}
}
