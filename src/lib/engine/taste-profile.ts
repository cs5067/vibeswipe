/* eslint-disable @typescript-eslint/no-explicit-any */
import type { TasteProfile, AnchorArtist } from "../../types/taste";
import { interpretVibe, findVibeAlignedGenres, getGenreVibe } from "./vibe-interpreter";

/**
 * Build a TasteProfile from Spotify data + the playlist name.
 * The playlist name drives the vibe; listening history provides the musical vocabulary.
 *
 * DEFENSIVE: Every array/object access is guarded against undefined.
 */
export function buildTasteProfile(
  topTracks: any[],
  topArtists: any[],
  recentlyPlayed: any[],
  playlistName: string
): TasteProfile {
  // Ensure inputs are arrays
  const safeTracks = Array.isArray(topTracks) ? topTracks : [];
  const safeArtists = Array.isArray(topArtists) ? topArtists : [];
  const safeRecent = Array.isArray(recentlyPlayed) ? recentlyPlayed : [];

  const genreWeights = new Map<string, number>();
  const knownArtistIds = new Set<string>();
  const seenTrackIds = new Set<string>();     // starts EMPTY — only tracks shown in swipe
  const knownTrackIds = new Set<string>();    // tracks used to build profile
  const genreTransitions = new Map<string, Map<string, number>>();

  // ----- Anchor artists (top 20, used for deep dives) -----
  const anchorArtists: AnchorArtist[] = safeArtists.slice(0, 20).map((a: any) => ({
    id: a?.id || "",
    name: a?.name || "Unknown",
    genres: Array.isArray(a?.genres) ? a.genres : [],
    popularity: a?.popularity || 0,
  }));

  // ----- Known artist/track IDs -----
  for (const track of safeTracks) {
    if (!track) continue;
    for (const artist of (track.artists || [])) {
      if (artist?.id) knownArtistIds.add(artist.id);
    }
    if (track.id) knownTrackIds.add(track.id);
  }
  for (const artist of safeArtists) {
    if (artist?.id) knownArtistIds.add(artist.id);
  }
  for (const item of safeRecent) {
    if (!item?.track) continue;
    if (item.track.id) knownTrackIds.add(item.track.id);
    for (const artist of (item.track.artists || [])) {
      if (artist?.id) knownArtistIds.add(artist.id);
    }
  }

  // ----- Genre weights (from artist ranking + recency) -----
  for (let i = 0; i < safeArtists.length; i++) {
    const a = safeArtists[i];
    if (!a) continue;
    const artistGenres = Array.isArray(a.genres) ? a.genres : [];
    const weight = 1 - i / (safeArtists.length + 1);
    for (const genre of artistGenres) {
      if (typeof genre !== "string") continue;
      const g = genre.toLowerCase();
      genreWeights.set(g, (genreWeights.get(g) || 0) + weight);
    }
  }

  // Build a cache of artist ID → genres for recency signal
  const recentArtistGenreCache = new Map<string, string[]>();
  for (const artist of safeArtists) {
    if (!artist?.id) continue;
    const artistGenres = Array.isArray(artist.genres) ? artist.genres : [];
    if (artistGenres.length > 0) {
      recentArtistGenreCache.set(artist.id, artistGenres.map((g: string) => (typeof g === "string" ? g.toLowerCase() : "")));
    }
  }

  // Add recency signal
  for (let i = 0; i < safeRecent.length; i++) {
    const item = safeRecent[i];
    if (!item?.track?.artists?.[0]?.id) continue;
    const recencyWeight = 0.5 * (1 - i / safeRecent.length);
    const artistId = item.track.artists[0].id;
    const genres = recentArtistGenreCache.get(artistId) || [];
    for (const g of genres) {
      genreWeights.set(g, (genreWeights.get(g) || 0) + recencyWeight);
    }
  }

  // Normalize weights to 0-1
  let maxWeight = 1;
  for (const w of genreWeights.values()) {
    if (w > maxWeight) maxWeight = w;
  }
  for (const [genre, weight] of genreWeights) {
    genreWeights.set(genre, weight / maxWeight);
  }

  // ----- Genre transitions (Markov chain from recently played) -----
  for (let i = 0; i < safeRecent.length - 1; i++) {
    const currentArtistId = safeRecent[i]?.track?.artists?.[0]?.id;
    const nextArtistId = safeRecent[i + 1]?.track?.artists?.[0]?.id;
    if (!currentArtistId || !nextArtistId) continue;
    const currentGenres = recentArtistGenreCache.get(currentArtistId);
    const nextGenres = recentArtistGenreCache.get(nextArtistId);

    if (currentGenres && currentGenres.length > 0 && nextGenres && nextGenres.length > 0) {
      const currentGenre = currentGenres[0];
      const nextGenre = nextGenres[0];
      if (!genreTransitions.has(currentGenre)) genreTransitions.set(currentGenre, new Map());
      const transitions = genreTransitions.get(currentGenre)!;
      transitions.set(nextGenre, (transitions.get(nextGenre) || 0) + 1);
    }
  }

  // ----- Popularity range -----
  const popularities = safeTracks.map((t: any) => t?.popularity || 0).filter((p: number) => p > 0);
  const popularityRange: [number, number] = popularities.length > 0
    ? [Math.min(...popularities), Math.max(...popularities)]
    : [20, 80];

  // ----- Vibe interpretation -----
  const safeName = typeof playlistName === "string" ? playlistName : "";
  const { vibe: sessionVibe, genreBoosts } = interpretVibe(safeName);

  // Boost genres that match the playlist vibe
  for (const g of (genreBoosts || [])) {
    const current = genreWeights.get(g) || 0;
    genreWeights.set(g, Math.min(current + 0.3, 1.5));
  }

  // ----- Seed selection: find artists and tracks that match the vibe -----
  const vibeAlignedGenres = new Set(findVibeAlignedGenres(genreWeights, sessionVibe, 10));

  // Pick seed artists whose genres overlap with vibe-aligned genres
  const seedArtistIds: string[] = [];
  for (const artist of anchorArtists) {
    if (seedArtistIds.length >= 5) break;
    const artistGenres = Array.isArray(artist.genres) ? artist.genres : [];
    const hasVibeGenre = artistGenres.some((g: string) => vibeAlignedGenres.has((g || "").toLowerCase()));
    if (hasVibeGenre) {
      seedArtistIds.push(artist.id);
    }
  }
  // Fallback: if no vibe match, use top 3 artists
  if (seedArtistIds.length === 0) {
    for (const a of anchorArtists.slice(0, 3)) {
      if (a.id) seedArtistIds.push(a.id);
    }
  }

  // Pick seed tracks from recent/top that match vibe
  const seedTrackIds: string[] = [];
  for (const track of safeTracks.slice(0, 30)) {
    if (!track) continue;
    if (seedTrackIds.length >= 5) break;
    const artistId = track.artists?.[0]?.id;
    if (!artistId) continue;
    const genres = recentArtistGenreCache.get(artistId) || [];
    if (genres.some((g: string) => vibeAlignedGenres.has(g))) {
      seedTrackIds.push(track.id);
    }
  }

  return {
    genreWeights,
    knownArtistIds,
    anchorArtists,
    genreTransitions,
    seenTrackIds,
    knownTrackIds,
    popularityRange,
    sessionVibe,
    seedTrackIds,
    seedArtistIds,
    branches: new Map(),
    activeBranchWeights: new Map(),
    swipeSignals: [],
    likedArtistIds: new Set(),
    dislikedArtistIds: new Set(),
    likedGenres: new Map(),
    dislikedGenres: new Map(),
    lastLikedTracks: [],
  };
}

