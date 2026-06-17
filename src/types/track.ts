export interface AppTrack {
  id: string;
  name: string;
  uri: string;
  previewUrl: string | null;
  durationMs: number;
  popularity: number;
  explicit: boolean;
  albumName: string;
  albumImageUrl: string;
  albumImageLarge: string;
  artistNames: string[];
  artistIds: string[];
  genres: string[];
  spotifyUrl: string;
  strategy?: string;
  branchId?: string;
  sourceType?: "safe" | "edge" | "jump";
  _debug?: {
    searchQuery?: string;
    playlistName?: string;
    score?: {
      vibeFit: number;
      genreProximity: number;
      sequenceFit: number;
      artistDiversity: number;
      branchHealth: number;
      novelty: number;
      popularityFit: number;
      total: number;
    };
    rank?: number;
    totalCandidates?: number;
    refillRound?: number;
  };
}
