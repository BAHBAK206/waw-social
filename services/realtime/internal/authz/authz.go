// Package authz asks the API whether a user may subscribe to a channel.
// Membership rules live in the API only; results are cached briefly.
package authz

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

// Checker decides channel access.
type Checker interface {
	Allowed(ctx context.Context, uid, channel string) (bool, error)
}

type entry struct {
	allowed bool
	until   time.Time
}

// APIChecker calls GET {base}/internal/authorize.
type APIChecker struct {
	base   string
	token  string
	client *http.Client
	mu     sync.Mutex
	cache  map[string]entry
	posTTL time.Duration
	negTTL time.Duration
}

func NewAPIChecker(base, token string) *APIChecker {
	return &APIChecker{
		base:   strings.TrimRight(base, "/"),
		token:  token,
		client: &http.Client{Timeout: 5 * time.Second},
		cache:  map[string]entry{},
		posTTL: 60 * time.Second,
		negTTL: 5 * time.Second,
	}
}

// Fast paths that never need the API: a user's own channel and the site channel.
func local(uid, channel string) (bool, bool) {
	if channel == "site" {
		return true, true
	}
	if strings.HasPrefix(channel, "user:") {
		return strings.TrimPrefix(channel, "user:") == uid, true
	}
	return false, false
}

func (a *APIChecker) Allowed(ctx context.Context, uid, channel string) (bool, error) {
	if ok, decided := local(uid, channel); decided {
		return ok, nil
	}
	key := uid + "|" + channel
	a.mu.Lock()
	if e, ok := a.cache[key]; ok && time.Now().Before(e.until) {
		a.mu.Unlock()
		return e.allowed, nil
	}
	a.mu.Unlock()

	u := fmt.Sprintf("%s/internal/authorize?uid=%s&channel=%s", a.base, url.QueryEscape(uid), url.QueryEscape(channel))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return false, err
	}
	req.Header.Set("x-internal-token", a.token)
	res, err := a.client.Do(req)
	if err != nil {
		return false, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return false, fmt.Errorf("authorize: status %d", res.StatusCode)
	}
	var body struct {
		Allowed bool `json:"allowed"`
	}
	if err := json.NewDecoder(res.Body).Decode(&body); err != nil {
		return false, err
	}
	ttl := a.negTTL
	if body.Allowed {
		ttl = a.posTTL
	}
	a.mu.Lock()
	if len(a.cache) > 50000 {
		a.cache = map[string]entry{}
	}
	a.cache[key] = entry{allowed: body.Allowed, until: time.Now().Add(ttl)}
	a.mu.Unlock()
	return body.Allowed, nil
}

// Invalidate drops cached decisions for a channel (e.g. a live room ended).
func (a *APIChecker) Invalidate(channel string) {
	a.mu.Lock()
	defer a.mu.Unlock()
	for k := range a.cache {
		if strings.HasSuffix(k, "|"+channel) {
			delete(a.cache, k)
		}
	}
}

// StaticChecker is used in tests.
type StaticChecker struct {
	Allow func(uid, channel string) bool
}

func (s StaticChecker) Allowed(_ context.Context, uid, channel string) (bool, error) {
	if ok, decided := local(uid, channel); decided {
		return ok, nil
	}
	return s.Allow(uid, channel), nil
}
