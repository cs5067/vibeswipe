import type {
  PaginatedResponse,
  RecentlyPlayedResponse,
  SearchResponse,
  SpotifyAlbumSimple,
  SpotifyPlaylist,
  SpotifyTrack,
} from "./types";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);

  if (!response.ok) {
    let message = `Request failed with ${response.status}`;
    try {
      const body = await response.json();
      if (body?.error) message = body.error;
    } catch {
      // The API may return an empty body for auth redirects or proxy failures.
    }
    throw new Error(message);
  }

  return response.json();
}

export async function getTopTracks(
  timeRange: "short_term" | "medium_term" | "long_term" = "short_term",
  limit = 50
): Promise<SpotifyTrack[]> {
  const params = new URLSearchParams({ time_range: timeRange, limit: String(limit) });
  return apiFetch<SpotifyTrack[]>(`/api/spotify/top-tracks?${params}`);
}

export async function getTopArtists(
  timeRange: "short_term" | "medium_term" | "long_term" = "short_term",
  limit = 50
): Promise<Array<{ id: string; name: string; genres: string[]; popularity: number }>> {
  const params = new URLSearchParams({ time_range: timeRange, limit: String(limit) });
  return apiFetch(`/api/spotify/top-artists?${params}`);
}

export async function getRecentlyPlayed(limit = 50): Promise<RecentlyPlayedResponse> {
  return apiFetch<RecentlyPlayedResponse>(`/api/spotify/recently-played?limit=${limit}`);
}

export async function getSavedTracks(limit = 50, offset = 0): Promise<SpotifyTrack[]> {
  const data = await apiFetch<PaginatedResponse<{ track: SpotifyTrack }>>(
    `/api/spotify/saved-tracks?limit=${limit}&offset=${offset}`
  );
  return (data.items || []).map((item) => item.track).filter(Boolean);
}

export async function search(
  query: string,
  types: string[] = ["track"],
  limit = 10,
  offset = 0
): Promise<SearchResponse> {
  const params = new URLSearchParams({
    q: query,
    type: types.join(","),
    limit: String(limit),
    offset: String(offset),
  });
  return apiFetch<SearchResponse>(`/api/spotify/search?${params}`);
}

export async function searchPlaylists(query: string, limit = 5): Promise<SpotifyPlaylist[]> {
  const result = await search(query, ["playlist"], Math.min(limit, 10), 0);
  return (result.playlists?.items || []).filter((playlist): playlist is SpotifyPlaylist => Boolean(playlist?.id));
}

export async function getPlaylistTracks(
  playlistId: string,
  limit = 50,
  offset = 0,
  name?: string
): Promise<PaginatedResponse<{ track: SpotifyTrack }>> {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (name) params.set("name", name); // lets the server tag the corpus ingest
  return apiFetch(`/api/spotify/playlist/${playlistId}/tracks?${params}`);
}

export async function getTracks(ids: string[]): Promise<SpotifyTrack[]> {
  if (ids.length === 0) return [];
  const data = await apiFetch<{ tracks: SpotifyTrack[] }>(
    `/api/spotify/tracks?ids=${ids.slice(0, 50).join(",")}`
  );
  return (data.tracks || []).filter(Boolean);
}

export async function getArtistAlbums(
  id: string,
  limit = 20
): Promise<PaginatedResponse<SpotifyAlbumSimple>> {
  return apiFetch(`/api/spotify/artist/${id}/albums?limit=${limit}`);
}

export async function getAlbumTracks(
  id: string,
  limit = 50
): Promise<PaginatedResponse<SpotifyTrack>> {
  return apiFetch(`/api/spotify/album/${id}/tracks?limit=${limit}`);
}
