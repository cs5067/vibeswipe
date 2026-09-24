import type {
  SpotifyUser,
  SpotifyTrack,
  SpotifyArtist,
  SpotifyAlbumSimple,
  RecentlyPlayedResponse,
  PaginatedResponse,
  SearchResponse,
  SpotifyPlaylist,
} from "./types";
import { getAccessToken } from "./auth";
import AsyncStorage from "@react-native-async-storage/async-storage";

const BASE_URL = "https://api.spotify.com/v1";
const PLAYLIST_SEARCH_COOLDOWN_KEY = "vibeswipe_spotify_playlist_search_cooldown_until";
const EXTENDED_QUOTA = process.env.EXPO_PUBLIC_SPOTIFY_QUOTA_MODE === "extended";
const REQUEST_TIMEOUT_MS = 10_000;
let cooldownUntil = 0;
let cooldownLoaded: Promise<void> | null = null;
let cooldownWrite: Promise<void> = Promise.resolve();

export class SpotifyApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public retryAt: number | null = null,
    public reason: string | null = null
  ) {
    super(message);
    this.name = "SpotifyApiError";
  }
}

export function supportsPublicPlaylistDiscovery(): boolean {
  return EXTENDED_QUOTA;
}

export function getSpotifyCooldownUntil(): number {
  return cooldownUntil;
}

async function restoreCooldown(): Promise<void> {
  if (!cooldownLoaded) {
    cooldownLoaded = AsyncStorage.getItem(PLAYLIST_SEARCH_COOLDOWN_KEY).then((value) => {
      const stored = Number(value);
      if (Number.isFinite(stored)) cooldownUntil = Math.max(cooldownUntil, stored);
    }).catch(() => {});
  }
  await cooldownLoaded;
}

let lastPlaylistSearchError: { status: number; query: string; timestamp: number } | null = null;

export function getLastPlaylistSearchError() {
  return lastPlaylistSearchError;
}

async function spotifyFetch<T>(path: string, options?: RequestInit): Promise<T> {
  await restoreCooldown();
  if (Date.now() < cooldownUntil) {
    throw new SpotifyApiError("Spotify is cooling down. Try again after the requested deadline.", 429, cooldownUntil);
  }
  const token = await getAccessToken();
  if (!token) throw new Error("Not authenticated");

  const method = options?.method?.toUpperCase() || "GET";

  // Only send Content-Type on requests with a body (POST/PUT)
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };
  if (method === "POST" || method === "PUT") {
    headers["Content-Type"] = "application/json";
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: { ...headers, ...options?.headers },
    });
    const text = response.status === 204 ? "" : await response.text();
    if (!response.ok) {
      let reason: string | null = null;
      try { reason = JSON.parse(text)?.error?.reason || null; } catch { /* Non-JSON provider error. */ }
      if (response.status === 429) {
        const header = response.headers.get("Retry-After");
        const seconds = header ? Number(header) : NaN;
        const deadline = Number.isFinite(seconds) && seconds > 0
          ? Date.now() + seconds * 1000
          : Date.parse(header || "");
        // Never shorten Spotify's deadline, including when concurrent responses arrive.
        cooldownUntil = Math.max(cooldownUntil, Number.isFinite(deadline) && deadline > Date.now() ? deadline : Date.now() + 120_000);
        cooldownWrite = cooldownWrite.catch(() => {}).then(() =>
          AsyncStorage.setItem(PLAYLIST_SEARCH_COOLDOWN_KEY, String(cooldownUntil))
        );
        await cooldownWrite.catch(() => {});
      }
      throw new SpotifyApiError(`Spotify API error ${response.status}`, response.status,
        response.status === 429 ? cooldownUntil : null, reason);
    }
    return text ? JSON.parse(text) : ({} as T);
  } finally {
    clearTimeout(timer);
  }
}

// Public entity hydration is reused across corpus refills, with a bounded cache.
const entityCache = new Map<string, { expiresAt: number; value: Promise<unknown> }>();
async function getEntity<T>(path: string): Promise<T> {
  const cached = entityCache.get(path);
  if (cached && cached.expiresAt > Date.now()) return cached.value as Promise<T>;
  if (entityCache.size >= 250) entityCache.delete(entityCache.keys().next().value!);
  const value = spotifyFetch<T>(path).catch((error) => {
    entityCache.delete(path);
    throw error;
  });
  entityCache.set(path, { expiresAt: Date.now() + 5 * 60_000, value });
  return value;
}

export async function getMe(): Promise<SpotifyUser> {
  return spotifyFetch<SpotifyUser>("/me");
}

