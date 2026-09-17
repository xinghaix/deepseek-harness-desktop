package update

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"deepseek-harness-desktop/internal/desktopstate"
)

const transactionFileName = "update-transaction.json"

var (
	ErrNoTransaction      = errors.New("update: no update transaction")
	ErrTransactionPending = errors.New("update: update transaction is still pending")
	ErrBackupExists       = errors.New("update: backup already exists")
	ErrBackupMissing      = errors.New("update: transaction backup is missing")
	ErrIdentityMismatch   = errors.New("update: transaction executable identity mismatch")
	transactionMu         sync.Mutex
)

// TransactionPhase is persisted before and after each replacement step. A
// healthy marker is represented by PhaseHealthy; CleanupLeftovers only removes
// a backup from that phase.
type TransactionPhase string

const (
	TransactionApplying   TransactionPhase = "applying"
	TransactionReplaced   TransactionPhase = "replaced"
	TransactionLaunched   TransactionPhase = "launched"
	TransactionHealthy    TransactionPhase = "healthy"
	TransactionRolledBack TransactionPhase = "rolledBack"
)

// TransactionState is the durable update/rollback record. Target and Backup
// are absolute paths owned by the updater; Artifact is informational and is
// never executed.
type TransactionState struct {
	Version       int              `json:"version"`
	ID            string           `json:"id"`
	Phase         TransactionPhase `json:"phase"`
	Executable    string           `json:"executable,omitempty"`
	Target        string           `json:"target"`
	Backup        string           `json:"backup"`
	TargetExisted bool             `json:"targetExisted"`
	Artifact      string           `json:"artifact"`
	StartedAt     time.Time        `json:"startedAt"`
	Healthy       bool             `json:"healthy"`
}

// TransactionStore is the persistence seam for update recovery. The default
// implementation writes an atomic, mode-0600 JSON file in the desktop state
// directory; tests/tools can use an explicit path.
type TransactionStore interface {
	Load() (TransactionState, error)
	Save(TransactionState) error
	Clear() error
}

// FileTransactionStore persists one transaction record.
type FileTransactionStore struct {
	Path string
}

func NewFileTransactionStore(path string) *FileTransactionStore {
	return &FileTransactionStore{Path: path}
}

func (s *FileTransactionStore) Load() (TransactionState, error) {
	if s == nil || strings.TrimSpace(s.Path) == "" {
		return TransactionState{}, errors.New("update: transaction path is empty")
	}
	data, err := os.ReadFile(s.Path)
	if err != nil {
		if os.IsNotExist(err) {
			return TransactionState{}, ErrNoTransaction
		}
		return TransactionState{}, err
	}
	dec := json.NewDecoder(strings.NewReader(string(data)))
	dec.DisallowUnknownFields()
	var tx TransactionState
	if err := dec.Decode(&tx); err != nil {
		return TransactionState{}, fmt.Errorf("update: invalid transaction state: %w", err)
	}
	var extra any
	if err := dec.Decode(&extra); !errors.Is(err, io.EOF) {
		if err == nil {
			return TransactionState{}, errors.New("update: multiple transaction JSON values")
		}
		return TransactionState{}, fmt.Errorf("update: invalid transaction state trailer: %w", err)
	}
	if err := validateTransaction(tx); err != nil {
		return TransactionState{}, err
	}
	return tx, nil
}

func (s *FileTransactionStore) Save(tx TransactionState) error {
	if s == nil || strings.TrimSpace(s.Path) == "" {
		return errors.New("update: transaction path is empty")
	}
	if err := validateTransaction(tx); err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(s.Path), 0o700); err != nil {
		return err
	}
	payload, err := json.MarshalIndent(tx, "", "  ")
	if err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(s.Path), ".update-transaction-*.tmp")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	defer os.Remove(tmpPath)
	if err := tmp.Chmod(0o600); err != nil {
		_ = tmp.Close()
		return err
	}
	if _, err := tmp.Write(payload); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Sync(); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmpPath, s.Path)
}

