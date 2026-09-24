import type { TasteProfile, VibeVector, Branch } from "../../types/taste";
import type { AppTrack } from "../../types/track";
import { vibeMatch, getGenreVibe } from "./vibe-interpreter";
import { genreSimilarity } from "./genre-graph";

/**
 * Multi-factor scoring for candidate tracks.
 *
 * Each track gets scored on:
 * 1. Vibe fit         - Does it match the playlist's target mood?
 * 2. Genre proximity  - Is it in the same neighborhood as liked songs?
 * 3. Sequence fit     - Does it flow well after the last liked track?
 * 4. Artist diversity - Penalize repeating artists too much
 * 5. Branch health    - Is the branch this came from still performing well?
 * 6. Novelty          - Slight bonus for discovery (not already known)
 * 7. Popularity fit   - Within the user's typical range?
 */

interface ScoreBreakdown {
  vibeFit: number;
  genreProximity: number;
  sequenceFit: number;
  artistDiversity: number;
  branchHealth: number;
  novelty: number;
  popularityFit: number;
  total: number;
}

// Weights for each scoring dimension
const WEIGHTS = {
  vibeFit: 0.25,
  genreProximity: 0.20,
  sequenceFit: 0.15,
  artistDiversity: 0.12,
  branchHealth: 0.10,
  novelty: 0.08,
  popularityFit: 0.10,
};

export function scoreTrack(
  track: AppTrack,
  profile: TasteProfile,
  branch: Branch | null,
  likedTracksList: AppTrack[]
): ScoreBreakdown {
  const vibeFit = scoreVibeFit(track, profile.sessionVibe);
  const genreProximity = scoreGenreProximity(track, profile, likedTracksList);
  const sequenceFit = scoreSequenceFit(track, profile);
  const artistDiversity = scoreArtistDiversity(track, profile, likedTracksList);
  const branchHealth = scoreBranchHealth(branch);
  const novelty = scoreNovelty(track, profile);
  const popularityFit = scorePopularityFit(track, profile);

  const total =
    vibeFit * WEIGHTS.vibeFit +
    genreProximity * WEIGHTS.genreProximity +
    sequenceFit * WEIGHTS.sequenceFit +
    artistDiversity * WEIGHTS.artistDiversity +
    branchHealth * WEIGHTS.branchHealth +
    novelty * WEIGHTS.novelty +
    popularityFit * WEIGHTS.popularityFit;

  return { vibeFit, genreProximity, sequenceFit, artistDiversity, branchHealth, novelty, popularityFit, total };
}

/**
 * 1. Vibe Fit: how well does this track's genre profile match the session vibe?
 */
function scoreVibeFit(track: AppTrack, sessionVibe: VibeVector): number {
  return vibeMatch(track.genres, sessionVibe);
}

/**
 * 2. Genre Proximity: how close is this track to the genres the user has liked this session?
 *    Falls back to overall genre weights if no session likes yet.
 */
function scoreGenreProximity(track: AppTrack, profile: TasteProfile, likedTracks: AppTrack[]): number {
  if (track.genres.length === 0) return 0.4;

  // If we have session likes, measure distance to those
  if (likedTracks.length > 0) {
    const likedGenreSet = new Set<string>();
    for (const lt of likedTracks.slice(-10)) { // last 10 liked
      for (const g of lt.genres) likedGenreSet.add(g.toLowerCase());
    }

    if (likedGenreSet.size > 0) {
      let maxSim = 0;
      for (const trackGenre of track.genres) {
        for (const likedGenre of likedGenreSet) {
          const sim = genreSimilarity(trackGenre, likedGenre);
          if (sim > maxSim) maxSim = sim;
        }
      }
      return maxSim;
    }
  }

  // Fallback: use overall genre weights
  let maxWeight = 0;
  for (const g of track.genres) {
    const w = profile.genreWeights.get(g.toLowerCase()) || 0;
    if (w > maxWeight) maxWeight = w;
  }
  return Math.min(maxWeight, 1);
}

/**
 * 3. Sequence Fit: does this track flow well after the last liked track?
 *    - Similar energy level → good continuation
 *    - Smooth transition (not too jarring)
 *    - Genre transition that appears in user's listening patterns
 */
