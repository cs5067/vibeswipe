import { NextResponse } from "next/server";
import { getSpotifyClient, unauthorized } from "@/lib/utils/api-helpers";
import { getCorpusClient } from "@/lib/supabase/server";
import { ingestPlaylist } from "@/lib/corpus/ingest";
import { KEYWORD_BANK } from "@/lib/corpus/keywords";
import { SpotifyApiError } from "@/lib/spotify/client";

/**
 * Corpus seeder — bulk-fills the playlist co-occurrence index.
 *
 * MPD is no longer downloadable, so this is the bootstrap replacement:
 * mine public playlists across a DELIBERATELY diverse keyword bank
 * (genres × moods × cultures × decades — far beyond any one user's taste)
 * so the corpus starts broad, not biased.
 *
 * Requires a logged-in web session (playlist reads need a user token).
 * Re-runnable: keywords are shuffled per run and already-known playlists
 * are skipped, so every run mines new ground. Stops politely on 429 or
 * after ~45s and reports what it did. Just hit it again for more.
 *
 * GET /api/corpus/seed            — run with defaults (~20 keywords)
 * GET /api/corpus/seed?keywords=30
 */

const TIME_BUDGET_MS = 45_000;
const CALL_DELAY_MS = 150;
const PLAYLISTS_PER_KEYWORD = 3;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function GET(request: Request) {
  const client = await getSpotifyClient();
  if (!client) return unauthorized();
  if (!client.supportsPublicPlaylistDiscovery()) {
    return NextResponse.json({ error: "Public-playlist seeding requires approved Spotify extended access." }, { status: 403 });
  }

  const url = new URL(request.url);
  const keywordCount = Math.min(
    Math.max(Number.parseInt(url.searchParams.get("keywords") || "20", 10) || 20, 1),
    40
  );

  const keywords = [...KEYWORD_BANK]
    .sort(() => Math.random() - 0.5)
    .slice(0, keywordCount);

  const supabase = getCorpusClient();
  const started = Date.now();

  let keywordsTried = 0;
  let playlistsIngested = 0;
  let tracksIngested = 0;
  let skippedKnown = 0;
  let rateLimited = false;

  try {
    for (const keyword of keywords) {
      if (Date.now() - started > TIME_BUDGET_MS) break;
      keywordsTried++;

      let found: Array<{ id: string; name?: string }>;
      try {
        const res = await client.search(keyword, ["playlist"], 5, 0);
        found = (res.playlists?.items || [])
          .filter((p) => !!p?.id)
          .map((p) => ({ id: p!.id, name: p!.name }));
      } catch (err) {
        if (err instanceof SpotifyApiError && err.status === 429) {
          rateLimited = true;
          break;
        }
        continue;
      }
      await sleep(CALL_DELAY_MS);
      if (found.length === 0) continue;

      // Skip playlists the corpus already knows — every run mines new ground.
      const ids = found.map((p) => p.id);
      const { data: known } = await supabase
        .from("playlists")
        .select("id")
        .in("id", ids);
      const knownIds = new Set((known || []).map((r) => r.id));
      skippedKnown += knownIds.size;

      const fresh = found.filter((p) => !knownIds.has(p.id)).slice(0, PLAYLISTS_PER_KEYWORD);

      for (const playlist of fresh) {
        if (Date.now() - started > TIME_BUDGET_MS) break;
        try {
          const data = await client.getPlaylistTracks(playlist.id, 100, 0);
          const items = data.items || [];
          await ingestPlaylist(
            playlist.id,
            playlist.name || keyword,
            (data as { total?: number }).total ?? null,
            items
          );
          playlistsIngested++;
          tracksIngested += items.length;
        } catch (err) {
          if (err instanceof SpotifyApiError && err.status === 429) {
            rateLimited = true;
            break;
          }
          // private/unavailable playlist — skip
        }
        await sleep(CALL_DELAY_MS);
      }
      if (rateLimited) break;
    }
  } catch (err) {
    console.error("seed run error:", err);
  }

  const { count: totalPlaylists } = await supabase
    .from("playlists")
    .select("id", { count: "exact", head: true });
  const { count: totalPairs } = await supabase
    .from("playlist_tracks")
    .select("playlist_id", { count: "exact", head: true });

  return NextResponse.json({
    run: {
      keywordsTried,
      playlistsIngested,
      tracksIngested,
      skippedKnown,
      rateLimited,
      seconds: Math.round((Date.now() - started) / 1000),
    },
    corpusTotal: {
      playlists: totalPlaylists ?? -1,
      trackPlaylistPairs: totalPairs ?? -1,
    },
    hint: rateLimited
      ? "Spotify rate-limited the run — wait a minute, then hit this URL again."
      : "Hit this URL again to mine another random slice of the keyword bank.",
  });
}
