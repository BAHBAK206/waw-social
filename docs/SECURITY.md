# Security notes

- Passwords: Argon2id. Sessions: 15-minute access tokens, rotating refresh tokens with reuse detection; "sign out everywhere" revokes all.
- Authorization is enforced on the server for every route; conversation, group, course and live-room access is membership-checked (a regression test pins that conversation lists never leak across users).
- Uploads are sniffed by magic bytes, size-limited per purpose, and served with safe content types; HTML/SVG are never served inline.
- Rate limits on authentication, posting, uploads, AI and search. `RATE_LIMIT_DISABLED` exists for local/e2e only and is ignored when `NODE_ENV=production`.
- Production refuses to start with the development JWT secret or internal token.
- WebSocket events are allow-listed per channel kind; clients cannot publish server events.
- Content safety: reports for posts, comments, messages, videos, stories, events, groups, forms, library items and users; admin review with audit log.
- Privacy: profile visibility, who-can-message, hidden stats and online status; data export and account deletion in Settings.
- Report vulnerabilities privately to the project maintainers before disclosing publicly.
