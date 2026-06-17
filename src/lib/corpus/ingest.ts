import { getCorpusClient } from "@/lib/supabase/server";

/**
 * Passive corpus ingestion — the app crawls as you use it.
 *
 * Every public playlist the recommendation engine touches during normal
 * swiping gets upserted into the corpus tables. Over time this feeds
 * cooccur_recommend() with real human-curated co-occurrence data, with no
 * separate crawler and no extra Spotify API calls.
 *
 * Runs inside next/server after() — never blocks the user's response;
 * failures are logged and swallowed.
 */

interface RawSpotifyTrack {
  id?: string;
  name?: string;
  popularity?: number;
  artists?: Array<{ id?: string; name?: string }>;
  album?: { name?: string; images?: Array<{ url?: string }> };
}

export async function ingestPlaylist(
  playlistId: string,
  playlistName: string | null,
  totalTracks: number | null,
  items: Array<{ track?: RawSpotifyTrack | null } | null>,
  offset = 0
): Promise<void> {
  try {
    const tracks = (items || [])
      .map((item) => item?.track)
      .filter((t): t is RawSpotifyTrack => !!t && typeof t.id === "string" && !!t.name);

    if (tracks.length === 0) return;

    const supabase = getCorpusClient();

    await supabase.from("playlists").upsert(
      {
        id: playlistId,
        name: playlistName,
        source: "crawl",
        track_count: totalTracks,
      },
      { onConflict: "id" }
    );

    await supabase.from("tracks").upsert(
      tracks.map((t) => ({
        id: t.id!,
        name: t.name || "Unknown",
        artist_name: t.artists?.[0]?.name || "Unknown",
        artist_id: t.artists?.[0]?.id || null,
        album_name: t.album?.name || null,
        album_image: t.album?.images?.[1]?.url || t.album?.images?.[0]?.url || null,
        popularity: typeof t.popularity === "number" ? t.popularity : null,
      })),
      { onConflict: "id", ignoreDuplicates: true }
    );

    await supabase.from("playlist_tracks").upsert(
      tracks.map((t, i) => ({
        playlist_id: playlistId,
        track_id: t.id!,
        position: offset + i,
      })),
      { onConflict: "playlist_id,track_id", ignoreDuplicates: true }
    );
  } catch (err) {
    console.error("corpus ingest failed (non-fatal):", err);
  }
}
