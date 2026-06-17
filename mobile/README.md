# vibeswipe Mobile

This is the primary app for testers. The web app exists in the repo, but product readiness should be judged here first.

## What Testers Should Experience

- Connect Spotify.
- Pick up to three vibe anchors.
- Name the playlist they want to make.
- Swipe through tracks with audio playback through Spotify.
- Save songs for later or like them into the playlist.
- Export liked tracks to Spotify.

## Engine

The mobile engine already follows the playlist co-occurrence direction:

- It interprets the playlist name and selected vibes.
- It searches for public playlists that match the session intent.
- It mines matching playlists for unseen tracks.
- It also explores artist searches, album deep dives, vibe searches, and the user's own library.
- It ranks candidates using vibe fit, genre proximity, sequence fit, artist diversity, branch health, novelty, and popularity fit.

The key idea is: if Abid likes seven songs that appear together on someone else's playlist, the rest of that playlist is a strong source of recommendations.

## Foundation

`src/lib/foundation` contains contracts for systems we will plug in later:

- `music-provider.ts`: Spotify now, Apple Music / YouTube Music / Tidal later.
- `analytics.ts`: no-op today, ready for PostHog or Amplitude.
- `entitlements.ts`: tester/free/plus capability model, ready for RevenueCat.
- `app-data.ts`: local no-op data store, ready for Supabase.

## Security

Spotify OAuth tokens are stored in `expo-secure-store`, not AsyncStorage. Playlist/session drafts still live in AsyncStorage because they are user-created app data rather than provider credentials.

Before public launch, add:

- Supabase persistence with RLS.
- Analytics consent/privacy copy.
- RevenueCat entitlement checks.
- Dependency audit remediation.

## Commands

```bash
npm install
npm run start
npm run ios
npm run android
npm run typecheck
```

Use Node `20.19.4` or newer for the least Expo/React Native engine noise.
