/* eslint-disable @typescript-eslint/no-explicit-any */
import type { AppTrack } from "../../types/track";
import type { TasteProfile } from "../../types/taste";
import { buildTasteProfile, estimateTrackEnergy } from "./taste-profile";
import { rankCandidates } from "./scoring";
import { generateSeeds, type PlaylistSeeds } from "./playlist-seeds";
import * as SpotifyAPI from "../spotify/api";

function toAppTrack(
  track: any,
  genres: string[],
  branchId: string,
  strategy: string,
  sourceType: "safe" | "edge" | "jump" = "safe",
  debugExtra?: { searchQuery?: string; playlistName?: string }
): AppTrack {
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
    _debug: {
      searchQuery: debugExtra?.searchQuery || branchId,
      playlistName: debugExtra?.playlistName,
    },
  };
}

/**
 * Recommendation Engine v6
 *
 * Key improvements over v5:
 * - Smart playlist-name-to-seeds mapping (with optional AI)
 * - Extracts anchor artists from top tracks when getTopArtists returns empty
 * - Fixed: search always uses offset=0 (dev mode rejects offsets)
 * - Fixed: null filtering in playlist co-occurrence
 * - Fixed: popularity filter removed from vibe search
 * - New: "playlist name search" strategy for cold start
 * - Better query diversity (unique query per search, never repeats)
 *
 * Working endpoints:
 * ✅ Search (tracks, playlists)
 * ✅ Artist Albums → Album Tracks
 * ✅ User Top Tracks / Top Artists / Recently Played / Saved Tracks
 *
 * Discovery strategies:
 * 1. SEARCH BY ARTIST NAME — finds similar music via Spotify's search ranking
 * 2. PLAYLIST CO-OCCURRENCE — find playlists containing liked artist → get other songs
 * 3. PLAYLIST NAME SEARCH — find playlists matching the user's chosen name → mine tracks
 * 4. ALBUM DEEP DIVE — crawl albums from liked artists for deep cuts
 * 5. VIBE/QUERY SEARCH — diverse search queries from playlist seeds
 * 6. USER LIBRARY — saved tracks, top tracks from different time ranges
 */
export class RecommendationEngine {
  private profile!: TasteProfile;
  private queue: AppTrack[] = [];
  private isRefilling = false;
  private initialized = false;
  private playlistName = "";
  private likedTracks: AppTrack[] = [];
  private swipeStartTime = 0;
  private totalSwipes = 0;
  private refillCount = 0;

  // Seeds from playlist name interpretation
  private seeds!: PlaylistSeeds;
  private selectedVibes: string[] = [];

  // Dedup tracking
  private searchedArtists = new Set<string>();
  private searchedQueries = new Set<string>();
  private exploredPlaylistIds = new Set<string>();
  private artistSearchIndex = 0;  // which seed artist to search next
  private querySearchIndex = 0;   // which query to use next

