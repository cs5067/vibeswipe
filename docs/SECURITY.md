# Security posture

Honest status: this repo is **safe to publish** (no secrets are tracked), but the
app is **not yet production-hardened**. Below is exactly what's solid and what
must be done before any public deployment. Don't read "secure" as "finished."

## What's solid

- **No secrets in git.** All credentials live in `.env.local` (gitignored). The
  committed template is `.env.example` with empty placeholders. Verified: no
  `.env` file has ever been committed; no API keys/secrets are hardcoded in
  source (the Spotify *client ID* in the mobile app is a public identifier, not
  a secret — mobile uses PKCE with no client secret).
- **Supabase RLS.** Every table in the `public` schema has RLS enabled with no
  public policies. Corpus and user data are reachable only through the
  server-side service-role client, never directly from the browser. The
  `service_role` key is server-only and never prefixed `NEXT_PUBLIC_`.
- **Co-occurrence SQL function** runs with `search_path = ''` and fully
  qualified names (advisor-clean).
- **Input validation** on the routes that take user input (UUID checks on
  profile ids before they reach PostgREST filters, track-id regex on batch
  hydrate, length caps on notes/usernames, item caps on ingest).

## Auth today

- **Web:** Spotify OAuth with PKCE. Tokens stored in httpOnly cookies; browser
  calls local API routes which call Spotify with the server-side cookie token.
- **Mobile:** Expo AuthSession; Spotify tokens in AsyncStorage. Move to
  SecureStore before launch.

## Must fix before production deploy

Not exploitable today (nothing is deployed; the app runs on localhost/LAN), but
real and tracked:

1. **Profile session cookie is unsigned.** `vibeswipe_profile_id` is a bare UUID
   in an httpOnly cookie. A client that learns another user's profile id could
   set the cookie and act as them. Before deploy: sign it (HMAC) or move identity
   to Supabase Auth and derive the profile from a verified JWT.
2. **Several API routes are unauthenticated.** `/api/preview` and
   `/api/lastfm/similar` are open proxies (low risk — fixed upstreams — but add
   rate limiting). `/api/reco/cooccur` reads public-playlist-derived data (low
   sensitivity). `/api/share` lets anyone create a share (spam vector). Add auth
   and/or rate limiting before public exposure.
3. **Corpus ingest** (`/api/corpus/ingest`) writes to the DB. Gated by an
   optional shared secret: set `CORPUS_INGEST_TOKEN` (server) and
   `EXPO_PUBLIC_CORPUS_INGEST_TOKEN` (mobile) in production so anonymous writes
   are rejected. A mobile-embedded token is weak — pair with rate limiting.
4. **Rotate any shared credentials.** If the Spotify client secret or Supabase
   service-role key was ever pasted into a chat, email, or screen share, rotate
   it. They are not in git, but rotation is cheap insurance.
5. **Spotify dev-mode + redirect URIs.** App is in Spotify development mode
   (limited, Premium-only test users). The Expo redirect URI is hardcoded to a
   LAN IP for dev; production needs a stable HTTPS redirect registered in the
   Spotify dashboard.

## Data policy (direction)

Privacy-first: don't sell listening data; store only what's needed to build
playlists, improve recommendations, and honor account controls; keep provider
tokens out of client-readable web storage; treat swipes and listening history as
sensitive preference data.

## Dependencies

Run `npm audit --audit-level=moderate` in both `/` and `/mobile`.
- Web: moderate PostCSS advisory via a Next dependency path.
- Mobile: the high `@xmldom/xmldom` advisory was resolved non-breaking; remaining
  findings are moderate Expo advisories where `npm audit fix --force` attempts a
  risky Expo downgrade. Do not force-upgrade blindly — treat dependency
  remediation as its own tested task.
