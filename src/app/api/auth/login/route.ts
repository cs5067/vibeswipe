import { NextResponse } from "next/server";
import { generateCodeChallenge, buildAuthUrl } from "@/lib/spotify/auth";
import { cookies } from "next/headers";

export async function GET() {
  const { verifier, challenge } = await generateCodeChallenge();
  const state = crypto.randomUUID();

  const cookieStore = await cookies();
  cookieStore.set("code_verifier", verifier, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  cookieStore.set("oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  const authUrl = buildAuthUrl(challenge, state);
  return NextResponse.redirect(authUrl);
}
