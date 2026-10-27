package hub

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/qubedu/realtime/internal/auth"
	"github.com/qubedu/realtime/internal/authz"
)

const secret = "test-secret-test-secret-test-secret!!"

func token(uid, name string) string {
	h, _ := json.Marshal(map[string]any{"alg": "HS256", "typ": "JWT"})
	p, _ := json.Marshal(map[string]any{"sub": uid, "sid": "s", "name": name, "role": "user", "typ": "access", "iss": "qubedu", "aud": "qubedu", "exp": time.Now().Add(time.Hour).Unix()})
	head := base64.RawURLEncoding.EncodeToString(h) + "." + base64.RawURLEncoding.EncodeToString(p)
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(head))
	return head + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

// fakeConn is an in-memory WebSocket.
type fakeConn struct {
	in     chan []byte
	out    chan Outbound
	once   sync.Once
	closed chan struct{}
	code   int
}

func newFake() *fakeConn {
	return &fakeConn{in: make(chan []byte, 64), out: make(chan Outbound, 256), closed: make(chan struct{})}
}

func (f *fakeConn) Read(ctx context.Context) ([]byte, error) {
	select {
	case b := <-f.in:
		return b, nil
	case <-f.closed:
		return nil, errors.New("closed")
	case <-ctx.Done():
		return nil, ctx.Err()
	}
}
func (f *fakeConn) Write(_ context.Context, b []byte) error {
	var m Outbound
	_ = json.Unmarshal(b, &m)
	select {
	case f.out <- m:
	default:
	}
	return nil
}
func (f *fakeConn) Ping(context.Context) error { return nil }
func (f *fakeConn) Close(code int, _ string) error {
	f.once.Do(func() { f.code = code; close(f.closed) })
	return nil
}
func (f *fakeConn) send(t *testing.T, m map[string]any) {
	t.Helper()
	b, _ := json.Marshal(m)
	f.in <- b
}

func (f *fakeConn) expect(t *testing.T, match func(Outbound) bool) Outbound {
	t.Helper()
	timeout := time.After(2 * time.Second)
	for {
		select {
		case m := <-f.out:
			if match(m) {
				return m
			}
		case <-timeout:
			t.Fatalf("timed out waiting for frame")
			return Outbound{}
		}
	}
}

const (
	uA   = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
	uB   = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
	uC   = "cccccccc-cccc-cccc-cccc-cccccccccccc"
	live = "live:11111111-1111-1111-1111-111111111111"
	conv = "conv:22222222-2222-2222-2222-222222222222"
)

func setup(t *testing.T) (*Hub, *auth.Verifier, context.Context) {
	t.Helper()
	checker := authz.StaticChecker{Allow: func(uid, ch string) bool { return uid != uC }}
	h := New(checker, nil, nil)
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	return h, auth.NewVerifier(secret), ctx
}

func connect(t *testing.T, h *Hub, v *auth.Verifier, ctx context.Context, uid, name string) (*fakeConn, string) {
	t.Helper()
	f := newFake()
	go Serve(ctx, f, v, h)
	f.send(t, map[string]any{"type": "auth", "token": token(uid, name)})
	w := f.expect(t, func(m Outbound) bool { return m.Type == "welcome" })
	return f, w.ConnID
}

func TestAuthRequired(t *testing.T) {
	h, v, ctx := setup(t)
	f := newFake()
	go Serve(ctx, f, v, h)
	f.send(t, map[string]any{"type": "auth", "token": "nope"})
	f.expect(t, func(m Outbound) bool { return m.Type == "error" && m.Code == "auth_failed" })
	<-f.closed
	if f.code != CloseAuthFailed {
		t.Fatalf("expected close %d got %d", CloseAuthFailed, f.code)
	}
}

