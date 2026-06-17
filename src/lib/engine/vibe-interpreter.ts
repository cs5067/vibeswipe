import type { VibeVector } from "../../types/taste";

/**
 * Maps playlist names / vibe keywords to a VibeVector.
 * This replaces audio features (deprecated) with semantic understanding.
 *
 * Each dimension is 0-1:
 *   energy:      0=calm, 1=intense
 *   mood:        0=dark/melancholy, 1=bright/uplifting
 *   tempo:       0=slow, 1=fast
 *   intimacy:    0=big/anthemic, 1=intimate/personal
 *   experimental: 0=mainstream, 1=niche/experimental
 */

interface VibeKeyword {
  keywords: string[];
  vector: Partial<VibeVector>;
  genreBoosts: string[];    // genres to prioritize when this vibe is detected
}

const VIBE_KEYWORDS: VibeKeyword[] = [
  // Night / Late night
  {
    keywords: ["night", "late night", "midnight", "after dark", "nocturnal", "3am", "2am", "dark"],
    vector: { energy: 0.3, mood: 0.3, tempo: 0.35, intimacy: 0.8, experimental: 0.4 },
    genreBoosts: ["r&b", "alternative r&b", "neo soul", "trip hop", "lo-fi", "ambient", "chillwave", "downtempo"],
  },
  // Drive / Cruise
  {
    keywords: ["drive", "driving", "road trip", "cruise", "highway", "ride", "windows down"],
    vector: { energy: 0.55, mood: 0.55, tempo: 0.55, intimacy: 0.5, experimental: 0.3 },
    genreBoosts: ["indie rock", "alternative rock", "synth-pop", "classic rock", "pop rock", "electronic"],
  },
  // Morning / Wake up
  {
    keywords: ["morning", "sunrise", "wake up", "fresh", "coffee", "start the day"],
    vector: { energy: 0.45, mood: 0.75, tempo: 0.45, intimacy: 0.6, experimental: 0.2 },
    genreBoosts: ["indie pop", "bedroom pop", "folk", "acoustic", "singer-songwriter", "dream pop"],
  },
  // Workout / Gym / Hype
  {
    keywords: ["workout", "gym", "hype", "pump", "beast mode", "gains", "run", "running", "lift"],
    vector: { energy: 0.95, mood: 0.5, tempo: 0.9, intimacy: 0.1, experimental: 0.2 },
    genreBoosts: ["trap", "hip hop", "edm", "drill", "dubstep", "drum and bass", "hard rock", "metal"],
  },
  // Chill / Relax
  {
    keywords: ["chill", "relax", "calm", "peaceful", "zen", "unwind", "easy", "mellow"],
    vector: { energy: 0.2, mood: 0.6, tempo: 0.25, intimacy: 0.7, experimental: 0.3 },
    genreBoosts: ["lo-fi", "chillhop", "ambient", "downtempo", "chill", "bedroom pop", "smooth jazz"],
  },
  // Study / Focus
  {
    keywords: ["study", "focus", "concentrate", "work", "productive", "deep work", "homework"],
    vector: { energy: 0.25, mood: 0.5, tempo: 0.3, intimacy: 0.6, experimental: 0.35 },
    genreBoosts: ["lo-fi", "ambient", "post-rock", "classical", "chillhop", "downtempo", "idm"],
  },
  // Party / Turn up
  {
    keywords: ["party", "turn up", "pregame", "lit", "club", "dance", "function"],
    vector: { energy: 0.9, mood: 0.7, tempo: 0.85, intimacy: 0.05, experimental: 0.15 },
    genreBoosts: ["dance pop", "edm", "house", "hip hop", "trap", "reggaeton", "pop", "afrobeats"],
  },
  // Sad / Emotional
  {
    keywords: ["sad", "heartbreak", "cry", "emotional", "pain", "in my feels", "feels", "breakup", "miss you", "lonely"],
    vector: { energy: 0.2, mood: 0.15, tempo: 0.3, intimacy: 0.9, experimental: 0.3 },
    genreBoosts: ["r&b", "indie folk", "singer-songwriter", "emo", "alternative r&b", "neo soul", "folk"],
  },
  // Energy / Aggressive
  {
    keywords: ["rage", "angry", "aggressive", "hard", "heavy", "intense", "adrenaline"],
    vector: { energy: 0.95, mood: 0.2, tempo: 0.85, intimacy: 0.1, experimental: 0.35 },
    genreBoosts: ["metal", "hardcore", "drill", "trap", "industrial", "punk rock", "death metal"],
  },
  // Feel good / Happy / Vibes
  {
    keywords: ["feel good", "happy", "good vibes", "positive", "sunshine", "summer", "vibe", "vibes"],
    vector: { energy: 0.6, mood: 0.85, tempo: 0.6, intimacy: 0.3, experimental: 0.15 },
    genreBoosts: ["pop", "funk", "disco", "dance pop", "indie pop", "afrobeats", "reggae", "soul"],
  },
  // Underground / Experimental
  {
    keywords: ["underground", "experimental", "weird", "avant-garde", "different", "unique", "finds"],
    vector: { energy: 0.5, mood: 0.4, tempo: 0.5, intimacy: 0.5, experimental: 0.9 },
    genreBoosts: ["experimental", "idm", "art pop", "noise pop", "abstract hip hop", "post-rock", "avant-garde"],
  },
  // Main character
  {
    keywords: ["main character", "confidence", "boss", "slay", "that girl", "iconic"],
    vector: { energy: 0.7, mood: 0.65, tempo: 0.6, intimacy: 0.3, experimental: 0.2 },
    genreBoosts: ["pop", "hip hop", "r&b", "dance pop", "trap", "alt-pop"],
  },
  // Smoke / 420
  {
    keywords: ["smoke", "420", "high", "blazed", "stoned"],
    vector: { energy: 0.3, mood: 0.45, tempo: 0.35, intimacy: 0.7, experimental: 0.5 },
    genreBoosts: ["lo-fi hip hop", "cloud rap", "psychedelic", "trip hop", "reggae", "downtempo", "stoner rock"],
  },
  // Romantic / Love
  {
    keywords: ["love", "romantic", "date", "cuddle", "boo", "couple", "slow dance", "slow jam"],
    vector: { energy: 0.3, mood: 0.6, tempo: 0.3, intimacy: 0.95, experimental: 0.1 },
    genreBoosts: ["r&b", "neo soul", "soul", "smooth jazz", "pop", "bachata", "latin pop"],
  },
  // Throwback / Nostalgia
  {
    keywords: ["throwback", "nostalgia", "old school", "retro", "classic", "90s", "2000s", "80s"],
    vector: { energy: 0.5, mood: 0.6, tempo: 0.5, intimacy: 0.4, experimental: 0.1 },
    genreBoosts: ["classic rock", "motown", "disco", "new wave", "synth-pop", "boom bap", "funk"],
  },
];