func (s *FileTransactionStore) Clear() error {
	if s == nil || strings.TrimSpace(s.Path) == "" {
		return errors.New("update: transaction path is empty")
	}
	if err := os.Remove(s.Path); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}

func validateTransaction(tx TransactionState) error {
	if tx.Version != 1 {
		return fmt.Errorf("update: unsupported transaction version %d", tx.Version)
	}
	if strings.TrimSpace(tx.ID) == "" || strings.TrimSpace(tx.Target) == "" || strings.TrimSpace(tx.Backup) == "" {
		return errors.New("update: incomplete transaction state")
	}
	if tx.Executable != "" && !filepath.IsAbs(tx.Executable) {
		return errors.New("update: transaction executable path is not absolute")
	}
	if !filepath.IsAbs(tx.Target) || !filepath.IsAbs(tx.Backup) || filepath.Clean(tx.Backup) != filepath.Clean(tx.Target+".old") {
		return errors.New("update: transaction paths are not a target/.old pair")
	}
	switch tx.Phase {
	case TransactionApplying, TransactionReplaced, TransactionLaunched, TransactionHealthy, TransactionRolledBack:
		return nil
	default:
		return fmt.Errorf("update: invalid transaction phase %q", tx.Phase)
	}
}

func validateTransactionIdentity(tx TransactionState, identity updateIdentity) error {
	if filepath.Clean(tx.Target) != filepath.Clean(identity.Target) || filepath.Clean(tx.Backup) != filepath.Clean(identity.Backup) {
		return fmt.Errorf("%w: target %q does not match current target %q", ErrIdentityMismatch, tx.Target, identity.Target)
	}
	if tx.Executable != "" && filepath.Clean(tx.Executable) != filepath.Clean(identity.Executable) {
		return fmt.Errorf("%w: executable %q does not match current executable %q", ErrIdentityMismatch, tx.Executable, identity.Executable)
	}
	return nil
}

func ensureCurrentTransactionIdentity(identity updateIdentity) error {
	transactionMu.Lock()
	defer transactionMu.Unlock()
	store, err := defaultTransactionStore()
	if err != nil {
		return err
	}
	tx, err := store.Load()
	if err != nil {
		return err
	}
	return validateTransactionIdentity(tx, identity)
}

func defaultTransactionStore() (*FileTransactionStore, error) {
	dir, err := desktopstate.Dir()
	if err != nil {
		return nil, err
	}
	return NewFileTransactionStore(filepath.Join(dir, transactionFileName)), nil
}

// LoadTransaction loads the default durable update record.
func LoadTransaction() (TransactionState, error) {
	transactionMu.Lock()
	defer transactionMu.Unlock()
	store, err := defaultTransactionStore()
	if err != nil {
		return TransactionState{}, err
	}
	return store.Load()
}

// SaveTransaction stores a validated update record atomically.
func SaveTransaction(tx TransactionState) error {
	transactionMu.Lock()
	defer transactionMu.Unlock()
	store, err := defaultTransactionStore()
	if err != nil {
		return err
	}
	return store.Save(tx)
}

// ClearTransaction removes the default durable update record.
func ClearTransaction() error {
	transactionMu.Lock()
	defer transactionMu.Unlock()
	store, err := defaultTransactionStore()
	if err != nil {
		return err
	}
	return store.Clear()
}

// BeginTransaction invalidates any previous health marker and records the
// target/backup pair before touching the installed executable.
func BeginTransaction(target, backup, artifact string) (TransactionState, error) {
	return beginTransaction(target, backup, "", artifact)
}

