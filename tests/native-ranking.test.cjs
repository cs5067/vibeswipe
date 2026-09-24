/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const cp = require("node:child_process");
const path = require("node:path");
const { loadTs } = require("./helpers/load-ts.cjs");

const graph = loadTs("src/lib/engine/genre-graph.ts");
const vibe = loadTs("src/lib/engine/vibe-interpreter.ts");
const scoring = loadTs("src/lib/engine/scoring.ts", { "./genre-graph": graph, "./vibe-interpreter": vibe });
const server = loadTs("src/lib/engine/native-server.ts", { "node:child_process": cp, "node:path": path }, { process });
const limiter = loadTs("src/lib/rate-limit.ts");
const route = loadTs("src/app/api/reco/rank/route.ts", {
  "@/lib/engine/native-server": server, "@/lib/rate-limit": limiter,
}, { Response });
const client = (file, fetch) => loadTs(file, { "./scoring": scoring }, { fetch });
const makeTrack = (id, genres = [], artistIds = []) => ({ id, genres, artistIds, popularity: 50, branchId: "branch" });
function fixture() {
  return {
    tracks: [makeTrack("lofi", ["lo-fi"], ["فنّان\nquoted\"\\"]), makeTrack("rock", ["rock"], ["known"]), makeTrack("tie", ["rock"], ["known"])],
    liked: [makeTrack("old", ["ambient"], ["known"])],
    branches: new Map([["branch", { likes: 3, dislikes: 1 }]]),
    profile: {
      genreWeights: new Map([["lo-fi", .8]]), knownArtistIds: new Set(["known"]),
      genreTransitions: new Map([["ambient", new Map([["lo-fi", 2]])]]),
      popularityRange: [20, 60], sessionVibe: { energy: .2, mood: .5, tempo: .3, intimacy: .8, experimental: .3 },
      lastLikedTracks: [{ genres: ["ambient"], energy: .2 }],
    },
  };
}
function payload(f = fixture()) {
  return client("src/lib/engine/native-ranking.ts").scoringPayload(f.tracks, f.profile, f.branches, f.liked);
}
function closeScores(actual, expected) {
  assert.deepEqual(Array.from(actual, r => r.track.id), Array.from(expected, r => r.track.id));
  actual.forEach((row, i) => Object.keys(expected[i].score).forEach(key =>
    assert.ok(Math.abs(row.score[key] - expected[i].score[key]) < 1e-12, key)));
}

for (const surface of ["src", "mobile/src"]) {
  test(`${surface}: app adapter -> route -> real C++ -> original tracks and stable scores`, async () => {
    const f = fixture(); let calls = 0;
    const adapter = client(`${surface}/lib/engine/native-ranking.ts`, async (url, init) => {
      calls++;
      const response = await route.POST(new Request(`http://local${url}`, init));
      assert.equal(response.status, 200);
      assert.equal((await response.clone().json()).engine, "cpp17");
      return response;
    });
    const ranked = await adapter.rankWithNative(f.tracks, f.profile, f.branches, f.liked, "/api/reco/rank");
    assert.equal(calls, 1);
    closeScores(ranked, scoring.rankCandidates(f.tracks, f.profile, f.branches, f.liked));
    for (const row of ranked) assert.ok(f.tracks.includes(row.track), "metadata object identity retained");
  });
}

test("missing backend falls back and pauses repeated failing requests", async () => {
  const f = fixture(); let calls = 0;
  const adapter = client("src/lib/engine/native-ranking.ts", async () => { calls++; throw new Error("offline"); });
  for (let i = 0; i < 2; i++) closeScores(
    await adapter.rankWithNative(f.tracks, f.profile, f.branches, f.liked, "/rank"),
    scoring.rankCandidates(f.tracks, f.profile, f.branches, f.liked));
  assert.equal(calls, 1);
});

test("a stalled scoring request aborts and falls back", async () => {
  const f = fixture(); let aborted = false;
  const adapter = client("src/lib/engine/native-ranking.ts", (_, init) => new Promise((resolve, reject) => {
    init.signal.addEventListener("abort", () => { aborted = true; reject(new Error("aborted")); }, { once: true });
  }));
  closeScores(await adapter.rankWithNative(f.tracks, f.profile, f.branches, f.liked, "/rank"),
    scoring.rankCandidates(f.tracks, f.profile, f.branches, f.liked));
  assert.equal(aborted, true);
});

