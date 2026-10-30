package hub

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"sync"
	"time"

	"github.com/qubedu/realtime/internal/auth"
)

// Conn abstracts a WebSocket so the protocol can be tested without a network.
type Conn interface {
	Read(ctx context.Context) ([]byte, error)
	Write(ctx context.Context, data []byte) error
	Ping(ctx context.Context) error
	Close(code int, reason string) error
}

const (
	sendBuffer       = 256
	authTimeout      = 10 * time.Second
	writeTimeout     = 10 * time.Second
	pingInterval     = 25 * time.Second
	expiryGrace      = 2 * time.Minute
	CloseAuthFailed  = 4001
	CloseRateLimited = 4008
	CloseSlowClient  = 4009
)

type Client struct {
	id   string
	uid  string
	name string
	subs map[string]struct{} // guarded by Hub.mu

	mu     sync.Mutex
	send   chan []byte
	closed bool
	exp    time.Time

	tokens   float64
	lastFill time.Time
}

func newID() string {
	b := make([]byte, 12)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func NewClient(uid, name string, exp time.Time) *Client {
	return &Client{id: newID(), uid: uid, name: name, subs: map[string]struct{}{}, send: make(chan []byte, sendBuffer), exp: exp, tokens: 60, lastFill: time.Now()}
}

func (c *Client) ID() string  { return c.id }
func (c *Client) UID() string { return c.uid }

func (c *Client) peer() Peer { return Peer{ConnID: c.id, UID: c.uid, Name: c.name} }

func (c *Client) trySend(b []byte) bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.closed {
		return false
	}
	select {
	case c.send <- b:
		return true
	default:
		return false
	}
}

func (c *Client) enqueue(m Outbound) {
	if b, err := json.Marshal(m); err == nil {
		c.trySend(b)
	}
}

func (c *Client) closeSend() {
	c.mu.Lock()
	defer c.mu.Unlock()
	if !c.closed {
		c.closed = true
		close(c.send)
	}
}

// allow implements a token bucket: 60 burst, 30 frames/second sustained.
func (c *Client) allow() bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	now := time.Now()
	c.tokens += now.Sub(c.lastFill).Seconds() * 30
	if c.tokens > 60 {
		c.tokens = 60
	}
	c.lastFill = now
	if c.tokens < 1 {
		return false
	}
	c.tokens--
	return true
}

func (c *Client) expired() bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	return time.Now().After(c.exp.Add(expiryGrace))
}

func (c *Client) setExpiry(t time.Time) {
	c.mu.Lock()
	c.exp = t
	c.mu.Unlock()
}

func writeJSON(ctx context.Context, conn Conn, m Outbound) error {
	b, err := json.Marshal(m)
	if err != nil {
		return err
	}
	wctx, cancel := context.WithTimeout(ctx, writeTimeout)
	defer cancel()
	return conn.Write(wctx, b)
}

// Serve runs one connection: authenticate, register, pump messages, clean up.
func Serve(ctx context.Context, conn Conn, verifier *auth.Verifier, h *Hub) {
	actx, cancel := context.WithTimeout(ctx, authTimeout)
	first, err := conn.Read(actx)
	cancel()
	if err != nil {
		_ = conn.Close(CloseAuthFailed, "auth_timeout")
		return
	}
	var in Inbound
	if json.Unmarshal(first, &in) != nil || in.Type != "auth" || in.Token == "" {
		_ = writeJSON(ctx, conn, Outbound{Type: "error", Code: "auth_required"})
		_ = conn.Close(CloseAuthFailed, "auth_required")
		return
	}
	claims, err := verifier.Verify(in.Token)
	if err != nil {
		_ = writeJSON(ctx, conn, Outbound{Type: "error", Code: "auth_failed"})
		_ = conn.Close(CloseAuthFailed, "auth_failed")
		return
	}
	c := NewClient(claims.Subject, claims.Name, time.Unix(claims.ExpiresAt, 0))
	h.Register(c)
	defer h.Unregister(c)
	c.enqueue(Outbound{Type: "welcome", ConnID: c.id, UID: c.uid})

	ctx, stop := context.WithCancel(ctx)
	defer stop()
	writerDone := make(chan struct{})
	go func() {
		defer close(writerDone)
		ticker := time.NewTicker(pingInterval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case b, ok := <-c.send:
				if !ok {
					return
				}
				wctx, cancel := context.WithTimeout(ctx, writeTimeout)
				err := conn.Write(wctx, b)
				cancel()
				if err != nil {
					stop()
					return
				}
			case <-ticker.C:
				if c.expired() {
					_ = conn.Close(CloseAuthFailed, "token_expired")
					stop()
					return
				}
				pctx, cancel := context.WithTimeout(ctx, writeTimeout)
				err := conn.Ping(pctx)
				cancel()
				if err != nil {
					stop()
					return
				}
			}
		}
	}()

	for {
		data, err := conn.Read(ctx)
		if err != nil {
			break
		}
		if !c.allow() {
			_ = conn.Close(CloseRateLimited, "rate_limited")
			break
		}
		if err := handleFrame(ctx, h, verifier, c, data); err != nil {
			if errors.Is(err, errFatal) {
				break
			}
		}
	}
	stop()
	<-writerDone
	_ = conn.Close(1000, "bye")
}

var errFatal = errors.New("fatal")

func handleFrame(ctx context.Context, h *Hub, verifier *auth.Verifier, c *Client, data []byte) error {
	var in Inbound
	if err := json.Unmarshal(data, &in); err != nil {
		c.enqueue(Outbound{Type: "error", Code: "bad_frame"})
		return err
	}
	reply := func(err error) {
		if err != nil {
			c.enqueue(Outbound{Type: "error", ID: in.ID, Channel: in.Channel, Code: err.Error()})
		}
	}
	switch in.Type {
	case "ping":
		c.enqueue(Outbound{Type: "pong", ID: in.ID})
	case "auth":
		claims, err := verifier.Verify(in.Token)
		if err != nil || claims.Subject != c.uid {
			c.enqueue(Outbound{Type: "error", ID: in.ID, Code: "auth_failed"})
			return errFatal
		}
		c.setExpiry(time.Unix(claims.ExpiresAt, 0))
		c.enqueue(Outbound{Type: "authed", ID: in.ID})
	case "subscribe":
		sctx, cancel := context.WithTimeout(ctx, 6*time.Second)
		err := h.Subscribe(sctx, c, in.Channel)
		cancel()
		if err != nil {
			reply(err)
			return err
		}
		c.enqueue(Outbound{Type: "subscribed", ID: in.ID, Channel: in.Channel})
	case "unsubscribe":
		h.Unsubscribe(c, in.Channel)
		c.enqueue(Outbound{Type: "unsubscribed", ID: in.ID, Channel: in.Channel})
	case "publish":
		err := h.PublishFromClient(c, in.Channel, in.Event, in.Data)
		reply(err)
		return err
	case "signal":
		err := h.Signal(c, in.Channel, in.To, in.Data)
		reply(err)
		return err
	default:
		c.enqueue(Outbound{Type: "error", ID: in.ID, Code: "unknown_type"})
	}
	return nil
}
