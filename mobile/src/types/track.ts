export interface ScoreDebug {
  vibeFit: number;
  genreProximity: number;
  sequenceFit: number;
  artistDiversity: number;
  branchHealth: number;
  novelty: number;
  popularityFit: number;
  total: number;
}

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
  branchId?: string;     // which exploration branch this came from
  sourceType?: "safe" | "edge" | "jump";  // neighborhood zone

  // Debug info — populated by the engine
  _debug?: {
    searchQuery?: string;     // what search query or artist name led to this
    playlistName?: string;    // which playlist it came from (if playlist strategy)
    matchedBecause?: string;  // why a playlist source was trusted
    matchedTrackName?: string; // liked track found inside the source playlist
    overlapCount?: number;    // how many liked tracks were found in the playlist
    overlapTarget?: number;   // how many liked tracks were checked
    matchedTrackNames?: string[];
    score?: ScoreDebug;       // full score breakdown
    rank?: number;            // position in the ranked queue
    totalCandidates?: number; // how many candidates it was ranked against
    refillRound?: number;     // which refill round produced this
  };
}

export interface SwipeRecord {
  track: AppTrack;
  direction: "left" | "right";
  timestamp: number;
  strategy: string;
  timeToDecideMs?: number;
}
