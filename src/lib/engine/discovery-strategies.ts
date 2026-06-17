import type { AppTrack } from "@/types/track";
import type { TasteProfile } from "@/types/taste";
import { getRelatedGenres } from "./genre-graph";
import { getTopGenres, weightedRandomGenre, getNextGenreByTransition } from "./taste-profile";

export type StrategyName =
  | "genre_search"
  | "adjacent_genre"
  | "artist_deep_dive"
  | "sequential"
  | "artist_crawl";

interface DiscoveryResult {
  tracks: AppTrack[];
  strategy: StrategyName;
}

// Helper: fetch tracks by searching with genre
async function searchByGenre(
  genre: string,
  seenIds: Set<string>,
  offset = 0
): Promise<AppTrack[]> {
  try {
    const res = await fetch(
      `/api/spotify/search?q=${encodeURIComponent(`genre:"${genre}"`)}&type=track&limit=10&offset=${offset}`
    );
    if (!res.ok) return [];
    const data = await res.json();
    const tracks = data.tracks?.items || [];
    return tracks
      .filter((t: Record<string, string>) => !seenIds.has(t.id))
      .map((t: Record<string, unknown>) => spotifyToAppTrack(t, [genre]));
  } catch {
    return [];
  }
}

// Helper: fetch tracks by searching artist name
async function searchByArtist(
  artistName: string,
  seenIds: Set<string>
): Promise<AppTrack[]> {
  try {
    const res = await fetch(
      `/api/spotify/search?q=${encodeURIComponent(`artist:"${artistName}"`)}&type=track&limit=10`
    );
    if (!res.ok) return [];
    const data = await res.json();
    const tracks = data.tracks?.items || [];
    return tracks
      .filter((t: Record<string, string>) => !seenIds.has(t.id))
      .map((t: Record<string, unknown>) => spotifyToAppTrack(t, []));
  } catch {
    return [];
  }
}

// Helper: get artist albums and pick random tracks
async function crawlArtistAlbums(
  artistId: string,
  seenIds: Set<string>
): Promise<AppTrack[]> {
  try {
    const albumsRes = await fetch(`/api/spotify/artist/${artistId}/albums`);
    if (!albumsRes.ok) return [];
    const albumsData = await albumsRes.json();
    const albums = albumsData.items || [];

    if (albums.length === 0) return [];

    // Pick a random album
    const album = albums[Math.floor(Math.random() * albums.length)];
    const tracksRes = await fetch(`/api/spotify/album/${album.id}/tracks`);
    if (!tracksRes.ok) return [];
    const tracksData = await tracksRes.json();

    return (tracksData.items || [])
      .filter((t: Record<string, string>) => !seenIds.has(t.id))
      .map((t: Record<string, unknown>) =>
        spotifyToAppTrack(
          { ...t, album: { id: album.id, name: album.name, images: album.images, release_date: album.release_date, album_type: album.album_type, uri: album.uri } },
          []
        )
      );
  } catch {
    return [];
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function spotifyToAppTrack(track: any, genres: string[]): AppTrack {
  return {
    id: track.id,
    name: track.name,
    uri: track.uri,
    previewUrl: track.preview_url || null,
    durationMs: track.duration_ms || 0,
    popularity: track.popularity || 0,
    explicit: track.explicit || false,
    albumName: track.album?.name || "",
    albumImageUrl: track.album?.images?.[1]?.url || track.album?.images?.[0]?.url || "",
    albumImageLarge: track.album?.images?.[0]?.url || "",
    artistNames: (track.artists || []).map((a: any) => a.name),
    artistIds: (track.artists || []).map((a: any) => a.id),
    genres,
    spotifyUrl: track.external_urls?.spotify || "",
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// Strategy 1: Search tracks in a genre the user already likes
export async function genreSearchStrategy(
  profile: TasteProfile
): Promise<DiscoveryResult> {
  const genre = weightedRandomGenre(profile);
  const offset = Math.floor(Math.random() * 50); // randomize page
  const tracks = await searchByGenre(genre, profile.seenTrackIds, offset);
  return { tracks, strategy: "genre_search" };
}

// Strategy 2: Search tracks in genres adjacent to what the user likes
export async function adjacentGenreStrategy(
  profile: TasteProfile
): Promise<DiscoveryResult> {
  const topGenres = getTopGenres(profile, 3);
  const allRelated = new Set<string>();

  for (const g of topGenres) {
    const related = getRelatedGenres(g, 1);
    related.forEach((r) => {
      // Only pick genres the user does NOT already heavily listen to
      if ((profile.genreWeights.get(r) || 0) < 0.3) {
        allRelated.add(r);
      }
    });
  }

  const adjacentGenres = Array.from(allRelated);
  if (adjacentGenres.length === 0) {
    return { tracks: [], strategy: "adjacent_genre" };
  }

  const genre = adjacentGenres[Math.floor(Math.random() * adjacentGenres.length)];
  const tracks = await searchByGenre(genre, profile.seenTrackIds);
  // Tag tracks with the genre they came from
  tracks.forEach((t) => {
    if (t.genres.length === 0) t.genres = [genre];
  });
  return { tracks, strategy: "adjacent_genre" };
}

// Strategy 3: Deep dive into an anchor artist's discography
export async function artistDeepDiveStrategy(
  profile: TasteProfile
): Promise<DiscoveryResult> {
  if (profile.anchorArtists.length === 0) {
    return { tracks: [], strategy: "artist_deep_dive" };
  }

  const artist =
    profile.anchorArtists[Math.floor(Math.random() * profile.anchorArtists.length)];
  const tracks = await crawlArtistAlbums(artist.id, profile.seenTrackIds);
  tracks.forEach((t) => {
    t.genres = artist.genres.slice(0, 3);
  });
  return { tracks, strategy: "artist_deep_dive" };
}

// Strategy 4: Sequential — use genre transitions to pick next genre
export async function sequentialStrategy(
  profile: TasteProfile,
  lastLikedGenre: string | null
): Promise<DiscoveryResult> {
  const startGenre = lastLikedGenre || getTopGenres(profile, 1)[0];
  if (!startGenre) return { tracks: [], strategy: "sequential" };

  const nextGenre = getNextGenreByTransition(profile, startGenre);
  if (!nextGenre) {
    // Fallback: pick a related genre
    const related = getRelatedGenres(startGenre, 1);
    if (related.length === 0) return { tracks: [], strategy: "sequential" };
    const fallback = related[Math.floor(Math.random() * related.length)];
    const tracks = await searchByGenre(fallback, profile.seenTrackIds);
    return { tracks, strategy: "sequential" };
  }

  const tracks = await searchByGenre(nextGenre, profile.seenTrackIds);
  return { tracks, strategy: "sequential" };
}

// Strategy 5: Crawl albums from a recently liked artist
export async function artistCrawlStrategy(
  profile: TasteProfile,
  recentLikedArtistId: string | null
): Promise<DiscoveryResult> {
  if (!recentLikedArtistId) {
    // Pick from anchor artists
    if (profile.anchorArtists.length === 0) {
      return { tracks: [], strategy: "artist_crawl" };
    }
    const artist =
      profile.anchorArtists[Math.floor(Math.random() * profile.anchorArtists.length)];

    // Search for similar artist names to find related artists
    const tracks = await searchByArtist(artist.name, profile.seenTrackIds);
    return { tracks: tracks.slice(0, 5), strategy: "artist_crawl" };
  }

  const tracks = await crawlArtistAlbums(recentLikedArtistId, profile.seenTrackIds);
  return { tracks, strategy: "artist_crawl" };
}
