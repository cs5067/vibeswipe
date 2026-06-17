import { NextRequest, NextResponse } from "next/server";
import { getCorpusClient } from "@/lib/supabase/server";

/**
 * Playlist co-occurrence recommendations.
 *
 * POST body: { liked: string[], seen?: string[], limit?: number }
 *   liked — Spotify track ids the user swiped right on
 *   seen  — track ids already shown (excluded from results)
 *   limit — max candidates to return (default 50)
 *
 * Returns: { candidates: Array<{ trackId, sharedPlaylists, score }> }
 *
 * This replaces the live-Spotify-search co-occurrence with a single
 * indexed query against our own corpus — no Spotify API calls, so it
 * does not consume the user's rate limit during a swipe session.
 */
export async function POST(request: NextRequest) {
  let body: { liked?: unknown; seen?: unknown; limit?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const liked = Array.isArray(body.liked)
    ? body.liked.filter((x): x is string => typeof x === "string")
    : [];
  const seen = Array.isArray(body.seen)
    ? body.seen.filter((x): x is string => typeof x === "string")
    : [];
  const limit =
    typeof body.limit === "number" && body.limit > 0 && body.limit <= 200
      ? Math.floor(body.limit)
      : 50;

  if (liked.length === 0) {
    return NextResponse.json({ candidates: [] });
  }

  try {
    const supabase = getCorpusClient();
    const { data, error } = await supabase.rpc("cooccur_recommend", {
      liked_ids: liked,
      seen_ids: seen,
      max_results: limit,
    });

    if (error) {
      console.error("cooccur_recommend error:", error);
      return NextResponse.json({ error: "Recommendation query failed" }, { status: 500 });
    }

    const candidates = (data ?? []).map(
      (row: { track_id: string; shared_playlists: number; score: number }) => ({
        trackId: row.track_id,
        sharedPlaylists: Number(row.shared_playlists),
        score: Number(row.score),
      })
    );

    return NextResponse.json({ candidates });
  } catch (err) {
    console.error("cooccur route error:", err);
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }
}
