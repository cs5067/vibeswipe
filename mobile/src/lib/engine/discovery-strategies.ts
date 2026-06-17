import type { AppTrack } from "../../types/track";
import type { TasteProfile, Branch } from "../../types/taste";
import { getRelatedGenres } from "./genre-graph";
import { getTopGenres, getNextGenreByTransition } from "./taste-profile";
import { findVibeAlignedGenres } from "./vibe-interpreter";
import * as SpotifyAPI from "../spotify/client";

export type SourceType = "safe" | "edge" | "jump";

export interface DiscoveryResult {
  tracks: AppTrack[];
  strategy: string;
  sourceType: SourceType;
  branchId: string;
}

let branchCounter = 0;
function newBranchId(prefix: string): string {
  return `${prefix}_${++branchCounter}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function spotifyToAppTrack(track: any, genres: string[], branchId: string, sourceType: SourceType, strategy: string): AppTrack {
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
    artistNames: (track.artists || []).map((a: { name: string }) => a.name),
    artistIds: (track.artists || []).map((a: { id: string }) => a.id),
    genres,
    spotifyUrl: track.external_urls?.spotify || "",
    strategy,
    branchId,
    sourceType,
  };
}

// ====================================================================
// STRATEGY 1: YOUR TOP TRACKS — Familiar comfort, limited use
// Only used sparingly to anchor the session
// ====================================================================
export async function yourTopTracksStrategy(
  profile: TasteProfile,
  timeRange: "short_term" | "medium_term" | "long_term" = "medium_term"
): Promise<DiscoveryResult> {
  const branchId = newBranchId("your_tops");
  try {
    const tracks = await SpotifyAPI.getTopTracks(timeRange, 50);
    const filtered = tracks.filter((t) => !profile.seenTrackIds.has(t.id));

    const artistIds = [...new Set(filtered.flatMap((t) => t.artists.map((a) => a.id)))].slice(0, 50);
    const artistGenreMap = await getArtistGenreMap(artistIds);

    const appTracks = filtered.map((t) => {
      const genres = artistGenreMap.get(t.artists[0]?.id) || [];
      return spotifyToAppTrack(t, genres, branchId, "safe", "your_top_tracks");
    });

    return { tracks: appTracks, strategy: "your_top_tracks", sourceType: "safe", branchId };
  } catch (err) {
    console.log("yourTopTracksStrategy error:", err);
    return { tracks: [], strategy: "your_top_tracks", sourceType: "safe", branchId };
  }
}

// ====================================================================
// STRATEGY 2: ARTIST TOP TRACKS — Best songs from known/liked artists
// ====================================================================
export async function artistTopTracksStrategy(
  profile: TasteProfile,
  preferLikedArtists = true
): Promise<DiscoveryResult> {
  const branchId = newBranchId("artist_tops");
  try {
    let artistId: string | null = null;
    let artistGenres: string[] = [];

    if (preferLikedArtists && profile.likedArtistIds.size > 0) {
      const liked = Array.from(profile.likedArtistIds);
      artistId = liked[Math.floor(Math.random() * liked.length)];
      const anchor = profile.anchorArtists.find((a) => a.id === artistId);
      artistGenres = anchor?.genres?.slice(0, 3) || [];
    }

    if (!artistId && profile.seedArtistIds.length > 0) {
      const idx = Math.floor(Math.random() * profile.seedArtistIds.length);
      artistId = profile.seedArtistIds[idx];
      const anchor = profile.anchorArtists.find((a) => a.id === artistId);
      artistGenres = anchor?.genres?.slice(0, 3) || [];
    }

    if (!artistId && profile.anchorArtists.length > 0) {
      const anchor = profile.anchorArtists[Math.floor(Math.random() * Math.min(10, profile.anchorArtists.length))];
      artistId = anchor.id;
      artistGenres = anchor.genres.slice(0, 3);
    }

    if (!artistId) return { tracks: [], strategy: "artist_top_tracks", sourceType: "safe", branchId };

    const topTracks = await SpotifyAPI.getArtistTopTracks(artistId);
    const filtered = topTracks.filter((t) => !profile.seenTrackIds.has(t.id));
    const appTracks = filtered.map((t) => spotifyToAppTrack(t, artistGenres, branchId, "safe", "artist_top_tracks"));

    return { tracks: appTracks, strategy: "artist_top_tracks", sourceType: "safe", branchId };
  } catch (err) {
    console.log("artistTopTracksStrategy error:", err);
    return { tracks: [], strategy: "artist_top_tracks", sourceType: "safe", branchId };
  }
}

// ====================================================================
// STRATEGY 3: COLLAB CHAIN — The core discovery mechanism
//
// This is the "flood fill" through the music graph:
// 1. Pick an artist the user likes
// 2. Search their name → finds tracks FEATURING them by OTHER artists
// 3. Discover those other artists
// 4. Get top tracks from those discovered artists
//
// Example: User likes Kendrick → finds "family ties" by Baby Keem ft. Kendrick
//          → discovers Baby Keem → shows Baby Keem's top tracks
//
// This uses Spotify's search ranking (which IS collaborative filtering)
// to naturally traverse through related music.
// ====================================================================
export async function collabChainStrategy(
  profile: TasteProfile,
  likedTracks: AppTrack[]
): Promise<DiscoveryResult> {
  const branchId = newBranchId("collab");
  try {
    // Pick a source artist
    let sourceArtistName = "";
    let sourceArtistId = "";
    let sourceGenres: string[] = [];

    if (likedTracks.length > 0) {
      const recent = likedTracks.slice(-10);
      const pick = recent[Math.floor(Math.random() * recent.length)];
      sourceArtistName = pick.artistNames[0] || "";
      sourceArtistId = pick.artistIds[0] || "";
      sourceGenres = pick.genres;
    } else if (profile.anchorArtists.length > 0) {
      const anchor = profile.anchorArtists[Math.floor(Math.random() * Math.min(8, profile.anchorArtists.length))];
      sourceArtistName = anchor.name;
      sourceArtistId = anchor.id;
      sourceGenres = anchor.genres.slice(0, 3);
    }

    if (!sourceArtistName) return { tracks: [], strategy: "collab_chain", sourceType: "edge", branchId };

    // Step 1: Search the artist name — Spotify returns tracks featuring them
    const offset = Math.floor(Math.random() * 20);
    const searchResult = await SpotifyAPI.search(sourceArtistName, ["track"], 20, offset);
    const searchTracks = (searchResult.tracks?.items || []).filter(
      (t) => !profile.seenTrackIds.has(t.id)
    );

    // Step 2: Find tracks by DIFFERENT artists (not the source artist)
    // These are collabs, features, or similar-sounding artists
    const discoveredArtistIds = new Set<string>();
    const collabTracks: AppTrack[] = [];

    for (const track of searchTracks) {
      const mainArtistId = track.artists[0]?.id;
      // Only take tracks by OTHER artists (not the source)
      if (mainArtistId && mainArtistId !== sourceArtistId) {
        discoveredArtistIds.add(mainArtistId);
        collabTracks.push(
          spotifyToAppTrack(track, sourceGenres, branchId, "edge", "collab_chain")
        );
      }
    }

    // Step 3: Get top tracks from discovered artists (the chain continues)
    const discoveredIds = Array.from(discoveredArtistIds).slice(0, 3);
    for (const artistId of discoveredIds) {
      try {
        const topTracks = await SpotifyAPI.getArtistTopTracks(artistId);
        const artistFiltered = topTracks
          .filter((t) => !profile.seenTrackIds.has(t.id))
          .slice(0, 3); // just top 3 from each discovered artist

        // Get genres for discovered artists
        const artistGenreMap = await getArtistGenreMap([artistId]);
        const genres = artistGenreMap.get(artistId) || sourceGenres;

        for (const t of artistFiltered) {
          collabTracks.push(
            spotifyToAppTrack(t, genres, branchId, "edge", "collab_chain")
          );
        }
      } catch {
        // non-critical
      }
    }

    return { tracks: collabTracks, strategy: "collab_chain", sourceType: "edge", branchId };
  } catch (err) {
    console.log("collabChainStrategy error:", err);
    return { tracks: [], strategy: "collab_chain", sourceType: "edge", branchId };
  }
}

// ====================================================================
// STRATEGY 4: MOOD/VIBE SEARCH — Tap into Spotify's editorial graph
//
// Searching "chill r&b night" returns tracks from curated playlists
// and editorial categories. Spotify's search inherently uses
// collaborative data to rank these results.
// ====================================================================
export async function vibeSearchStrategy(
  profile: TasteProfile,
  playlistName: string
): Promise<DiscoveryResult> {
  const branchId = newBranchId("vibe_search");
  try {
    const topGenres = getTopGenres(profile, 3);
    const queries: string[] = [];

    // Sanitize playlist name — remove special chars that break Spotify search
    const safeName = (playlistName || "").replace(/[^a-zA-Z0-9\s]/g, "").trim();

    if (safeName.length > 2) {
      queries.push(safeName);
      if (topGenres.length > 0) {
        queries.push(`${safeName} ${topGenres[0]}`);
      }
    }

    // Mood + genre combos
    const moodTerms = [
      "vibes", "mood", "chill", "hype",
      "late night", "morning", "feels", "fire"
    ];
    const randomMood = moodTerms[Math.floor(Math.random() * moodTerms.length)];
    if (topGenres.length > 0) {
      queries.push(`${randomMood} ${topGenres[Math.floor(Math.random() * topGenres.length)]}`);
    }

    if (queries.length === 0) queries.push("new music 2026");

    const query = queries[Math.floor(Math.random() * queries.length)];
    const offset = Math.floor(Math.random() * 15);

    const result = await SpotifyAPI.search(query, ["track"], 15, offset);
    const tracks = (result.tracks?.items || [])
      .filter((t) => !profile.seenTrackIds.has(t.id))
      .filter((t) => (t.popularity || 0) > 25);

    const appTracks = tracks.map((t) =>
      spotifyToAppTrack(t, topGenres, branchId, "edge", "vibe_search")
    );

    return { tracks: appTracks, strategy: "vibe_search", sourceType: "edge", branchId };
  } catch (err) {
    console.log("vibeSearchStrategy error:", err);
    return { tracks: [], strategy: "vibe_search", sourceType: "edge", branchId };
  }
}

// ====================================================================
// STRATEGY 5: GENRE TRENDING — Search genre names as keywords
// "hip hop" as a search term → returns currently popular hip hop tracks
// Spotify ranks by popularity + collaborative signals
// ====================================================================
export async function genreTrendingStrategy(profile: TasteProfile): Promise<DiscoveryResult> {
  const branchId = newBranchId("genre_trending");
  try {
    const vibeGenres = findVibeAlignedGenres(profile.genreWeights, profile.sessionVibe, 5);
    const genre = vibeGenres.length > 0
      ? vibeGenres[Math.floor(Math.random() * vibeGenres.length)]
      : getTopGenres(profile, 1)[0] || "pop";

    // Search genre as keyword (NOT genre:"x" filter which returns garbage)
    // Adding "new" or year gets fresh tracks
    const yearVariants = ["2025", "2026", "new", ""];
    const yearPick = yearVariants[Math.floor(Math.random() * yearVariants.length)];
    const query = yearPick ? `${genre} ${yearPick}` : genre;
    const offset = Math.floor(Math.random() * 30);

    const result = await SpotifyAPI.search(query, ["track"], 20, offset);
    const tracks = (result.tracks?.items || [])
      .filter((t) => !profile.seenTrackIds.has(t.id))
      .filter((t) => (t.popularity || 0) > 30); // keep quality threshold

    const appTracks = tracks.map((t) =>
      spotifyToAppTrack(t, [genre], branchId, "edge", "genre_trending")
    );

    return { tracks: appTracks, strategy: "genre_trending", sourceType: "edge", branchId };
  } catch (err) {
    console.log("genreTrendingStrategy error:", err);
    return { tracks: [], strategy: "genre_trending", sourceType: "edge", branchId };
  }
}

// ====================================================================
// STRATEGY 6: DISCOVERY CHAIN — Multi-hop exploration
//
// Goes deeper: picks an artist 2 hops away
// UserArtist → search → DiscoveredArtist1 → search → DiscoveredArtist2
// This is the "controlled jump" — further from home but still connected
// ====================================================================
export async function discoveryChainStrategy(
  profile: TasteProfile,
  likedTracks: AppTrack[]
): Promise<DiscoveryResult> {
  const branchId = newBranchId("discovery");
  try {
    // Start from a seed artist
    let seedName = "";
    if (likedTracks.length > 0) {
      const pick = likedTracks[Math.floor(Math.random() * likedTracks.length)];
      seedName = pick.artistNames[0] || "";
    } else if (profile.anchorArtists.length > 0) {
      seedName = profile.anchorArtists[Math.floor(Math.random() * Math.min(5, profile.anchorArtists.length))].name;
    }

    if (!seedName) return { tracks: [], strategy: "discovery_chain", sourceType: "jump", branchId };

    // Hop 1: Search seed artist → find a different artist
    const hop1Result = await SpotifyAPI.search(seedName, ["track"], 10, Math.floor(Math.random() * 10));
    const hop1Tracks = hop1Result.tracks?.items || [];

    let hop1ArtistName = "";
    let hop1ArtistId = "";
    for (const track of hop1Tracks) {
      const mainArtist = track.artists[0];
      // Find a DIFFERENT artist from the search results
      if (mainArtist && !profile.anchorArtists.some((a) => a.id === mainArtist.id)) {
        hop1ArtistName = mainArtist.name;
        hop1ArtistId = mainArtist.id;
        break;
      }
    }

    if (!hop1ArtistName) return { tracks: [], strategy: "discovery_chain", sourceType: "jump", branchId };

    // Hop 2: Search the discovered artist → find ANOTHER different artist
    const hop2Result = await SpotifyAPI.search(hop1ArtistName, ["track"], 10, Math.floor(Math.random() * 10));
    const hop2Tracks = hop2Result.tracks?.items || [];

    let hop2ArtistId = "";
    for (const track of hop2Tracks) {
      const mainArtist = track.artists[0];
      if (mainArtist && mainArtist.id !== hop1ArtistId &&
          !profile.anchorArtists.some((a) => a.id === mainArtist.id)) {
        hop2ArtistId = mainArtist.id;
        break;
      }
    }

    // Get top tracks from the 2-hop-away artist
    const targetArtistId = hop2ArtistId || hop1ArtistId;
    const topTracks = await SpotifyAPI.getArtistTopTracks(targetArtistId);
    const filtered = topTracks.filter((t) => !profile.seenTrackIds.has(t.id));

    const artistGenreMap = await getArtistGenreMap([targetArtistId]);
    const genres = artistGenreMap.get(targetArtistId) || [];

    const appTracks = filtered.map((t) =>
      spotifyToAppTrack(t, genres, branchId, "jump", "discovery_chain")
    );

    return { tracks: appTracks, strategy: "discovery_chain", sourceType: "jump", branchId };
  } catch (err) {
    console.log("discoveryChainStrategy error:", err);
    return { tracks: [], strategy: "discovery_chain", sourceType: "jump", branchId };
  }
}

// ====================================================================
// STRATEGY 7: SAVED TRACKS — User's liked songs library
// ====================================================================
export async function savedTracksStrategy(profile: TasteProfile): Promise<DiscoveryResult> {
  const branchId = newBranchId("saved");
  try {
    const offset = Math.floor(Math.random() * 200);
    const tracks = await SpotifyAPI.getSavedTracks(50, offset);
    const filtered = tracks.filter((t) => !profile.seenTrackIds.has(t.id));

    const artistIds = [...new Set(filtered.flatMap((t) => t.artists.map((a) => a.id)))].slice(0, 50);
    const artistGenreMap = await getArtistGenreMap(artistIds);

    const appTracks = filtered.map((t) => {
      const genres = artistGenreMap.get(t.artists[0]?.id) || [];
      return spotifyToAppTrack(t, genres, branchId, "safe", "saved_tracks");
    });

    return { tracks: appTracks, strategy: "saved_tracks", sourceType: "safe", branchId };
  } catch (err) {
    console.log("savedTracksStrategy error:", err);
    return { tracks: [], strategy: "saved_tracks", sourceType: "safe", branchId };
  }
}

// ====================================================================
// Helper: get genres for a list of artist IDs
// ====================================================================
async function getArtistGenreMap(artistIds: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (artistIds.length === 0) return map;

  try {
    const artists = await SpotifyAPI.getArtists(artistIds);
    for (const artist of artists) {
      if (artist) {
        map.set(artist.id, artist.genres.map((g) => g.toLowerCase()));
      }
    }
  } catch {
    // non-critical
  }
  return map;
}