export async function getTopTracks(
  timeRange: "short_term" | "medium_term" | "long_term" = "short_term",
  limit = 50
): Promise<SpotifyTrack[]> {
  const res = await spotifyFetch<PaginatedResponse<SpotifyTrack>>(
    `/me/top/tracks?time_range=${timeRange}&limit=${limit}`
  );
  return res.items || [];
}

export async function getTopArtists(
  timeRange: "short_term" | "medium_term" | "long_term" = "short_term",
  limit = 50
): Promise<SpotifyArtist[]> {
  const res = await spotifyFetch<PaginatedResponse<SpotifyArtist>>(
    `/me/top/artists?time_range=${timeRange}&limit=${limit}`
  );
  return res.items || [];
}

export async function getRecentlyPlayed(limit = 50): Promise<RecentlyPlayedResponse> {
  return spotifyFetch<RecentlyPlayedResponse>(
    `/me/player/recently-played?limit=${limit}`
  );
}

/**
 * Get an artist's top tracks — the BEST way to discover quality tracks.
 * Returns the artist's most popular tracks in the given market.
 */
export async function getArtistTopTracks(
  artistId: string,
  market = "US"
): Promise<SpotifyTrack[]> {
  if (!EXTENDED_QUOTA) {
    throw new SpotifyApiError("Artist top tracks are unavailable in Spotify development mode.", 403, null, "UNSUPPORTED_CAPABILITY");
  }
  const res = await spotifyFetch<{ tracks: SpotifyTrack[] }>(
    `/artists/${artistId}/top-tracks?market=${market}`
  );
  return res.tracks || [];
}

/**
 * Get multiple artists' details at once (up to 50).
 * Useful for getting genre info for artists from track data.
 */
export async function getArtists(ids: string[]): Promise<SpotifyArtist[]> {
  if (ids.length === 0) return [];
  if (!EXTENDED_QUOTA) {
    const artists: SpotifyArtist[] = [];
    for (const id of [...new Set(ids)].slice(0, 50)) {
      artists.push(await getEntity<SpotifyArtist>(`/artists/${encodeURIComponent(id)}`));
    }
    return artists;
  }
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 50) {
    chunks.push(ids.slice(i, i + 50));
  }
  const results: SpotifyArtist[] = [];
  for (const chunk of chunks) {
    const res = await spotifyFetch<{ artists: SpotifyArtist[] }>(
      `/artists?ids=${chunk.join(",")}`
    );
    results.push(...(res.artists || []));
  }
  return results;
}

/**
 * Get user's saved/liked tracks.
 */
export async function getSavedTracks(limit = 50, offset = 0): Promise<SpotifyTrack[]> {
  const res = await spotifyFetch<PaginatedResponse<{ track: SpotifyTrack }>>(
    `/me/tracks?limit=${limit}&offset=${offset}`
  );
  return (res.items || []).map((item) => item.track);
}

/**
 * Save tracks to the user's Liked Songs (requires user-library-modify scope).
 */
export async function saveTracks(ids: string[]): Promise<boolean> {
  if (ids.length === 0) return false;
  try {
    const chunkSize = EXTENDED_QUOTA ? 50 : 40;
    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);
      const params = new URLSearchParams({ uris: chunk.map((id) => `spotify:track:${id}`).join(",") });
      await spotifyFetch(EXTENDED_QUOTA ? "/me/tracks" : `/me/library?${params}`, {
        method: "PUT",
        body: EXTENDED_QUOTA ? JSON.stringify({ ids: chunk }) : undefined,
      });
    }
    return true;
  } catch (err) {
    console.log("saveTracks error:", err);
    return false;
  }
}

export async function search(
  query: string,
  types: string[] = ["track"],
  limit = 10,
  offset = 0
): Promise<SearchResponse> {
  const params = new URLSearchParams({ q: query, type: types.join(","),
    limit: String(Math.max(1, Math.min(limit, 10))), offset: String(Math.max(0, offset)) });
  return spotifyFetch<SearchResponse>(`/search?${params}`);
}

export async function getArtistAlbums(
  id: string,
  limit = 20
): Promise<PaginatedResponse<SpotifyAlbumSimple>> {
  return spotifyFetch(`/artists/${id}/albums?include_groups=album,single&limit=${limit}`);
}

export async function getAlbumTracks(
  id: string,
  limit = 50
): Promise<PaginatedResponse<SpotifyTrack>> {
  return spotifyFetch(`/albums/${id}/tracks?limit=${limit}`);
}

/**
 * Get user's playlists
 */
export async function getMyPlaylists(limit = 50, offset = 0): Promise<PaginatedResponse<SpotifyPlaylist>> {
  return spotifyFetch(`/me/playlists?limit=${limit}&offset=${offset}`);
}

/**
 * Get tracks from a playlist
 */
