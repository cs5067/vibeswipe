# vibeswipe

A social music app. Swipe through songs to build a vibe, then **force the ones
you love onto your friends** — your pick lands in their inbox, and you find out
the moment they actually listen. Music taste as a way to connect, not just
discover.

Built as a React Native (Expo) app and a Next.js web app sharing one backend,
with a recommendation engine built around **playlist co-occurrence**.

> Personal project / work in progress. Runs locally against Spotify, Supabase,
> Last.fm, and Deezer. Not yet hardened for public deployment — see
> [Production readiness](#production-readiness).

## Tech stack

| Layer | Tech |
|---|---|
| Mobile | React Native, Expo, expo-auth-session (Spotify PKCE) |
| Web | Next.js (App Router), React, TypeScript |
| Backend | Next.js route handlers, Supabase (Postgres + RLS) |
| Data | Spotify Web API, Last.fm API, Deezer API |

## The interesting problem

The core idea: *if a stranger's public playlist already contains the songs you're
liking, the rest of that playlist is a strong recommendation* — collaborative
filtering via playlist co-occurrence.

The catch: **Spotify's API has no "which playlists contain this song" endpoint.**
You can only search playlists by text. So the engine can't ask the question
directly — it has to build its own index. The recommendation engine blends three
sources and self-balances as the first one grows:

1. **Own playlist corpus (primary).** A Postgres index of which songs appear on
   which playlists. A `cooccur_recommend()` SQL function ranks candidates by how
   many playlists they share with the liked set, weighted by overlap depth and
   down-weighted for giant catch-all playlists (TF-IDF style). The corpus fills
   itself: every playlist any session scans is ingested in the background, so it
   widens with use — no separate crawler.
2. **Last.fm similar tracks (borrowed scale).** "People who play X also play Y,"
   from millions of real listeners — carries quality while the corpus densifies.
3. **Spotify search strategies (filler + corpus feeders).**

Other details worth a look:

- **Preview fallback** — Spotify removed `preview_url` from most API responses, so
  playback falls back to Deezer's public API, resolved server-side.
- **Provider-agnostic identity** — accounts are decoupled from Spotify
  (`profiles` + `provider_identities`) so a future Apple Music login maps to the
  same user, friends, and recommendations.
- **Self-contained share links** — a shared song renders, unfurls (Open Graph),
  and plays for a recipient who has never opened the app.

## Project layout

```
src/                       Next.js web app + backend
  app/api/                 route handlers (Spotify proxy, recommendations,
                           corpus, social: friends / recommend / inbox / share)
  lib/engine/              recommendation engine + scoring
  lib/supabase/            server-side Supabase client (service role)
  app/swipe | inbox | friends | s/[code]   web screens
mobile/                    Expo / React Native app (primary surface)
  src/lib/engine/          the engine, on-device
  src/lib/server-api.ts    bridge to the backend (corpus + Last.fm)
supabase/migrations/       database schema (corpus + social)
```

## Running it locally

Needs Node, a Spotify developer app, and a Supabase project.

```bash
cp .env.example .env.local        # fill in Spotify + Supabase (+ optional Last.fm)
npm install
npm run dev                       # web → http://localhost:3000, connect Spotify
```

Apply `supabase/migrations/` to your Supabase project (SQL editor or CLI).

Mobile (Expo Go, same Wi-Fi):

```bash
cd mobile && npm install
npx expo start --port 8082
```

The mobile app's backend URL and Spotify redirect URI default to a LAN IP for
local dev (`mobile/src/lib/server-api.ts`, `mobile/src/lib/spotify/auth.ts`);
register the redirect URI in your Spotify dashboard.

All config is via environment variables ([.env.example](.env.example)). Secrets
live only in `.env.local` (gitignored); nothing sensitive is committed.

## Production readiness

This is a working prototype. Before any public deployment:
the session cookie needs signing, several API routes need auth + rate limiting,
and Spotify dev-mode limits apply. Database access is already locked down with
Supabase RLS (every table; reachable only via the server-side service role).

## Checks

```bash
npx tsc --noEmit                  # web
cd mobile && npm run typecheck    # mobile
npm run lint
```