  async initialize(playlistName?: string, selectedVibes?: string[]): Promise<void> {
    this.playlistName = playlistName || "My Playlist";
    this.selectedVibes = selectedVibes || [];

    console.log("Engine init: step 1 — fetching user data");

    // Fetch user data in parallel — each call guarded independently
    let shortTracks: any[] = [];
    let shortArtists: any[] = [];
    let mediumTracks: any[] = [];
    let mediumArtists: any[] = [];
    let recentItems: any[] = [];

    try {
      const r0 = await SpotifyAPI.getTopTracks("short_term", 50).catch(() => null);
      shortTracks = Array.isArray(r0) ? r0 : [];
    } catch { shortTracks = []; }

    try {
      const r1 = await SpotifyAPI.getTopArtists("short_term", 50).catch(() => null);
      shortArtists = Array.isArray(r1) ? r1 : [];
    } catch { shortArtists = []; }

    try {
      const r2 = await SpotifyAPI.getTopTracks("medium_term", 50).catch(() => null);
      mediumTracks = Array.isArray(r2) ? r2 : [];
    } catch { mediumTracks = []; }

    try {
      const r3 = await SpotifyAPI.getTopArtists("medium_term", 50).catch(() => null);
      mediumArtists = Array.isArray(r3) ? r3 : [];
    } catch { mediumArtists = []; }

    try {
      const r4 = await SpotifyAPI.getRecentlyPlayed(50).catch(() => null);
      recentItems = Array.isArray(r4?.items) ? r4.items : [];
    } catch { recentItems = []; }

    console.log(`Engine init: step 2 — short=${shortTracks.length}t/${shortArtists.length}a, med=${mediumTracks.length}t/${mediumArtists.length}a, recent=${recentItems.length}`);

    // Merge tracks (dedup by ID)
    const allTracks: any[] = [];
    const seenIds = new Set<string>();
    for (const t of shortTracks) {
      if (t && t.id && !seenIds.has(t.id)) { allTracks.push(t); seenIds.add(t.id); }
    }
    for (const t of mediumTracks) {
      if (t && t.id && !seenIds.has(t.id)) { allTracks.push(t); seenIds.add(t.id); }
    }

    // Merge artists (dedup by ID) — ensure every artist has a genres array
    let allArtists: any[] = [];
    const seenArtIds = new Set<string>();
    for (const a of shortArtists) {
      if (a && a.id && !seenArtIds.has(a.id)) {
        a.genres = Array.isArray(a.genres) ? a.genres : [];
        allArtists.push(a);
        seenArtIds.add(a.id);
      }
    }
    for (const a of mediumArtists) {
      if (a && a.id && !seenArtIds.has(a.id)) {
        a.genres = Array.isArray(a.genres) ? a.genres : [];
        allArtists.push(a);
        seenArtIds.add(a.id);
      }
    }

    // If getTopArtists returned empty, extract artists from top tracks
    if (allArtists.length === 0 && allTracks.length > 0) {
      console.log("No top artists from API — extracting from top tracks");
      const artistMap = new Map<string, { id: string; name: string; count: number }>();
      for (const track of allTracks) {
        for (const artist of (track.artists || [])) {
          if (artist && artist.id && !artistMap.has(artist.id)) {
            artistMap.set(artist.id, { id: artist.id, name: artist.name || "Unknown", count: 0 });
          }
          if (artist && artist.id) artistMap.get(artist.id)!.count++;
        }
      }
      const sorted = Array.from(artistMap.values()).sort((a, b) => b.count - a.count);
      allArtists = sorted.slice(0, 30).map((a) => ({
        id: a.id,
        name: a.name,
        uri: `spotify:artist:${a.id}`,
        genres: [] as string[],
        images: [],
        popularity: 50,
      }));
      console.log(`Extracted ${allArtists.length} artists from tracks`);
    }

    console.log(`Engine init: step 3 — ${allTracks.length} tracks, ${allArtists.length} artists`);

    // Build taste profile
    this.profile = buildTasteProfile(allTracks, allArtists, recentItems, this.playlistName);
    console.log("Engine init: step 4 — profile built");

    // Get user's top genres for seed generation
    const userGenres = Array.from(this.profile.genreWeights.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([g]) => g);

    // Generate smart seeds from playlist name + selected vibes
    const seedGenres = this.selectedVibes.length > 0
      ? [...this.selectedVibes, ...userGenres]
      : userGenres;
    this.seeds = await generateSeeds(this.playlistName, seedGenres);
    console.log("Engine init: step 5 — seeds generated");

    this.initialized = true;

    console.log(`Engine v6 initialized:`);
    console.log(`  ${this.profile.anchorArtists.length} anchor artists, ${this.profile.genreWeights.size} genres`);
    console.log(`  ${this.seeds.seedArtists.length} seed artists, ${this.seeds.searchQueries.length} search queries`);

    await this.refillPool();
  }

  isReady(): boolean {
    return this.initialized && this.queue.length > 0;
  }

  getPoolSize(): number {
    return this.queue.length;
  }

  async getNextTrack(): Promise<AppTrack | null> {
    if (!this.initialized) return null;
    const track = this.queue.shift() || null;
    if (track) {
      this.profile.seenTrackIds.add(track.id);
      this.swipeStartTime = Date.now();
    }
    if (this.queue.length < 8) this.refillPool();
    return track;
  }

