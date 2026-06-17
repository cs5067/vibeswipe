import { NextResponse } from "next/server";
import { getSpotifyClient, unauthorized } from "@/lib/utils/api-helpers";

/**
 * TEMPORARY diagnostic route — DELETE after testing.
 * Runs under the logged-in user's token to verify two things the
 * app-level (client-credentials) token could NOT confirm:
 *   1. Can we read tracks of a PUBLIC, NON-OWNED playlist? (mining step)
 *   2. Do track search results include a populated preview_url? (audio previews)
 * Results are returned as JSON AND logged server-side with a grep marker.
 */
export async function GET() {
  const client = await getSpotifyClient();
  if (!client) return unauthorized();

  const out: Record<string, unknown> = {};
  const log = (k: string, v: unknown) => {
    out[k] = v;
    console.log(`[DIAG] ${k}:`, typeof v === "object" ? JSON.stringify(v) : v);
  };

  console.log("========== [DIAG] START ==========");

  // --- who am I (confirms user token, not app token) ---
  try {
    const me = await client.getMe();
    log("user", { id: me.id, product: (me as { product?: string }).product });
  } catch (e) {
    log("user_error", String(e));
  }

  // --- 1. find a non-owned public playlist via search ---
  let minedPlaylist: { id: string; name: string; owner: string } | null = null;
  try {
    const res = await client.search("late night drive", ["playlist"], 10, 0);
    const items = (res.playlists?.items || []).filter(Boolean) as Array<{
      id: string;
      name: string;
      owner?: { id?: string; display_name?: string };
    }>;
    log("playlist_search_count", items.length);
    const nonEditorial = items.find((p) => (p.owner?.id || "") !== "spotify");
    if (nonEditorial) {
      minedPlaylist = {
        id: nonEditorial.id,
        name: nonEditorial.name,
        owner: nonEditorial.owner?.id || "?",
      };
      log("chosen_non_owned_playlist", minedPlaylist);
    } else {
      log("chosen_non_owned_playlist", "NONE (all results spotify-owned)");
    }
  } catch (e) {
    log("playlist_search_error", String(e));
  }

  // --- 2. THE CAVEAT: read tracks of that non-owned playlist ---
  if (minedPlaylist) {
    try {
      const data = await client.getPlaylistTracks(minedPlaylist.id, 10, 0);
      const tracks = (data.items || []).map((i) => i?.track).filter(Boolean);
      log("MINING_RESULT", `SUCCESS — read ${tracks.length} tracks from non-owned playlist`);
    } catch (e) {
      log("MINING_RESULT", `FAILED — ${String(e)}`);
    }
  }

  // --- 3. preview_url presence on track search results ---
  try {
    const res = await client.search("blinding lights", ["track"], 10, 0);
    const tracks = (res.tracks?.items || []).filter(Boolean) as Array<{
      name: string;
      preview_url: string | null;
    }>;
    const withPreview = tracks.filter((t) => !!t.preview_url).length;
    log("PREVIEW_RESULT", `${withPreview}/${tracks.length} track results had a non-null preview_url`);
    log("preview_sample", tracks.slice(0, 3).map((t) => ({ name: t.name, hasPreview: !!t.preview_url })));
  } catch (e) {
    log("preview_error", String(e));
  }

  console.log("========== [DIAG] END ==========");
  return NextResponse.json(out);
}
