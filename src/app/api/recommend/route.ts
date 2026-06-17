import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/profile/server";
import { areFriends, isProfileId } from "@/lib/friends/server";
import { getCorpusClient } from "@/lib/supabase/server";
import type { SharedTrack } from "@/types/share";

/**
 * "Abid recommends" — send a song into a friend's in-app inbox.
 *
 * POST { toId: string, track: SharedTrack, note?: string }
 */
export async function POST(request: NextRequest) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: { toId?: unknown; track?: Partial<SharedTrack>; note?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const toId = isProfileId(body.toId) ? body.toId : null;
  const t = body.track;
  if (!toId || !t || typeof t.name !== "string" || !Array.isArray(t.artistNames)) {
    return NextResponse.json({ error: "Missing toId or track" }, { status: 400 });
  }
  if (toId === me.id) {
    return NextResponse.json({ error: "Can't recommend to yourself" }, { status: 400 });
  }

  // Only allow recommending to accepted friends.
  if (!(await areFriends(me.id, toId))) {
    return NextResponse.json({ error: "You can only recommend to friends" }, { status: 403 });
  }

  const track: SharedTrack = {
    name: t.name,
    artistNames: t.artistNames.filter((x): x is string => typeof x === "string"),
    albumImage: typeof t.albumImage === "string" ? t.albumImage : "",
    previewUrl: typeof t.previewUrl === "string" ? t.previewUrl : null,
    spotifyUrl: typeof t.spotifyUrl === "string" ? t.spotifyUrl : "",
  };
  const note = typeof body.note === "string" ? body.note.slice(0, 140) : null;

  const supabase = getCorpusClient();
  const { error } = await supabase.from("recommendations").insert({
    from_id: me.id,
    to_id: toId,
    track,
    note,
  });

  if (error) {
    console.error("recommend insert error:", error);
    return NextResponse.json({ error: "Could not send" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
