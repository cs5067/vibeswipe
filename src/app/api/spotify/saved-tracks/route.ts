import { NextRequest, NextResponse } from "next/server";
import { getSpotifyClient, spotifyErrorResponse, unauthorized } from "@/lib/utils/api-helpers";

export async function GET(request: NextRequest) {
  const client = await getSpotifyClient();
  if (!client) return unauthorized();

  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get("limit") || "50");
  const offset = parseInt(searchParams.get("offset") || "0");

  try {
    const data = await client.getSavedTracks(limit, offset);
    return NextResponse.json(data);
  } catch (err) {
    console.error("Error fetching saved tracks:", err);
    return spotifyErrorResponse(err);
  }
}
