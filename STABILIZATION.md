# Stabilization Notes

## Scope

September 22 follow-up: a separate private Deezer-only Expo Go experiment now
implements full-set-first tiers within a bounded live playlist pool, direct
previews and per-decision local persistence. See [DEEZER_TEST.md](DEEZER_TEST.md).
It does not change the older Spotify/corpus path or resolve production permissions.

This is the first implementation pass following the September 20, 2026 audit.
It preserves the mobile layout and existing user work. It is not a completed
public-launch checklist and does not establish recommendation quality.

## How The Fixes Work

- **Profile authentication:** production will not mint or accept unsigned profile
  cookies, and requires a signing secret of at least 32 characters. Signature
  parsing rejects trailing garbage instead of letting Buffer truncate it.
- **Mobile Spotify requests:** all direct API methods use the same timeout and
  persisted cooldown. A long Retry-After remains long after restarting. Quota
  errors retain their reason. There is no automatic retry loop.
- **Provider capabilities:** development is the default. The clients normalize
  playlist items into the app's existing track shape and use current-user
  playlist creation. Mobile library writes use batches of at most 40 URIs.
  Removed bulk hydration becomes individual requests; mobile caches these
  public entities briefly and deduplicates pending hydration.
- **Source honesty:** unsupported public-playlist retrieval does not run in
  development mode. The status line identifies actual sources or a cooldown
  deadline. This flag cannot unlock Spotify permissions.
- **Recommendation lifecycle:** concurrent consumers share one refill promise.
  Changing likes increments a revision; older results are discarded and the
  pending operation rebuilds against the current set. An empty deck awaits its
  refill. Initialization is also shared across screen remounts.
- **Recording matching:** a title match now requires an actual candidate artist
  match, not the seed artist matching itself. Exact IDs remain preferred. This
  still needs canonical recording IDs/ISRC for robust cross-provider matching.
- **Ranking evidence:** mobile corpus scores survive hydration and ranking. The
  final random shuffle no longer overrides evidence ordering. Existing SQL is
  still weighted co-occurrence, not the proposed full-set-first tier algorithm.
- **Playback:** each play/pause/reset changes a generation. Old preview URLs
  cannot start after a newer command. Spotify Connect writes are serialized so
  their completion order cannot override the latest intent. Successful device
  lookup no longer resets failed-play backoff, and device results are cached.
- **Friends:** search results use usernames, requests post toUsername, and the
  mobile UI waits for success before saying Sent. Failed requests can be retried.
- **Maintenance:** Node 24 is pinned, a no-network regression suite is available
  through npm test, and GitHub Actions covers tests, typechecks, lint and build.
  Next.js and its ESLint config are pinned to 16.3.5.

The comments at the refill, cooldown and playback boundaries explain the key
invariants. Most code remains in its existing modules; this pass does not
introduce a new app framework or redesign the recommendation architecture.

## Verification

September 20-21 check: 35 regression tests passed; backend and mobile TypeScript
checks passed. ESLint has no errors and three existing web-navigation warnings.
The Next.js production build and both iOS/Android bundle exports passed.
Local startup was also checked: the page returned 200; friends and inbox
returned 401 without authentication. No authenticated provider flow was tested.

Automated tests mock provider responses and native audio bindings. They make no
Spotify requests and do not create database rows. Typechecks and a production
Next build must pass alongside them. Expo's iOS/Android bundle export checks
module/bundler compatibility, not native installation or audible playback.

The existing scripts/smoke.mjs writes live records. Use a separate staging
database before running it; it is intentionally not part of CI.

## Next Gates

1. Reconcile live database schema into migrations and verify a fresh staging
   database. Add constraints, grants, RLS, deletion and ingestion-provenance tests.
2. Replace unverified ingestion and client-visible shared secrets with a trusted
   server-side workflow. Share quota state across backend workers and seeders.
3. Implement stable per-account playlist storage and account-switch cleanup;
   persist decisions immediately and test kill/restart and final-like removal.
4. Implement full-set-first overlap tiers against permitted, adequately covered
   data. Preserve matched seed IDs and coverage gaps in the explanation.
5. Verify a real source/provider capability matrix and a reachable HTTPS mobile
   backend. Confirm actual Spotify quota mode in the dashboard. No access
   approvals or provider accounts were changed by this pass.
6. Test real phones and real listening sessions: create a playlist, like songs,
   remove two, resume with one, swipe rapidly, pause, and export. Measure fit by
   context, playback success and return use. Do not mistake regression tests for
   proof that the music feels right.
7. Resolve remaining dependency advisories and provider/commercial-use terms
   before public distribution. Do not add payments or expand Arena first.

## Configuration Notes

Keep quota-mode flags at development unless approval already exists. Use Node
24 for both the backend and Expo tooling. Set the mobile backend URL explicitly;
an Expo tunnel does not tunnel the backend. Required secrets belong only in
server environment files, never an EXPO_PUBLIC or NEXT_PUBLIC variable.

Do not clear cooldown storage just to make a blocked search run again. Wait for
the reported deadline; if it remains blocked, inspect the provider error reason
and the developer dashboard instead of generating more requests.
