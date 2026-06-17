# vibeswipe — Handoff Briefing

*For any Claude Code session picking up this project. Last updated April 2026.*

## What this app is

**vibeswipe** — a Tinder-style music discovery app. Users swipe on tracks, liked songs auto-build a playlist, and the algorithm learns taste from swipe signal. Currently Spotify-only; plan is to go multi-platform (Apple Music, YouTube Music, Tidal) as the main moat.

Landing tagline: *"Swipe right on music you love. Build playlists that match your vibe."*

## Where we are right now

- Next.js 16 web app (~3k LOC) with working Spotify OAuth, swipe mechanic, recommendation engine (genre-graph, discovery-strategies, taste-profile), and playlist export
- React Native / Expo mobile shell exists alongside (`/mobile`)
- Core loop works: login → swipe → export to Spotify playlist
- **Not yet shipped.** Goal is tester-readiness, then TestFlight + Play Store beta, then public launch

## Immediate goal: get to tester-ready

Before handing the app to testers, the must-haves are:

1. **Audio previews on swipe cards** — Spotify 30s previews. No one swipes on a song they can't hear. This is the #1 blocker.
2. **Spotify integration hardening** — token refresh edge cases, rate-limit handling, graceful degradation, proper error states.
3. **Analytics instrumentation** — PostHog or Amplitude. Must track: login, time-to-first-swipe, swipes per session, playlist created, day-7 return.
4. **Onboarding polish** — 3-screen flow, connect Spotify, explain the swipe mechanic, land in a swipe session.
5. **Mobile app parity** — React Native app needs to match web functionality. Mobile is the primary surface; swipe apps die on web.
6. **Basic error + empty states** — what happens when Spotify's down, when a user has no top tracks, when they swipe through all candidates.

Once testers are happy, the publishing path is TestFlight (iOS) + Play Store closed testing (Android) → public App Store + Play Store launches coordinated with a Product Hunt + Show HN drop.

## Key architectural decision: algorithm pivot

The current recommendation engine is mostly content-based (audio features, genre graph). We've decided to pivot toward **collaborative filtering via playlist co-occurrence**.

The idea: when a user swipes right on a set of tracks, find public playlists that contain significant overlap with those tracks, then recommend other tracks from those playlists, weighted by co-occurrence frequency. Blends with the existing taste-profile model.

Why this pivot:

- Spotify deprecated key audio-features/recommendations endpoints in late 2024 — the current engine's foundation is on shaky ground
- Playlist co-occurrence captures contextual "vibe" signal (e.g. "late night drive") that audio features can't
- This is closer to how Spotify's own Discover Weekly reportedly works
- Robust to future API changes since it only needs track IDs and playlist contents

**Bootstrap:** Spotify's Million Playlist Dataset (MPD), released 2018 for the RecSys Challenge, is free and gives us ~1M real playlists / ~66M track-playlist pairs on day one. Supplement via periodic crawling of public playlists through the search API.

**Storage:** needs a track-to-playlist inverted index. Postgres with proper indexing is probably sufficient to start; revisit if performance demands a dedicated graph/vector store.

This pivot is **not blocking tester release** — ship what we have, instrument it, gather swipe data, then layer collaborative filtering in. But the abstraction should be designed now so the rewrite isn't painful later.

## Strategic decisions already made

- **Multi-platform is the moat.** Apple Music via MusicKit is the single highest-leverage addition after MVP. Abstract the streaming provider layer now even if we only ship Spotify initially.
- **Monetization:** freemium. Free tier = 50 swipes/day, Spotify only, 1 playlist at a time, light ads. Paid tier (vibeswipe Plus) = $4.99/mo or $39.99/yr, unlimited swipes, all platforms, cross-platform export, mood modes, social features.
- **Target conversion:** 3–5% free→paid. At 100K MAU, that's ~$20K MRR.
- **Distribution strategy:** organic first (Product Hunt, Show HN, Reddit, TikTok/IG via shareable taste-profile cards), no paid acquisition until retention data justifies it.
- **The shareable moment is the taste-profile reveal** — a Spotify-Wrapped-style screen after ~50 swipes, optimized for Instagram Stories / TikTok sharing. This is the primary virality loop.

## Key constraints

- **Stack:** Next.js 16 (note: `AGENTS.md` warns the API/conventions may differ from training data — read `node_modules/next/dist/docs/` before writing new Next code)
- **No database yet** — current app is stateless, relying on Spotify as the data store. Adding the playlist corpus requires a real DB decision.
- **Mobile app = React Native / Expo** in `/mobile`.
- **Cost budget:** target <$200/mo infra at 10K MAU, <$2K/mo at 100K MAU.
- **Privacy:** no selling listening data, GDPR/CCPA compliant from day one.

## Open questions to decide with Abid

- Which DB to use for the playlist corpus (Postgres + pg_trgm? dedicated search like Meilisearch? something else?)
- Hosting choice for the background crawler/worker
- Whether to build collaborative filtering in Phase 1 (before testers) or Phase 2 (after initial feedback)
- Payments provider (RevenueCat + Stripe is the default for mobile subscriptions)

## Reference files

- `PLAN.md` — full 12-month growth and monetization plan
- `AGENTS.md` — Next.js 16 specifics, must-read
- `src/lib/engine/` — current recommendation engine (will be refactored for collaborative filtering)
- `src/app/api/spotify/` — Spotify API wrappers (should be abstracted behind a provider interface)
