import AsyncStorage from "@react-native-async-storage/async-storage";
import type { AppTrack } from "../../types/track";

export interface PlaylistHit { id: string; title: string; query: string }
export interface DiscoveryPlaylist extends PlaylistHit {
  tracks: AppTrack[];
  total: number;
  complete: boolean;
}

const BASE = "https://api.deezer.com";
const COOLDOWN_KEY = "vibeswipe_deezer_cooldown_until";
let cooldownUntil = 0;
let restore: Promise<void> | null = null;
const cache = new Map<string, { expires: number; value: Promise<any> }>();

export class DeezerError extends Error {}

async function request(path: string): Promise<any> {
  if (!restore) restore = AsyncStorage.getItem(COOLDOWN_KEY).then((value) => {
    cooldownUntil = Math.max(cooldownUntil, Number(value) || 0);
  }).catch(() => {});
  await restore;
  if (Date.now() < cooldownUntil) {
    throw new DeezerError(`Deezer cooldown until ${new Date(cooldownUntil).toLocaleTimeString()}.`);
  }
  const cached = cache.get(path);
  if (cached && cached.expires > Date.now()) return cached.value;
  const value = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    try {
      const response = await fetch(`${BASE}${path}`, { signal: controller.signal });
      const data = await response.json();
      // Deezer can return provider errors in an HTTP 200 response.
      if (response.status === 429 || data?.error?.code === 4) {
        const header = response.headers.get("retry-after");
        const seconds = Number(header);
        const deadline = header && Number.isFinite(seconds)
          ? Date.now() + seconds * 1000 : Date.parse(header || "");
        cooldownUntil = Math.max(cooldownUntil, Number.isFinite(deadline) && deadline > Date.now()
          ? deadline : Date.now() + 60_000);
        await AsyncStorage.setItem(COOLDOWN_KEY, String(cooldownUntil)).catch(() => {});
        throw new DeezerError(`Deezer cooldown until ${new Date(cooldownUntil).toLocaleTimeString()}.`);
      }
      if (!response.ok || data?.error) {
        throw new DeezerError(`Deezer: ${data?.error?.message || `HTTP ${response.status}`}`);
      }
      return data;
    } catch (error) {
      if (error instanceof DeezerError) throw error;
      console.warn("[Deezer] request failed", path, error);
      throw new DeezerError("Deezer did not respond. Check your connection and retry.");
    } finally { clearTimeout(timer); }
  })();
  // Metadata only, in memory for five minutes. Never cache audio or crawl in the background.
  if (cache.size >= 40) cache.delete(cache.keys().next().value!);
  cache.set(path, { expires: Date.now() + 5 * 60_000, value });
  try { return await value; } catch (error) { cache.delete(path); throw error; }
}

export function toDeezerTrack(track: any): AppTrack | null {
  if (!track || !/^\d+$/.test(String(track.id)) || !track.title || !track.artist?.name) return null;
  return {
    id: `deezer:${track.id}`, uri: `deezer:track:${track.id}`,
    provider: "deezer", providerUrl: `https://www.deezer.com/track/${track.id}`,
    name: track.title, artistNames: [track.artist.name],
    artistIds: track.artist.id ? [`deezer:${track.artist.id}`] : [],
    previewUrl: track.readable !== false && typeof track.preview === "string" && track.preview.startsWith("https://")
      ? track.preview : null,
    durationMs: (track.duration || 0) * 1000,
    albumName: track.album?.title || "", albumImageUrl: track.album?.cover_medium || "",
    albumImageLarge: track.album?.cover_big || track.album?.cover_medium || "",
    popularity: 0, explicit: !!track.explicit_lyrics, genres: [], spotifyUrl: "",
  };
}

export async function searchPlaylists(query: string): Promise<PlaylistHit[]> {
  const result = await request(`/search/playlist?q=${encodeURIComponent(query.slice(0, 160))}&limit=5`);
  if (!Array.isArray(result.data)) throw new DeezerError("Deezer returned an invalid playlist search.");
  return result.data.filter((p: any) => p && /^\d+$/.test(String(p.id))).map((p: any) => ({
    id: String(p.id), title: String(p.title || "Untitled playlist"), query,
  }));
}

export async function readPlaylist(hit: PlaylistHit): Promise<DiscoveryPlaylist> {
  if (!/^\d+$/.test(hit.id)) throw new DeezerError("Invalid playlist ID.");
  const tracks = new Map<string, AppTrack>();
  let total = 0;
  let complete = false;
  // Two bounded pages. Missing matches in a partial playlist are not proof of absence.
  for (let index = 0; index < 200; index += 100) {
    const page = await request(`/playlist/${hit.id}/tracks?limit=100&index=${index}`);
    if (!Array.isArray(page.data)) throw new DeezerError("Deezer returned an invalid track list.");
    total = typeof page.total === "number" ? page.total : page.data.length;
    for (const raw of page.data) {
      const track = toDeezerTrack(raw);
      if (track) tracks.set(track.id, track);
    }
    complete = !page.next || index + page.data.length >= total;
    if (complete) break;
  }
  return { ...hit, tracks: [...tracks.values()], total, complete };
}
