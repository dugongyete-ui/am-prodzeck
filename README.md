# Dzeck Premium — Alight Motion Premium Activation

A clean, minimal web app for activating Alight Motion Premium 1 Tahun via
email verification. Built with Next.js 16 (App Router), TypeScript, Tailwind
CSS 4, shadcn/ui, and Prisma (SQLite).

## Features

- **Email-based activation flow** (3 steps): send activation link → paste link
  from inbox → premium active.
- **Apikey-gated activations**: each apikey allows up to 3 email activations
  before auto-expiring. Users see a "hubungi admin via WhatsApp" hint when
  their key is missing, unknown, or expired.
- **Admin-only `/token` page** for creating and managing apikeys. Protected by
  a server-side password (HMAC-signed session cookie), `noindex`/`nofollow`
  metadata, and no links from the public site.
- **Responsive** layout tested at 320px / 375px / 1280px+ viewpoints.
- **Privacy**: admin password is stored server-side only (via the
  `server-only` package), never shipped to the client bundle.

## Tech Stack

- Next.js 16 (App Router, Turbopack)
- TypeScript 5
- Tailwind CSS 4 + shadcn/ui (New York style)
- Prisma ORM (SQLite) + Prisma Client
- Lucide icons
- Plus Jakarta Sans + JetBrains Mono via `next/font`

## Project Layout

```
prisma/schema.prisma             # ApiKey model
src/app/
  page.tsx                       # Public app entry (renders <App />)
  layout.tsx                     # Root layout + fonts + metadata
  globals.css                    # Tailwind + custom scrollbar
  _am/                            # Private folder (non-route)
    App.tsx                       # Main client app
    components/
      Header.tsx
      AutoAuthFlow.tsx            # Step 1/2/3 UI
      CleanHistory.tsx            # Verified accounts list
    services/api.ts              # Client-side API helpers
    types.ts                     # Session / Relay / ApiKey types
  token/
    page.tsx                     # Admin UI (password gate + key management)
    layout.tsx                   # noindex metadata
  api/
    relay/
      send-link/route.ts         # Email activation (apikey-enforced)
      verify-link/route.ts        # Link verification
      session/route.ts            # Session persistence
    token/
      auth/route.ts               # POST login / DELETE logout
      keys/route.ts               # GET list / POST create
      keys/[id]/route.ts          # DELETE / PATCH (reset) key
src/lib/
  relay/relay.ts                  # Crypto + session helpers
  token/auth.ts                   # Admin password + signed session token
  db.ts                           # Prisma client
```

## Getting Started

```bash
# Install deps
bun install

# Push Prisma schema to SQLite
bun run db:push

# Start dev server (auto-runs on port 3000)
bun run dev
```

Visit `/` for the public app. Visit `/token` for the admin (password
required — set `TOKEN_ADMIN_PASSWORD` in `.env`).

## Admin Access

The `/token` page is intentionally **not** linked from the public site. To
access it, navigate directly to `/token` and enter the admin password (set
via the `TOKEN_ADMIN_PASSWORD` env var in `.env`).

## Configuration

All secrets are read from environment variables (see `.env` for local dev —
never commit `.env` to git).

- `MAX_EMAILS_PER_KEY` (in `src/lib/token/auth.ts`): max email activations
  per apikey. Default: 3.
- `TOKEN_ADMIN_PASSWORD` (env var, required): admin password for `/token`.
  If not set, all login attempts fail. Must be ≥ 6 chars.
- `TOKEN_SESSION_SECRET` (env var, optional): secret used to HMAC-sign admin
  session tokens. Set to a long random string in production.
- `SESSION_COOKIE_SECRET` (env var, optional): HMAC secret for the per-browser
  signed session cookie used by the relay flow. Random fallback in dev.
- `SESSION_COOKIE_SALT` (env var, optional): salt marker for the session
  cookie. Rotating it invalidates all existing session cookies.
