import type { AppTrack } from "../../types/track";

export type MusicProviderId = "spotify" | "apple_music" | "youtube_music" | "tidal";

export interface MusicUserProfile {
  provider: MusicProviderId;
  providerUserId: string;
  displayName: string;
  imageUrl: string | null;
}

export interface PlaylistDraft {
  name: string;
  description?: string;
  tracks: AppTrack[];
}

export interface MusicProvider {
  id: MusicProviderId;
  getCurrentUser(): Promise<MusicUserProfile>;
  getTopTracks(limit?: number): Promise<AppTrack[]>;
  getSavedTracks(limit?: number): Promise<AppTrack[]>;
  createPlaylist(draft: PlaylistDraft): Promise<{ providerPlaylistId: string; url: string }>;
}

export const ENABLED_PROVIDERS: MusicProviderId[] = ["spotify"];
