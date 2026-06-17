import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SpotifyApiError, SpotifyClient } from "@/lib/spotify/client";

export async function getSpotifyClient(): Promise<SpotifyClient | null> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("spotify_access_token")?.value;
  if (!accessToken) return null;
  return new SpotifyClient(accessToken);
}

export function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export function spotifyErrorResponse(err: unknown, fallback = "Spotify request failed") {
  if (err instanceof SpotifyApiError) {
    if (err.status === 401 || err.status === 403) {
      return NextResponse.json({ error: "Spotify authorization failed" }, { status: err.status });
    }

    if (err.status === 429) {
      return NextResponse.json(
        { error: "Spotify rate limit reached", retryAfter: err.retryAfter },
        {
          status: 429,
          headers: err.retryAfter ? { "Retry-After": err.retryAfter } : undefined,
        }
      );
    }

    return NextResponse.json({ error: fallback }, { status: err.status });
  }

  return NextResponse.json({ error: fallback }, { status: 500 });
}