function scoreSequenceFit(track: AppTrack, profile: TasteProfile): number {
  if (profile.lastLikedTracks.length === 0) return 0.7; // neutral if no context

  const lastLiked = profile.lastLikedTracks[profile.lastLikedTracks.length - 1];

  // Energy continuity: prefer smooth transitions (small energy delta)
  const trackEnergy = estimateEnergy(track.genres);
  const energyDelta = Math.abs(trackEnergy - lastLiked.energy);
  const energyScore = 1 - energyDelta; // closer energy = better

  // Genre transition score: does this transition appear in listening history?
  let transitionScore = 0.5;
  if (lastLiked.genres.length > 0 && track.genres.length > 0) {
    const lastGenre = lastLiked.genres[0].toLowerCase();
    const nextGenre = track.genres[0].toLowerCase();
    const transitions = profile.genreTransitions.get(lastGenre);
    if (transitions && transitions.has(nextGenre)) {
      const count = transitions.get(nextGenre)!;
      transitionScore = Math.min(0.5 + count * 0.1, 1); // boost for known transitions
    }
    // Same genre is always decent
    if (lastGenre === nextGenre) transitionScore = Math.max(transitionScore, 0.7);
  }

  return energyScore * 0.5 + transitionScore * 0.5;
}

/**
 * 4. Artist Diversity: penalize if we've already liked too many tracks by this artist
 */
function scoreArtistDiversity(track: AppTrack, profile: TasteProfile, likedTracks: AppTrack[]): number {
  if (track.artistIds.length === 0) return 0.8;

  const mainArtistId = track.artistIds[0];
  const likedByThisArtist = likedTracks.filter((t) => t.artistIds.includes(mainArtistId)).length;

  if (likedByThisArtist === 0) return 1.0;   // fresh artist = great
  if (likedByThisArtist === 1) return 0.7;   // one already = ok
  if (likedByThisArtist === 2) return 0.4;   // two = getting repetitive
  return 0.2;                                  // three+ = too much

}

/**
 * 5. Branch Health: how well is the branch this track came from performing?
 */
function scoreBranchHealth(branch: Branch | null): number {
  if (!branch) return 0.6; // unknown branch = neutral

  const total = branch.likes + branch.dislikes;
  if (total === 0) return 0.7; // untested branch = slight positive (exploration)

  const likeRate = branch.likes / total;

  // Confidence scales with sample size
  const confidence = Math.min(total / 5, 1); // fully confident after 5 swipes
  return likeRate * confidence + 0.5 * (1 - confidence); // blend toward neutral when low confidence
}

/**
 * 6. Novelty: slight bonus for tracks from unknown artists (discovery)
 */
function scoreNovelty(track: AppTrack, profile: TasteProfile): number {
  const isKnownArtist = track.artistIds.some((id) => profile.knownArtistIds.has(id));
  return isKnownArtist ? 0.4 : 0.8; // prefer discovery
}

/**
 * 7. Popularity Fit: is the track within the user's typical popularity range?
 */
function scorePopularityFit(track: AppTrack, profile: TasteProfile): number {
  const [minPop, maxPop] = profile.popularityRange;
  const range = maxPop - minPop || 1;

  if (track.popularity >= minPop && track.popularity <= maxPop) return 1;

  // How far outside the range?
  const overshoot = track.popularity > maxPop
    ? (track.popularity - maxPop) / range
    : (minPop - track.popularity) / range;

  return Math.max(0.2, 1 - overshoot * 0.5);
}

function estimateEnergy(genres: string[]): number {
  if (genres.length === 0) return 0.5;
  let total = 0;
  let count = 0;
  for (const g of genres) {
    const vibe = getGenreVibe(g);
    total += vibe.energy;
    count++;
  }
  return count > 0 ? total / count : 0.5;
}

/**
 * Score and sort a batch of candidate tracks.
 * Returns tracks sorted best-first with their scores attached.
 */
export function rankCandidates(
  candidates: AppTrack[],
  profile: TasteProfile,
  branches: Map<string, Branch>,
  likedTracks: AppTrack[]
): Array<{ track: AppTrack; score: ScoreBreakdown }> {
  return candidates
    .map((track) => {
      const branch = track.branchId ? branches.get(track.branchId) || null : null;
      return { track, score: scoreTrack(track, profile, branch, likedTracks) };
    })
    .sort((a, b) => b.score.total - a.score.total);
}
