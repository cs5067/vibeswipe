import { NextRequest, NextResponse } from "next/server";
import { getSpotifyClient, spotifyErrorResponse, unauthorized } from "@/lib/utils/api-helpers";

export async function GET(request: NextRequest) {
  const client = await getSpotifyClient();
  if (!client) return unauthorized();

  const { searchParams } = new URL(request.url);
  const timeRange = (searchParams.get("time_range") || "short_term") as
    | "short_term"
    | "medium_term"
    | "long_term";
  const limit = parseInt(searchParams.get("limit") || "50");

  try {
    const tracks = await client.getTopTracks(timeRange, limit);
    return NextResponse.json(tracks);
  } catch (err) {
    console.error("Error fetching top tracks:", err);
    return spotifyErrorResponse(err);
  }
}
