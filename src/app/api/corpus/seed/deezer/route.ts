import { NextResponse } from "next/server";
import { getCorpusClient } from "@/lib/supabase/server";
import { ingestPlaylist } from "@/lib/corpus/ingest";
import { KEYWORD_BANK } from "@/lib/corpus/keywords";

/**
 * Deezer corpus seeder — cross-platform playlist mining, no user login.
 *
 * Deezer's public API needs no auth and exposes playlist search + full
 * tracklists, so it's a second independent well of human-curated
 * co-occurrence data. The corpus is keyed by SPOTIFY track ids, so each
 * Deezer track is mapped to a Spotify id via an app-token search (client
 * credentials — no user session required). Mappings (including failures)
 * are cached in public.deezer_track_map so a track is only ever searched
 * once, and Deezer playlists get "dz:"-prefixed corpus ids so they never
 * collide with Spotify playlist ids.
 *
 * Re-runnable like the Spotify seeder: keywords shuffle per run,
 * already-known playlists are skipped, and the run stops politely on 429
 * or after ~45s. Just hit it again for more.
 *
 * GET /api/corpus/seed/deezer             — run with defaults (6 keywords)
 * GET /api/corpus/seed/deezer?keywords=12 — max 12; each Deezer keyword is
 *                                           heavier than a Spotify one
 *                                           because of the mapping step.
 */

const TIME_BUDGET_MS = 45_000;
const CALL_DELAY_MS = 120;
const PLAYLISTS_PER_KEYWORD = 2;
const TRACKS_PER_PLAYLIST = 80;
const SEARCH_CAP_PER_PLAYLIST = 25;
const DEEZER_ID_PREFIX = "dz:";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Spotify app token (client-credentials flow) — module-level cache w/ expiry.
// ---------------------------------------------------------------------------

let appToken: { token: string; expiresAt: number } | null = null;

async function getAppToken(): Promise<string> {
  if (appToken && appToken.expiresAt - Date.now() > 60_000) return appToken.token;

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET are not set");
  }

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`Spotify app-token mint failed (${res.status})`);

  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new Error("Spotify app-token mint returned no token");

  appToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  return appToken.token;
}

// ---------------------------------------------------------------------------
// External API shapes
// ---------------------------------------------------------------------------

interface DeezerPlaylistHit {
  id?: number | string;
  title?: string;
  nb_tracks?: number;
}

interface DeezerTrack {
  id?: number | string;
  title?: string;
  artist?: { name?: string };
  album?: { title?: string };
}

/** Spotify track object as returned by /v1/search — matches ingest's shape. */
interface SpotifyTrack {
  id?: string;
  name?: string;
  popularity?: number;
  artists?: Array<{ id?: string; name?: string }>;
  album?: { name?: string; images?: Array<{ url?: string }> };
}

/** Fetch a Deezer endpoint; null on any failure (Deezer 200s with {error}). */
async function deezerJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const json: unknown = await res.json();
    if (!json || typeof json !== "object" || "error" in json) return null;
    return json as T;
  } catch {
    return null;
  }
}

/** Case-insensitive loose artist match — substring in either direction. */
function artistsMatch(spotifyTrack: SpotifyTrack, deezerArtist: string): boolean {
  const dz = deezerArtist.trim().toLowerCase();
  if (!dz) return false;
  return (spotifyTrack.artists || []).some((a) => {
    const sp = (a.name || "").trim().toLowerCase();
    return !!sp && (sp.includes(dz) || dz.includes(sp));
  });
}

/** Thrown when Spotify returns 429 so the run can stop gracefully. */
class SpotifyRateLimited extends Error {}

