/* eslint-disable @typescript-eslint/no-require-imports */
// Explicit, read-only provider probe. Not part of CI. No Spotify or database calls.
const assert = require("node:assert/strict");
const { loadTs } = require("../tests/helpers/load-ts.cjs");
const memory = new Map();
const client = loadTs("mobile/src/lib/deezer/client.ts", {
  "@react-native-async-storage/async-storage": {
    getItem: async (key) => memory.get(key) || null,
    setItem: async (key, value) => { memory.set(key, value); },
  },
}, { fetch, console });
const { DeezerRecommendationEngine } = loadTs("mobile/src/lib/engine/deezer-engine.ts", {
  "../deezer/client": client,
}, { console });

async function main() {
  const query = process.argv[2] || "Sudanese";
  const started = Date.now();
  console.log(`Checking live Deezer playlists for "${query}"...`);
  const hits = await client.searchPlaylists(query);
  assert.ok(hits.length, "No playlists returned for the test context");
  const source = await client.readPlaylist(hits[0]);
  console.log(`Read ${source.tracks.length}/${source.total} tracks from the first result.`);
  const likes = source.tracks.filter((t) => t.previewUrl).slice(0, 7);
  assert.equal(likes.length, 7, "The source must have seven playable test anchors");
  const engine = new DeezerRecommendationEngine();
  await engine.initialize(query, [], likes);
  const recommendation = await engine.getNextTrack();
  assert.ok(recommendation, "No candidate beyond the seven anchors");
  assert.equal(recommendation._debug.overlapCount, 7);
  assert.equal(recommendation._debug.overlapTarget, 7);
  assert.ok(recommendation.previewUrl);
  console.log(JSON.stringify({ elapsedMs: Date.now() - started,
    source: source.title, scanned: source.tracks.length, total: source.total,
    candidate: recommendation.name, artist: recommendation.artistNames[0],
    evidence: recommendation._debug,
  }, null, 2));
  engine.syncLikedTracks([likes[0]]);
  const resumed = await engine.getNextTrack();
  assert.equal(resumed?._debug?.overlapCount, 1);
  assert.equal(resumed?._debug?.overlapTarget, 1);
  console.log("PASS: real 7/7 overlap, playable candidate URL, then rebuild with one remaining like.");
  console.log("This verifies retrieval and evidence, not audible playback, musical fit, or whole-catalog coverage.");
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
