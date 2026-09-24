# Private Expo Go Discovery Test

This is a bounded experiment with real public Deezer playlists and 30-second
previews. It is not a production integration, a music license, or a claim that
all playlists in Deezer's catalog have been searched. Keep it private while
provider permission and commercial-use questions remain unresolved.

## Run

Use Node 24, then run from the repository root:

```bash
npm run start:discovery --prefix mobile -- --lan --port 8082
```

The phone and Mac must share Wi-Fi. Scan the terminal QR with the iPhone camera
or Expo Go. This project uses Expo SDK 54; the installed Expo Go must support
that SDK. An incompatible-version error is a client compatibility problem, not
a recommendation failure. Do not switch to a development build without first
deciding whether to upgrade the project or use a compatible Expo Go client.

The experiment does not need Spotify login or the Next.js backend. Native
fetch reads Deezer directly; expo-audio plays preview URLs directly. Starting
normally without EXPO_PUBLIC_DISCOVERY_SOURCE=deezer restores the previous
provider flow. The test flag cannot activate in a release build.

## Phone Check

1. Create a new session named Sudanese (genres can be skipped).
2. Listen and make genuine choices. The first cards are labeled context
   discovery, because there are no playlist likes yet.
3. After liking songs, check the overlap count above the card. Tap the card
   while debug mode is on to see the matched songs and evidence. Source playlist
   opens the actual Deezer playlist.
4. Keep seven songs if they genuinely fit. Check whether results stay at 7/7
   or explicitly move to a lower available tier.
5. Open Playlist, remove songs until one remains, then return. Evidence must
   rebuild around that remaining song, not the old seven.
6. Close and reopen Expo Go, resume the saved session, and verify its likes.
7. Share exports a text list of songs and Deezer links through the native share
   sheet. It does not create a Spotify or Deezer account playlist.

Right swipe builds this playlist. Left excludes the song. Up saves for later.
Down stores the decision and track locally as liked outside this vibe, not in
Spotify; this prototype has no separate outside-vibe favorites screen yet.

## Algorithm And Limits

- Playlist-name search collects initial candidates. Later searches use the
  session name and liked artist names. Text matches never count as overlap.
- Membership is verified by exact Deezer track ID. Versions with different IDs
  do not automatically match, even if their titles are identical.
- A single playlist must contain the matched set. Seven separate one-song
  playlists cannot masquerade as a 7/7 match.
- Only the highest nonempty overlap tier in the scanned pool is dealt. Once its
  playable unseen candidates are exhausted, the next best tier is considered.
  With likes present, zero-overlap playlists never become a fallback.
- At most four new playlists are read per retrieval and twelve are retained
  per session. Each read checks at most 200 entries. Partial scans are labeled;
  unscanned entries and unsearched playlists remain coverage gaps.
- Requests have six-second timeouts. New playlist reads stop being started
  after a fifteen-second scan budget; an already-started two-page read can take
  longer. There is no background crawler or automatic retry storm.
- Metadata responses are cached in memory for five minutes. Audio is not
  downloaded for offline storage. Provider cooldowns survive restarts.
- Likes changing invalidates older retrieval results. A title or genre match
  never turns into a claimed playlist match. No Spotify or Last.fm fallback runs.

The engine is in mobile/src/lib/engine/deezer-engine.ts. Network normalization,
pagination and cooldowns are in mobile/src/lib/deezer/client.ts. Native playback
uses mobile/src/lib/playback-controller.ts. Test playlists use the separate
vibeswipe_deezer_test_playlists storage key and persist each decision.

## Verification

```bash
npm test
npm run typecheck --prefix mobile
node scripts/check-deezer-discovery.cjs Sudanese
```

Only the last command contacts Deezer. It selects seven anchors from a real
returned playlist to check membership accounting and the one-like rebuild.
That is a controlled live check, not evidence of whole-catalog retrieval or
musical fit. No Spotify calls, database writes, or audio downloads are made.

The live check on September 22 found a 7/7 source and an additional candidate
in about 2.8 seconds, and rebuilt at 1/1. An earlier network attempt failed;
the phone UI therefore exposes connection errors and an explicit retry.
Actual phone playback, your listening judgments and broader context coverage
remain the purpose of this test.

Before public distribution, obtain appropriate provider permissions and review
[Deezer's terms](https://developers.deezer.com/termsofuse). The private flag is
not a substitute for permission. Dependency advisories also remain outstanding.
