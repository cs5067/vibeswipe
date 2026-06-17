import { NextRequest, NextResponse } from "next/server";
import { createShare } from "@/lib/share/server";
import type { SharedTrack } from "@/types/share";

/**
 * Create a "force-a-song" share.
 *
 * POST body: { track: SharedTrack, senderName?: string, note?: string }
 * Returns:   { code, url }
 */
export async function POST(request: NextRequest) {
  let body: { track?: Partial<SharedTrack>; senderName?: unknown; note?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const t = body.track;
  if (!t || typeof t.name !== "string" || !Array.isArray(t.artistNames)) {
    return NextResponse.json({ error: "Missing track data" }, { status: 400 });
  }

  const track: SharedTrack = {
    name: t.name,
    artistNames: t.artistNames.filter((x): x is string => typeof x === "string"),
    albumImage: typeof t.albumImage === "string" ? t.albumImage : "",
    previewUrl: typeof t.previewUrl === "string" ? t.previewUrl : null,
    spotifyUrl: typeof t.spotifyUrl === "string" ? t.spotifyUrl : "",
  };

  const senderName =
    typeof body.senderName === "string" ? body.senderName.slice(0, 40) : null;
  const note = typeof body.note === "string" ? body.note.slice(0, 140) : null;

  try {
    const code = await createShare(track, senderName, note);
    const base = process.env.NEXT_PUBLIC_BASE_URL || "";
    return NextResponse.json({ code, url: `${base}/s/${code}` });
  } catch (err) {
    console.error("share create error:", err);
    return NextResponse.json({ error: "Could not create share" }, { status: 500 });
  }
}
