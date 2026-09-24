/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadTs } = require("./helpers/load-ts.cjs");

function client(mode = "development", response = () => ({})) {
  const calls = [];
  const { SpotifyClient } = loadTs("src/lib/spotify/client.ts", {}, {
    process: { env: { SPOTIFY_QUOTA_MODE: mode } },
    fetch: async (url, init) => {
      calls.push({ url, ...init });
      return { ok: true, status: 200, text: async () => JSON.stringify(response(url)) };
    },
  });
  return { api: new SpotifyClient("test"), calls };
}

test("backend development exports use current-user playlists and items", async () => {
  const { api, calls } = client();
  await api.createPlaylist("user", "Night drive");
  await api.addTracksToPlaylist("playlist", ["spotify:track:a"]);
  assert.ok(calls[0].url.endsWith("/me/playlists"));
  assert.ok(calls[1].url.endsWith("/playlists/playlist/items"));
  assert.equal(api.supportsPublicPlaylistDiscovery(), false);
});

test("backend normalizes new playlist items and preserves pagination", async () => {
  const { api, calls } = client("development", () => ({ items: [{ item: { id: "a" } }, null], next: "next", total: 70 }));
  const data = await api.getPlaylistTracks("playlist", 100, 50);
  assert.ok(calls[0].url.endsWith("/items?limit=50&offset=50"));
  assert.equal(data.items[0].track.id, "a");
  assert.equal(data.next, "next");
});

test("backend development hydration avoids removed bulk endpoints", async () => {
  const { api, calls } = client("development", (url) => ({ id: url.split("/").at(-1) }));
  const { tracks } = await api.getTracks(["a", "a", "b"]);
  assert.equal(tracks.length, 2);
  assert.equal(calls.length, 2);
  assert.ok(calls[0].url.endsWith("/tracks/a"));
});

test("backend extended mode keeps legacy playlist writes", async () => {
  const { api, calls } = client("extended");
  await api.createPlaylist("user", "Night drive");
  assert.equal(api.supportsPublicPlaylistDiscovery(), true);
  assert.ok(calls[0].url.endsWith("/users/user/playlists"));
});