export async function getPlaylistTracks(
  playlistId: string,
  limit = 50,
  offset = 0
): Promise<PaginatedResponse<{ track: SpotifyTrack }>> {
  if (EXTENDED_QUOTA) return spotifyFetch(`/playlists/${playlistId}/tracks?limit=${Math.min(limit, 50)}&offset=${offset}`);
  const data = await spotifyFetch<PaginatedResponse<{ item: SpotifyTrack }>>(
    `/playlists/${playlistId}/items?limit=${Math.min(limit, 50)}&offset=${offset}`
  );
  return { ...data, items: (data.items || []).filter((entry) => entry?.item?.id)
    .map((entry) => ({ track: entry.item })) };
}

/** Batch-hydrate track ids (max 50) into full track objects. */
export async function getTracks(ids: string[]): Promise<SpotifyTrack[]> {
  if (ids.length === 0) return [];
  if (!EXTENDED_QUOTA) {
    const tracks: SpotifyTrack[] = [];
    // Sequential, cached requests avoid turning one removed bulk call into a burst.
    for (const id of [...new Set(ids)].slice(0, 50)) {
      try { tracks.push(await getEntity<SpotifyTrack>(`/tracks/${encodeURIComponent(id)}`)); }
      catch (error) {
        if (!(error instanceof SpotifyApiError) || error.status !== 404) throw error;
      }
    }
    return tracks;
  }
  const data = await spotifyFetch<{ tracks: SpotifyTrack[] }>(
    `/tracks?ids=${ids.slice(0, 50).join(",")}`
  );
  return (data.tracks || []).filter(Boolean);
}

/**
 * Search for playlists containing certain terms
 */
export async function searchPlaylists(query: string, limit = 5): Promise<SpotifyPlaylist[]> {
  try {
    const data = await search(query, ["playlist"], limit);
    lastPlaylistSearchError = null;
    return (data.playlists?.items || []).filter((playlist) => playlist?.id);
  } catch (error) {
    lastPlaylistSearchError = { status: error instanceof SpotifyApiError ? error.status : 0,
      query, timestamp: Date.now() };
    return [];
  }
}

export async function createPlaylist(
  userId: string,
  name: string,
  description = ""
): Promise<SpotifyPlaylist> {
  return spotifyFetch<SpotifyPlaylist>(EXTENDED_QUOTA ? `/users/${userId}/playlists` : "/me/playlists", {
    method: "POST",
    body: JSON.stringify({ name, description, public: false }),
  });
}

export async function addTracksToPlaylist(
  playlistId: string,
  uris: string[]
): Promise<void> {
  for (let i = 0; i < uris.length; i += 100) {
    await spotifyFetch(`/playlists/${playlistId}/${EXTENDED_QUOTA ? "tracks" : "items"}`, {
      method: "POST",
      body: JSON.stringify({ uris: uris.slice(i, i + 100) }),
    });
  }
}

// ====================================================================
// Playback Control — use the user's Spotify app as the audio player
// ====================================================================

export interface PlaybackState {
  is_playing: boolean;
  item: SpotifyTrack | null;
  device: { id: string; name: string; is_active: boolean } | null;
  progress_ms: number;
}

/**
 * Get available playback devices (phone, desktop, speaker, etc.)
 */
export async function getDevices(): Promise<Array<{ id: string; name: string; type: string; is_active: boolean }>> {
  const res = await spotifyFetch<{ devices: Array<{ id: string; name: string; type: string; is_active: boolean }> }>(
    "/me/player/devices"
  );
  return res.devices || [];
}

/**
 * Get current playback state
 */
export async function getPlaybackState(): Promise<PlaybackState | null> {
  try {
    const state = await spotifyFetch<PlaybackState>("/me/player");
    return state.item ? state : null;
  } catch {
    return null;
  }
}

/**
 * Play a specific track on the user's Spotify app.
 * If positionMs is provided, start from that position (useful for playing the best part).
 */
export async function playTrack(
  uri: string,
  deviceId?: string,
  positionMs = 0
): Promise<boolean> {
  try {
    const params = deviceId ? `?device_id=${deviceId}` : "";
    await spotifyFetch(`/me/player/play${params}`, {
      method: "PUT",
      body: JSON.stringify({
        uris: [uri],
        position_ms: positionMs,
      }),
    });
    return true;
  } catch (err) {
    console.log("playTrack error:", err);
    return false;
  }
}

/**
 * Pause playback
 */
export async function pausePlayback(): Promise<boolean> {
  try {
    await spotifyFetch("/me/player/pause", { method: "PUT" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Set volume (0-100)
 */
export async function setVolume(volumePercent: number): Promise<boolean> {
  try {
    await spotifyFetch(`/me/player/volume?volume_percent=${Math.round(volumePercent)}`, {
      method: "PUT",
    });
    return true;
  } catch {
    return false;
  }
}
