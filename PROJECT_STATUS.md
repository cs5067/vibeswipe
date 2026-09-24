# VibeSwipe project status

25 September 2026

VibeSwipe is a working mobile-first prototype suitable for guided private
testing. It is not ready for a public launch. The code now includes the C++
scoring integration. Local production-build and HTTP checks pass; real-device
and hosting-platform checks remain open.

## Implemented

- React Native/Expo mobile app and Next.js web/backend surfaces.
- Swipe-driven playlist building and taste updates, Spotify authentication and
  playlist export paths, preview playback with Deezer fallback, social song
  sharing, friends and inbox flows.
- Normal recommendation flow combining PostgreSQL playlist co-occurrence,
  available Spotify sources and Last.fm similarity, with C++17 scoring and
  TypeScript fallback. Mobile retains retrieval evidence when ranking.
- A separate private Deezer experiment with direct previews, exact-ID playlist
  matching, highest-available overlap tiers and per-decision local persistence.
  Its scan is bounded to twelve playlists per session and 200 entries per
  playlist; it does not search an entire provider catalog.
- Offline regression tests, native parity checks and a GitHub Actions workflow.

Implemented means present in the code. Offline tests verify selected behavior;
they do not establish account permissions, audible playback on a phone, musical
fit, user adoption or public availability. See `NATIVE_INTEGRATION.md` for the
latest commands and verification boundaries.

## Before broader testing or release

1. Reconcile the live database into complete reproducible migrations and test
   constraints, access policies and deletion behavior on a staging database.
2. Make normal-mode saved playlists and history account-scoped; verify logout,
   account switching, app termination and restoration. Existing global/name-based
   storage can mix state between accounts or sessions.
3. Replace the client-visible ingestion token workflow with trusted server-side
   ingestion. Review session expiry/revocation and shared provider quotas.
4. Verify provider capabilities and permissions for the intended distribution.
   The Deezer experiment and Spotify development access are separate paths.
5. Verify the production build on the intended host, then test real iOS/Android devices:
   authenticate, hear previews, swipe rapidly, remove likes, resume and export.
6. Measure recommendation fit and playback reliability with consenting testers.
   The analytics interface currently uses a no-op implementation, so retention
   and engagement are not being established by the current code.

Arena, monetization and additional providers are lower priority than a durable,
reliable playlist session. Existing historical growth targets are hypotheses.
