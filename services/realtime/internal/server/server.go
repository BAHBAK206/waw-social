// Package server exposes the WebSocket endpoint, health and the internal publish hook.
package server

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/coder/websocket"
	"github.com/redis/go-redis/v9"

	"github.com/qubedu/realtime/internal/auth"
	"github.com/qubedu/realtime/internal/hub"
)

const maxFrameBytes = 64 * 1024

type Config struct {
	AllowedOrigins []string
	InternalToken  string
}

type Server struct {
	hub      *hub.Hub
	verifier *auth.Verifier
	cfg      Config
	log      *slog.Logger
}

func New(h *hub.Hub, v *auth.Verifier, cfg Config, log *slog.Logger) *Server {
	return &Server{hub: h, verifier: v, cfg: cfg, log: log}
}

// wsConn adapts coder/websocket to hub.Conn.
type wsConn struct{ c *websocket.Conn }

func (w wsConn) Read(ctx context.Context) ([]byte, error) {
	typ, data, err := w.c.Read(ctx)
	if err != nil {
		return nil, err
	}
	if typ != websocket.MessageText {
		return nil, errors.New("binary frames are not supported")
	}
	return data, nil
}
func (w wsConn) Write(ctx context.Context, data []byte) error {
	return w.c.Write(ctx, websocket.MessageText, data)
}
func (w wsConn) Ping(ctx context.Context) error { return w.c.Ping(ctx) }
func (w wsConn) Close(code int, reason string) error {
	return w.c.Close(websocket.StatusCode(code), reason)
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/ws", s.handleWS)
	mux.HandleFunc("/health", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("content-type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "stats": s.hub.Stats()})
	})
	mux.HandleFunc("/internal/publish", s.handlePublish)
	return mux
}

func (s *Server) handleWS(w http.ResponseWriter, r *http.Request) {
	opts := &websocket.AcceptOptions{OriginPatterns: s.cfg.AllowedOrigins, CompressionMode: websocket.CompressionContextTakeover}
	for _, o := range s.cfg.AllowedOrigins {
		if o == "*" {
			opts.InsecureSkipVerify = true
		}
	}
	c, err := websocket.Accept(w, r, opts)
	if err != nil {
		s.log.Debug("ws accept failed", "err", err)
		return
	}
	c.SetReadLimit(maxFrameBytes)
	hub.Serve(r.Context(), wsConn{c}, s.verifier, s.hub)
}

func (s *Server) handlePublish(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	token := r.Header.Get("x-internal-token")
	if s.cfg.InternalToken == "" || subtle.ConstantTimeCompare([]byte(token), []byte(s.cfg.InternalToken)) != 1 {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	var ev hub.ServerEvent
	if err := json.Unmarshal(body, &ev); err != nil || ev.Event == "" {
		http.Error(w, "bad event", http.StatusBadRequest)
		return
	}
	s.hub.Deliver(ev)
	w.WriteHeader(http.StatusAccepted)
}

// SubscribeRedis forwards API events from the Redis channel into the hub, reconnecting on failure.
func SubscribeRedis(ctx context.Context, rdb *redis.Client, channel string, h *hub.Hub, log *slog.Logger) {
	backoff := time.Second
	for ctx.Err() == nil {
		ps := rdb.Subscribe(ctx, channel)
		if _, err := ps.Receive(ctx); err != nil {
			log.Warn("redis subscribe failed", "err", err)
			_ = ps.Close()
			select {
			case <-ctx.Done():
				return
			case <-time.After(backoff):
			}
			if backoff < 30*time.Second {
				backoff *= 2
			}
			continue
		}
		backoff = time.Second
		log.Info("subscribed to redis", "channel", channel)
		for msg := range ps.Channel() {
			var ev hub.ServerEvent
			if err := json.Unmarshal([]byte(msg.Payload), &ev); err != nil {
				log.Warn("bad event payload", "err", err)
				continue
			}
			h.Deliver(ev)
		}
		_ = ps.Close()
	}
}

func SplitOrigins(v string) []string {
	var out []string
	for _, p := range strings.Split(v, ",") {
		p = strings.TrimSpace(p)
		p = strings.TrimPrefix(strings.TrimPrefix(p, "https://"), "http://")
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}
