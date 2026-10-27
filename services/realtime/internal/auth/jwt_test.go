package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"testing"
	"time"
)

func sign(t *testing.T, secret string, header, payload map[string]any) string {
	t.Helper()
	h, _ := json.Marshal(header)
	p, _ := json.Marshal(payload)
	head := base64.RawURLEncoding.EncodeToString(h) + "." + base64.RawURLEncoding.EncodeToString(p)
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(head))
	return head + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func TestVerify(t *testing.T) {
	secret := "s3cret-s3cret-s3cret-s3cret-s3cret!!"
	now := time.Unix(1_800_000_000, 0)
	v := NewVerifier(secret).WithClock(func() time.Time { return now })
	good := map[string]any{"sub": "u1", "sid": "s1", "name": "Ali", "role": "user", "typ": "access", "iss": "qubedu", "aud": "qubedu", "exp": now.Unix() + 60}
	hs := map[string]any{"alg": "HS256", "typ": "JWT"}

	c, err := v.Verify(sign(t, secret, hs, good))
	if err != nil || c.Subject != "u1" || c.Name != "Ali" {
		t.Fatalf("expected valid token, got %v %v", c, err)
	}

	cases := map[string]string{
		"wrong secret": sign(t, "other-secret-other-secret-other!!", hs, good),
		"alg none":     sign(t, secret, map[string]any{"alg": "none"}, good),
		"malformed":    "abc.def",
	}
	expired := map[string]any{}
	for k, v := range good {
		expired[k] = v
	}
	expired["exp"] = now.Unix() - 1
	cases["expired"] = sign(t, secret, hs, expired)
	refresh := map[string]any{}
	for k, v := range good {
		refresh[k] = v
	}
	refresh["typ"] = "refresh"
	cases["wrong type"] = sign(t, secret, hs, refresh)
	aud := map[string]any{}
	for k, v := range good {
		aud[k] = v
	}
	aud["aud"] = []any{"other"}
	cases["wrong audience"] = sign(t, secret, hs, aud)

	for name, tok := range cases {
		if _, err := v.Verify(tok); err == nil {
			t.Errorf("%s: expected error", name)
		}
	}
}
