package dsh

import (
	"context"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"sync"
)

// Framed streams are reserved for a future dsh Host/FD or pipe adapter. The
// installed dsh web process remains HTTP; this module only defines the bounded
// protocol seam and its backpressure primitive so a future adapter cannot grow
// an unbounded in-memory request/response queue.
const (
	FrameMagic             uint32 = 0x44534833 // "DSH3"
	FrameHeaderBytes              = 13
	MaxFramePayloadBytes          = 64 * 1024
	MaxControlPayloadBytes        = 1 * 1024 * 1024
)

type FrameType uint8

const (
	FrameStart  FrameType = 1
	FrameData   FrameType = 2
	FrameEnd    FrameType = 3
	FrameCancel FrameType = 4
	FrameError  FrameType = 5
)

type Frame struct {
	Type     FrameType
	StreamID uint32
	Payload  []byte
}

var (
	ErrFrameMagic       = errors.New("dsh frame: invalid magic")
	ErrFrameType        = errors.New("dsh frame: invalid type")
	ErrFrameStreamID    = errors.New("dsh frame: invalid stream id")
	ErrFrameTooLarge    = errors.New("dsh frame: payload exceeds limit")
	ErrFrameShortHeader = errors.New("dsh frame: truncated header")
)

func framePayloadLimit(kind FrameType) int {
	switch kind {
	case FrameStart, FrameError:
		return MaxControlPayloadBytes
	case FrameData, FrameEnd, FrameCancel:
		return MaxFramePayloadBytes
	default:
		return 0
	}
}

func validateFrame(frame Frame) error {
	if framePayloadLimit(frame.Type) == 0 {
		return fmt.Errorf("%w: %d", ErrFrameType, frame.Type)
	}
	if frame.StreamID == 0 {
		return ErrFrameStreamID
	}
	if len(frame.Payload) > framePayloadLimit(frame.Type) {
		return ErrFrameTooLarge
	}
	return nil
}

func EncodeFrame(frame Frame) ([]byte, error) {
	if err := validateFrame(frame); err != nil {
		return nil, err
	}
	encoded := make([]byte, FrameHeaderBytes+len(frame.Payload))
	binary.BigEndian.PutUint32(encoded[0:4], FrameMagic)
	encoded[4] = byte(frame.Type)
	binary.BigEndian.PutUint32(encoded[5:9], frame.StreamID)
	binary.BigEndian.PutUint32(encoded[9:13], uint32(len(frame.Payload)))
	copy(encoded[FrameHeaderBytes:], frame.Payload)
	return encoded, nil
}

func DecodeFrame(r io.Reader) (Frame, error) {
	var header [FrameHeaderBytes]byte
	if _, err := io.ReadFull(r, header[:]); err != nil {
		if errors.Is(err, io.EOF) || errors.Is(err, io.ErrUnexpectedEOF) {
			return Frame{}, ErrFrameShortHeader
		}
		return Frame{}, err
	}
	if binary.BigEndian.Uint32(header[0:4]) != FrameMagic {
		return Frame{}, ErrFrameMagic
	}
	frame := Frame{
		Type:     FrameType(header[4]),
		StreamID: binary.BigEndian.Uint32(header[5:9]),
	}
	limit := framePayloadLimit(frame.Type)
	if limit == 0 {
		return Frame{}, fmt.Errorf("%w: %d", ErrFrameType, frame.Type)
	}
	length := binary.BigEndian.Uint32(header[9:13])
	if length > uint32(limit) {
		return Frame{}, ErrFrameTooLarge
	}
	if frame.StreamID == 0 {
		return Frame{}, ErrFrameStreamID
	}
	if length == 0 {
		return frame, nil
	}
	frame.Payload = make([]byte, int(length))
	if _, err := io.ReadFull(r, frame.Payload); err != nil {
		return Frame{}, err
	}
	return frame, nil
}

type FramedStream struct {
	read  io.Reader
	mu    sync.Mutex
	write io.Writer
}

func NewFramedStream(read io.Reader, write io.Writer) *FramedStream {
	return &FramedStream{read: read, write: write}
}

func (s *FramedStream) ReadFrame() (Frame, error) { return DecodeFrame(s.read) }

func (s *FramedStream) WriteFrame(frame Frame) error {
	encoded, err := EncodeFrame(frame)
	if err != nil {
		return err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	return writeAll(s.write, encoded)
}

func writeAll(w io.Writer, data []byte) error {
	for len(data) > 0 {
		n, err := w.Write(data)
		if n > 0 {
			data = data[n:]
		}
		if err != nil {
			return err
		}
		if n == 0 {
			return io.ErrShortWrite
		}
	}
	return nil
}

// BoundedFrameWriter reserves bounded wire bytes before writing. The returned
// release function must be called when the consumer has drained the frame;
// until then later writers block or return ctx.Err(). This is explicit
// backpressure rather than an unbounded buffered channel.
type BoundedFrameWriter struct {
	stream  *FramedStream
	mu      sync.Mutex
	limit   int64
	used    int64
	changed chan struct{}
}

func NewBoundedFrameWriter(write io.Writer, maxBytes int64) (*BoundedFrameWriter, error) {
	if write == nil || maxBytes < int64(FrameHeaderBytes) {
		return nil, errors.New("dsh frame: invalid writer or backpressure budget")
	}
	return &BoundedFrameWriter{stream: NewFramedStream(nil, write), limit: maxBytes, changed: make(chan struct{})}, nil
}

func (w *BoundedFrameWriter) WriteFrame(ctx context.Context, frame Frame) (func(), error) {
	if err := validateFrame(frame); err != nil {
		return nil, err
	}
	size := int64(FrameHeaderBytes + len(frame.Payload))
	if size > w.limit {
		return nil, ErrFrameTooLarge
	}
	// Reserve the entire frame atomically. Partial reservations can deadlock
	// competing writers even when each individual frame fits the budget.
	for {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		w.mu.Lock()
		if size <= w.limit-w.used {
			w.used += size
			w.mu.Unlock()
			break
		}
		changed := w.changed
		w.mu.Unlock()
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-changed:
		}
	}
	var once sync.Once
	release := func() {
		once.Do(func() {
			w.mu.Lock()
			w.used -= size
			close(w.changed)
			w.changed = make(chan struct{})
			w.mu.Unlock()
		})
	}
	// Cancellation governs admission; interrupting an arbitrary io.Writer
	// requires the transport owner to close it or set its write deadline.
	if err := w.stream.WriteFrame(frame); err != nil {
		release()
		return nil, err
	}
	return release, nil
}
