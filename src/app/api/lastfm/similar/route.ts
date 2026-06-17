import { NextRequest, NextResponse } from "next/server";

/**
 * Last.fm similar-tracks proxy — borrowed collaborative filtering.
 *
 * Last.fm computes "people who play X also play Y" from millions of real
 * scrobbles. This carries recommendation quality while our own playlist
 * corpus densifies, and keeps the API key server-side.
 *
 * GET /api/lastfm/similar?artist=...&title=...&limit=12
 * → { similar: [{ name, artist, match }] }   (names, not Spotify ids —
 *   the engines resolve the few they need via Spotify search)
 */

interface LastfmSimilarTrack {
  name?: string;
  match?: number | string;
  artist?: { name?: string };
}

export async function GET(request: NextRequest) {
  const apiKey = process.env.LASTFM_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "LASTFM_API_KEY not set", similar: [] },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(request.url);
  const artist = (searchParams.get("artist") || "").trim();
  const title = (searchParams.get("title") || "").trim();
  const limit = Math.min(
    Math.max(Number.parseInt(searchParams.get("limit") || "12", 10) || 12, 1),
    30
  );

  if (!artist || !title) {
    return NextResponse.json({ error: "Missing artist or title" }, { status: 400 });
  }

  try {
    const params = new URLSearchParams({
      method: "track.getsimilar",
      artist,
      track: title,
      api_key: apiKey,
      format: "json",
      autocorrect: "1",
      limit: String(limit),
    });
    const res = await fetch(`https://ws.audioscrobbler.com/2.0/?${params}`, {
      next: { revalidate: 86400 },
    });
    if (!res.ok) return NextResponse.json({ similar: [] });

    const data = (await res.json()) as {
      similartracks?: { track?: LastfmSimilarTrack[] };
      error?: number;
    };
    if (data.error || !data.similartracks?.track) {
      return NextResponse.json({ similar: [] });
    }

    const similar = data.similartracks.track
      .filter((t) => t?.name && t.artist?.name)
      .map((t) => ({
        name: t.name as string,
        artist: t.artist!.name as string,
        match: Number(t.match) || 0,
      }));

    return NextResponse.json(
      { similar },
      { headers: { "Cache-Control": "public, s-maxage=86400, max-age=3600" } }
    );
  } catch (err) {
    console.error("lastfm similar error:", err);
    return NextResponse.json({ similar: [] });
  }
}
