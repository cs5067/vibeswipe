export interface AnchorArtist {
  id: string;
  name: string;
  genres: string[];
  popularity: number;
}

export interface VibeVector {
  energy: number;      // 0 = calm/low energy, 1 = high energy/intense
  mood: number;        // 0 = dark/melancholy, 1 = bright/happy
  tempo: number;       // 0 = slow, 1 = fast
  intimacy: number;    // 0 = big/arena/anthemic, 1 = intimate/personal
  experimental: number; // 0 = mainstream, 1 = avant-garde/niche
}

export interface Branch {
  id: string;           // unique branch identifier
  sourceArtistId: string;
  sourceGenres: string[];
  trackIds: string[];
  likes: number;
  dislikes: number;
  confidence: number;   // how much we trust this branch (decays with dislikes)
}

export interface SwipeSignal {
  trackId: string;
  direction: "left" | "right";
  timeToDecideMs: number;  // how long they looked before swiping
  branchId: string;
  timestamp: number;
}

export interface TasteProfile {
  // Core data
  genreWeights: Map<string, number>;
  knownArtistIds: Set<string>;
  anchorArtists: AnchorArtist[];
  genreTransitions: Map<string, Map<string, number>>;
  seenTrackIds: Set<string>;        // tracks shown to user (for dedup in swipe)
  knownTrackIds: Set<string>;       // tracks used to build profile (NOT for dedup)
  popularityRange: [number, number];

  // Vibe-aware fields
  sessionVibe: VibeVector;
  seedTrackIds: string[];        // tracks that anchor this session
  seedArtistIds: string[];       // artists that anchor this session

  // Branch tracking
  branches: Map<string, Branch>;
  activeBranchWeights: Map<string, number>;

  // Swipe intelligence
  swipeSignals: SwipeSignal[];
  likedArtistIds: Set<string>;   // artists liked THIS session
  dislikedArtistIds: Set<string>; // artists disliked THIS session
  likedGenres: Map<string, number>;    // genre → like count this session
  dislikedGenres: Map<string, number>; // genre → dislike count this session

  // Sequence awareness
  lastLikedTracks: Array<{
    id: string;
    genres: string[];
    artistIds: string[];
    energy: number;
    popularity: number;
  }>;
}