  recordSwipe(track: AppTrack, direction: "left" | "right"): void {
    this.totalSwipes++;
    const timeToDecide = this.swipeStartTime > 0 ? Date.now() - this.swipeStartTime : 3000;

    this.profile.swipeSignals.push({
      trackId: track.id,
      direction,
      timeToDecideMs: timeToDecide,
      branchId: track.branchId || "unknown",
      timestamp: Date.now(),
    });

    const strength =
      direction === "right"
        ? timeToDecide < 2000 ? 1.5 : timeToDecide < 5000 ? 1.0 : 0.7
        : timeToDecide < 1500 ? 1.2 : timeToDecide < 5000 ? 0.8 : 0.5;

    if (direction === "right") this.handleLike(track, strength);
    else this.handleDislike(track, strength);
  }

  private handleLike(track: AppTrack, strength: number): void {
    this.likedTracks.push(track);
    for (const id of track.artistIds) this.profile.likedArtistIds.add(id);
    for (const genre of track.genres) {
      const g = genre.toLowerCase();
      const cur = this.profile.genreWeights.get(g) || 0;
      this.profile.genreWeights.set(g, Math.min(cur + 0.12 * strength, 1.5));
      this.profile.likedGenres.set(g, (this.profile.likedGenres.get(g) || 0) + 1);
    }
    if (track.branchId) {
      const b = this.profile.branches.get(track.branchId);
      if (b) { b.likes++; b.confidence = Math.min(b.confidence + 0.15 * strength, 1); }
    }
    this.profile.lastLikedTracks.push({
      id: track.id,
      genres: track.genres,
      artistIds: track.artistIds,
      energy: estimateTrackEnergy(track.genres),
      popularity: track.popularity,
    });
    if (this.profile.lastLikedTracks.length > 5) this.profile.lastLikedTracks.shift();
  }

  private handleDislike(track: AppTrack, strength: number): void {
    for (const id of track.artistIds) this.profile.dislikedArtistIds.add(id);
    for (const genre of track.genres) {
      const g = genre.toLowerCase();
      const cur = this.profile.genreWeights.get(g) || 0;
      this.profile.genreWeights.set(g, Math.max(cur - 0.03 * strength, 0.05));
      this.profile.dislikedGenres.set(g, (this.profile.dislikedGenres.get(g) || 0) + 1);
    }
    if (track.branchId) {
      const b = this.profile.branches.get(track.branchId);
      if (b) { b.dislikes++; b.confidence = Math.max(b.confidence - 0.2 * strength, 0); }
    }
  }

  // ================================================
  // STRATEGY 1: Search by artist name
  // ================================================
  private async searchArtist(artistName: string, genres: string[]): Promise<AppTrack[]> {
    if (!artistName || this.searchedArtists.has(artistName.toLowerCase())) return [];
    this.searchedArtists.add(artistName.toLowerCase());

    const branchId = `search_${artistName.slice(0, 10)}`;
    try {
      // FIXED: Always use offset=0, limit=10 (dev mode rejects higher values)
      const result = await SpotifyAPI.search(artistName, ["track"], 10, 0);
      const tracks = (result.tracks?.items || [])
        .filter((t: any) => t && t.id && !this.profile.seenTrackIds.has(t.id));

      console.log(`Search "${artistName}": ${tracks.length} tracks`);
      this.registerBranch(branchId, genres);
      return tracks.map((t: any) => toAppTrack(t, genres, branchId, "artist_search", "safe", { searchQuery: artistName }));
    } catch (err) {
      console.log(`Search "${artistName}" failed:`, err);
      return [];
    }
  }

  // ================================================
  // STRATEGY 2: Playlist co-occurrence
  // Find playlists containing an artist/song → get other songs
  // ================================================
  private async playlistCoOccurrence(searchTerm: string, genres: string[]): Promise<AppTrack[]> {
    const branchId = `playlist_${searchTerm.slice(0, 10)}`;
    try {
      const playlists = await SpotifyAPI.searchPlaylists(searchTerm, 5);

      // FIXED: Filter null/undefined items
      const validPlaylists = playlists.filter((p) => p && p.id);
      if (validPlaylists.length === 0) return [];

      const unexplored = validPlaylists.filter((p) => !this.exploredPlaylistIds.has(p.id));
      if (unexplored.length === 0) return [];

      const picked = unexplored.slice(0, 2);
      const allTracks: AppTrack[] = [];

      for (const playlist of picked) {
        this.exploredPlaylistIds.add(playlist.id);
        try {
          // FIXED: Always offset=0 — name passed so the corpus ingest can tag it
          const data = await SpotifyAPI.getPlaylistTracks(playlist.id, 30, 0, playlist.name);
          const tracks = (data.items || [])
            .map((item: any) => item?.track)
            .filter((t: any) => t && t.id && !this.profile.seenTrackIds.has(t.id));

          console.log(`Playlist "${playlist.name}": ${tracks.length} tracks`);
          for (const t of tracks) {
            allTracks.push(toAppTrack(t, genres, branchId, "playlist_cooccur", "edge", { searchQuery: searchTerm, playlistName: playlist.name }));
          }
        } catch {
          // skip this playlist
        }
      }

      this.registerBranch(branchId, genres);
      return allTracks;
    } catch (err) {
      console.log(`Playlist co-occurrence "${searchTerm}" failed:`, err);
      return [];
    }
  }

