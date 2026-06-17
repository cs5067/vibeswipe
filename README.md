# vibeswipe

A social music app. You swipe through songs, build a vibe, and **force the ones
you love onto your friends** — they get it in their inbox, and you find out when
they actually listen. Music taste as a way to connect, not just discover.

> ⚠️ Early-stage / not production-hardened. See [docs/SECURITY.md](docs/SECURITY.md)
> before deploying anywhere public.

## Surfaces

- `mobile/` — Expo / React Native app. **The primary surface.**
- `src/` — Next.js web app + the server (API routes, corpus, social backend).
- `supabase/migrations/` — database schema (corpus + social).

The mobile app talks to Spotify directly and to the Next.js server for the
corpus, recommendations, and (soon) social features.

## How recommendations work

The goal — the "Abid & John" idea: *if a stranger's playlist already contains
the songs you're liking, the rest of that playlist is a strong recommendation.*
Spotify's API can't answer "which playlists contain this song," so the engine
blends three sources, self-balancing as the first one grows:

1. **Our own playlist corpus** (primary). A Postgres index of which songs appear
   on which playlists. `cooccur_recommend()` answers the John/Michael question
   directly. The corpus fills passively — every playlist any session scans is
   ingested — plus a seeder (`/api/corpus/seed`) that mines a deliberately
   diverse keyword bank.
2. **Last.fm similar tracks** (borrowed scale). "People who play X also play Y,"
   computed from millions of real listeners — carries quality while the corpus
   densifies.
3. **Spotify search strategies** (filler + corpus feeders).

Audio previews fall back to Deezer's public API (Spotify removed `preview_url`
from most responses).

## Local development

Copy the env template and fill in your keys:

```bash
cp .env.example .env.local   # then fill in Spotify + Supabase (+ optional Last.fm)
```

Web:

```bash
npm install
npm run dev            # http://localhost:3000 — connect Spotify here
```

Apply the database schema to your Supabase project from
`supabase/migrations/` (via the Supabase SQL editor or CLI).

Mobile (Expo Go):

```bash
cd mobile
npm install
npx expo start --port 8082
```

The mobile app's server URL and Spotify redirect URI default to a LAN IP for
local dev — see `mobile/src/lib/server-api.ts` and
`mobile/src/lib/spotify/auth.ts`. Register the redirect URI in your Spotify
dashboard.

## Required environment

See [.env.example](.env.example). Secrets live only in `.env.local`
(gitignored). Never hardcode keys; never prefix a secret with `NEXT_PUBLIC_`.

## Checks

```bash
npx tsc --noEmit            # web
cd mobile && npm run typecheck
npm run lint
npm audit --audit-level=moderate
```
