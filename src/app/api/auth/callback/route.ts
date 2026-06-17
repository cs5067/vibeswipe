import { NextRequest, NextResponse } from "next/server";
import { exchangeCode } from "@/lib/spotify/auth";
import { cookies } from "next/headers";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

  if (error) {
    return NextResponse.redirect(`${baseUrl}/?error=${error}`);
  }

  if (!code || !state) {
    return NextResponse.redirect(`${baseUrl}/?error=missing_params`);
  }

  const cookieStore = await cookies();
  const storedState = cookieStore.get("oauth_state")?.value;
  const codeVerifier = cookieStore.get("code_verifier")?.value;

  if (state !== storedState) {
    return NextResponse.redirect(`${baseUrl}/?error=state_mismatch`);
  }

  if (!codeVerifier) {
    return NextResponse.redirect(`${baseUrl}/?error=missing_verifier`);
  }

  try {
    const tokens = await exchangeCode(code, codeVerifier);

    const response = NextResponse.redirect(`${baseUrl}/swipe`);

    response.cookies.set("spotify_access_token", tokens.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: tokens.expires_in,
      path: "/",
    });

    response.cookies.set("spotify_refresh_token", tokens.refresh_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: "/",
    });

    // Clean up OAuth cookies
    response.cookies.delete("code_verifier");
    response.cookies.delete("oauth_state");

    return response;
  } catch (err) {
    console.error("Token exchange error:", err);
    return NextResponse.redirect(`${baseUrl}/?error=token_exchange_failed`);
  }
}
