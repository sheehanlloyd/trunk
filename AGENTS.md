<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Cursor Cloud specific instructions

`trunk` is a multi-tenant HVAC "AI Receptionist" SaaS (Next.js 16 App Router + Turbopack, React 19, Supabase, Stripe, Twilio, Anthropic). See `DESIGN.md` for the full product model and `docs/` for per-feature notes.

### Services

- **Next.js dev server** — `npm run dev` on port 3000. Standard scripts live in `package.json` (`lint`, `test`, `build`, `start`, `test:onboarding`).
- **Local Supabase stack** (Postgres + Auth + Studio + Mailpit) via the `supabase` CLI, which requires a running **Docker daemon**. `supabase start` applies `supabase/migrations/*` and loads `supabase/seed.sql`. Studio: http://127.0.0.1:54323, API: http://127.0.0.1:54321.

### Running it (non-obvious gotchas)

- **`.env.local` is required or the app won't boot.** `lib/env.ts` calls `required()` for `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` at import time. `.env.local` is gitignored — recreate it with `cp .env.example .env.local` (defaults match the local Supabase demo keys). If `supabase start` prints different keys, sync them from `supabase status`. `SUPABASE_SERVICE_ROLE_KEY` is needed for onboarding + chat/voice; Anthropic/Twilio/Stripe/`CRON_SECRET` are read lazily and only needed when exercising those features.
- **Docker daemon must be started manually** — this VM has no systemd, so `sudo systemctl start docker` fails. Start it with `sudo dockerd` in a background/tmux session, then `sudo chmod 666 /var/run/docker.sock` so the `ubuntu` user can reach it without sudo.
- **Docker 29 + this kernel**: `/etc/docker/daemon.json` must set `storage-driver: fuse-overlayfs` AND `features.containerd-snapshotter: false`, and iptables must be switched to `iptables-legacy`, or the daemon/containers won't start.
- **Supabase CLI is a two-binary shim**: the release tarball ships both `supabase` and `supabase-go`; extract the whole tarball into one directory on PATH (moving only `supabase` breaks it with a "Could not find the `supabase-go` binary" error).

### Testing / hello-world

- Unit tests (`npm test`, Vitest) are pure and need no services; they only cover `lib/**/*.test.ts`.
- Email confirmations are disabled locally (`supabase/config.toml`), so `/accept-invite` sign-up yields an immediate session. Use the seeded invited owner `owner@coolbreeze.test` (any 8+ char password) — a DB trigger links the new auth user to the "Cool Breeze HVAC" tenant, and the dashboard then shows that tenant's seeded conversations/bookings.
