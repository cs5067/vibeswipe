/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadTs, deferred } = require("./helpers/load-ts.cjs");

function track(id, name = id, artist = "Artist A") {
  return { id, name, artistNames: [artist], artistIds: ["artist"], genres: [], popularity: 0, strategy: "test" };
}

function engine(spotify = {}, server = {}, nativeRank = async (tracks) => tracks.map((track) => ({ track, score: { total: 1 } }))) {
  const { RecommendationEngine } = loadTs("mobile/src/lib/engine/recommendation-engine.ts", {
    "./taste-profile": { estimateTrackEnergy: () => 0.5 },
    "./scoring": { rankCandidates: (tracks) => tracks.map((track) => ({ track, score: { total: 1 } })) },
    "./native-ranking": { rankWithNative: nativeRank },
    "./playlist-seeds": {}, "./playlist-memory": { rememberSeen() {} },
    "../server-api": server,
    "../spotify/client": { supportsPublicPlaylistDiscovery: () => false, getSpotifyCooldownUntil: () => 0,
      getLastPlaylistSearchError: () => null, ...spotify },
  });
  const instance = new RecommendationEngine();
  instance.initialized = true;
  instance.profile = { seenTrackIds: new Set(), genreWeights: new Map(), branches: new Map(),
    likedArtistIds: new Set(), likedGenres: new Map(), lastLikedTracks: [] };
  instance.seeds = { seedArtists: [], searchQueries: [], genres: [], playlistSearches: [] };
  instance.likedTracks = [track("seed")];
  return instance;
}

test("same title alone is not a recording match", () => {
  const e = engine();
  assert.equal(e.isSameTrack({ id: "other", name: "Home", artists: [{ name: "Artist B" }] }, track("seed", "Home")), false);
  assert.equal(e.isSameTrack({ name: "Home", artists: [{ name: "Artist A Tribute" }] }, track("seed", "Home")), false);
  assert.equal(e.isSameTrack({ name: " HOME ", artists: [{ name: " artist a " }] }, track("seed", "Home")), true);
  assert.equal(e.isSameTrack({ id: "seed" }, track("seed")), true);
});

test("concurrent refill callers await the same pending work", async () => {
  const e = engine(); const gate = deferred(); let runs = 0;
  e.refillOnce = async () => { runs++; await gate.promise; e.queue.push(track("new")); };
  const first = e.refillPool();
  assert.equal(e.refillPool(), first);
  let completed = false;
  const reactive = e.getReactiveTracksAfterLike(1).then((tracks) => { completed = true; return tracks; });
  await new Promise(setImmediate);
  assert.equal(completed, false);
  gate.resolve();
  const tracks = await reactive;
  assert.equal(tracks[0].id, "new");
  // getNextTrack may start the next prefetch, but not before the first completes.
  assert.ok(runs >= 1);
});

test("leaving and returning while initialization runs does not initialize twice", async () => {
  const e = engine(); const gate = deferred(); let calls = 0;
  e.initializeSession = async () => { calls++; await gate.promise; };
  const first = e.initialize("Night drive");
  assert.equal(e.initialize("Night drive"), first);
  gate.resolve();
  await first;
  assert.equal(calls, 1);
});

test("an empty deck waits for its refill rather than remaining blank", async () => {
  const e = engine(); const gate = deferred();
  e.refillOnce = async () => { await gate.promise; e.queue.push(...Array.from({ length: 10 }, (_, i) => track(String(i)))); };
  const next = e.getNextTrack();
  gate.resolve();
  assert.equal((await next).id, "0");
});

test("a removal during retrieval discards old results and rebuilds against remaining likes", async () => {
  const e = engine(); const gate = deferred(); let rounds = 0;
  e.likedTracks = [track("kept"), track("removed")];
  e.ownPlaylistMatches = async () => [];
  e.corpusCooccurrence = async () => {
    rounds++;
    if (rounds === 1) { await gate.promise; return [track("stale")]; }
    assert.equal(e.likedTracks.length, 1);
    return [track("fresh")];
  };
  e.lastfmSimilar = async () => [];
  e.searchArtist = async () => [];
  const pending = e.refillPool();
  e.syncLikedTracks([track("kept")]);
  gate.resolve();
  await pending;
  assert.equal(rounds, 2);
  assert.equal(e.queue.length, 1);
  assert.equal(e.queue[0].id, "fresh");
});

test("unsupported public-playlist strategies spend no requests", async () => {
  const e = engine({ searchPlaylists: () => { throw new Error("Must not search"); } });
  assert.equal((await e.playlistOverlapFromLikedSet()).length, 0);
  assert.equal((await e.playlistCoOccurrence("artist", [])).length, 0);
  assert.equal((await e.playlistNameSearch()).length, 0);
});

test("a single remaining like is enough to query the corpus", async () => {
  let queried = false;
  const e = engine({}, { corpusRecommend: async (liked) => { queried = liked[0] === "seed"; return []; } });
  await e.corpusCooccurrence();
  assert.equal(queried, true);
});

test("an active provider cooldown ends with a deadline instead of a loading message", async () => {
  const e = engine({ getSpotifyCooldownUntil: () => Date.now() + 60_000 });
  await e.refillPool();
  assert.match(e.getStatusMessage(), /paused requests until/);
  assert.equal(e.getPoolSize(), 0);
});

test("a like removal during native scoring discards that batch and refills", async () => {
  const gate = deferred(); let scoringCalls = 0;
  const e = engine({}, {}, async tracks => {
    scoringCalls++;
    if (scoringCalls === 1) await gate.promise;
    return tracks.map(track => ({ track, score: { total: 1 } }));
  });
  e.likedTracks = [track("kept"), track("removed")];
  e.ownPlaylistMatches = async () => [];
  e.corpusCooccurrence = async () => [track(e.likedTracks.length === 2 ? "stale" : "fresh")];
  e.lastfmSimilar = async () => [];
  e.searchArtist = async () => [];
  const pending = e.refillPool();
  while (scoringCalls === 0) await new Promise(setImmediate);
  e.syncLikedTracks([track("kept")]);
  gate.resolve();
  await pending;
  assert.equal(scoringCalls, 2);
  assert.equal(e.queue.length, 1);
  assert.equal(e.queue[0].id, "fresh");
});

test("corpus hydration retains its source score", async () => {
  const e = engine({ getTracks: async () => [{ id: "candidate", name: "Candidate", artists: [] }] },
    { corpusRecommend: async () => [{ trackId: "candidate", sharedPlaylists: 3, score: 2.75 }] });
  const tracks = await e.corpusCooccurrence();
  assert.equal(tracks[0].corpusScore, 2.75);
  assert.match(tracks[0]._debug.matchedBecause, /2.750/);
});

test("corpus ranking preserves stronger evidence instead of shuffling it away", async () => {
  const e = engine();
  e.ownPlaylistMatches = async () => [];
  e.lastfmSimilar = async () => [];
  e.searchArtist = async () => [];
  e.corpusCooccurrence = async () => [
    { ...track("weak"), strategy: "corpus_cooccur", corpusScore: 1 },
    { ...track("strong"), strategy: "corpus_cooccur", corpusScore: 10 },
  ];
  await e.refillPool();
  assert.equal(e.queue[0].id, "strong");
});