  // ================================================
  // STRATEGY 3: Playlist name search (NEW!)
  // Search for playlists matching the user's chosen playlist name
  // This IS collaborative filtering — other users curated these playlists
  // ================================================
  private async playlistNameSearch(): Promise<AppTrack[]> {
    const searches = this.seeds.playlistSearches;
    if (searches.length === 0) return [];

    // Pick the next unused search term
    const untried = searches.filter((s) => !this.exploredPlaylistIds.has(`name_${s}`));
    if (untried.length === 0) return [];

    const term = untried[0];
    this.exploredPlaylistIds.add(`name_${term}`);

    const branchId = `name_search_${this.refillCount}`;
    try {
      const playlists = await SpotifyAPI.searchPlaylists(term, 3);
      const valid = playlists.filter((p) => p && p.id && !this.exploredPlaylistIds.has(p.id));
      if (valid.length === 0) return [];

      const allTracks: AppTrack[] = [];
      for (const playlist of valid.slice(0, 2)) {
        this.exploredPlaylistIds.add(playlist.id);
        try {
          const data = await SpotifyAPI.getPlaylistTracks(playlist.id, 40, 0, playlist.name);
          const tracks = (data.items || [])
            .map((item: any) => item?.track)
            .filter((t: any) => t && t.id && !this.profile.seenTrackIds.has(t.id));

          console.log(`Name search playlist "${playlist.name}": ${tracks.length} tracks`);
          for (const t of tracks) {
            allTracks.push(toAppTrack(t, this.seeds.genres, branchId, "name_search", "edge", { searchQuery: term, playlistName: playlist.name }));
          }
        } catch { /* skip */ }
      }

      this.registerBranch(branchId, this.seeds.genres);
      return allTracks;
    } catch (err) {
      console.log("Playlist name search failed:", err);
      return [];
    }
  }

  // ================================================
  // STRATEGY 4: Album deep dive
  // ================================================
  private async albumDeepDive(artistId: string, genres: string[]): Promise<AppTrack[]> {
    const branchId = `album_${artistId.slice(0, 8)}`;
    try {
      const albumsData = await SpotifyAPI.getArtistAlbums(artistId, 10);
      const albums = albumsData.items || [];
      if (albums.length === 0) return [];

      const shuffled = [...albums].sort(() => Math.random() - 0.5);
      const picked = shuffled.slice(0, 2);
      const allTracks: AppTrack[] = [];

      for (const album of picked) {
        try {
          const tracksData = await SpotifyAPI.getAlbumTracks(album.id, 15);
          for (const t of tracksData.items || []) {
            if (t && t.id && !this.profile.seenTrackIds.has(t.id)) {
              allTracks.push(
                toAppTrack(
                  {
                    ...t,
                    album: {
                      id: album.id, name: album.name, images: album.images,
                      release_date: album.release_date, album_type: album.album_type, uri: album.uri,
                    },
                  },
                  genres, branchId, "album_dive", "safe",
                  { searchQuery: `Album: ${album.name}` }
                )
              );
            }
          }
        } catch { /* skip album */ }
      }

      console.log(`Album dive for ${artistId}: ${allTracks.length} tracks`);
      this.registerBranch(branchId, genres);
      return allTracks;
    } catch (err) {
      console.log("Album dive failed:", err);
      return [];
    }
  }

