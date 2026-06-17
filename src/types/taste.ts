export interface AnchorArtist {
  id: string;
  name: string;
  genres: string[];
  popularity: number;
}

export interface VibeVector {
  energy: number;
  mood: number;
  tempo: number;
  intimacy: number;
  experimental: number;
}

export interface Branch {
  id: string;
  sourceArtistId: string;
  sourceGenres: string[];
  trackIds: string[];
  likes: number;
  dislikes: number;
  confidence: number;
}

export interface SwipeSignal {
  trackId: string;
  direction: "left" | "right";
  timeToDecideMs: number;
  branchId: string;
  timestamp: number;
}

export interface TasteProfile {
  genreWeights: Map<string, number>;
  knownArtistIds: Set<string>;
  anchorArtists: AnchorArtist[];
  genreTransitions: Map<string, Map<string, number>>;
  seenTrackIds: Set<string>;
  knownTrackIds: Set<string>;
  popularityRange: [number, number];
  sessionVibe: VibeVector;
  seedTrackIds: string[];
  seedArtistIds: string[];
  branches: Map<string, Branch>;
  activeBranchWeights: Map<string, number>;
  swipeSignals: SwipeSignal[];
  likedArtistIds: Set<string>;
  dislikedArtistIds: Set<string>;
  likedGenres: Map<string, number>;
  dislikedGenres: Map<string, number>;
  lastLikedTracks: Array<{
    id: string;
    genres: string[];
    artistIds: string[];
    energy: number;
    popularity: number;
  }>;
}
