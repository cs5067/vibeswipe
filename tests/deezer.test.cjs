/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadTs, deferred } = require("./helpers/load-ts.cjs");

const track = (id, artist = id) => ({ id: `deezer:${id}`, name: id, artistNames: [artist], artistIds: [artist], previewUrl: `https://preview/${id}` });
const playlist = (id, tracks, extra = {}) => ({ id, title: id, query: "Sudanese", tracks, total: tracks.length, complete: true, ...extra });
function engine(api = {}) {
  return loadTs("mobile/src/lib/engine/deezer-engine.ts", { "../deezer/client": {
    searchPlaylists: async () => [], readPlaylist: async () => null, ...api,
  } });
}

test("one 7/7 playlist beats many 1/7 playlists, then relaxes to 6/7 when exhausted", () => {
  const likes = Array.from({ length: 7 }, (_, i) => track(`seed${i}`));
  const pool = [playlist("full", [...likes, track("full-next")]),
    playlist("six", [...likes.slice(0, 6), track("six-next")]),
    ...Array.from({ length: 20 }, (_, i) => playlist(`weak${i}`, [likes[0], track("weak-next")]))];
  const { rankPlaylistMatches: rank } = engine();
  const first = rank(pool, likes, new Set());
  assert.equal(first.length, 1);
  assert.equal(first[0].id, "deezer:full-next");
  assert.equal(first[0]._debug.overlapCount, 7);
  assert.equal(first[0]._debug.matchedTrackIds.length, 7);
  const next = rank(pool, likes, new Set(["deezer:full-next"]));
  assert.equal(next[0].id, "deezer:six-next");
  assert.equal(next[0]._debug.overlapCount, 6);
});

test("different recordings with the same title do not manufacture overlap", () => {
  const seed = { ...track("1"), name: "Same title" };
  const other = { ...track("2"), name: "Same title" };
  assert.equal(engine().rankPlaylistMatches([playlist("p", [other, track("next")])], [seed], new Set()).length, 0);
});

test("a partial scan is labeled and unplayable candidates are excluded", () => {
  const result = engine().rankPlaylistMatches([playlist("p", [track("a"), track("b"), { ...track("c"), previewUrl: null }], { complete: false, total: 1000 })], [track("a")], new Set());
  assert.equal(result.length, 1);
  assert.match(result[0]._debug.matchedBecause, /Partial scan/);
  assert.equal(result[0]._debug.playlistUrl, "https://www.deezer.com/playlist/p");
});

test("cold start is explicitly context search, not a liked-song match", () => {
  const result = engine().rankPlaylistMatches([playlist("p", [track("a")])], [], new Set());
  assert.equal(result[0].strategy, "deezer_context");
  assert.equal(result[0]._debug.overlapTarget, 0);
});

test("removing two likes rebuilds around the one remaining like", async () => {
  const pool = playlist("p", [track("a"), track("b"), track("c"), track("next")]);
  const { DeezerRecommendationEngine } = engine({ searchPlaylists: async () => [pool], readPlaylist: async () => pool });
  const e = new DeezerRecommendationEngine();
  await e.initialize("Sudanese", [], [track("a"), track("b"), track("c")]);
  assert.equal((await e.getNextTrack())._debug.overlapTarget, 3);
  e.syncLikedTracks([track("c")]);
  const next = await e.getNextTrack();
  assert.equal(next._debug.overlapCount, 1);
  assert.deepEqual([...next._debug.matchedTrackIds], ["deezer:c"]);
});

test("removal during a pending scan discards the old overlap explanation", async () => {
  const pending = deferred();
  const pool = playlist("p", [track("a"), track("b"), track("next")]);
  const { DeezerRecommendationEngine } = engine({ searchPlaylists: async () => [pool], readPlaylist: () => pending.promise });
  const e = new DeezerRecommendationEngine();
  const init = e.initialize("Sudanese", [], [track("a"), track("b")]);
  await new Promise(setImmediate);
  e.syncLikedTracks([track("b")]);
  pending.resolve(pool);
  await init;
  const next = await e.getNextTrack();
  assert.equal(next._debug.overlapTarget, 1);
  assert.deepEqual([...next._debug.matchedTrackIds], ["deezer:b"]);
});

test("failures stay visible and an empty deck does not repeatedly call the provider", async () => {
  let calls = 0;
  const { DeezerRecommendationEngine } = engine({ searchPlaylists: async () => { calls++; throw new Error("Deezer cooldown until tomorrow"); } });
  const e = new DeezerRecommendationEngine();
  await e.initialize("Sudanese");
  await e.getReactiveTracksAfterLike(5);
  await e.getNextTrack();
  assert.equal(calls, 1);
  assert.match(e.getStatusMessage(), /cooldown until tomorrow/);
  await e.retry();
  assert.equal(calls, 2);
});

function client(fetch, storage = {}) {
  return loadTs("mobile/src/lib/deezer/client.ts", { "@react-native-async-storage/async-storage": {
    getItem: async (key) => storage[key] || null,
    setItem: async (key, value) => { storage[key] = value; },
  } }, { fetch });
}

test("Deezer HTTP 200 quota errors persist a cooldown and stop other requests", async () => {
  let calls = 0;
  const storage = {};
  const api = client(async () => { calls++; return new Response(JSON.stringify({ error: { code: 4, message: "Quota exceeded" } }), { headers: { "retry-after": "7200" } }); }, storage);
  await assert.rejects(api.searchPlaylists("Sudanese"), /cooldown/);
  await assert.rejects(api.searchPlaylists("Other"), /cooldown/);
  assert.equal(calls, 1);
  assert.ok(Number(storage.vibeswipe_deezer_cooldown_until) > Date.now() + 7_000_000);
  const restarted = client(async () => { throw new Error("Must not fetch"); }, storage);
  await assert.rejects(restarted.searchPlaylists("Sudanese"), /cooldown/);
});

test("playlist reads paginate and expose partial coverage without fetching unbounded next links", async () => {
  const urls = [];
  const api = client(async (url) => {
    urls.push(url);
    return new Response(JSON.stringify({ total: 500, next: "https://other.invalid/do-not-follow", data: [
      { id: urls.length, title: "Song", artist: { name: "Artist" }, preview: "https://preview/1" },
    ] }));
  });
  const p = await api.readPlaylist({ id: "123", title: "Sudanese", query: "Sudanese" });
  assert.equal(p.complete, false);
  assert.equal(p.total, 500);
  assert.equal(p.tracks.length, 2);
  assert.equal(urls.length, 2);
  assert.match(urls[1], /api.deezer.com\/playlist\/123\/tracks\?limit=100&index=100/);
  await api.readPlaylist({ id: "123", title: "Sudanese", query: "Sudanese" });
  assert.equal(urls.length, 2);
});

test("the private test flag cannot activate in a release build", () => {
  const load = (__DEV__) => loadTs("mobile/src/lib/discovery-mode.ts", {}, { __DEV__, process: { env: { EXPO_PUBLIC_DISCOVERY_SOURCE: "deezer" } } });
  assert.equal(load(true).DEEZER_TEST_MODE, true);
  assert.equal(load(false).DEEZER_TEST_MODE, false);
});
