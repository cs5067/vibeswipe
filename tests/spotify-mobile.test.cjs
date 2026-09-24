/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadTs } = require("./helpers/load-ts.cjs");

function client({ initial = null, response = () => ({}), env = {} } = {}) {
  let stored = initial;
  const calls = [];
  const api = loadTs("mobile/src/lib/spotify/client.ts", {
    "./auth": { getAccessToken: async () => "test" },
    "@react-native-async-storage/async-storage": {
      getItem: async () => stored, setItem: async (_, value) => { stored = value; },
    },
  }, { process: { env }, fetch: async (url, init) => {
    calls.push({ url, ...init });
    const result = response(url, init);
    const status = result.status || 200;
    return { ok: status < 400, status,
      headers: { get: () => result.retryAfter ?? null },
      text: async () => JSON.stringify(result.body ?? {}) };
  } });
  return { api, calls, stored: () => stored };
}

test("a long Retry-After survives and blocks search AND other Spotify requests", async () => {
  const { api, calls, stored } = client({ response: () => ({ status: 429, retryAfter: "81850",
    body: { error: { reason: "QUOTA_EXCEEDED" } } }) });
  const before = Date.now();
  await assert.rejects(api.search("a"), (error) => error.reason === "QUOTA_EXCEEDED");
  assert.ok(Number(stored()) >= before + 81850_000);
  await assert.rejects(api.getMe(), (error) => error.status === 429);
  await api.searchPlaylists("b");
  assert.equal(calls.length, 1);
});

test("a persisted cooldown is never clamped on app restart", async () => {
  const initial = String(Date.now() + 81850_000);
  const { api, calls, stored } = client({ initial });
  await assert.rejects(api.getMe(), (error) => error.status === 429);
  assert.equal(calls.length, 0);
  assert.equal(stored(), initial);
});

test("an expired cooldown allows requests and search keeps its offset", async () => {
  const { api, calls } = client({ initial: String(Date.now() - 1000) });
  await api.search("a", ["track"], 50, 10);
  const url = new URL(calls[0].url);
  assert.equal(url.searchParams.get("offset"), "10");
  assert.equal(url.searchParams.get("limit"), "10");
});

test("development playlist items are normalized to the internal track shape", async () => {
  const { api, calls } = client({ response: () => ({ body: { items: [{ item: { id: "a" } }, null], total: 1 } }) });
  const data = await api.getPlaylistTracks("playlist", 100);
  assert.match(calls[0].url, /\/items\?limit=50/);
  assert.equal(data.items[0].track.id, "a");
  assert.equal(data.items.length, 1);
});

test("development hydration uses cached individual tracks instead of removed bulk calls", async () => {
  const { api, calls } = client({ response: (url) => ({ body: { id: url.split("/").at(-1) } }) });
  await api.getTracks(["a", "a", "b"]);
  await api.getTracks(["b", "a"]);
  assert.equal(calls.length, 2);
  assert.ok(calls.every((call) => /\/tracks\/[ab]$/.test(call.url)));
});

test("development export and library writes use supported endpoints", async () => {
  const { api, calls } = client();
  await api.createPlaylist("me", "Road trip");
  await api.addTracksToPlaylist("playlist", ["spotify:track:a"]);
  assert.equal(await api.saveTracks(["a"]), true);
  assert.ok(calls[0].url.endsWith("/me/playlists"));
  assert.ok(calls[1].url.endsWith("/playlists/playlist/items"));
  const saveUrl = new URL(calls[2].url);
  assert.equal(saveUrl.pathname, "/v1/me/library");
  assert.equal(saveUrl.searchParams.get("uris"), "spotify:track:a");
  assert.equal(calls[2].body, undefined);
});

test("library writes respect the forty-URI limit", async () => {
  const { api, calls } = client();
  assert.equal(await api.saveTracks(Array.from({ length: 41 }, (_, i) => String(i))), true);
  assert.equal(calls.length, 2);
  assert.equal(new URL(calls[0].url).searchParams.get("uris").split(",").length, 40);
});

test("unavailable artist-top requests fail without spending quota", async () => {
  const { api, calls } = client();
  assert.equal(api.supportsPublicPlaylistDiscovery(), false);
  await assert.rejects(api.getArtistTopTracks("artist"), (error) => error.reason === "UNSUPPORTED_CAPABILITY");
  assert.equal(calls.length, 0);
});

test("extended mode retains its approved legacy endpoint behavior", async () => {
  const { api, calls } = client({ env: { EXPO_PUBLIC_SPOTIFY_QUOTA_MODE: "extended" } });
  assert.equal(api.supportsPublicPlaylistDiscovery(), true);
  await api.getPlaylistTracks("playlist");
  await api.createPlaylist("me", "Road trip");
  assert.match(calls[0].url, /\/playlist\/tracks\?/);
  assert.ok(calls[1].url.endsWith("/users/me/playlists"));
});
