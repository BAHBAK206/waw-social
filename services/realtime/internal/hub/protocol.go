package hub

import (
	"encoding/json"
	"regexp"
	"strings"
)

// Inbound frames from clients.
type Inbound struct {
	Type    string          `json:"type"`
	ID      string          `json:"id,omitempty"`
	Token   string          `json:"token,omitempty"`
	Channel string          `json:"channel,omitempty"`
	Event   string          `json:"event,omitempty"`
	To      string          `json:"to,omitempty"`
	Data    json.RawMessage `json:"data,omitempty"`
}

// Peer identifies a connection inside a channel.
type Peer struct {
	ConnID string `json:"connId"`
	UID    string `json:"uid"`
	Name   string `json:"name"`
}

// Outbound frames to clients.
type Outbound struct {
	Type    string          `json:"type"`
	ID      string          `json:"id,omitempty"`
	Channel string          `json:"channel,omitempty"`
	Event   string          `json:"event,omitempty"`
	Code    string          `json:"code,omitempty"`
	ConnID  string          `json:"connId,omitempty"`
	UID     string          `json:"uid,omitempty"`
	From    *Peer           `json:"from,omitempty"`
	Peers   []Peer          `json:"peers,omitempty"`
	Data    json.RawMessage `json:"data,omitempty"`
}

// ServerEvent is what the API publishes (via Redis or the internal HTTP endpoint).
type ServerEvent struct {
	Channels   []string        `json:"channels"`
	Event      string          `json:"event"`
	Data       json.RawMessage `json:"data"`
	ExceptUser string          `json:"exceptUser,omitempty"`
}

var channelPattern = regexp.MustCompile(`^(site|(user|conv|group|live|course):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$`)

// ValidChannel rejects anything that is not a known channel shape.
func ValidChannel(ch string) bool {
	return channelPattern.MatchString(ch)
}

func channelKind(ch string) string {
	if i := strings.IndexByte(ch, ':'); i > 0 {
		return ch[:i]
	}
	return ch
}

// Client-originated (ephemeral) events allowed per channel kind. Everything durable
// (messages, posts, grades…) goes through the API and arrives as a ServerEvent.
var clientEvents = map[string]map[string]bool{
	"conv": {"typing": true, "stop-typing": true},
	"live": {
		"hand": true, "reaction": true, "media-state": true, "whiteboard": true, "whiteboard-clear": true,
		"whiteboard-undo": true, "pdf-page": true, "pdf-open": true, "pdf-close": true, "speaking": true,
	},
	"course": {},
	"group":  {},
	"user":   {},
	"site":   {},
}

func clientEventAllowed(channel, event string) bool {
	return clientEvents[channelKind(channel)][event]
}
