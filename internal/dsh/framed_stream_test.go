package dsh

import (
	"bytes"
	"context"
	"errors"
	"io"
	"sync"
	"testing"
	"time"
)

func TestFrameBudgetRejectsOversizeWithoutWaiting(t *testing.T) {
	var sink bytes.Buffer
	writer, err := NewBoundedFrameWriter(&sink, 128)
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if _, err := writer.WriteFrame(ctx, Frame{Type: FrameData, StreamID: 1, Payload: make([]byte, 116)}); !errors.Is(err, ErrFrameTooLarge) {
		t.Fatalf("129 wire bytes in 128-byte budget: %v", err)
	}
	release, err := writer.WriteFrame(ctx, Frame{Type: FrameData, StreamID: 1, Payload: make([]byte, 115)})
	if err != nil {
		t.Fatal(err)
	}
	release()
	release() // A repeated acknowledgement must not inflate the budget.
	if writer.used != 0 {
		t.Fatalf("budget leaked: %d", writer.used)
	}
}

func TestConcurrentFrameReservationsDoNotDeadlock(t *testing.T) {
	writer, err := NewBoundedFrameWriter(io.Discard, 4096)
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	var workers sync.WaitGroup
	for i := 0; i < 16; i++ {
		workers.Add(1)
		go func() {
			defer workers.Done()
			for j := 0; j < 20; j++ {
				release, err := writer.WriteFrame(ctx, Frame{Type: FrameData, StreamID: 1, Payload: make([]byte, 3000)})
				if err != nil {
					t.Errorf("reservation failed: %v", err)
					return
				}
				release()
			}
		}()
	}
	workers.Wait()
	if writer.used != 0 {
		t.Fatalf("budget leaked: %d", writer.used)
	}
}

func TestFrameRoundTripAndBounds(t *testing.T) {
	want := Frame{Type: FrameData, StreamID: 7, Payload: []byte("hello")}
	encoded, err := EncodeFrame(want)
	if err != nil {
		t.Fatal(err)
	}
	got, err := DecodeFrame(bytes.NewReader(encoded))
	if err != nil {
		t.Fatal(err)
	}
	if got.Type != want.Type || got.StreamID != want.StreamID || string(got.Payload) != string(want.Payload) {
		t.Fatalf("got %+v, want %+v", got, want)
	}
	if _, err := EncodeFrame(Frame{Type: FrameData, StreamID: 1, Payload: make([]byte, MaxFramePayloadBytes+1)}); !errors.Is(err, ErrFrameTooLarge) {
		t.Fatalf("oversize error = %v", err)
	}
	bad := append([]byte(nil), encoded...)
	bad[0]++
	if _, err := DecodeFrame(bytes.NewReader(bad)); !errors.Is(err, ErrFrameMagic) {
		t.Fatalf("magic error = %v", err)
	}
}

func TestBoundedFrameWriterAppliesBackpressureUntilRelease(t *testing.T) {
	var sink bytes.Buffer
	writer, err := NewBoundedFrameWriter(&sink, 128)
	if err != nil {
		t.Fatal(err)
	}
	firstRelease, err := writer.WriteFrame(context.Background(), Frame{Type: FrameData, StreamID: 1, Payload: make([]byte, 60)})
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancel()
	if _, err := writer.WriteFrame(ctx, Frame{Type: FrameData, StreamID: 2, Payload: make([]byte, 60)}); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("backpressure error = %v", err)
	}
	firstRelease()
	secondRelease, err := writer.WriteFrame(context.Background(), Frame{Type: FrameData, StreamID: 2, Payload: make([]byte, 60)})
	if err != nil {
		t.Fatal(err)
	}
	secondRelease()
	if sink.Len() == 0 {
		t.Fatal("writer did not emit frames")
	}
}
