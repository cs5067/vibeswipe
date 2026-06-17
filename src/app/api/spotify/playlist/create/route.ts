import { NextRequest, NextResponse } from "next/server";
import { getSpotifyClient, spotifyErrorResponse, unauthorized } from "@/lib/utils/api-helpers";

export async function POST(request: NextRequest) {
  const client = await getSpotifyClient();
  if (!client) return unauthorized();

  try {
    const { name, description } = await request.json();
    const user = await client.getMe();
    const playlist = await client.createPlaylist(user.id, name, description);
    return NextResponse.json(playlist);
  } catch (err) {
    console.error("Error creating playlist:", err);
    return spotifyErrorResponse(err);
  }
}
