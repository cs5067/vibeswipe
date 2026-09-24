/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadTs, deferred } = require("./helpers/load-ts.cjs");

function playback({ spotify = {}, preview = async () => null, audioMode = async () => {} } = {}) {
  const played = [];
  const api = loadTs("mobile/src/lib/playback-controller.ts", {
    "./spotify/client": { getDevices: async () => [], pausePlayback: async () => true, ...spotify },
    "./server-api": { resolvePreviewUrl: preview },
    "expo-audio": { setAudioModeAsync: audioMode,
      createAudioPlayer: ({ uri }) => ({ play: () => played.push(uri), pause() {}, remove() {} }) },
  });
  return { controller: api.playbackController, played };
}

test("late preview resolution cannot replace the latest card", async () => {
  const a = deferred(); const b = deferred();
  const { controller, played } = playback({ preview: (artist) => artist === "A" ? a.promise : b.promise });
  const old = controller.play("a", { artist: "A", name: "A" });
  // Let A reach its preview request before swiping again.
  await new Promise(setImmediate);
  const latest = controller.play("b", { artist: "B", name: "B" });
  b.resolve("preview-B");
  assert.equal(await latest, true);
  a.resolve("preview-A");
  assert.equal(await old, false);
  assert.deepEqual(played, ["preview-B"]);
});

for (const action of ["pause", "reset"]) {
  test(`${action} invalidates pending preview playback`, async () => {
    const url = deferred();
    const { controller, played } = playback({ preview: () => url.promise });
    const play = controller.play("a", { artist: "A", name: "A" });
    await new Promise(setImmediate);
    await controller[action]();
    url.resolve("preview-A");
    assert.equal(await play, false);
    assert.equal(played.length, 0);
  });
}

test("pause while audio mode initializes also cancels the preview", async () => {
  const mode = deferred();
  const { controller, played } = playback({ preview: async () => "a", audioMode: () => mode.promise });
  const play = controller.play("a", { artist: "A", name: "A" });
  await new Promise(setImmediate);
  await controller.pause();
  mode.resolve();
  assert.equal(await play, false);
  assert.equal(played.length, 0);
});

test("Connect commands are ordered and obsolete queued plays are skipped", async () => {
  const first = deferred(); const calls = [];
  const { controller } = playback({ spotify: {
    getDevices: async () => [{ id: "device", is_active: true }],
    playTrack: async (uri) => { calls.push(uri); return uri === "a" ? first.promise : true; },
  } });
  const a = controller.play("a");
  await new Promise(setImmediate);
  const b = controller.play("b");
  const c = controller.play("c");
  first.resolve(true);
  await Promise.all([a, b, c]);
  assert.deepEqual(calls, ["a", "c"]);
});

test("pause is sent after an already in-flight Connect play completes", async () => {
  const first = deferred(); const calls = [];
  const { controller } = playback({ spotify: {
    getDevices: async () => [{ id: "device" }],
    playTrack: async () => { calls.push("play"); return first.promise; },
    pausePlayback: async () => { calls.push("pause"); return true; },
  } });
  const play = controller.play("a");
  await new Promise(setImmediate);
  const pause = controller.pause();
  first.resolve(true);
  await Promise.all([play, pause]);
  assert.deepEqual(calls, ["play", "pause"]);
});

test("device lookup is reused and playback failures actually trigger backoff", async () => {
  let devices = 0; let plays = 0;
  const { controller } = playback({ spotify: {
    getDevices: async () => { devices++; return [{ id: "device" }]; },
    playTrack: async () => { plays++; return false; },
  } });
  for (const id of ["a", "b", "c", "d"]) await controller.play(id);
  assert.equal(devices, 1);
  assert.equal(plays, 3);
  assert.equal(controller.connected, false);
});

test("Deezer previews play directly without Spotify or the backend", async () => {
  let requests = 0;
  const { controller, played } = playback({
    spotify: { getDevices: async () => { requests++; return []; } },
    preview: async () => { requests++; return null; },
  });
  assert.equal(await controller.play("deezer:track:1", { provider: "deezer", name: "Song", artist: "Artist", previewUrl: "https://preview/1" }), true);
  assert.equal(requests, 0);
  assert.deepEqual(played, ["https://preview/1"]);
});
