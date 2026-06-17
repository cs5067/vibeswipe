import { NextRequest, NextResponse } from "next/server";

/**
 * Preview fallback — Spotify stripped preview_url from most API responses
 * (Nov 2024), so we resolve 30s previews from Deezer's public API instead.
 * Deezer needs no auth but blocks browser CORS, hence this server proxy.
 *
 * GET /api/preview?artist=...&title=...  →  { previewUrl: string | null }
 */

interface DeezerTrack {
  title?: string;
  preview?: string;
  artist?: { name?: string };
}

async function searchDeezer(query: string): Promise<string | null> {
  const res = await fetch(
    `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=5`,
    { next: { revalidate: 86400 } }
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { data?: DeezerTrack[] };
  const hit = (data.data || []).find((t) => t.preview);
  return hit?.preview || null;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const artist = (searchParams.get("artist") || "").trim();
  const title = (searchParams.get("title") || "").trim();

  if (!title) {
    return NextResponse.json({ error: "Missing title" }, { status: 400 });
  }

  try {
    // Precise field search first, plain search as fallback.
    let previewUrl: string | null = null;
    if (artist) {
      previewUrl = await searchDeezer(`artist:"${artist}" track:"${title}"`);
    }
    if (!previewUrl) {
      previewUrl = await searchDeezer(`${title} ${artist}`.trim());
    }

    return NextResponse.json(
      { previewUrl },
      { headers: { "Cache-Control": "public, s-maxage=86400, max-age=3600" } }
    );
  } catch (err) {
    console.error("preview lookup error:", err);
    return NextResponse.json({ previewUrl: null });
  }
}
