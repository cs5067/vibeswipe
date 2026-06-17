import type { AppTrack } from "./track";

export interface SwipeRecord {
  track: AppTrack;
  direction: "left" | "right" | "up";
  timestamp: number;
  strategy: string;
  timeToDecideMs?: number;
}

export interface SessionState {
  isAuthenticated: boolean;
  userId: string | null;
  userName: string | null;
  userImage: string | null;
  likedTracks: AppTrack[];
  skippedTrackIds: string[];
  swipeHistory: SwipeRecord[];
  swipeCount: number;
  sessionStartTime: number;
  playlistName: string;
  genreWeights: Record<string, number>;
}
