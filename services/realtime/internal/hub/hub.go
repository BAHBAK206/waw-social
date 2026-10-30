// Package hub fans realtime events out to WebSocket clients.
package hub

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"sync"
	"sync/atomic"
	"time"

	"github.com/qubedu/realtime/internal/authz"
)

// Presence tracks which users are online (implemented with Redis in production).
type Presence interface {
	Online(ctx context.Context, uid string)
	Offline(ctx context.Context, uid string)
	Refresh(ctx context.Context, uids []string)
}

type noopPresence struct{}

func (noopPresence) Online(context.Context, string)    {}
func (noopPresence) Offline(context.Context, string)   {}
func (noopPresence) Refresh(context.Context, []string) {}

var (
	ErrInvalidChannel = errors.New("invalid_channel")
	ErrForbidden      = errors.New("forbidden")
	ErrNotSubscribed  = errors.New("not_subscribed")
	ErrEventNotAllow  = errors.New("event_not_allowed")
	ErrPeerNotFound   = errors.New("peer_not_found")
	ErrTooManySubs    = errors.New("too_many_subscriptions")
)

const maxSubscriptionsPerClient = 200

// Stats are exposed on /health.
type Stats struct {
	Connections int64 `json:"connections"`
	Users       int   `json:"users"`
	Channels    int   `json:"channels"`
	Delivered   int64 `json:"delivered"`
	Dropped     int64 `json:"dropped"`
}

type Hub struct {
	mu       sync.RWMutex
	clients  map[*Client]struct{}
	byConn   map[string]*Client
	byUser   map[string]map[*Client]struct{}
	channels map[string]map[*Client]struct{}

	authz    authz.Checker
	presence Presence
	log      *slog.Logger

	connections atomic.Int64
	delivered   atomic.Int64
	dropped     atomic.Int64
}

func New(checker authz.Checker, presence Presence, log *slog.Logger) *Hub {
	if presence == nil {
		presence = noopPresence{}
	}
	if log == nil {
		log = slog.Default()
	}
	return &Hub{
		clients:  map[*Client]struct{}{},
		byConn:   map[string]*Client{},
		byUser:   map[string]map[*Client]struct{}{},
		channels: map[string]map[*Client]struct{}{},
		authz:    checker,
		presence: presence,
		log:      log,
	}
}

func (h *Hub) Stats() Stats {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return Stats{
		Connections: h.connections.Load(),
		Users:       len(h.byUser),
		Channels:    len(h.channels),
		Delivered:   h.delivered.Load(),
		Dropped:     h.dropped.Load(),
	}
}

// Register adds an authenticated client and subscribes it to its personal and site channels.
func (h *Hub) Register(c *Client) {
	h.mu.Lock()
	h.clients[c] = struct{}{}
	h.byConn[c.id] = c
	first := false
	if h.byUser[c.uid] == nil {
		h.byUser[c.uid] = map[*Client]struct{}{}
		first = true
	}
	h.byUser[c.uid][c] = struct{}{}
	for _, ch := range []string{"user:" + c.uid, "site"} {
		h.addSubLocked(c, ch)
	}
	h.mu.Unlock()
	h.connections.Add(1)
	if first {
		h.presence.Online(context.Background(), c.uid)
	}
}

// Unregister removes a client and announces it left any live rooms.
func (h *Hub) Unregister(c *Client) {
	h.mu.Lock()
	if _, ok := h.clients[c]; !ok {
		h.mu.Unlock()
		return
	}
	delete(h.clients, c)
	delete(h.byConn, c.id)
	var liveLeft []string
	for ch := range c.subs {
		if channelKind(ch) == "live" {
			liveLeft = append(liveLeft, ch)
		}
		h.removeSubLocked(c, ch)
	}
	last := false
	if set := h.byUser[c.uid]; set != nil {
		delete(set, c)
		if len(set) == 0 {
			delete(h.byUser, c.uid)
			last = true
		}
	}
	h.mu.Unlock()
	h.connections.Add(-1)
	c.closeSend()
	for _, ch := range liveLeft {
		h.broadcastPeer(ch, "peer-left", c, nil)
	}
	if last {
		h.presence.Offline(context.Background(), c.uid)
	}
}

func (h *Hub) addSubLocked(c *Client, ch string) {
	if h.channels[ch] == nil {
		h.channels[ch] = map[*Client]struct{}{}
	}
	h.channels[ch][c] = struct{}{}
	c.subs[ch] = struct{}{}
}

func (h *Hub) removeSubLocked(c *Client, ch string) {
	if set := h.channels[ch]; set != nil {
		delete(set, c)
		if len(set) == 0 {
			delete(h.channels, ch)
		}
	}
	delete(c.subs, ch)
}