func beginTransaction(target, backup, executable, artifact string) (TransactionState, error) {
	target = filepath.Clean(target)
	backup = filepath.Clean(backup)
	if !filepath.IsAbs(target) || !filepath.IsAbs(backup) || filepath.Clean(backup) != filepath.Clean(target+".old") {
		return TransactionState{}, errors.New("update: invalid transaction target/backup pair")
	}
	if executable != "" {
		executable = filepath.Clean(executable)
		if !filepath.IsAbs(executable) {
			return TransactionState{}, errors.New("update: transaction executable path is not absolute")
		}
	}

	transactionMu.Lock()
	defer transactionMu.Unlock()
	store, err := defaultTransactionStore()
	if err != nil {
		return TransactionState{}, err
	}
	if existing, loadErr := store.Load(); loadErr == nil {
		if filepath.Clean(existing.Target) != target || filepath.Clean(existing.Backup) != backup {
			return TransactionState{}, fmt.Errorf("%w: previous target %q does not match requested target %q", ErrIdentityMismatch, existing.Target, target)
		}
		if existing.Executable != "" && executable != "" && filepath.Clean(existing.Executable) != executable {
			return TransactionState{}, fmt.Errorf("%w: previous executable %q does not match requested executable %q", ErrIdentityMismatch, existing.Executable, executable)
		}
		backupExists := false
		if _, statErr := os.Lstat(existing.Backup); statErr == nil {
			backupExists = true
		} else if !os.IsNotExist(statErr) {
			return TransactionState{}, statErr
		}
		switch existing.Phase {
		case TransactionApplying, TransactionReplaced, TransactionLaunched:
			if !backupExists {
				// An applying transaction without its backup has not committed a
				// replace (or has lost the only recoverable copy). Do not guess;
				// retaining the record prevents a new update from overwriting the
				// only known installation.
				return TransactionState{}, fmt.Errorf("%w: %w", ErrTransactionPending, ErrBackupMissing)
			}
			if err := rollbackTransactionLocked(store, existing); err != nil {
				return TransactionState{}, err
			}
		case TransactionRolledBack:
			if backupExists {
				// A prior rollback may have failed after persisting its terminal
				// phase. Retry the safe restore before starting another update.
				if err := rollbackTransactionLocked(store, existing); err != nil {
					return TransactionState{}, err
				}
			}
		case TransactionHealthy:
			if backupExists {
				// Healthy means the new installation is authoritative. A backup
				// left by a failed cleanup must never be mistaken for the next
				// transaction's backup.
				return TransactionState{}, fmt.Errorf("%w: %s", ErrBackupExists, existing.Backup)
			}
		default:
			return TransactionState{}, fmt.Errorf("update: invalid previous transaction phase %q", existing.Phase)
		}
		// The previous transaction is terminal and has no backup left. It is
		// safe to replace only its metadata; never overwrite a pending record.
		if err := store.Clear(); err != nil {
			return TransactionState{}, err
		}
	} else if !errors.Is(loadErr, ErrNoTransaction) {
		return TransactionState{}, loadErr
	}
	if _, err := os.Lstat(backup); err == nil {
		return TransactionState{}, fmt.Errorf("%w: %s", ErrBackupExists, backup)
	} else if !os.IsNotExist(err) {
		return TransactionState{}, err
	}
	targetExisted := false
	if _, err := os.Lstat(target); err == nil {
		targetExisted = true
	} else if !os.IsNotExist(err) {
		return TransactionState{}, err
	}
	tx := TransactionState{
		Version:       1,
		ID:            fmt.Sprintf("%d", time.Now().UnixNano()),
		Phase:         TransactionApplying,
		Executable:    executable,
		Target:        target,
		Backup:        backup,
		TargetExisted: targetExisted,
		Artifact:      filepath.Base(artifact),
		StartedAt:     time.Now().UTC(),
	}
	if err := store.Save(tx); err != nil {
		return TransactionState{}, err
	}
	return tx, nil
}

// UpdateTransactionPhase advances the current record without changing its
// target. Phase transitions are monotonic except that Rollback is terminal.
func UpdateTransactionPhase(phase TransactionPhase) (TransactionState, error) {
	transactionMu.Lock()
	defer transactionMu.Unlock()
	store, err := defaultTransactionStore()
	if err != nil {
		return TransactionState{}, err
	}
	tx, err := store.Load()
	if err != nil {
		return TransactionState{}, err
	}
	if !validPhaseTransition(tx.Phase, phase) {
		return TransactionState{}, fmt.Errorf("update: invalid transaction transition %q -> %q", tx.Phase, phase)
	}
	tx.Phase = phase
	if phase != TransactionHealthy {
		tx.Healthy = false
	}
	if err := store.Save(tx); err != nil {
		return TransactionState{}, err
	}
	return tx, nil
}

