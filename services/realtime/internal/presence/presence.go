// Package presence stores online status in Redis (online:<uid> keys with TTL)
// and tells the API when a user goes offline so last-seen is persisted.
package presence

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
)

const ttl = 90 * time.Second

type Redis struct {
	rdb     *redis.Client
	apiBase string
	token   string
	http    *http.Client
	log     *slog.Logger
}

func NewRedis(rdb *redis.Client, apiBase, token string, log *slog.Logger) *Redis {
	return &Redis{rdb: rdb, apiBase: strings.TrimRight(apiBase, "/"), token: token, http: &http.Client{Timeout: 5 * time.Second}, log: log}
}

func (p *Redis) Online(ctx context.Context, uid string) {
	if p.rdb != nil {
		if err := p.rdb.Set(ctx, "online:"+uid, "1", ttl).Err(); err != nil {
			p.log.Warn("presence online", "err", err)
		}
	}
	p.notify(uid, true)
}

func (p *Redis) Offline(ctx context.Context, uid string) {
	if p.rdb != nil {
		if err := p.rdb.Del(ctx, "online:"+uid).Err(); err != nil {
			p.log.Warn("presence offline", "err", err)
		}
	}
	p.notify(uid, false)
}

func (p *Redis) Refresh(ctx context.Context, uids []string) {
	if p.rdb == nil || len(uids) == 0 {
		return
	}
	pipe := p.rdb.Pipeline()
	for _, uid := range uids {
		pipe.Set(ctx, "online:"+uid, "1", ttl)
	}
	if _, err := pipe.Exec(ctx); err != nil {
		p.log.Warn("presence refresh", "err", err)
	}
}

func (p *Redis) notify(uid string, online bool) {
	if p.apiBase == "" {
		return
	}
	go func() {
		body, _ := json.Marshal(map[string]any{"uid": uid, "online": online})
		req, err := http.NewRequest(http.MethodPost, p.apiBase+"/internal/presence", bytes.NewReader(body))
		if err != nil {
			return
		}
		req.Header.Set("content-type", "application/json")
		req.Header.Set("x-internal-token", p.token)
		res, err := p.http.Do(req)
		if err != nil {
			p.log.Debug("presence notify failed", "err", err)
			return
		}
		res.Body.Close()
	}()
}