/** Search Spotify for a Deezer track; null when no confident match. */
async function searchSpotifyMatch(title: string, artist: string): Promise<SpotifyTrack | null> {
  const token = await getAppToken();
  // Quotes inside field filters break Spotify's query syntax — strip them.
  const q = `track:"${title.replace(/"/g, "")}" artist:"${artist.replace(/"/g, "")}"`;
  const res = await fetch(
    `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=3`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (res.status === 429) throw new SpotifyRateLimited();
  if (!res.ok) throw new Error(`Spotify search failed (${res.status})`);

  const data = (await res.json()) as { tracks?: { items?: Array<SpotifyTrack | null> } };
  const hit = (data.tracks?.items || []).find(
    (t): t is SpotifyTrack => !!t?.id && !!t.name && artistsMatch(t, artist)
  );
  return hit ?? null;
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
  // Optional shared-secret gate, mirroring /api/corpus/ingest. When
  // CORPUS_INGEST_TOKEN is set (production), callers must send a matching
  // x-ingest-token header. Unset in local dev for zero-ceremony runs.
  const expected = process.env.CORPUS_INGEST_TOKEN;
  if (expected && request.headers.get("x-ingest-token") !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const keywordCount = Math.min(
    Math.max(Number.parseInt(url.searchParams.get("keywords") || "6", 10) || 6, 1),
    12
  );

  // The whole point of this seeder is the Deezer→Spotify mapping, so mint
  // the app token up front — a run without it would just burn Deezer quota.
  try {
    await getAppToken();
  } catch (err) {
    console.error("deezer seed: app token unavailable:", err);
    return NextResponse.json(
      { error: "Spotify app token unavailable — check SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET" },
      { status: 500 }
    );
  }

  // ?q=comma,separated,keywords targets the mine at a specific taste
  // neighborhood (e.g. a user's genres) instead of the random diverse bank.
  const custom = (url.searchParams.get("q") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 12);

  const keywords =
    custom.length > 0
      ? custom
      : [...KEYWORD_BANK].sort(() => Math.random() - 0.5).slice(0, keywordCount);

  const supabase = getCorpusClient();
  const started = Date.now();
  const outOfTime = () => Date.now() - started > TIME_BUDGET_MS;

  let keywordsTried = 0;
  let deezerPlaylistsIngested = 0;
  let tracksIngested = 0;
  let mapCacheHits = 0;
  let newMappings = 0;
  let unmappable = 0;
  let spotifySearchesUsed = 0;
  let searchCapSkipped = 0;
  let rateLimited = false;

  try {
    keywordLoop: for (const keyword of keywords) {
      if (outOfTime()) break;
      keywordsTried++;

      const search = await deezerJson<{ data?: Array<DeezerPlaylistHit | null> }>(
        `https://api.deezer.com/search/playlist?q=${encodeURIComponent(keyword)}&limit=5`
      );
      await sleep(CALL_DELAY_MS);
      const found = (search?.data || [])
        .filter((p): p is DeezerPlaylistHit => !!p?.id)
        .map((p) => ({
          id: String(p.id),
          title: p.title || keyword,
          nbTracks: typeof p.nb_tracks === "number" ? p.nb_tracks : null,
        }));
      if (found.length === 0) continue;

      // Skip playlists the corpus already knows — every run mines new ground.
      const corpusIds = found.map((p) => DEEZER_ID_PREFIX + p.id);
      const { data: known } = await supabase
        .from("playlists")
        .select("id")
        .in("id", corpusIds);
      const knownIds = new Set((known || []).map((r: { id: string }) => r.id));

      const fresh = found
        .filter((p) => !knownIds.has(DEEZER_ID_PREFIX + p.id))
        .slice(0, PLAYLISTS_PER_KEYWORD);

      for (const playlist of fresh) {
        if (outOfTime()) break keywordLoop;

        const tracklist = await deezerJson<{ data?: Array<DeezerTrack | null> }>(
          `https://api.deezer.com/playlist/${playlist.id}/tracks?limit=${TRACKS_PER_PLAYLIST}`
        );
        await sleep(CALL_DELAY_MS);
        const dzTracks = (tracklist?.data || []).filter(
          (t): t is DeezerTrack & { id: number | string; title: string } =>
            !!t?.id && !!t.title
        );
        if (dzTracks.length === 0) continue;

        // (a) Batch-check the mapping cache — one .in() query per playlist.
        const dzIds = dzTracks.map((t) => String(t.id));
        const { data: mapRows } = await supabase
          .from("deezer_track_map")
          .select("deezer_id, spotify_id")
          .in("deezer_id", dzIds);
        const cache = new Map<string, string | null>(
          (mapRows || []).map((r: { deezer_id: string; spotify_id: string | null }) => [
            r.deezer_id,
            r.spotify_id,
          ])
        );

        const mappedTracks: SpotifyTrack[] = [];
        const unmapped: Array<DeezerTrack & { id: number | string; title: string }> = [];

        for (const t of dzTracks) {
          const cached = cache.get(String(t.id));
          if (cached === undefined) {
            unmapped.push(t);
          } else if (cached !== null) {
            // Known mapping — minimal Spotify-shaped track, no API call.
            mappedTracks.push({
              id: cached,
              name: t.title,
              artists: [{ name: t.artist?.name || "Unknown" }],
            });
            mapCacheHits++;
          }
          // cached === null → known unmappable, skip silently.
        }

        // (b) Spotify-search the unmapped, capped per playlist.
        const toSearch = unmapped.slice(0, SEARCH_CAP_PER_PLAYLIST);
        searchCapSkipped += unmapped.length - toSearch.length;
        const newMapRows: Array<{
          deezer_id: string;
          spotify_id: string | null;
          title: string;
          artist: string;
        }> = [];

        for (const t of toSearch) {
          if (outOfTime() || rateLimited) break;
          const artist = t.artist?.name || "";
          try {
            spotifySearchesUsed++;
            const match = await searchSpotifyMatch(t.title, artist);
            if (match?.id) {
              mappedTracks.push(match); // full Spotify object → richer ingest
              newMapRows.push({
                deezer_id: String(t.id),
                spotify_id: match.id,
                title: t.title,
                artist,
              });
              newMappings++;
            } else {
              // Confirmed no match — remember so we never re-search it.
              newMapRows.push({
                deezer_id: String(t.id),
                spotify_id: null,
                title: t.title,
                artist,
              });
              unmappable++;
            }
          } catch (err) {
            if (err instanceof SpotifyRateLimited) {
              rateLimited = true;
              break;
            }
            // Transient search failure — leave uncached so a later run retries.
          }
          await sleep(CALL_DELAY_MS);
        }

        if (newMapRows.length > 0) {
          await supabase
            .from("deezer_track_map")
            .upsert(newMapRows, { onConflict: "deezer_id" });
        }

        // (c) Ingest whatever mapped — even a partial haul from a cut-short run.
        if (mappedTracks.length > 0) {
          await ingestPlaylist(
            DEEZER_ID_PREFIX + playlist.id,
            playlist.title,
            playlist.nbTracks,
            mappedTracks.map((track) => ({ track }))
          );
          deezerPlaylistsIngested++;
          tracksIngested += mappedTracks.length;
        }

        if (rateLimited) break keywordLoop;
      }
    }
  } catch (err) {
    console.error("deezer seed run error:", err);
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
      deezerPlaylistsIngested,
      tracksIngested,
      mapCacheHits,
      newMappings,
      unmappable,
      spotifySearchesUsed,
      searchCapSkipped,
      rateLimited,
      seconds: Math.round((Date.now() - started) / 1000),
    },
    corpusTotal: {
      playlists: totalPlaylists ?? -1,
      trackPlaylistPairs: totalPairs ?? -1,
    },
    hint: rateLimited
      ? "Spotify rate-limited the mapping step — wait a minute, then hit this URL again."
      : "Hit this URL again to mine another random slice of the keyword bank via Deezer.",
  });
}