// Genre → estimated vibe vector (used to score tracks by genre)
const GENRE_VIBES: Record<string, VibeVector> = {
  // Hip-Hop family
  "hip hop":            { energy: 0.65, mood: 0.45, tempo: 0.6, intimacy: 0.3, experimental: 0.2 },
  rap:                  { energy: 0.7, mood: 0.4, tempo: 0.65, intimacy: 0.25, experimental: 0.2 },
  trap:                 { energy: 0.75, mood: 0.35, tempo: 0.7, intimacy: 0.2, experimental: 0.25 },
  drill:                { energy: 0.8, mood: 0.2, tempo: 0.75, intimacy: 0.1, experimental: 0.3 },
  "cloud rap":          { energy: 0.35, mood: 0.35, tempo: 0.4, intimacy: 0.7, experimental: 0.6 },
  "lo-fi hip hop":      { energy: 0.2, mood: 0.45, tempo: 0.35, intimacy: 0.8, experimental: 0.3 },
  "conscious hip hop":  { energy: 0.5, mood: 0.4, tempo: 0.5, intimacy: 0.6, experimental: 0.4 },
  "boom bap":           { energy: 0.55, mood: 0.4, tempo: 0.55, intimacy: 0.4, experimental: 0.3 },
  "jazz rap":           { energy: 0.4, mood: 0.5, tempo: 0.45, intimacy: 0.6, experimental: 0.5 },

  // R&B family
  "r&b":                { energy: 0.4, mood: 0.45, tempo: 0.4, intimacy: 0.8, experimental: 0.2 },
  "alternative r&b":    { energy: 0.35, mood: 0.35, tempo: 0.4, intimacy: 0.85, experimental: 0.5 },
  "neo soul":           { energy: 0.3, mood: 0.5, tempo: 0.35, intimacy: 0.85, experimental: 0.35 },
  soul:                 { energy: 0.4, mood: 0.55, tempo: 0.4, intimacy: 0.7, experimental: 0.1 },
  funk:                 { energy: 0.7, mood: 0.75, tempo: 0.7, intimacy: 0.2, experimental: 0.2 },

  // Pop family
  pop:                  { energy: 0.6, mood: 0.7, tempo: 0.6, intimacy: 0.3, experimental: 0.1 },
  "dance pop":          { energy: 0.8, mood: 0.75, tempo: 0.8, intimacy: 0.1, experimental: 0.05 },
  "indie pop":          { energy: 0.45, mood: 0.65, tempo: 0.5, intimacy: 0.6, experimental: 0.35 },
  "bedroom pop":        { energy: 0.25, mood: 0.55, tempo: 0.35, intimacy: 0.9, experimental: 0.35 },
  "synth-pop":          { energy: 0.55, mood: 0.5, tempo: 0.6, intimacy: 0.4, experimental: 0.3 },
  "art pop":            { energy: 0.5, mood: 0.45, tempo: 0.5, intimacy: 0.5, experimental: 0.7 },
  electropop:           { energy: 0.7, mood: 0.65, tempo: 0.7, intimacy: 0.2, experimental: 0.2 },

  // Rock family
  rock:                 { energy: 0.7, mood: 0.5, tempo: 0.65, intimacy: 0.25, experimental: 0.2 },
  "indie rock":         { energy: 0.55, mood: 0.5, tempo: 0.55, intimacy: 0.5, experimental: 0.45 },
  "alternative rock":   { energy: 0.6, mood: 0.4, tempo: 0.6, intimacy: 0.4, experimental: 0.35 },
  "classic rock":       { energy: 0.65, mood: 0.55, tempo: 0.6, intimacy: 0.25, experimental: 0.15 },
  shoegaze:             { energy: 0.4, mood: 0.35, tempo: 0.45, intimacy: 0.75, experimental: 0.6 },
  "dream pop":          { energy: 0.25, mood: 0.5, tempo: 0.35, intimacy: 0.85, experimental: 0.5 },
  "post-rock":          { energy: 0.45, mood: 0.35, tempo: 0.4, intimacy: 0.7, experimental: 0.6 },
  "post-punk":          { energy: 0.55, mood: 0.25, tempo: 0.55, intimacy: 0.5, experimental: 0.5 },
  grunge:               { energy: 0.75, mood: 0.25, tempo: 0.6, intimacy: 0.4, experimental: 0.3 },
  emo:                  { energy: 0.55, mood: 0.2, tempo: 0.55, intimacy: 0.8, experimental: 0.25 },
  "punk rock":          { energy: 0.85, mood: 0.35, tempo: 0.8, intimacy: 0.15, experimental: 0.25 },

  // Electronic family
  electronic:           { energy: 0.6, mood: 0.5, tempo: 0.6, intimacy: 0.3, experimental: 0.4 },
  edm:                  { energy: 0.9, mood: 0.7, tempo: 0.85, intimacy: 0.05, experimental: 0.1 },
  house:                { energy: 0.7, mood: 0.65, tempo: 0.7, intimacy: 0.15, experimental: 0.2 },
  "deep house":         { energy: 0.5, mood: 0.55, tempo: 0.6, intimacy: 0.5, experimental: 0.3 },
  techno:               { energy: 0.7, mood: 0.3, tempo: 0.75, intimacy: 0.1, experimental: 0.45 },
  ambient:              { energy: 0.1, mood: 0.45, tempo: 0.15, intimacy: 0.9, experimental: 0.5 },
  downtempo:            { energy: 0.25, mood: 0.45, tempo: 0.3, intimacy: 0.7, experimental: 0.4 },
  "trip hop":           { energy: 0.35, mood: 0.3, tempo: 0.4, intimacy: 0.7, experimental: 0.5 },
  "drum and bass":      { energy: 0.85, mood: 0.45, tempo: 0.9, intimacy: 0.1, experimental: 0.35 },
  dubstep:              { energy: 0.85, mood: 0.35, tempo: 0.7, intimacy: 0.05, experimental: 0.4 },
  chillwave:            { energy: 0.25, mood: 0.55, tempo: 0.35, intimacy: 0.8, experimental: 0.45 },
  idm:                  { energy: 0.4, mood: 0.35, tempo: 0.5, intimacy: 0.6, experimental: 0.85 },

  // Other
  "lo-fi":              { energy: 0.15, mood: 0.5, tempo: 0.3, intimacy: 0.85, experimental: 0.25 },
  chillhop:             { energy: 0.2, mood: 0.55, tempo: 0.35, intimacy: 0.8, experimental: 0.2 },
  chill:                { energy: 0.2, mood: 0.6, tempo: 0.3, intimacy: 0.75, experimental: 0.2 },
  jazz:                 { energy: 0.35, mood: 0.55, tempo: 0.4, intimacy: 0.6, experimental: 0.4 },
  folk:                 { energy: 0.3, mood: 0.5, tempo: 0.35, intimacy: 0.8, experimental: 0.2 },
  "indie folk":         { energy: 0.3, mood: 0.45, tempo: 0.35, intimacy: 0.85, experimental: 0.3 },
  country:              { energy: 0.5, mood: 0.6, tempo: 0.5, intimacy: 0.5, experimental: 0.05 },
  reggaeton:            { energy: 0.75, mood: 0.7, tempo: 0.75, intimacy: 0.1, experimental: 0.05 },
  afrobeats:            { energy: 0.7, mood: 0.75, tempo: 0.7, intimacy: 0.2, experimental: 0.15 },
  reggae:               { energy: 0.4, mood: 0.7, tempo: 0.45, intimacy: 0.4, experimental: 0.1 },
  metal:                { energy: 0.9, mood: 0.15, tempo: 0.8, intimacy: 0.1, experimental: 0.35 },
  disco:                { energy: 0.75, mood: 0.8, tempo: 0.75, intimacy: 0.1, experimental: 0.1 },
  classical:            { energy: 0.3, mood: 0.5, tempo: 0.35, intimacy: 0.6, experimental: 0.2 },
  experimental:         { energy: 0.5, mood: 0.35, tempo: 0.5, intimacy: 0.5, experimental: 0.9 },
  gospel:               { energy: 0.55, mood: 0.75, tempo: 0.5, intimacy: 0.5, experimental: 0.05 },
  dancehall:            { energy: 0.75, mood: 0.7, tempo: 0.7, intimacy: 0.1, experimental: 0.1 },
};

