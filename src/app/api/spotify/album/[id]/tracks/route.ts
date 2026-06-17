import { NextRequest, NextResponse } from "next/server";
import { getSpotifyClient, spotifyErrorResponse, unauthorized } from "@/lib/utils/api-helpers";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const client = await getSpotifyClient();
  if (!client) return unauthorized();

  const { id } = await params;

  try {
    const data = await client.getAlbumTracks(id);
    return NextResponse.json(data);
  } catch (err) {
    console.error("Error fetching album tracks:", err);
    return spotifyErrorResponse(err);
  }
}