test("native process concurrency is bounded and released after completion", async () => {
  const callbacks = [];
  const bounded = loadTs("src/lib/engine/native-server.ts", {
    "node:path": path,
    "node:child_process": { execFile: (_, args, options, callback) => {
      assert.deepEqual(Array.from(args), []);
      assert.equal(options.timeout, 2000);
      assert.equal(options.killSignal, "SIGKILL");
      callbacks.push(callback);
      return { stdin: { on() {}, end() {} } };
    } },
  }, { process });
  const p = payload(); p.candidates = [];
  const running = Array.from({ length: 4 }, () => bounded.nativeRank(p));
  await assert.rejects(bounded.nativeRank(p), bounded.RankingUnavailableError);
  callbacks.splice(0).forEach(callback => callback(null, "VIBESWIPE_RANK_V1\n"));
  await Promise.all(running);
  const next = bounded.nativeRank(p);
  callbacks[0](null, "VIBESWIPE_RANK_V1\n");
  assert.equal((await next).length, 0);
});

test("invalid, duplicate, nonfinite or unsorted native output falls back", async () => {
  const f = fixture();
  const expected = scoring.rankCandidates(f.tracks, f.profile, f.branches, f.liked);
  const valid = expected.map(row => ({ index: f.tracks.indexOf(row.track), score: row.score }));
  for (const rows of [[], [valid[0], valid[0], valid[0]], [...valid].reverse(),
    [{ ...valid[0], score: { ...valid[0].score, total: NaN } }, ...valid.slice(1)]]) {
    const adapter = client("src/lib/engine/native-ranking.ts", async () => ({ ok: true, json: async () => ({ engine: "cpp17", ranked: rows }) }));
    closeScores(await adapter.rankWithNative(f.tracks, f.profile, f.branches, f.liked, "/rank"), expected);
  }
});

test("bounded server schema rejects invalid inputs before spawning", () => {
  for (const change of [
    p => { p.candidates = Array(501).fill(p.candidates[0]); },
    p => { p.profile.popularityRange = [90, 10]; },
    p => { p.profile.sessionVibe.mood = NaN; },
    p => { p.branches[0][1].likes = -1; },
    p => { p.profile.genreTransitions[0][2] = -1; },
    p => { p.candidates[0].artistIds = ["x".repeat(4097)]; },
    p => { p.liked = {}; },
  ]) {
    const p = payload(); change(p);
    assert.throws(() => server.encodeRanking(p), server.RankingInputError);
  }
});

test("empty candidate set is a valid native result", async () => {
  const p = payload(); p.candidates = [];
  assert.equal((await server.nativeRank(p)).length, 0);
});

test("C++ protocol rejects truncation, invalid hex, count overflow and trailing input", () => {
  const wire = server.encodeRanking(payload()).wire;
  const cases = ["", "WRONG\n", wire.slice(0, 30), wire + "EXTRA\n",
    wire.replace("6c6f2d6669", "zz"), wire.replace("VIBESWIPE_RANK_V1\n", "VIBESWIPE_RANK_V1\nnan\n"),
    "VIBESWIPE_RANK_V1\n.5 .5 .5 .5 .3 0 100 100000000000000000000\n"];
  for (const input of cases) {
    const result = cp.spawnSync(path.join(process.cwd(), "native/build/vibeswipe-rank"), [], { input, encoding: "utf8", timeout: 3000 });
    assert.equal(result.error, undefined);
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, "");
  }
});

test("native output parser enforces complete unique sorted results", () => {
  const row = "0\t.5\t.5\t.5\t.5\t.5\t.5\t.5\t.5";
  for (const output of ["", `VIBESWIPE_RANK_V1\n${row}\n${row}\n`, `VIBESWIPE_RANK_V1\n${row.replace(".5", "nan")}\n`])
    assert.throws(() => server.parseRanking(output, 1), server.RankingUnavailableError);
});

test("route rejects malformed JSON and oversized bodies without native work", async () => {
  const cases = [["{", "application/json", 400], ["{}", "text/plain", 415], ["x".repeat(1024 * 1024 + 1), "application/json", 413], ["{}", "application/json", 400]];
  for (const [body, contentType, status] of cases) {
    const response = await route.POST(new Request("http://local/api/reco/rank", { method: "POST", headers: { "content-type": contentType }, body }));
    assert.equal(response.status, status);
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
});

test("route returns 503 for native failure and 429 when its budget is exhausted", async () => {
  const failed = loadTs("src/app/api/reco/rank/route.ts", {
    "@/lib/engine/native-server": { ...server, nativeRank: async () => { throw new Error("missing binary"); } },
    "@/lib/rate-limit": { rateLimit: () => ({ ok: true }) },
  }, { Response });
  const busy = loadTs("src/app/api/reco/rank/route.ts", {
    "@/lib/engine/native-server": server,
    "@/lib/rate-limit": { rateLimit: () => ({ ok: false, retryAfterSec: 15 }) },
  }, { Response });
  const request = () => new Request("http://local/api/reco/rank", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload()) });
  assert.equal((await failed.POST(request())).status, 503);
  const response = await busy.POST(request());
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "15");
});
