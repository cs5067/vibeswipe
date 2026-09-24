/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { loadTs } = require("./helpers/load-ts.cjs");

const id = "00000000-0000-4000-8000-000000000001";
function profile(env) {
  return loadTs("src/lib/profile/server.ts", {
    "next/headers": {}, "node:crypto": crypto, "@/lib/supabase/server": {},
  }, { process: { env } });
}

test("production rejects unsigned cookies and cannot mint them without a secret", () => {
  const api = profile({ NODE_ENV: "production" });
  assert.equal(api.parseProfileCookie(id), null);
  assert.throws(() => api.makeProfileCookieValue(id), /PROFILE_COOKIE_SECRET/);
});

test("signed cookies round-trip and reject tampered or malformed signatures", () => {
  const api = profile({ NODE_ENV: "production", PROFILE_COOKIE_SECRET: "x".repeat(64) });
  const cookie = api.makeProfileCookieValue(id);
  assert.equal(api.parseProfileCookie(cookie), id);
  assert.equal(api.parseProfileCookie(cookie.replace("000001", "000002")), null);
  assert.equal(api.parseProfileCookie(cookie + "junk"), null);
  assert.equal(api.parseProfileCookie(id), null);
});

test("unsigned cookies remain available only for local development", () => {
  const api = profile({ NODE_ENV: "development" });
  assert.equal(api.parseProfileCookie(api.makeProfileCookieValue(id)), id);
});