const DEFAULT_VIBE: VibeVector = { energy: 0.5, mood: 0.5, tempo: 0.5, intimacy: 0.5, experimental: 0.3 };

/**
 * Interpret a playlist name into a VibeVector
 */
export function interpretVibe(playlistName: string): { vibe: VibeVector; genreBoosts: string[] } {
  const lower = playlistName.toLowerCase();
  let bestMatch: VibeKeyword | null = null;
  let bestScore = 0;
  const matchedKeywords: VibeKeyword[] = [];

  for (const entry of VIBE_KEYWORDS) {
    for (const kw of entry.keywords) {
      if (lower.includes(kw)) {
        const score = kw.length; // longer keyword = more specific match
        matchedKeywords.push(entry);
        if (score > bestScore) {
          bestScore = score;
          bestMatch = entry;
        }
        break; // don't double-count same entry
      }
    }
  }

  if (matchedKeywords.length === 0) {
    return { vibe: { ...DEFAULT_VIBE }, genreBoosts: [] };
  }

  // Blend matched keywords (weight by match specificity, but primary match dominates)
  const result: VibeVector = { energy: 0, mood: 0, tempo: 0, intimacy: 0, experimental: 0 };
  const allGenreBoosts = new Set<string>();
  let totalWeight = 0;

  for (const kw of matchedKeywords) {
    const weight = kw === bestMatch ? 2 : 1;
    totalWeight += weight;
    for (const dim of ["energy", "mood", "tempo", "intimacy", "experimental"] as const) {
      result[dim] += (kw.vector[dim] ?? DEFAULT_VIBE[dim]) * weight;
    }
    kw.genreBoosts.forEach((g) => allGenreBoosts.add(g));
  }

  for (const dim of ["energy", "mood", "tempo", "intimacy", "experimental"] as const) {
    result[dim] /= totalWeight;
  }

  return { vibe: result, genreBoosts: Array.from(allGenreBoosts) };
}

