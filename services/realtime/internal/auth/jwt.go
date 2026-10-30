// Package auth verifies the HS256 access tokens issued by the Qubedu API.
package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"strings"
	"time"
)

// Claims are the access-token fields the realtime hub relies on.
type Claims struct {
	Subject   string `json:"sub"`
	SessionID string `json:"sid"`
	Name      string `json:"name"`
	Role      string `json:"role"`
	Type      string `json:"typ"`
	Issuer    string `json:"iss"`
	ExpiresAt int64  `json:"exp"`
	Audience  any    `json:"aud"`
}

var (
	ErrMalformed = errors.New("malformed token")
	ErrSignature = errors.New("invalid signature")
	ErrExpired   = errors.New("token expired")
	ErrClaims    = errors.New("invalid claims")
)

// Verifier checks signature, issuer, audience, type and expiry.
type Verifier struct {
	secret []byte
	now    func() time.Time
}

func NewVerifier(secret string) *Verifier {
	return &Verifier{secret: []byte(secret), now: time.Now}
}

// WithClock is used by tests.
func (v *Verifier) WithClock(now func() time.Time) *Verifier {
	v.now = now
	return v
}

func (v *Verifier) Verify(token string) (*Claims, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return nil, ErrMalformed
	}
	headerRaw, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return nil, ErrMalformed
	}
	var header struct {
		Alg string `json:"alg"`
	}
	if err := json.Unmarshal(headerRaw, &header); err != nil || header.Alg != "HS256" {
		return nil, ErrMalformed
	}
	mac := hmac.New(sha256.New, v.secret)
	mac.Write([]byte(parts[0] + "." + parts[1]))
	expected := mac.Sum(nil)
	given, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil || !hmac.Equal(expected, given) {
		return nil, ErrSignature
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, ErrMalformed
	}
	var c Claims
	if err := json.Unmarshal(payload, &c); err != nil {
		return nil, ErrMalformed
	}
	if c.Type != "access" || c.Issuer != "qubedu" || c.Subject == "" || !hasAudience(c.Audience, "qubedu") {
		return nil, ErrClaims
	}
	if c.ExpiresAt <= v.now().Unix() {
		return nil, ErrExpired
	}
	return &c, nil
}

func hasAudience(aud any, want string) bool {
	switch a := aud.(type) {
	case string:
		return a == want
	case []any:
		for _, x := range a {
			if s, ok := x.(string); ok && s == want {
				return true
			}
		}
	}
	return false
}
