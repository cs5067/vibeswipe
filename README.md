# vibeswipe

A social music app. Swipe through songs to build a vibe, then **force the ones
you love onto your friends** — your pick lands in their inbox, and you find out
the moment they actually listen. Music taste as a way to connect, not just
discover.

Built as a React Native (Expo) app and a Next.js web app sharing one backend,
with **playlist co-occurrence retrieval and a C++17 track-scoring engine**.

> Personal project / work in progress. Runs locally against Spotify, Supabase,
> Last.fm, and Deezer. Mobile is the primary experience. Not yet ready for public deployment — see
> [Production readiness](#production-readiness).

## Tech stack

| Layer | Tech |
|---|---|
| Mobile | React Native, Expo, expo-auth-session (Spotify PKCE) |
| Web | Next.js (App Router), React, TypeScript |
| Backend | Next.js route handlers, Supabase (Postgres + RLS) |
| Native ranking | C++17, STL, graph traversal, batch scoring over a REST endpoint |
| Data | Spotify Web API, Last.fm API, Deezer API |

## The interesting problem

The core idea: *if a stranger's public playlist already contains the songs you're
liking, the rest of that playlist is a strong recommendation* — collaborative
filtering via playlist co-occurrence.

The catch: **Spotify's API has no "which playlists contain this song" endpoint.**
Development-mode apps also cannot read arbitrary strangers' playlist contents.
Public-playlist discovery is therefore disabled by default; setting an extended
mode flag does not grant permission. The mobile engine uses available sources:

1. **Playlist corpus.** A Postgres index of which songs appear on
   which playlists. A `cooccur_recommend()` SQL function ranks candidates by how
   many playlists they share with the liked set, weighted by overlap depth and
   down-weighted for giant catch-all playlists. Corpus evidence is retained in
   mobile ranking. Coverage is limited; the current SQL is not yet an
   all-likes-first, then N-1 matching implementation. Existing ingestion paths
   need verified provenance and consent before production use.
2. **Last.fm similar tracks (borrowed scale).** "People who play X also play Y,"
   from millions of real listeners — carries quality while the corpus densifies.
3. **Authorized own playlists and supported Spotify track searches.** Cold-start
   and fallback tracks are identified by their actual source, not all called
   playlist-overlap recommendations.

Other details worth a look:

- **C++ scoring integration** — the web and normal mobile engines send candidate
  batches to `/api/reco/rank`. The backend invokes the C++ scorer and returns all
  seven factors. Clients retain their original track objects and fall back to
  TypeScript on timeout, invalid results or backend failure. Mobile preserves
  playlist-overlap priority and discards scoring results made stale by changed
  likes. The C++ corpus index is also available for offline use; the app's live
  corpus retrieval still uses PostgreSQL. The private Deezer experiment remains
  a separate TypeScript tier algorithm.

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
native/                    C++17 scoring library, batch driver, corpus index,
                           parity checks and synthetic benchmark
supabase/migrations/       database schema (corpus + social)
```

## Running it locally

For the private Deezer-only Expo Go experiment, use the
[phone test guide](DEEZER_TEST.md). It uses real playlist memberships and direct
previews without Spotify requests or the backend, with explicit coverage limits.
This is separate from the normal provider setup below.

Use Node 24 (see `.nvmrc`), a C++17 compiler and Make, a Spotify developer app,
and a Supabase project. `npm run dev`, `npm run build` and `npm test` build the
native executables automatically. No additional C++ libraries are required.
The older Node 20 runtime on this machine cannot initialize the installed
Supabase client without additional WebSocket support.

```bash
cp .env.example .env.local        # fill in Spotify + Supabase (+ optional Last.fm)
npm ci
npm run dev                       # backend + web: http://localhost:3005
```

The checked-in migrations currently omit parts of the live social schema.
Do not reset a real database or assume a fresh project can be recreated yet.
Schema reconciliation is an outstanding release blocker.

Mobile (Expo Go, same Wi-Fi):

```bash
npm ci --prefix mobile
npm start --prefix mobile -- --port 8082
```

Configure `mobile/.env` from `mobile/.env.example`. Set EXPO_PUBLIC_SERVER_URL to
the Mac's reachable LAN address on port 3005, or a deployed HTTPS backend.
The localhost fallback points to the phone itself, not your Mac. Register the
exact mobile redirect URI with Spotify. An Expo tunnel exposes Metro, not the
Next.js backend automatically.

Leave SPOTIFY_QUOTA_MODE, NEXT_PUBLIC_SPOTIFY_QUOTA_MODE and
EXPO_PUBLIC_SPOTIFY_QUOTA_MODE set to development unless this Spotify app has
approved extended access. Restart Metro/Next after changing public variables.
See the [Spotify migration guide](https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide).

All config is via environment variables ([.env.example](.env.example)). Keep
server secrets in `.env.local` (gitignored), never in public/mobile variables.

## Production readiness

This is a working prototype. Before any public deployment, address the following.

Production profile cookies now fail closed without a PROFILE_COOKIE_SECRET of
at least 32 characters. Signed cookies reject malformed signatures. Development
still supports unsigned cookies when the secret is absent; do not expose that
configuration publicly. Expiring/revocable sessions remain future work.

Other release blockers include verified corpus ingestion, complete migrations
and RLS review, account-scoped durable playlist storage, shared server-side
provider budgets, provider usage/licensing approval, and actual phone testing.
Mobile honors persisted Spotify Retry-After deadlines without shortening them.
This is not a guarantee that all backend/seeder traffic shares its cooldown.
No production deployment or database migration was performed by the stabilization work.

The root Next.js dependency is updated to 16.3.5. Additional root/mobile
dependency advisories remain and need exposure-based triage; a successful build
does not establish security. See [Stabilization notes](STABILIZATION.md) for
the changed behavior and remaining work.

## Checks

```bash
npm test                         # offline regression tests, no provider requests
npm run native:test              # C++ behavioral tests
npm run native:parity            # original TypeScript + independent SQL comparisons
npx tsc --noEmit --incremental false
npm run typecheck --prefix mobile
npm run lint
npm run build
```

GitHub Actions runs these checks with Node 24 once the workflow is pushed.
Tests load the actual TypeScript modules with controlled provider/native
dependencies. They check correctness, not musical taste, device playback or
Spotify account permissions.

See [native integration](NATIVE_INTEGRATION.md) for the request boundary,
resource limits, deployment requirements and the latest verification record.
See [current project status](PROJECT_STATUS.md) for what works and what remains.
