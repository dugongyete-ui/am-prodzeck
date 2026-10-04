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
  session cookies. Set to a long random string in production.
- `ADMIN_WHATSAPP_URL` / `ADMIN_WHATSAPP_TEXT` (in `src/lib/token/auth.ts`):
  the WhatsApp contact shown to users when their apikey is
  missing/unknown/expired.

## License

Private project. All rights reserved.
