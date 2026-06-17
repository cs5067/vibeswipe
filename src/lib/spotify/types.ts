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
  followers?: { total: number };
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
  product: string;
  country: string;
}

export interface SpotifyPlaylist {
  id: string;
  name: string;
  description: string;
  uri: string;
  external_urls: { spotify: string };
  images: SpotifyImage[];
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
  previous: string | null;
}

export interface RecentlyPlayedResponse {
  items: RecentlyPlayedItem[];
  next: string | null;
  cursors: { after: string; before: string } | null;
}

export interface SearchResponse {
  tracks?: PaginatedResponse<SpotifyTrack>;
  artists?: PaginatedResponse<SpotifyArtist>;
  playlists?: PaginatedResponse<SpotifyPlaylist | null>;
}
