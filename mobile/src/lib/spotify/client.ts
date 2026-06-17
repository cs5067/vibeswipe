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

let lastPlaylistSearchError: { status: number; query: string; timestamp: number } | null = null;

export function getLastPlaylistSearchError() {
  return lastPlaylistSearchError;
}

async function spotifyFetch<T>(path: string, options?: RequestInit): Promise<T> {
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

  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      ...headers,
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Spotify API error ${response.status}: ${error}`);
  }

  if (response.status === 204) return {} as T;
  return response.json();
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

export async function search(
  query: string,
  types: string[] = ["track"],
  limit = 10,
  _offset = 0  // offset ignored — Spotify dev mode rejects non-zero offsets
): Promise<SearchResponse> {
  // FIXED: Dev mode always rejects offset > 0 and limit > 10.
  // Always use limit=10, offset=0 to avoid 400 errors.
  const safeLimit = Math.min(limit, 10);

  const q = encodeURIComponent(query);
  const url = `${BASE_URL}/search?q=${q}&type=${types.join(",")}&limit=${safeLimit}&offset=0`;

  const token = await getAccessToken();
  if (!token) throw new Error("Not authenticated");

  console.log("Search:", query);

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  // Fallback: try bare URL if still failing
  if (!response.ok && response.status === 400) {
    console.log("Search 400, trying bare URL...");
    const bareUrl = `${BASE_URL}/search?q=${q}&type=${types.join(",")}`;
    const retryResponse = await fetch(bareUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!retryResponse.ok) {
      const error = await retryResponse.text();
      throw new Error(`Spotify search error ${retryResponse.status}: ${error}`);
    }
    return retryResponse.json();
  }

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Spotify search error ${response.status}: ${error}`);
  }

  return response.json();
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
  return spotifyFetch(`/playlists/${playlistId}/tracks?limit=${limit}&offset=${offset}`);
}

/** Batch-hydrate track ids (max 50) into full track objects. */
export async function getTracks(ids: string[]): Promise<SpotifyTrack[]> {
  if (ids.length === 0) return [];
  const data = await spotifyFetch<{ tracks: SpotifyTrack[] }>(
    `/tracks?ids=${ids.slice(0, 50).join(",")}`
  );
  return (data.tracks || []).filter(Boolean);
}

/**
 * Search for playlists containing certain terms
 */
export async function searchPlaylists(query: string, limit = 5): Promise<SpotifyPlaylist[]> {
  const storedCooldown = await AsyncStorage.getItem(PLAYLIST_SEARCH_COOLDOWN_KEY);
  const cooldownUntil = storedCooldown ? Number(storedCooldown) : 0;
  if (Number.isFinite(cooldownUntil) && Date.now() < cooldownUntil) {
    lastPlaylistSearchError = {
      status: 429,
      query,
      timestamp: Date.now(),
    };
    const secondsLeft = Math.ceil((cooldownUntil - Date.now()) / 1000);
    console.log(`Playlist search skipped: Spotify cooldown ${secondsLeft}s left`);
    return [];
  }

  const q = encodeURIComponent(query);
  const token = await getAccessToken();
  if (!token) throw new Error("Not authenticated");

  // Use safe limit (dev mode may reject high values)
  const safeLimit = Math.min(limit, 10);
  console.log("Playlist search:", query);
  const response = await fetch(`${BASE_URL}/search?q=${q}&type=playlist&limit=${safeLimit}&offset=0`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const retryAfter = Number(response.headers.get("Retry-After"));
    if (response.status === 429) {
      const cooldownSeconds = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 120;
      await AsyncStorage.setItem(
        PLAYLIST_SEARCH_COOLDOWN_KEY,
        String(Date.now() + cooldownSeconds * 1000)
      );
      console.log(`Spotify playlist search cooldown saved for ${cooldownSeconds}s`);
    }
    lastPlaylistSearchError = {
      status: response.status,
      query,
      timestamp: Date.now(),
    };
    console.log(`Playlist search failed ${response.status}: ${query}`);
    return [];
  }
  lastPlaylistSearchError = null;
  const data = await response.json();
  // FIXED: Filter out null/undefined items (Spotify sometimes returns null entries)
  return (data.playlists?.items || []).filter((p: any) => p && p.id);
}

export async function createPlaylist(
  userId: string,
  name: string,
  description = ""
): Promise<SpotifyPlaylist> {
  return spotifyFetch<SpotifyPlaylist>(`/users/${userId}/playlists`, {
    method: "POST",
    body: JSON.stringify({ name, description, public: false }),
  });
}

export async function addTracksToPlaylist(
  playlistId: string,
  uris: string[]
): Promise<void> {
  for (let i = 0; i < uris.length; i += 100) {
    await spotifyFetch(`/playlists/${playlistId}/tracks`, {
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
    const token = await getAccessToken();
    if (!token) return null;
    const response = await fetch(`${BASE_URL}/me/player`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.status === 204 || response.status === 404) return null;
    if (!response.ok) return null;
    return response.json();
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
