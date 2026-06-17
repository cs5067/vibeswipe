import { NextRequest, NextResponse } from "next/server";
import { getSpotifyClient, spotifyErrorResponse, unauthorized } from "@/lib/utils/api-helpers";

export async function GET(request: NextRequest) {
  const client = await getSpotifyClient();
  if (!client) return unauthorized();

  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get("limit") || "50");

  try {
    const data = await client.getRecentlyPlayed(limit);
    return NextResponse.json(data);
  } catch (err) {
    console.error("Error fetching recently played:", err);
    return spotifyErrorResponse(err);
  }
}
