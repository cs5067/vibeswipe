# Recommendation Engine

## Product Goal

The engine should answer: "What playlist is this user trying to create right now?"

It should not only ask what the user usually likes. A late-night-drive session, gym session, and sad-hours session from the same person should produce different candidate pools.

## Core Signals

- Long-term taste: Spotify top tracks, top artists, saved tracks, recently played.
- Session intent: playlist name and selected vibes.
- Swipe feedback: likes, skips, saves, decision time, and source strategy.
- Playlist co-occurrence: public playlists that contain songs/artists similar to what the user is liking.

## Co-Occurrence Example

Abid creates `late night drive`.

He swipes right on seven songs. A public playlist already contains those seven songs plus twenty more. The engine should treat that playlist as a high-confidence branch and recommend the unseen songs from it. If Abid likes those too, similar playlists become stronger candidates.

This works before vibeswipe has many users because public Spotify playlists can act as the starting corpus. Once vibeswipe has its own users, internal swipe/session data becomes an even stronger co-occurrence graph.

## Current Strategies

- `playlistNameSearch`: searches playlists matching the user's playlist name or inferred vibe.
- `playlistCoOccurrence`: searches playlists by liked artist or track name and mines unseen tracks.
- `searchArtist`: finds tracks through Spotify search for seed or liked artists.
- `albumDeepDive`: explores albums by artists the session is responding to.
- `querySearch`: searches vibe-aware terms such as `late night r&b` or `night drive playlist`.
- `userLibrary`: falls back to the user's own top/saved tracks.

## Ranking

Candidate tracks are scored by:

- Vibe fit.
- Genre proximity.
- Sequence flow after recent likes.
- Artist diversity.
- Branch health.
- Novelty.
- Popularity fit.

The score debug object on `AppTrack._debug` exists so testers and developers can inspect why a song appeared without changing the user-facing design.

## Future Database Shape

When Supabase is added, the likely tables are:

- `profiles`: one row per vibeswipe user.
- `provider_accounts`: Spotify/Apple/etc account links.
- `sessions`: playlist-building sessions.
- `swipes`: every swipe event.
- `playlists`: saved/exported playlists.
- `playlist_tracks`: tracks in saved playlists.
- `public_playlist_index`: discovered public playlists.
- `public_playlist_tracks`: track membership for indexed playlists.
- `track_cooccurrence_edges`: precomputed track-to-track co-occurrence weights.

The first beta does not need the full public corpus, but the app should be shaped so this can be added without rewriting the screens.