// Subscribe authorizes and adds a channel subscription.
func (h *Hub) Subscribe(ctx context.Context, c *Client, ch string) error {
	if !ValidChannel(ch) {
		return ErrInvalidChannel
	}
	h.mu.RLock()
	_, already := c.subs[ch]
	count := len(c.subs)
	h.mu.RUnlock()
	if already {
		return nil
	}
	if count >= maxSubscriptionsPerClient {
		return ErrTooManySubs
	}
	ok, err := h.authz.Allowed(ctx, c.uid, ch)
	if err != nil {
		h.log.Warn("authorize failed", "channel", ch, "err", err)
		return ErrForbidden
	}
	if !ok {
		return ErrForbidden
	}
	h.mu.Lock()
	if _, alive := h.clients[c]; !alive {
		h.mu.Unlock()
		return ErrForbidden
	}
	h.addSubLocked(c, ch)
	var peers []Peer
	if channelKind(ch) == "live" {
		for other := range h.channels[ch] {
			if other != c {
				peers = append(peers, other.peer())
			}
		}
	}
	h.mu.Unlock()
	if channelKind(ch) == "live" {
		c.enqueue(Outbound{Type: "peers", Channel: ch, Peers: peers})
		h.broadcastPeer(ch, "peer-joined", c, nil)
	}
	return nil
}

func (h *Hub) Unsubscribe(c *Client, ch string) {
	h.mu.Lock()
	_, had := c.subs[ch]
	if had && ch != "site" && ch != "user:"+c.uid {
		h.removeSubLocked(c, ch)
	} else {
		had = false
	}
	h.mu.Unlock()
	if had && channelKind(ch) == "live" {
		h.broadcastPeer(ch, "peer-left", c, nil)
	}
}

func (h *Hub) broadcastPeer(ch, event string, c *Client, data json.RawMessage) {
	p := c.peer()
	h.fanout(ch, Outbound{Type: "event", Channel: ch, Event: event, From: &p, Data: data}, func(o *Client) bool { return o != c })
}

// fanout delivers to all subscribers of a channel that pass the filter.
func (h *Hub) fanout(ch string, msg Outbound, keep func(*Client) bool) {
	payload, err := json.Marshal(msg)
	if err != nil {
		return
	}
	h.mu.RLock()
	targets := make([]*Client, 0, len(h.channels[ch]))
	for c := range h.channels[ch] {
		if keep == nil || keep(c) {
			targets = append(targets, c)
		}
	}
	h.mu.RUnlock()
	for _, c := range targets {
		if c.trySend(payload) {
			h.delivered.Add(1)
		} else {
			h.dropped.Add(1)
		}
	}
}

// Deliver routes a server event to every channel it names.
func (h *Hub) Deliver(ev ServerEvent) {
	for _, ch := range ev.Channels {
		if !ValidChannel(ch) {
			continue
		}
		except := ev.ExceptUser
		h.fanout(ch, Outbound{Type: "event", Channel: ch, Event: ev.Event, Data: ev.Data}, func(c *Client) bool { return except == "" || c.uid != except })
		if ev.Event == "room:status" && channelKind(ch) == "live" {
			var d struct {
				Status string `json:"status"`
			}
			if json.Unmarshal(ev.Data, &d) == nil && d.Status == "ended" {
				h.closeChannel(ch)
			}
		}
	}
}

// closeChannel drops every subscription (an ended live room cannot be rejoined).
func (h *Hub) closeChannel(ch string) {
	h.mu.Lock()
	for c := range h.channels[ch] {
		delete(c.subs, ch)
	}
	delete(h.channels, ch)
	h.mu.Unlock()
	if inv, ok := h.authz.(interface{ Invalidate(string) }); ok {
		inv.Invalidate(ch)
	}
}

// PublishFromClient relays an allowed ephemeral event to the channel (excluding the sender).
func (h *Hub) PublishFromClient(c *Client, ch, event string, data json.RawMessage) error {
	if !clientEventAllowed(ch, event) {
		return ErrEventNotAllow
	}
	h.mu.RLock()
	_, subscribed := c.subs[ch]
	h.mu.RUnlock()
	if !subscribed {
		return ErrNotSubscribed
	}
	p := c.peer()
	h.fanout(ch, Outbound{Type: "event", Channel: ch, Event: event, From: &p, Data: data}, func(o *Client) bool { return o != c })
	return nil
}

// Signal sends a WebRTC signaling payload to one peer in the same live channel.
func (h *Hub) Signal(c *Client, ch, to string, data json.RawMessage) error {
	if channelKind(ch) != "live" {
		return ErrEventNotAllow
	}
	h.mu.RLock()
	_, mine := c.subs[ch]
	target := h.byConn[to]
	var theirs bool
	if target != nil {
		_, theirs = target.subs[ch]
	}
	h.mu.RUnlock()
	if !mine {
		return ErrNotSubscribed
	}
	if target == nil || !theirs {
		return ErrPeerNotFound
	}
	p := c.peer()
	payload, _ := json.Marshal(Outbound{Type: "signal", Channel: ch, From: &p, Data: data})
	if target.trySend(payload) {
		h.delivered.Add(1)
	} else {
		h.dropped.Add(1)
	}
	return nil
}

// OnlineUsers lists connected user ids (for presence refresh).
func (h *Hub) OnlineUsers() []string {
	h.mu.RLock()
	defer h.mu.RUnlock()
	out := make([]string, 0, len(h.byUser))
	for uid := range h.byUser {
		out = append(out, uid)
	}
	return out
}

// RunPresenceRefresher keeps online keys alive while users stay connected.
func (h *Hub) RunPresenceRefresher(ctx context.Context, every time.Duration) {
	t := time.NewTicker(every)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			h.presence.Refresh(ctx, h.OnlineUsers())
		}
	}
}
