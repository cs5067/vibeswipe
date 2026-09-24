import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getCurrentProfile } from "@/lib/profile/server";
import { getCorpusClient } from "@/lib/supabase/server";
import type { ArenaTrack } from "@/lib/arena/server";

/**
 * Seed the Arena from the corpus — "the algorithm seeded these".
 *
 * For each vibe, find corpus playlists whose name matches the vibe
 * (full name first, then just the first word), pull up to 10 distinct
 * tracks, and drop them with dropped_by null so the UI renders
 * "the algorithm". The unique (vibe_id, spotifyUrl) index dedupes, so
 * re-running is safe.
 *
 * GET (logged-in only) -> { seeded: { [slug]: count }, total }
 */
export async function GET() {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  try {
    const supabase = getCorpusClient();
    const { data: vibes, error: vibesErr } = await supabase
      .from("vibes")
      .select("id, slug, name");

    if (vibesErr) {
      console.error("arena seed vibes error:", vibesErr);
      return NextResponse.json({ error: "Could not load vibes" }, { status: 500 });
    }

    const seeded: Record<string, number> = {};
    let total = 0;

    for (const vibe of vibes ?? []) {
      const tracks = await findSeedTracks(supabase, vibe.name);
      let count = 0;

      for (const t of tracks) {
        const track: ArenaTrack = {
          id: t.id,
          name: t.name,
          artistNames: [t.artist_name],
          albumImage: t.album_image || "",
          previewUrl: null,
          spotifyUrl: `https://open.spotify.com/track/${t.id}`,
        };
        const { error } = await supabase.from("drops").insert({
          vibe_id: vibe.id,
          track,
          note: null,
          dropped_by: null,
        });
        if (!error) count += 1;
        else if (error.code !== "23505") {
          console.error(`arena seed insert error (${vibe.slug}):`, error);
        }
      }

      seeded[vibe.slug] = count;
      total += count;
    }

    return NextResponse.json({ seeded, total });
  } catch (err) {
    console.error("arena seed error:", err);
    return NextResponse.json({ error: "Seed failed" }, { status: 500 });
  }
}

interface SeedTrack {
  id: string;
  name: string;
  artist_name: string;
  album_image: string | null;
}

/** Escape %, _ and \ so vibe names are literal in ilike patterns. */
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, "\\$&");
}

/**
 * Corpus lookup: playlists matching the vibe name (then its first word),
 * then up to 10 distinct tracks from those playlists.
 */
async function findSeedTracks(
  supabase: SupabaseClient,
  vibeName: string
): Promise<SeedTrack[]> {
  const patterns = [...new Set([vibeName, vibeName.split(" ")[0]])];

  for (const pattern of patterns) {
    const { data: playlists, error: plErr } = await supabase
      .from("playlists")
      .select("id")
      .ilike("name", `%${escapeLike(pattern)}%`)
      .limit(25);

    if (plErr) {
      console.error("arena seed playlist search error:", plErr);
      continue;
    }
    const playlistIds = (playlists ?? []).map((p) => p.id);
    if (playlistIds.length === 0) continue;

    const { data: rows, error: ptErr } = await supabase
      .from("playlist_tracks")
      .select("track_id")
      .in("playlist_id", playlistIds)
      .limit(300);

    if (ptErr) {
      console.error("arena seed playlist_tracks error:", ptErr);
      continue;
    }
    const trackIds = [...new Set((rows ?? []).map((r) => r.track_id))].slice(0, 10);
    if (trackIds.length === 0) continue;

    const { data: tracks, error: trErr } = await supabase
      .from("tracks")
      .select("id, name, artist_name, album_image")
      .in("id", trackIds);

    if (trErr) {
      console.error("arena seed tracks error:", trErr);
      continue;
    }
    if (tracks && tracks.length > 0) return tracks;
  }

  return [];
}
