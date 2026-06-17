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

const BASE_URL = "https://api.spotify.com/v1";

export class SpotifyApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public retryAfter: string | null
  ) {
    super(message);
    this.name = "SpotifyApiError";
  }
}

export class SpotifyClient {
  constructor(private accessToken: string) {}

  private async fetch<T>(path: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new SpotifyApiError(
        `Spotify API error ${response.status}: ${error}`,
        response.status,
        response.headers.get("retry-after")
      );
    }

    if (response.status === 204) return {} as T;
    return response.json();
  }

  async getMe(): Promise<SpotifyUser> {
    return this.fetch<SpotifyUser>("/me");
  }

  async getTopTracks(
    timeRange: "short_term" | "medium_term" | "long_term" = "short_term",
    limit = 50
  ): Promise<SpotifyTrack[]> {
    const res = await this.fetch<PaginatedResponse<SpotifyTrack>>(
      `/me/top/tracks?time_range=${timeRange}&limit=${limit}`
    );
    return res.items;
  }

  async getTopArtists(
    timeRange: "short_term" | "medium_term" | "long_term" = "short_term",
    limit = 50
  ): Promise<SpotifyArtist[]> {
    const res = await this.fetch<PaginatedResponse<SpotifyArtist>>(
      `/me/top/artists?time_range=${timeRange}&limit=${limit}`
    );
    return res.items;
  }

  async getRecentlyPlayed(limit = 50): Promise<RecentlyPlayedResponse> {
    return this.fetch<RecentlyPlayedResponse>(
      `/me/player/recently-played?limit=${limit}`
    );
  }

  async getSavedTracks(
    limit = 50,
    offset = 0
  ): Promise<PaginatedResponse<{ track: SpotifyTrack }>> {
    return this.fetch(`/me/tracks?limit=${limit}&offset=${offset}`);
  }

  async getTrack(id: string): Promise<SpotifyTrack> {
    return this.fetch<SpotifyTrack>(`/tracks/${id}`);
  }

  async getTracks(ids: string[]): Promise<{ tracks: SpotifyTrack[] }> {
    return this.fetch<{ tracks: SpotifyTrack[] }>(
      `/tracks?ids=${ids.slice(0, 50).join(",")}`
    );
  }

  async getArtist(id: string): Promise<SpotifyArtist> {
    return this.fetch<SpotifyArtist>(`/artists/${id}`);
  }

  async getArtistAlbums(
    id: string,
    limit = 20
  ): Promise<PaginatedResponse<SpotifyAlbumSimple>> {
    return this.fetch(`/artists/${id}/albums?include_groups=album,single&limit=${limit}`);
  }

  async getAlbumTracks(
    id: string,
    limit = 50
  ): Promise<PaginatedResponse<SpotifyTrack>> {
    return this.fetch(`/albums/${id}/tracks?limit=${limit}`);
  }

  async search(
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
    return this.fetch<SearchResponse>(`/search?${params}`);
  }

  async getPlaylistTracks(
    playlistId: string,
    limit = 50,
    offset = 0
  ): Promise<PaginatedResponse<{ track: SpotifyTrack }>> {
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
    });
    return this.fetch(`/playlists/${playlistId}/tracks?${params}`);
  }

  async createPlaylist(
    userId: string,
    name: string,
    description = ""
  ): Promise<SpotifyPlaylist> {
    return this.fetch<SpotifyPlaylist>(`/users/${userId}/playlists`, {
      method: "POST",
      body: JSON.stringify({ name, description, public: false }),
    });
  }

  async addTracksToPlaylist(playlistId: string, uris: string[]): Promise<void> {
    // Spotify allows max 100 tracks per request
    for (let i = 0; i < uris.length; i += 100) {
      await this.fetch(`/playlists/${playlistId}/tracks`, {
        method: "POST",
        body: JSON.stringify({ uris: uris.slice(i, i + 100) }),
      });
    }
  }
}