  // ================================================
  // STRATEGY 5: Diverse query search
  // Uses pre-generated search queries from playlist seeds
  // ================================================
  private async querySearch(): Promise<AppTrack[]> {
    const branchId = `query_${this.refillCount}`;

    // Get next unused query from seeds
    const allQueries = this.seeds.searchQueries;
    let query: string | null = null;

    while (this.querySearchIndex < allQueries.length) {
      const candidate = allQueries[this.querySearchIndex++];
      if (!this.searchedQueries.has(candidate.toLowerCase())) {
        query = candidate;
        this.searchedQueries.add(candidate.toLowerCase());
        break;
      }
    }

    // If all seed queries exhausted, generate new ones from liked tracks
    if (!query && this.likedTracks.length > 0) {
      const liked = this.likedTracks[Math.floor(Math.random() * this.likedTracks.length)];
      const moods = ["vibes", "chill", "hype", "late night", "feels", "energy", "mood", "similar to"];
      const mood = moods[Math.floor(Math.random() * moods.length)];
      query = `${mood} ${liked.artistNames[0]}`;
      if (this.searchedQueries.has(query.toLowerCase())) {
        query = `${liked.artistNames[0]} type beat`;
      }
      this.searchedQueries.add(query.toLowerCase());
    }

    if (!query) {
      // Last resort: random genre search
      const topGenres = Array.from(this.profile.genreWeights.entries())
        .sort((a, b) => b[1] - a[1]).slice(0, 3).map(([g]) => g);
      const g = topGenres[Math.floor(Math.random() * topGenres.length)] || "music";
      query = `best ${g} ${2024 + Math.floor(Math.random() * 2)}`;
      this.searchedQueries.add(query.toLowerCase());
    }

    try {
      // FIXED: Always offset=0, limit=10
      const result = await SpotifyAPI.search(query, ["track"], 10, 0);
      // FIXED: Removed popularity filter — let the scoring system handle quality
      const tracks = (result.tracks?.items || [])
        .filter((t: any) => t && t.id && !this.profile.seenTrackIds.has(t.id));

      console.log(`Query search "${query}": ${tracks.length} tracks`);
      this.registerBranch(branchId, []);
      return tracks.map((t: any) => toAppTrack(t, [], branchId, "query_search", "edge", { searchQuery: query }));
    } catch (err) {
      console.log(`Query search failed:`, err);
      return [];
    }
  }

  // ================================================
  // STRATEGY 6: User library
  // ================================================
  private async userLibrary(source: "top" | "saved"): Promise<AppTrack[]> {
    const branchId = `library_${source}_${this.refillCount}`;
    try {
      let tracks: any[];
      if (source === "saved") {
        tracks = await SpotifyAPI.getSavedTracks(50, 0);
      } else {
        const ranges: Array<"short_term" | "medium_term" | "long_term"> = [
          "short_term", "medium_term", "long_term",
        ];
        const range = ranges[this.refillCount % 3];
        tracks = await SpotifyAPI.getTopTracks(range, 50);
      }

      const filtered = tracks.filter(
        (t: any) => t && t.id && !this.profile.seenTrackIds.has(t.id)
      );

      // Shuffle library tracks so they don't appear in the same order
      for (let i = filtered.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [filtered[i], filtered[j]] = [filtered[j], filtered[i]];
      }

      console.log(`Library (${source}): ${filtered.length} tracks`);
      return filtered.map((t: any) => toAppTrack(t, [], branchId, "library", "safe", { searchQuery: `Your ${source} tracks` }));
    } catch {
      return [];
    }
  }

