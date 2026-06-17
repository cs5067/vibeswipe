import { NextRequest, NextResponse } from "next/server";
import { getSpotifyClient, spotifyErrorResponse, unauthorized } from "@/lib/utils/api-helpers";

/** Batch-hydrate track ids (from the co-occurrence corpus) into full
 *  Spotify track objects. Max 50 ids per Spotify's multi-get. */
export async function GET(request: NextRequest) {
  const client = await getSpotifyClient();
  if (!client) return unauthorized();

  const idsParam = new URL(request.url).searchParams.get("ids") || "";
  const ids = idsParam
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^[A-Za-z0-9]{10,30}$/.test(s))
    .slice(0, 50);

  if (ids.length === 0) {
    return NextResponse.json({ error: "Missing ids" }, { status: 400 });
  }

  try {
    const data = await client.getTracks(ids);
    return NextResponse.json(data);
  } catch (err) {
    console.error("Error fetching tracks batch:", err);
    return spotifyErrorResponse(err, "Failed to fetch tracks");
  }
}
