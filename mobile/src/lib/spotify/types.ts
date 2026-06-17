export interface SpotifyImage {
  url: string;
  height: number | null;
  width: number | null;
}

export interface SpotifyArtistSimple {
  id: string;
  name: string;
  uri: string;
}

export interface SpotifyArtist extends SpotifyArtistSimple {
  genres: string[];
  images: SpotifyImage[];
  popularity: number;
}

export interface SpotifyAlbumSimple {
  id: string;
  name: string;
  images: SpotifyImage[];
  release_date: string;
  album_type: string;
  uri: string;
}

export interface SpotifyTrack {
  id: string;
  name: string;
  uri: string;
  preview_url: string | null;
  duration_ms: number;
  popularity: number;
  explicit: boolean;
  album: SpotifyAlbumSimple;
  artists: SpotifyArtistSimple[];
  external_urls: { spotify: string };
}

export interface SpotifyUser {
  id: string;
  display_name: string;
  email: string;
  images: SpotifyImage[];
}

export interface SpotifyPlaylist {
  id: string;
  name: string;
  uri: string;
  external_urls: { spotify: string };
}

export interface RecentlyPlayedItem {
  track: SpotifyTrack;
  played_at: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  next: string | null;
}

export interface RecentlyPlayedResponse {
  items: RecentlyPlayedItem[];
  next: string | null;
}

export interface SearchResponse {
  tracks?: PaginatedResponse<SpotifyTrack>;
}