- `ALLOWED_ORIGINS` (env var, optional): comma-separated list of allowed
  Origin values for CSRF check on state-changing requests. In production,
  set to your public domain (e.g. `https://dzeck-alightmotion.space-z.ai`).
- `TRUSTED_PROXY_CIDRS` (env var, optional): comma-separated CIDRs trusted
  to set `X-Forwarded-For`. Set to your CDN's CIDRs in production.

## Keeping the App Warm (anti-cold-start cron)

Serverless platforms (Alibaba Function Compute, Vercel, AWS Lambda, etc.)
put idle functions to sleep after a few minutes of inactivity. The next
request then suffers cold-start latency (often 1–5+ seconds).

To prevent this, set up a free cron-job service to ping the health
endpoint every 5 minutes:

```
GET https://dzeck-alightmotion.space-z.ai/api/health
```

Response: `{"ok":true,"status":"healthy","ts":"...","uptimeSec":N}`

### Recommended free cron-job services

- **cron-job.org** — free, EU-based, supports 1-min intervals on free tier
- **UptimeRobot** — free tier, 5-min minimum interval
- **EasyCron** — free tier with 5-min minimum
- **GitHub Actions** — scheduled workflow, free for public repos

### Setup steps (cron-job.org example)

1. Create a free account at https://cron-job.org
2. Click "Create Cronjob"
3. URL: `https://dzeck-alightmotion.space-z.ai/api/health`
4. Schedule: `*/5 * * * *` (every 5 min)
5. Method: GET
6. Save

The endpoint is unauthenticated, lightweight (no DB call), and returns
`Cache-Control: no-store` so cron services always get fresh responses.

## Security Architecture

This app implements server-side hardening against scraping and automated
abuse. The frontend remains functional for legitimate users; the server
rejects unauthorized/scripted traffic.

- **Centralized security layer** (`src/lib/security/`): rate limiting,
  IP extraction (trusted-proxy aware), CSRF/Origin check, HMAC request
  signing with anti-replay, signed per-browser session cookie, structured
  security logging.
- **API key hashing**: keys are stored as `keyPrefix` (non-secret, indexed
  for lookup) + `keyHash` (SHA-256). Plaintext is shown only once on
  creation. Lookup uses `crypto.timingSafeEqual` to avoid timing leaks.
- **Rate limiting**: in-memory sliding window per IP / per admin session /
  per apikey prefix. Sensitive endpoints have tighter limits.
- **Anti-enumeration**: invalid / unknown / expired apikeys all return the
  same generic message ("Apikey tidak valid atau sudah tidak aktif") with
  the WhatsApp contact hint.
- **Request signing (admin only)**: state-changing admin requests
  (POST/PATCH/DELETE on `/api/token/keys*`) require `X-Timestamp`,
  `X-Nonce`, `X-Signature` headers. Server verifies ±60s skew + nonce
  freshness (5-min replay window) + HMAC-SHA256 signature.
- **Signed session cookie**: per-browser state (`sessionKey`, `nonce`,
  `challenge`, `pow`) lives in an HttpOnly, SameSite=Lax, 15-min TTL
  signed cookie. Replaces the old shared `.session.json` file (which
  leaked session state to anyone hitting `/api/relay/session`).
- **Removed endpoints**: `/api/relay/session` is blocked by middleware
  (defense-in-depth fallback even if the route file is recreated).
- **Security headers**: CSP, X-Content-Type-Options, X-Frame-Options,
  Referrer-Policy, Permissions-Policy, HSTS are injected globally by
  `src/middleware.ts`. No `Access-Control-Allow-Origin: *` is set anywhere.
- **Response minimization**: API responses only include fields the client
  needs. Internal IDs, hashes, IP hashes, and upstream `sessionKey` are
  never returned to the browser.
- **Production build**: source maps disabled; `console.debug` stripped;
  TypeScript and ESLint errors fail the build in production.

## License

Private project. All rights reserved.
