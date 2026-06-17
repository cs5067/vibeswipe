import { NextRequest, NextResponse, after } from "next/server";
import { getSpotifyClient, spotifyErrorResponse, unauthorized } from "@/lib/utils/api-helpers";
import { ingestPlaylist } from "@/lib/corpus/ingest";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const client = await getSpotifyClient();
  if (!client) return unauthorized();

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const limit = Number.parseInt(searchParams.get("limit") || "50", 10);
  const offset = Number.parseInt(searchParams.get("offset") || "0", 10);
  const name = searchParams.get("name");

  try {
    const data = await client.getPlaylistTracks(id, limit, offset);

    // Passive corpus crawl: ingest this playlist after the response is sent.
    const total = (data as { total?: number }).total ?? null;
    after(() => ingestPlaylist(id, name, total, data.items || [], offset));

    return NextResponse.json(data);
  } catch (err) {
    console.error("Error fetching playlist tracks:", err);
    return spotifyErrorResponse(err, "Failed to fetch playlist tracks");
  }
}
