import { NextRequest, NextResponse, after } from "next/server";
import { getCurrentProfile } from "@/lib/profile/server";
import { getCorpusClient } from "@/lib/supabase/server";
import { ingestPlaylist } from "@/lib/corpus/ingest";
import {
  getVibeBySlug,
  isVibeSlug,
  parseArenaTrack,
  type ArenaTrack,
  type ArenaVibe,
} from "@/lib/arena/server";

/**
 * Drop a song into a vibe. Requires a logged-in profile.
 *
 * POST { vibeSlug, track (SharedTrack + optional id), note? }
 * Returns { ok: true } — or { ok: true, already: true } if this song
 * was already dropped into this vibe (unique index on spotifyUrl).
 */
export async function POST(request: NextRequest) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: { vibeSlug?: unknown; track?: Partial<ArenaTrack>; note?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!isVibeSlug(body.vibeSlug)) {
    return NextResponse.json({ error: "Invalid vibe" }, { status: 400 });
  }
  const track = parseArenaTrack(body.track);
  if (!track) {
    return NextResponse.json({ error: "Missing track data" }, { status: 400 });
  }
  const note = typeof body.note === "string" ? body.note.slice(0, 140) : null;

  try {
    const vibe = await getVibeBySlug(body.vibeSlug);
    if (!vibe) {
      return NextResponse.json({ error: "No such vibe" }, { status: 404 });
    }

    const supabase = getCorpusClient();
    const { error } = await supabase.from("drops").insert({
      vibe_id: vibe.id,
      track,
      note,
      dropped_by: me.id,
    });

    if (error && error.code !== "23505") {
      console.error("arena drop insert error:", error);
      return NextResponse.json({ error: "Could not drop" }, { status: 500 });
    }

    // Corpus flywheel: every arena drop feeds the co-occurrence engine.
    after(() => ingestArenaDrop(vibe, track));

    return NextResponse.json(
      error?.code === "23505" ? { ok: true, already: true } : { ok: true }
    );
  } catch (err) {
    console.error("arena drop error:", err);
    return NextResponse.json({ error: "Could not drop" }, { status: 500 });
  }
}

/** Upsert the vibe as an "arena:<slug>" corpus playlist + this track into it. */
async function ingestArenaDrop(vibe: ArenaVibe, track: ArenaTrack): Promise<void> {
  if (!track.id) return; // no Spotify id — nothing to correlate on

  const playlistId = `arena:${vibe.slug}`;
  await ingestPlaylist(playlistId, `arena: ${vibe.name}`, null, [
    {
      track: {
        id: track.id,
        name: track.name,
        artists: [{ name: track.artistNames[0] }],
        album: { images: [{ url: track.albumImage }] },
      },
    },
  ]);

  // ingestPlaylist tags playlists as 'crawl'; arena rooms are their own source.
  try {
    await getCorpusClient()
      .from("playlists")
      .update({ source: "arena" })
      .eq("id", playlistId);
  } catch (err) {
    console.error("arena playlist source update failed (non-fatal):", err);
  }
}
