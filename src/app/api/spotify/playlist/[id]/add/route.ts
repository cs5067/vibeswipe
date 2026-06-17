import { NextRequest, NextResponse } from "next/server";
import { getSpotifyClient, spotifyErrorResponse, unauthorized } from "@/lib/utils/api-helpers";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const client = await getSpotifyClient();
  if (!client) return unauthorized();

  const { id } = await params;

  try {
    const { uris } = await request.json();
    await client.addTracksToPlaylist(id, uris);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Error adding tracks:", err);
    return spotifyErrorResponse(err);
  }
}