// ----- Helper exports -----

export function getTopGenres(profile: TasteProfile, count = 5): string[] {
  return Array.from(profile.genreWeights.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([genre]) => genre);
}

export function getNextGenreByTransition(profile: TasteProfile, currentGenre: string): string | null {
  const transitions = profile.genreTransitions.get(currentGenre.toLowerCase());
  if (!transitions || transitions.size === 0) return null;
  const entries = Array.from(transitions.entries());
  const totalWeight = entries.reduce((sum, [, w]) => sum + w, 0);
  let random = Math.random() * totalWeight;
  for (const [genre, weight] of entries) {
    random -= weight;
    if (random <= 0) return genre;
  }
  return entries[0][0];
}

export function weightedRandomGenre(profile: TasteProfile): string {
  const entries = Array.from(profile.genreWeights.entries());
  if (entries.length === 0) return "pop";
  const totalWeight = entries.reduce((sum, [, w]) => sum + w, 0);
  let random = Math.random() * totalWeight;
  for (const [genre, weight] of entries) {
    random -= weight;
    if (random <= 0) return genre;
  }
  return entries[0][0];
}

/**
 * Estimate a track's "energy" level from its genres for sequence awareness
 */
export function estimateTrackEnergy(genres: string[]): number {
  const safeGenres = Array.isArray(genres) ? genres : [];
  if (safeGenres.length === 0) return 0.5;
  let total = 0;
  let count = 0;
  for (const g of safeGenres) {
    const vibe = getGenreVibe(g);
    total += vibe.energy;
    count++;
  }
  return count > 0 ? total / count : 0.5;
}