/**
 * Get the estimated vibe vector for a genre
 */
export function getGenreVibe(genre: string): VibeVector {
  return GENRE_VIBES[genre.toLowerCase()] || { ...DEFAULT_VIBE };
}

/**
 * Calculate how well a set of genres matches a target vibe (0 to 1)
 */
export function vibeMatch(genres: string[], targetVibe: VibeVector): number {
  if (genres.length === 0) return 0.5; // neutral if no genre data

  // Average the genre vibes
  const avg: VibeVector = { energy: 0, mood: 0, tempo: 0, intimacy: 0, experimental: 0 };
  let count = 0;

  for (const g of genres) {
    const gv = GENRE_VIBES[g.toLowerCase()];
    if (gv) {
      for (const dim of ["energy", "mood", "tempo", "intimacy", "experimental"] as const) {
        avg[dim] += gv[dim];
      }
      count++;
    }
  }

  if (count === 0) return 0.5;
  for (const dim of ["energy", "mood", "tempo", "intimacy", "experimental"] as const) {
    avg[dim] /= count;
  }

  // Euclidean distance in vibe space, normalized to 0-1 similarity
  let sumSqDiff = 0;
  for (const dim of ["energy", "mood", "tempo", "intimacy", "experimental"] as const) {
    sumSqDiff += (avg[dim] - targetVibe[dim]) ** 2;
  }
  const distance = Math.sqrt(sumSqDiff / 5); // normalized 0-1
  return 1 - distance;
}

/**
 * Given a user's genre weights and a target vibe, find the best seed genres
 */
export function findVibeAlignedGenres(
  genreWeights: Map<string, number>,
  targetVibe: VibeVector,
  count = 8
): string[] {
  const scored: Array<{ genre: string; score: number }> = [];

  for (const [genre, weight] of genreWeights) {
    const gv = GENRE_VIBES[genre.toLowerCase()];
    if (!gv) continue;

    let sumSqDiff = 0;
    for (const dim of ["energy", "mood", "tempo", "intimacy", "experimental"] as const) {
      sumSqDiff += (gv[dim] - targetVibe[dim]) ** 2;
    }
    const vibeDistance = Math.sqrt(sumSqDiff / 5);
    const vibeFit = 1 - vibeDistance;

    // Combine user preference weight with vibe fit
    // User weight matters (we want genres they actually listen to)
    // But vibe fit filters out genres that don't match the mood
    const score = weight * 0.4 + vibeFit * 0.6;
    scored.push({ genre, score });
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, count)
    .map((s) => s.genre);
}

export { GENRE_VIBES };
