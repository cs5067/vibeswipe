import { NextResponse } from "next/server";
import { getSpotifyClient, spotifyErrorResponse, unauthorized } from "@/lib/utils/api-helpers";
import { getOrCreateProfile, PROFILE_COOKIE } from "@/lib/profile/server";

export async function GET() {
  const client = await getSpotifyClient();
  if (!client) return unauthorized();

  try {
    const user = await client.getMe();

    // Bootstrap (or fetch) the vibeswipe profile for this Spotify identity
    // and pin it to the session cookie so social features know who you are.
    let profile = null;
    try {
      profile = await getOrCreateProfile(
        "spotify",
        user.id,
        user.display_name || null,
        user.images?.[0]?.url || null
      );
    } catch (e) {
      console.error("Profile bootstrap failed:", e);
    }

    const res = NextResponse.json({ ...user, vibeswipeProfile: profile });
    if (profile) {
      res.cookies.set(PROFILE_COOKIE, profile.id, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 60, // 60 days
        path: "/",
      });
    }
    return res;
  } catch (err) {
    console.error("Error fetching user:", err);
    return spotifyErrorResponse(err, "Failed to fetch user");
  }
}
