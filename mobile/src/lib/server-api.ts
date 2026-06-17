/**
 * Bridge to the vibeswipe server (Next.js on the Mac during dev).
 *
 * Two jobs:
 *  1. corpusRecommend — ask OUR index "which songs sit next to my liked
 *     songs on real playlists" (the lookup Spotify's API cannot do).
 *  2. ingestPlaylist — donate every playlist this phone scans to the index,
 *     so the base widens with every session.
 *
 * All calls fail silently and fast — the engine must work offline from
 * the server too.
 */

// Server base URL. Override per environment via EXPO_PUBLIC_SERVER_URL;
// defaults to the Mac's LAN IP for local Expo Go dev.
const SERVER_BASE_URL =
  process.env.EXPO_PUBLIC_SERVER_URL || "http://192.168.100.95:3000";

// Matches CORPUS_INGEST_TOKEN on the server when ingestion is gated (prod).
const INGEST_TOKEN = process.env.EXPO_PUBLIC_CORPUS_INGEST_TOKEN || "";

const TIMEOUT_MS = 4000;

async function post<T>(path: string, body: unknown): Promise<T | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (INGEST_TOKEN) headers["x-ingest-token"] = INGEST_TOKEN;
    const res = await fetch(`${SERVER_BASE_URL}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export interface CorpusCandidate {
  trackId: string;
  sharedPlaylists: number;
  score: number;
}

/** Songs that co-occur with the liked set across the corpus. */
export async function corpusRecommend(
  liked: string[],
  seen: string[],
  limit = 20
): Promise<CorpusCandidate[]> {
  const data = await post<{ candidates?: CorpusCandidate[] }>("/api/reco/cooccur", {
    liked,
    seen,
    limit,
  });
  return data?.candidates ?? [];
}

export interface LastfmSimilar {
  name: string;
  artist: string;
  match: number;
}

/** "People who play X also play Y" — Last.fm's collaborative filtering,
 *  computed from millions of real listeners. Carries quality while our
 *  own corpus grows. */
export async function lastfmSimilar(
  artist: string,
  title: string,
  limit = 12
): Promise<LastfmSimilar[]> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const params = new URLSearchParams({ artist, title, limit: String(limit) });
    const res = await fetch(`${SERVER_BASE_URL}/api/lastfm/similar?${params}`, {
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.similar) ? data.similar : [];
  } catch {
    return [];
  }
}

/** Fire-and-forget: donate a scanned playlist to the corpus. */
export function ingestPlaylist(
  playlistId: string,
  playlistName: string | null,
  totalTracks: number | null,
  items: Array<{ track?: unknown } | null>
): void {
  void post("/api/corpus/ingest", {
    playlistId,
    playlistName,
    totalTracks,
    items: items.slice(0, 200),
  });
}
