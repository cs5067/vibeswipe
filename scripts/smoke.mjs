#!/usr/bin/env node
/**
 * vibeswipe smoke suite — every public surface, one command, pass/fail.
 *
 *   node scripts/smoke.mjs [baseUrl]     (default http://localhost:3005)
 *
 * Covers: pages render logged-out, arena read+anonymous-vote loop, waitlist
 * validation, preview + last.fm + cooccur APIs, share create→render, and the
 * auth gates (401s) on protected routes. Exits non-zero on any failure so it
 * can gate commits/deploys.
 */

const BASE = process.argv[2] || "http://localhost:3005";
let passed = 0;
let failed = 0;
const failures = [];

function ok(name, cond, detail = "") {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    failures.push(name);
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function req(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, { redirect: "manual", ...opts });
  let body = null;
  const text = await res.text();
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body, headers: res.headers };
}

console.log(`\nvibeswipe smoke @ ${BASE}\n`);

// ── pages (logged out) ──────────────────────────────────────────
{
  const home = await req("/");
  ok("landing renders", home.status === 200);
  const arena = await req("/arena");
  ok("arena renders logged-out", arena.status === 200);
}

// ── arena read APIs ─────────────────────────────────────────────
let dropId = null;
{
  const vibes = await req("/api/arena/vibes");
  ok(
    "arena vibes list",
    vibes.status === 200 && Array.isArray(vibes.body?.vibes) && vibes.body.vibes.length >= 8
  );
  const room = await req("/api/arena/vibe/late-night-drive");
  ok(
    "arena room ranked drops",
    room.status === 200 && Array.isArray(room.body?.drops) && room.body.drops.length > 0
  );
  dropId = room.body?.drops?.[0]?.id ?? null;
  const bad = await req("/api/arena/vibe/NOPE_bad_slug!!");
  ok("arena rejects malformed slug", bad.status === 400 || bad.status === 404);
}

// ── anonymous vote loop (cookie identity, revote replaces) ─────
if (dropId) {
  const v1 = await req("/api/arena/vote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dropId, value: 1 }),
  });
  const cookie = v1.headers.get("set-cookie")?.split(";")[0] ?? "";
  ok("anon vote fire", v1.status === 200 && v1.body?.ok === true && !!cookie);
  const before = v1.body?.score;

  const v2 = await req("/api/arena/vote", {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ dropId, value: -1 }),
  });
  ok(
    "revote replaces (no stacking)",
    v2.status === 200 && typeof before === "number" && v2.body.score === before - 2
  );

  // cleanup: flip back to neutral is impossible via API; acceptable — votes
  // are test residue of ±1 on one seeded drop. Flip to +1 to end positive.
  await req("/api/arena/vote", {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ dropId, value: 1 }),
  });

  const badVote = await req("/api/arena/vote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dropId, value: 7 }),
  });
  ok("vote rejects bad value", badVote.status === 400);
}

// ── waitlist ────────────────────────────────────────────────────
{
  const email = `smoke+${Math.random().toString(36).slice(2, 8)}@vibeswipe.test`;
  const w1 = await req("/api/waitlist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, source: "smoke" }),
  });
  ok("waitlist accepts", w1.status === 200 && w1.body?.ok === true);
  const w2 = await req("/api/waitlist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, source: "smoke" }),
  });
  ok("waitlist duplicate is ok:true", w2.status === 200 && w2.body?.ok === true);
  const w3 = await req("/api/waitlist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "not-an-email" }),
  });
  ok("waitlist rejects garbage", w3.status === 400);
}

// ── recommendation + audio APIs ────────────────────────────────
{
  const prev = await req(
    "/api/preview?artist=The%20Weeknd&title=Blinding%20Lights"
  );
  ok(
    "deezer preview resolves",
    prev.status === 200 && typeof prev.body?.previewUrl === "string" && prev.body.previewUrl.length > 10
  );
  const lfm = await req(
    "/api/lastfm/similar?artist=The%20Weeknd&title=Blinding%20Lights&limit=3"
  );
  ok(
    "last.fm similars flow (or key unset 503)",
    (lfm.status === 200 && Array.isArray(lfm.body?.similar)) || lfm.status === 503
  );
  const co = await req("/api/reco/cooccur", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ liked: [] }),
  });
  ok("cooccur empty-likes -> empty candidates", co.status === 200 && Array.isArray(co.body?.candidates));
}

// ── share loop (create → recipient page) ───────────────────────
{
  const share = await req("/api/share", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      track: {
        name: "Smoke Test Song",
        artistNames: ["Smoke Artist"],
        albumImage: "",
        previewUrl: null,
        spotifyUrl: "https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b",
      },
      senderName: "Smoke",
      note: "smoke suite",
    }),
  });
  ok("share creates", share.status === 200 && typeof share.body?.code === "string");
  if (share.body?.code) {
    const page = await req(`/s/${share.body.code}`);
    ok(
      "share page renders w/ content",
      page.status === 200 && String(page.body).includes("Smoke Test Song")
    );
  }
}

// ── auth gates hold ────────────────────────────────────────────
{
  for (const [name, path, init] of [
    ["inbox gated", "/api/inbox", {}],
    ["friends gated", "/api/friends", {}],
    ["sent gated", "/api/sent", {}],
    [
      "arena drop gated",
      "/api/arena/drop",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vibeSlug: "gym-rage",
          track: { name: "x", artistNames: ["y"], albumImage: "", previewUrl: null, spotifyUrl: "https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b" },
        }),
      },
    ],
    ["seed gated", "/api/corpus/seed", {}],
  ]) {
    const r = await req(path, init);
    ok(name, r.status === 401);
  }
}

console.log(`\n${passed} passed, ${failed} failed${failed ? `: ${failures.join(", ")}` : ""}\n`);
process.exit(failed ? 1 : 0);
