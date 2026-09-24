import { NextRequest, NextResponse } from "next/server";
import { ingestPlaylist } from "@/lib/corpus/ingest";
import { rateLimit, requestIp } from "@/lib/rate-limit";

/**
 * Corpus ingestion endpoint for the MOBILE app.
 *
 * The web app ingests playlists server-side as a side effect of proxying
 * Spotify calls. The mobile app talks to Spotify directly, so it POSTs the
 * playlists it scans here instead — every scan widens the co-occurrence base.
 *
 * POST { playlistId, playlistName?, totalTracks?, items: [{ track: {...} }] }
 *
 * Gated by CORPUS_INGEST_TOKEN (required in production) + per-ip rate limit.
 */
export async function POST(request: NextRequest) {
  const limited = rateLimit(`ingest:${requestIp(request)}`, {
    limit: 60,
    windowMs: 60 * 60 * 1000,
  });
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many requests", retryAfterSec: limited.retryAfterSec },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSec) } }
    );
  }

  // Optional shared-secret gate. When CORPUS_INGEST_TOKEN is set (production),
  // callers must send a matching x-ingest-token header. Unset in local dev so
  // the phone-over-LAN flow works without ceremony. MUST be set before deploy.
  const expected = process.env.CORPUS_INGEST_TOKEN;
  if (expected && request.headers.get("x-ingest-token") !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    playlistId?: unknown;
    playlistName?: unknown;
    totalTracks?: unknown;
    items?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const playlistId =
    typeof body.playlistId === "string" && /^[A-Za-z0-9]{10,40}$/.test(body.playlistId)
      ? body.playlistId
      : null;
  if (!playlistId || !Array.isArray(body.items)) {
    return NextResponse.json({ error: "Missing playlistId or items" }, { status: 400 });
  }

  const playlistName =
    typeof body.playlistName === "string" ? body.playlistName.slice(0, 200) : null;
  const totalTracks =
    typeof body.totalTracks === "number" && body.totalTracks >= 0
      ? Math.floor(body.totalTracks)
      : null;
  const items = (body.items as Array<{ track?: unknown } | null>).slice(0, 200);

  try {
    await ingestPlaylist(
      playlistId,
      playlistName,
      totalTracks,
      items as Parameters<typeof ingestPlaylist>[3]
    );
    return NextResponse.json({ ok: true, ingested: items.length });
  } catch (err) {
    console.error("corpus ingest route error:", err);
    return NextResponse.json({ error: "Ingest failed" }, { status: 500 });
  }
}
