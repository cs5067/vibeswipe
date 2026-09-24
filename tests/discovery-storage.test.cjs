/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadTs } = require("./helpers/load-ts.cjs");
const zustand = require("../mobile/node_modules/zustand");

function setup(testMode = true, data = {}) {
  const writes = [];
  const api = loadTs("mobile/src/stores/session-store.ts", {
    zustand,
    "../lib/discovery-mode": { DEEZER_TEST_MODE: testMode },
    "@react-native-async-storage/async-storage": {
      getItem: async (key) => data[key] || null,
      setItem: async (key, value) => { writes.push(key); data[key] = value; },
    },
  });
  return { store: api.useSessionStore, writes, data };
}

test("the first test swipe persists separately from existing Spotify playlists", async () => {
  const { store, writes, data } = setup(true, { vibeswipe_playlists: "original" });
  store.getState().addLikedTrack({ id: "deezer:1", name: "One" });
  await new Promise(setImmediate);
  assert.equal(writes.length, 1);
  assert.equal(writes[0], "vibeswipe_deezer_test_playlists");
  assert.equal(data.vibeswipe_playlists, "original");
  assert.equal(JSON.parse(data.vibeswipe_deezer_test_playlists)[0].tracks[0].id, "deezer:1");
});

test("removing the final liked song persists an empty existing playlist", async () => {
  const { store, data } = setup();
  store.getState().addLikedTrack({ id: "deezer:1", name: "One" });
  store.getState().removeLikedTrack("deezer:1");
  await new Promise(setImmediate);
  assert.equal(JSON.parse(data.vibeswipe_deezer_test_playlists)[0].tracks.length, 0);
});

test("resume restores exclusions and locally saved outside-vibe tracks", async () => {
  const { store, data } = setup();
  store.getState().addSkippedTrack({ id: "deezer:skip", name: "Skip" });
  store.getState().addSavedToLiked({ id: "deezer:outside", name: "Outside" });
  await new Promise(setImmediate);
  const restarted = setup(true, data).store;
  await restarted.getState().loadSavedPlaylists();
  restarted.getState().resumePlaylist(restarted.getState().savedPlaylists[0].id);
  assert.deepEqual([...restarted.getState().skippedTrackIds], ["deezer:skip"]);
  assert.deepEqual([...restarted.getState().savedTrackIds], ["deezer:outside"]);
  assert.equal(restarted.getState().swipeHistory[1].track.name, "Outside");
  assert.equal(restarted.getState().likedTracks.length, 0);
});

test("normal provider mode does not write the test storage namespace", async () => {
  const { store, writes } = setup(false);
  store.getState().addLikedTrack({ id: "spotify-id" });
  await store.getState().saveCurrentPlaylist();
  assert.deepEqual(writes, ["vibeswipe_playlists"]);
});