func validPhaseTransition(from, to TransactionPhase) bool {
	if from == to {
		return true
	}
	switch from {
	case TransactionApplying:
		return to == TransactionReplaced || to == TransactionRolledBack
	case TransactionReplaced:
		return to == TransactionLaunched || to == TransactionRolledBack
	case TransactionLaunched:
		return to == TransactionHealthy || to == TransactionRolledBack
	case TransactionHealthy:
		return to == TransactionHealthy
	case TransactionRolledBack:
		return to == TransactionRolledBack
	default:
		return false
	}
}

// MarkHealthy records a post-launch health marker. It is intentionally a
// separate call from CleanupLeftovers so a startup crash cannot cause an
// unconditional .old deletion.
func MarkHealthy() error {
	transactionMu.Lock()
	defer transactionMu.Unlock()
	store, err := defaultTransactionStore()
	if err != nil {
		return err
	}
	tx, err := store.Load()
	if errors.Is(err, ErrNoTransaction) {
		return nil
	}
	if err != nil {
		return err
	}
	if err := validateStoredCurrentIdentity(tx); err != nil {
		return err
	}
	if tx.Phase == TransactionHealthy && tx.Healthy {
		return nil
	}
	if tx.Phase != TransactionLaunched {
		return fmt.Errorf("update: cannot mark transaction %q healthy", tx.Phase)
	}
	tx.Phase = TransactionHealthy
	tx.Healthy = true
	return store.Save(tx)
}

// RollbackTransaction restores the persisted backup and leaves a terminal
// rolledBack record for diagnostics. It is safe to call when no transaction is
// present. A transaction created by ApplyAndRelaunch is also bound to the
// resolved current executable, so a stale record cannot replace an unrelated
// path after the application has moved.
func RollbackTransaction() error {
	transactionMu.Lock()
	defer transactionMu.Unlock()
	store, err := defaultTransactionStore()
	if err != nil {
		return err
	}
	tx, err := store.Load()
	if errors.Is(err, ErrNoTransaction) {
		return nil
	}
	if err != nil {
		return err
	}
	if err := validateStoredCurrentIdentity(tx); err != nil {
		return err
	}
	return rollbackTransactionLocked(store, tx)
}

func rollbackTransactionLocked(store *FileTransactionStore, tx TransactionState) error {
	if tx.Backup == "" {
		return errors.New("update: transaction backup is empty")
	}
	if _, err := os.Lstat(tx.Backup); err != nil {
		if os.IsNotExist(err) {
			// Without a backup, do not remove a target: it may still be the only
			// recoverable installation. A missing target is safe to mark terminal.
			if _, targetErr := os.Lstat(tx.Target); targetErr == nil {
				return fmt.Errorf("%w: %s", ErrBackupMissing, tx.Backup)
			} else if !os.IsNotExist(targetErr) {
				return targetErr
			}
			tx.Phase = TransactionRolledBack
			tx.Healthy = false
			return store.Save(tx)
		}
		return err
	}
	if err := restorePath(tx.Target, tx.Backup, tx.TargetExisted); err != nil {
		return err
	}
	tx.Phase = TransactionRolledBack
	tx.Healthy = false
	return store.Save(tx)
}

func validateStoredCurrentIdentity(tx TransactionState) error {
	if tx.Executable == "" {
		return nil
	}
	identity, err := currentUpdateIdentity()
	if err != nil {
		return err
	}
	return validateTransactionIdentity(tx, identity)
}

// cleanupTransactionLeftovers removes a backup only after MarkHealthy wrote a
// matching healthy marker. Unknown/legacy .old files are deliberately left in
// place rather than being guessed at or deleted at startup.
func cleanupTransactionLeftovers() {
	tx, err := LoadTransaction()
	if err != nil || tx.Phase != TransactionHealthy || !tx.Healthy {
		return
	}
	if tx.Backup != "" {
		_ = os.RemoveAll(tx.Backup)
	}
	_ = ClearTransaction()
}