  // ================================================
  // STRATEGY 7: Corpus co-occurrence (the real one)
  // "Songs that sit next to your likes on real people's playlists."
  // Queries OUR Postgres corpus (fed passively by strategies 2/3),
  // so it costs zero Spotify search calls — just one batch hydrate.
  // ================================================
  private async corpusCooccurrence(): Promise<AppTrack[]> {
    const likedIds = this.likedTracks.map((t) => t.id);
    if (likedIds.length < 3) return [];

    const branchId = `corpus_${this.refillCount}`;
    try {
      const res = await fetch("/api/reco/cooccur", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          liked: likedIds.slice(-25),
          seen: Array.from(this.profile.seenTrackIds).slice(-300),
          limit: 20,
        }),
      });
      if (!res.ok) return [];

      const data = await res.json();
      const ids: string[] = (data.candidates || [])
        .map((c: { trackId: string }) => c.trackId)
        .filter((id: string) => id && !this.profile.seenTrackIds.has(id))
        .slice(0, 15);
      if (ids.length === 0) return [];

      const tracks = await SpotifyAPI.getTracks(ids);
      const fresh = tracks.filter(
        (t: any) => t && t.id && !this.profile.seenTrackIds.has(t.id)
      );

      console.log(`Corpus co-occurrence: ${fresh.length} tracks from our index`);
      this.registerBranch(branchId, []);
      return fresh.map((t: any) =>
        toAppTrack(t, [], branchId, "corpus_cooccur", "edge", {
          searchQuery: "playlist co-occurrence (corpus)",
        })
      );
    } catch (err) {
      console.log("Corpus co-occurrence failed:", err);
      return [];
    }
  }

  private registerBranch(branchId: string, genres: string[]): void {
    this.profile.branches.set(branchId, {
      id: branchId, sourceArtistId: "", sourceGenres: genres,
      trackIds: [], likes: 0, dislikes: 0, confidence: 0.6,
    });
  }

  // Get the next seed artist to search
  private getNextSeedArtist(): string | null {
    while (this.artistSearchIndex < this.seeds.seedArtists.length) {
      const artist = this.seeds.seedArtists[this.artistSearchIndex++];
      if (!this.searchedArtists.has(artist.toLowerCase())) {
        return artist;
      }
    }
    return null;
  }

  // ================================================
  // POOL REFILL — orchestrates all strategies
  // ================================================
  async refillPool(): Promise<void> {
    if (this.isRefilling) return;
    this.isRefilling = true;
    this.refillCount++;

    try {
      const promises: Promise<AppTrack[]>[] = [];

      if (this.totalSwipes < 5) {
        // ─── COLD START ───
        // Use playlist seeds for discovery + playlist name search + some library

        // 1. Search for playlists matching the playlist name (collaborative filtering!)
        promises.push(this.playlistNameSearch());

        // 2. Search for 2-3 seed artists from playlist-name mapping
        for (let i = 0; i < 3; i++) {
          const artist = this.getNextSeedArtist();
          if (artist) {
            promises.push(this.searchArtist(artist, this.seeds.genres));
          }
        }

        // 3. Playlist co-occurrence from a seed artist
        const coArtist = this.getNextSeedArtist();
        if (coArtist) {
          promises.push(this.playlistCoOccurrence(coArtist, this.seeds.genres));
        }

        // 4. One query search from seeds
        promises.push(this.querySearch());

        // 5. Small amount of library (shuffled)
        promises.push(this.userLibrary("top"));

      } else if (this.likedTracks.length > 0) {
        // ─── WARM/HOT PHASE ───
        // Driven by what the user actually liked

        // The real collaborative filter — runs every refill once there are
        // ≥3 likes (it self-gates), alongside whichever mix is rolled below.
        promises.push(this.corpusCooccurrence());

        const recentLiked = this.likedTracks.slice(-8);
        const pick = recentLiked[Math.floor(Math.random() * recentLiked.length)];

        const r = Math.random();

        if (r < 0.30) {
          // Artist search + playlist co-occurrence from liked track
          promises.push(this.searchArtist(pick.artistNames[0], pick.genres));
          promises.push(this.playlistCoOccurrence(pick.artistNames[0], pick.genres));
          // Also try another liked track's artist
          const pick2 = recentLiked[Math.floor(Math.random() * recentLiked.length)];
          if (pick2.id !== pick.id) {
            promises.push(this.searchArtist(pick2.artistNames[0], pick2.genres));
          }
          promises.push(this.querySearch());

        } else if (r < 0.55) {
          // Playlist co-occurrence heavy (user's core idea!)
          promises.push(this.playlistCoOccurrence(pick.artistNames[0], pick.genres));
          promises.push(this.playlistCoOccurrence(pick.name, pick.genres)); // by song name too
          promises.push(this.playlistNameSearch());

        } else if (r < 0.70) {
          // Album deep dive + search
          if (pick.artistIds[0]) {
            promises.push(this.albumDeepDive(pick.artistIds[0], pick.genres));
          }
          promises.push(this.searchArtist(pick.artistNames[0], pick.genres));
          promises.push(this.querySearch());

        } else if (r < 0.85) {
          // Seed artist search (from playlist theme) + co-occurrence
          const seedArtist = this.getNextSeedArtist();
          if (seedArtist) {
            promises.push(this.searchArtist(seedArtist, this.seeds.genres));
            promises.push(this.playlistCoOccurrence(seedArtist, this.seeds.genres));
          }
          promises.push(this.querySearch());

        } else {
          // Library refresh + new seed discovery
          promises.push(this.userLibrary(this.refillCount % 2 === 0 ? "saved" : "top"));
          const seedArtist = this.getNextSeedArtist();
          if (seedArtist) {
            promises.push(this.searchArtist(seedArtist, this.seeds.genres));
          }
          promises.push(this.querySearch());
        }

      } else {
        // ─── NO LIKES YET (past cold start) ───
        // Keep searching seed artists + playlists
        for (let i = 0; i < 3; i++) {
          const artist = this.getNextSeedArtist();
          if (artist) {
            promises.push(this.searchArtist(artist, this.seeds.genres));
          }
        }
        promises.push(this.playlistNameSearch());
        promises.push(this.querySearch());
      }

      const results = await Promise.allSettled(promises);
      const allCandidates: AppTrack[] = [];
      const candidateIds = new Set<string>();

      for (const result of results) {
        if (result.status === "fulfilled") {
          for (const track of result.value) {
            if (
              track.id &&
              !this.profile.seenTrackIds.has(track.id) &&
              !this.queue.find((t) => t.id === track.id) &&
              !candidateIds.has(track.id)
            ) {
              allCandidates.push(track);
              candidateIds.add(track.id);
            }
          }
        }
      }

      console.log(`Refill #${this.refillCount}: ${allCandidates.length} candidates`);

      // Emergency fallback
      if (allCandidates.length === 0) {
        const lib = await this.userLibrary(this.refillCount % 2 === 0 ? "top" : "saved");
        for (const t of lib) {
          if (!this.profile.seenTrackIds.has(t.id) && !this.queue.find((q) => q.id === t.id)) {
            allCandidates.push(t);
          }
        }
        console.log(`Emergency library: ${allCandidates.length} tracks`);
      }

      if (allCandidates.length === 0) {
        this.isRefilling = false;
        return;
      }

      // Score, rank, light shuffle for variety
      const ranked = rankCandidates(
        allCandidates, this.profile, this.profile.branches, this.likedTracks
      );

      // Attach debug score info to each track
      const totalCandidates = ranked.length;
      for (let i = 0; i < ranked.length; i++) {
        const r = ranked[i];
        if (!r.track._debug) r.track._debug = {};
        r.track._debug.score = {
          vibeFit: Math.round(r.score.vibeFit * 100) / 100,
          genreProximity: Math.round(r.score.genreProximity * 100) / 100,
          sequenceFit: Math.round(r.score.sequenceFit * 100) / 100,
          artistDiversity: Math.round(r.score.artistDiversity * 100) / 100,
          branchHealth: Math.round(r.score.branchHealth * 100) / 100,
          novelty: Math.round(r.score.novelty * 100) / 100,
          popularityFit: Math.round(r.score.popularityFit * 100) / 100,
          total: Math.round(r.score.total * 100) / 100,
        };
        r.track._debug.rank = i + 1;
        r.track._debug.totalCandidates = totalCandidates;
        r.track._debug.refillRound = this.refillCount;
      }

      const topN = Math.max(5, Math.ceil(ranked.length * 0.7));
      const topTracks = ranked.slice(0, topN).map((r) => r.track);

      // Light shuffle: swap within window of 3 to avoid robotic ordering
      for (let i = topTracks.length - 1; i > 0; i--) {
        const j = i - Math.floor(Math.random() * Math.min(3, i));
        [topTracks[i], topTracks[j]] = [topTracks[j], topTracks[i]];
      }

      this.queue.push(...topTracks);
      console.log(`Queue: ${this.queue.length} tracks`);
    } catch (err) {
      console.error("Refill error:", err);
    } finally {
      this.isRefilling = false;
    }
  }

  getGenreWeights(): Record<string, number> {
    const obj: Record<string, number> = {};
    for (const [genre, weight] of this.profile.genreWeights) {
      if (weight > 0.05) obj[genre] = Math.round(weight * 100) / 100;
    }
    return obj;
  }
}