func TestServerEventsAndTyping(t *testing.T) {
	h, v, ctx := setup(t)
	a, _ := connect(t, h, v, ctx, uA, "Ali")
	b, _ := connect(t, h, v, ctx, uB, "Bushra")
	c, _ := connect(t, h, v, ctx, uC, "Outsider")

	a.send(t, map[string]any{"type": "subscribe", "channel": conv, "id": "1"})
	a.expect(t, func(m Outbound) bool { return m.Type == "subscribed" && m.ID == "1" })
	b.send(t, map[string]any{"type": "subscribe", "channel": conv, "id": "2"})
	b.expect(t, func(m Outbound) bool { return m.Type == "subscribed" })
	c.send(t, map[string]any{"type": "subscribe", "channel": conv, "id": "3"})
	c.expect(t, func(m Outbound) bool { return m.Type == "error" && m.Code == "forbidden" })

	h.Deliver(ServerEvent{Channels: []string{conv}, Event: "message:new", Data: json.RawMessage(`{"text":"hi"}`)})
	a.expect(t, func(m Outbound) bool { return m.Event == "message:new" && strings.Contains(string(m.Data), "hi") })
	b.expect(t, func(m Outbound) bool { return m.Event == "message:new" })

	a.send(t, map[string]any{"type": "publish", "channel": conv, "event": "typing"})
	got := b.expect(t, func(m Outbound) bool { return m.Event == "typing" })
	if got.From == nil || got.From.UID != uA || got.From.Name != "Ali" {
		t.Fatalf("typing should carry sender, got %+v", got.From)
	}
	a.send(t, map[string]any{"type": "publish", "channel": conv, "event": "message:new", "id": "x"})
	a.expect(t, func(m Outbound) bool { return m.Type == "error" && m.Code == "event_not_allowed" })

	h.Deliver(ServerEvent{Channels: []string{"user:" + uB}, Event: "notification", Data: json.RawMessage(`{}`)})
	b.expect(t, func(m Outbound) bool { return m.Event == "notification" && m.Channel == "user:"+uB })

	h.Deliver(ServerEvent{Channels: []string{"site"}, Event: "config:changed", Data: json.RawMessage(`{}`), ExceptUser: uA})
	b.expect(t, func(m Outbound) bool { return m.Event == "config:changed" })
	c.expect(t, func(m Outbound) bool { return m.Event == "config:changed" })

	c.send(t, map[string]any{"type": "subscribe", "channel": "user:" + uA, "id": "4"})
	c.expect(t, func(m Outbound) bool { return m.Type == "error" && m.ID == "4" })
}

func TestLiveRoomPeersAndSignaling(t *testing.T) {
	h, v, ctx := setup(t)
	a, aID := connect(t, h, v, ctx, uA, "Teacher")
	b, bID := connect(t, h, v, ctx, uB, "Student")

	a.send(t, map[string]any{"type": "subscribe", "channel": live})
	a.expect(t, func(m Outbound) bool { return m.Type == "peers" && len(m.Peers) == 0 })
	b.send(t, map[string]any{"type": "subscribe", "channel": live})
	peers := b.expect(t, func(m Outbound) bool { return m.Type == "peers" })
	if len(peers.Peers) != 1 || peers.Peers[0].ConnID != aID {
		t.Fatalf("expected teacher in peers, got %+v", peers.Peers)
	}
	joined := a.expect(t, func(m Outbound) bool { return m.Event == "peer-joined" })
	if joined.From.ConnID != bID {
		t.Fatalf("peer-joined from wrong conn")
	}

	a.send(t, map[string]any{"type": "signal", "channel": live, "to": bID, "data": map[string]any{"sdp": "offer"}})
	sig := b.expect(t, func(m Outbound) bool { return m.Type == "signal" })
	if sig.From.ConnID != aID || !strings.Contains(string(sig.Data), "offer") {
		t.Fatalf("bad signal %+v", sig)
	}
	a.send(t, map[string]any{"type": "signal", "channel": live, "to": "nobody", "data": map[string]any{}})
	a.expect(t, func(m Outbound) bool { return m.Type == "error" && m.Code == "peer_not_found" })

	b.send(t, map[string]any{"type": "publish", "channel": live, "event": "hand", "data": map[string]any{"raised": true}})
	a.expect(t, func(m Outbound) bool { return m.Event == "hand" })

	b.send(t, map[string]any{"type": "unsubscribe", "channel": live})
	a.expect(t, func(m Outbound) bool { return m.Event == "peer-left" && m.From.ConnID == bID })

	h.Deliver(ServerEvent{Channels: []string{live}, Event: "room:status", Data: json.RawMessage(`{"status":"ended"}`)})
	a.expect(t, func(m Outbound) bool { return m.Event == "room:status" })
	a.send(t, map[string]any{"type": "publish", "channel": live, "event": "hand", "data": map[string]any{}})
	a.expect(t, func(m Outbound) bool { return m.Type == "error" && m.Code == "not_subscribed" })
}

func TestDisconnectAnnouncesLeave(t *testing.T) {
	h, v, ctx := setup(t)
	a, _ := connect(t, h, v, ctx, uA, "A")
	b, bID := connect(t, h, v, ctx, uB, "B")
	a.send(t, map[string]any{"type": "subscribe", "channel": live})
	a.expect(t, func(m Outbound) bool { return m.Type == "peers" })
	b.send(t, map[string]any{"type": "subscribe", "channel": live})
	b.expect(t, func(m Outbound) bool { return m.Type == "peers" })
	_ = b.Close(1000, "")
	a.expect(t, func(m Outbound) bool { return m.Event == "peer-left" && m.From.ConnID == bID })
	deadline := time.Now().Add(time.Second)
	for h.Stats().Connections != 1 && time.Now().Before(deadline) {
		time.Sleep(10 * time.Millisecond)
	}
	if got := h.Stats().Connections; got != 1 {
		t.Fatalf("expected 1 connection, got %d", got)
	}
}
