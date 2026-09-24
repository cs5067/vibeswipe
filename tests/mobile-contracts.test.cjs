/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadTs } = require("./helpers/load-ts.cjs");

test("friend requests send the username required by the server", async () => {
  let body;
  const api = loadTs("mobile/src/lib/server-api.ts", {
    "./spotify/auth": { getAccessToken: async () => "test" },
  }, {
    fetch: async (_, init) => {
      body = JSON.parse(init.body);
      return { ok: true, json: async () => ({ ok: true }) };
    },
  });
  assert.equal(await api.sendFriendRequest("  John  "), true);
  assert.deepEqual(body, { toUsername: "john" });
});

test("a rejected friend request is not a success", async () => {
  const api = loadTs("mobile/src/lib/server-api.ts", {
    "./spotify/auth": { getAccessToken: async () => "test" },
  }, { fetch: async () => ({ ok: false, status: 400 }) });
  assert.equal(await api.sendFriendRequest("john"), false);
});
