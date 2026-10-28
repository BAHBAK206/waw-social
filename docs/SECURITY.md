# Security notes

- Passwords: Argon2id. Sessions: 15-minute access tokens, rotating refresh tokens with reuse detection; "sign out everywhere" revokes all.
- Authorization is enforced on the server for every route; conversation, group, course and live-room access is membership-checked (a regression test pins that conversation lists never leak across users).
- Uploads are sniffed by magic bytes, size-limited per purpose, and served with safe content types; HTML/SVG are never served inline.
- Rate limits on authentication, posting, uploads, AI and search. `RATE_LIMIT_DISABLED` exists for local/e2e only and is ignored when `NODE_ENV=production`.
- Production refuses to start with the development JWT secret or internal token.
- WebSocket events are allow-listed per channel kind; clients cannot publish server events.
- Content safety: reports for posts, comments, messages, videos, stories, events, groups, forms, library items and users; admin review with audit log.
- Privacy: profile visibility, who-can-message, hidden stats and online status; data export and account deletion in Settings.
- Two-step sign-in (TOTP, RFC 6238): the secret is stored AES-256-GCM encrypted; sign-in with a password returns a 5-minute ticket that only a valid code (±30 s) or a single-use recovery code turns into a session, 5 tries per ticket.
- Under-13 accounts need a parent's approval (emailed link) before messages, groups and the AI are on; a refusal closes the account. School-created accounts and accounts linked by a parent count as approved.
- Web Content-Security-Policy (nginx and Cloudflare `_headers`): only the site's own scripts (no inline scripts), no plugins, no framing by other sites.
- Payments: Stripe signatures (5-minute window) and Paymob HMAC-SHA512 plus amount and our own payment id are checked before enrolling; manual transfer receipts are private files re-signed for the teacher only.
- Schools can create accounts but only *invite* existing ones (they join when they accept), and only link parents to children they created.
- The AI tutor and assistant pause while a student sits an exam; parents and teachers can switch them to hints-only.
- Report vulnerabilities privately to the project maintainers before disclosing publicly.
