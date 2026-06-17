# Architecture

## Principle

Keep screens focused on experience. Put provider, analytics, persistence, entitlement, and engine decisions behind small contracts.

## Layers

- UI: `src/app`, `src/components`, and `mobile/src/screens`.
- State: Zustand stores for current session state.
- Engine: `src/lib/engine` and `mobile/src/lib/engine`.
- Provider/API: Spotify code today, provider interface for future platforms.
- Foundation: `src/lib/foundation`.

## Foundation Contracts

`src/lib/foundation/music-provider.ts`

Defines the minimum shape every music provider needs: current user, top tracks, saved tracks, and playlist creation.

`src/lib/foundation/analytics.ts`

No-op today. Replace with PostHog/Amplitude implementation when keys are ready.

`src/lib/foundation/entitlements.ts`

Models free, plus, and tester capabilities. This lets us add RevenueCat/Stripe without scattering paywall checks across screens.

`src/lib/foundation/app-data.ts`

No-op local store today. Replace with Supabase persistence for sessions, swipes, saved playlists, and internal co-occurrence data.

## Provider Roadmap

Spotify remains the only live provider for testers. Apple Music, YouTube Music, and Tidal should be added behind `MusicProvider` instead of directly inside screens.

## Web vs Mobile

Mobile is the priority tester surface. Web should stay useful for testing and sharing, but product decisions should optimize the mobile app first.
