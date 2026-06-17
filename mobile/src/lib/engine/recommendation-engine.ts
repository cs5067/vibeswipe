import type { AppTrack } from "../../types/track";
import type { TasteProfile, Branch } from "../../types/taste";
import { buildTasteProfile, estimateTrackEnergy } from "./taste-profile";
import { rankCandidates } from "./scoring";
import { generateSeeds, type PlaylistSeeds } from "./playlist-seeds";
import * as SpotifyAPI from "../spotify/client";
import * as ServerAPI from "../server-api";

function toAppTrack(
  track: any,
  genres: string[],
  branchId: string,
  strategy: string,
  sourceType: "safe" | "edge" | "jump" = "safe",
  debugExtra?: {
    searchQuery?: string;
    playlistName?: string;
    matchedBecause?: string;
    matchedTrackName?: string;
    overlapCount?: number;
    overlapTarget?: number;
    matchedTrackNames?: string[];
  }
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
      matchedBecause: debugExtra?.matchedBecause,
      matchedTrackName: debugExtra?.matchedTrackName,
      overlapCount: debugExtra?.overlapCount,
      overlapTarget: debugExtra?.overlapTarget,
      matchedTrackNames: debugExtra?.matchedTrackNames,
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
  private baseGenreWeights = new Map<string, number>();
  private swipeStartTime = 0;
  private totalSwipes = 0;
  private refillCount = 0;
  private statusMessage = "Getting recommendations ready...";
  private playlistSearchCooldownUntil = 0;

  // Seeds from playlist name interpretation
  private seeds!: PlaylistSeeds;
  private selectedVibes: string[] = [];

  // Dedup tracking
  private searchedArtists = new Set<string>();
  private searchedQueries = new Set<string>();
  private exploredPlaylistIds = new Set<string>();
  private checkedOverlapPlaylists = new Set<string>();
  private artistSearchIndex = 0;  // which seed artist to search next
  private querySearchIndex = 0;   // which query to use next

  private getSpecificIntentTerms(): string[] {
    const lower = this.playlistName.toLowerCase();
    if (lower.includes("sudan") || lower.includes("سودان")) {
      return ["sudan", "sudanese", "سودان", "سوداني", "اغاني سودانية", "nubian"];
    }
    return [];
  }

  private matchesSpecificIntent(track: AppTrack): boolean {
    const terms = this.getSpecificIntentTerms();
    if (terms.length === 0) return true;

    const haystack = [
      track.name,
      ...track.artistNames,
      ...track.genres,
      track._debug?.searchQuery || "",
      track._debug?.playlistName || "",
      track.strategy || "",
    ].join(" ").toLowerCase();

    return terms.some((term) => haystack.includes(term.toLowerCase()));
  }

  async initialize(
    playlistName?: string,
    selectedVibes?: string[],
    initialLikedTracks: AppTrack[] = []
  ): Promise<void> {
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
    this.baseGenreWeights = new Map(this.profile.genreWeights);
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

    if (initialLikedTracks.length > 0) {
      this.likedTracks = initialLikedTracks.filter((track, index, tracks) =>
        tracks.findIndex((candidate) => candidate.id === track.id) === index
      );
      this.rebuildLikedSessionProfile();
      console.log(`Engine init: hydrated ${this.likedTracks.length} saved liked tracks`);
    }

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

  getStatusMessage(): string {
    return this.statusMessage;
  }

  async getNextTrack(): Promise<AppTrack | null> {
    if (!this.initialized) return null;
    if (this.queue.length === 0 && Date.now() < this.playlistSearchCooldownUntil) {
      return null;
    }
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
    if (this.likedTracks.some((liked) => liked.id === track.id)) return;

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

    // A like is a strong steering signal. Keep a small, on-intent queue so
    // the next refill can react to this exact song instead of draining old candidates.
    this.queue = this.queue
      .filter((candidate) => this.matchesSpecificIntent(candidate))
      .slice(0, 6);
  }

  /**
   * The playlist screen can remove right-swiped songs after the engine has
   * already learned from them. Keep the engine's private session memory in
   * lockstep with the actual playlist so removed songs stop steering results.
   */
  syncLikedTracks(currentLikedTracks: AppTrack[]): { changed: boolean; removed: boolean } {
    if (!this.initialized) return { changed: false, removed: false };

    const uniqueLiked = currentLikedTracks.filter((track, index, tracks) =>
      tracks.findIndex((candidate) => candidate.id === track.id) === index
    );
    const previousIds = new Set(this.likedTracks.map((track) => track.id));
    const nextIds = new Set(uniqueLiked.map((track) => track.id));
    const changed =
      previousIds.size !== nextIds.size ||
      uniqueLiked.some((track) => !previousIds.has(track.id));
    const removed = Array.from(previousIds).some((id) => !nextIds.has(id));

    if (!changed) return { changed: false, removed: false };

    this.likedTracks = uniqueLiked;
    this.rebuildLikedSessionProfile();
    this.checkedOverlapPlaylists.clear();

    // If songs were removed, queued cards may have been produced by the old
    // liked set. Clear them so the next stack reflects the remaining songs.
    this.queue = removed
      ? []
      : this.queue.filter((candidate) =>
          this.matchesSpecificIntent(candidate) &&
          !nextIds.has(candidate.id)
        );

    console.log(
      `Engine liked sync: ${this.likedTracks.length} active likes${removed ? " after removal" : ""}`
    );

    return { changed: true, removed };
  }

  private rebuildLikedSessionProfile(): void {
    this.profile.likedArtistIds = new Set();
    this.profile.likedGenres = new Map();
    this.profile.lastLikedTracks = [];
    this.profile.genreWeights = new Map(this.baseGenreWeights);

    for (const track of this.likedTracks) {
      for (const id of track.artistIds) this.profile.likedArtistIds.add(id);
      for (const genre of track.genres) {
        const g = genre.toLowerCase();
        const cur = this.profile.genreWeights.get(g) || 0;
        this.profile.genreWeights.set(g, Math.min(cur + 0.12, 1.5));
        this.profile.likedGenres.set(g, (this.profile.likedGenres.get(g) || 0) + 1);
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
          // FIXED: Always offset=0
          const data = await SpotifyAPI.getPlaylistTracks(playlist.id, 30, 0);
          ServerAPI.ingestPlaylist(playlist.id, playlist.name || null, (data as any).total ?? null, data.items || []);
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
  // STRATEGY 2B: Exact playlist overlap from the whole liked set
  // Spotify has no "playlists containing track X" endpoint, so we:
  // 1. Search plausible playlists from the liked track + session name
  // 2. Fetch playlist tracks
  // 3. Trust only playlists that actually contain the liked track
  // 4. Recommend the other tracks from those verified playlists
  // ================================================
  private async playlistOverlapFromLikedSet(seedTrack?: AppTrack): Promise<AppTrack[]> {
    const likedSet = this.likedTracks.slice(-8);
    if (seedTrack && !likedSet.some((track) => track.id === seedTrack.id)) {
      likedSet.push(seedTrack);
    }
    if (likedSet.length === 0) return [];

    const primaryTrack = seedTrack || likedSet[likedSet.length - 1];
    const artistName = primaryTrack.artistNames[0] || "";
    const branchId = `overlap_set_${primaryTrack.id.slice(0, 8)}`;
    // Any-overlap is the point (a playlist containing even ONE of your liked
    // songs is signal — the John/Michael model). Demanding the full set made
    // matches near-impossible and starved the queue. Tighten to 2 only once
    // there are enough likes for that to be realistic.
    const minOverlap = likedSet.length >= 4 ? 2 : 1;
    // Queries must NOT be prefixed with the session/playlist name — that
    // polluted every search ("Yur The Weeknd") and returned garbage.
    const queries = [
      `${primaryTrack.name} ${artistName}`,
      likedSet.map((track) => track.artistNames[0]).filter(Boolean).slice(-3).join(" "),
      artistName,
    ].filter((q, index, arr) => q.trim().length > 0 && arr.indexOf(q) === index);

    const playlistMatches: Array<{
      playlistName: string;
      query: string;
      tracks: any[];
      matched: AppTrack[];
      overlapCount: number;
    }> = [];
    let scannedPlaylists = 0;
    let verifiedPlaylists = 0;

    const maxQueries = likedSet.length <= 2 ? 2 : 3;

    for (const query of queries.slice(0, maxQueries)) {
      try {
        console.log(`Overlap search: "${query}" for ${likedSet.length} liked songs`);
        const playlists = await SpotifyAPI.searchPlaylists(query, 3);
        const valid = playlists.filter((p) => p?.id);
        console.log(`Overlap search "${query}": ${valid.length} playlist candidates`);

        for (const playlist of valid.slice(0, 2)) {
          const scanKey = `${likedSet.map((track) => track.id).join(",")}:${playlist.id}`;
          if (this.checkedOverlapPlaylists.has(scanKey)) continue;
          this.checkedOverlapPlaylists.add(scanKey);
          scannedPlaylists++;

          try {
            const data = await SpotifyAPI.getPlaylistTracks(playlist.id, 100, 0);
            ServerAPI.ingestPlaylist(playlist.id, playlist.name || null, (data as any).total ?? null, data.items || []);
            const playlistTracks = (data.items || [])
              .map((item: any) => item?.track)
              .filter((t: any) => t && t.id);

            const matched = likedSet.filter((liked) =>
              playlistTracks.some((candidate: any) => this.isSameTrack(candidate, liked))
            );

            if (matched.length < minOverlap) continue;

            verifiedPlaylists++;
            console.log(
              `Exact set overlap: "${playlist.name}" contains ${matched.length}/${likedSet.length} liked songs`
            );
            playlistMatches.push({
              playlistName: playlist.name,
              query,
              tracks: playlistTracks,
              matched,
              overlapCount: matched.length,
            });
          } catch {
            // Skip unavailable or private playlists.
          }
        }
      } catch (err) {
        console.log(`Overlap search "${query}" failed:`, err);
      }
    }

    playlistMatches.sort((a, b) => b.overlapCount - a.overlapCount);

    const allTracks: AppTrack[] = [];
    const addedIds = new Set<string>();
    for (const match of playlistMatches.slice(0, 3)) {
      for (const t of match.tracks) {
        if (
          !t?.id ||
          likedSet.some((liked) => this.isSameTrack(t, liked)) ||
          this.profile.seenTrackIds.has(t.id) ||
          this.queue.some((queued) => queued.id === t.id) ||
          addedIds.has(t.id)
        ) {
          continue;
        }

        addedIds.add(t.id);
        allTracks.push(
          toAppTrack(t, primaryTrack.genres, branchId, "playlist_overlap", "safe", {
            searchQuery: match.query,
            playlistName: match.playlistName,
            matchedBecause: `This playlist matched ${match.overlapCount} of your ${likedSet.length} liked songs.`,
            matchedTrackName: match.matched[0]?.name,
            overlapCount: match.overlapCount,
            overlapTarget: likedSet.length,
            matchedTrackNames: match.matched.map((track) => track.name),
          })
        );
      }
    }

    if (allTracks.length > 0) {
      this.registerBranch(branchId, primaryTrack.genres);
      const branch = this.profile.branches.get(branchId);
      if (branch) branch.confidence = 0.9;
      console.log(`Exact overlap produced ${allTracks.length} tracks from ${verifiedPlaylists} verified playlists`);
    } else {
      console.log(`No exact set overlap found after scanning ${scannedPlaylists} playlists`);
    }

    return allTracks;
  }

  // ================================================
  // STRATEGY 2C: Corpus co-occurrence (the real index)
  // Asks OUR Postgres corpus "which songs sit next to my liked songs on
  // real playlists" — the direct lookup Spotify's API cannot do. The
  // corpus is fed by every playlist any session scans (see ingestPlaylist
  // calls), so it widens with use. Kicks in from 2 likes.
  // ================================================
  private async corpusCooccurrence(): Promise<AppTrack[]> {
    const likedIds = this.likedTracks.map((t) => t.id);
    if (likedIds.length < 2) return [];

    const branchId = `corpus_${this.refillCount}`;
    try {
      const candidates = await ServerAPI.corpusRecommend(
        likedIds.slice(-25),
        Array.from(this.profile.seenTrackIds).slice(-300),
        20
      );
      const ids = candidates
        .map((c) => c.trackId)
        .filter((id) => id && !this.profile.seenTrackIds.has(id))
        .slice(0, 15);
      if (ids.length === 0) return [];

      const byId = new Map(candidates.map((c) => [c.trackId, c]));
      const tracks = await SpotifyAPI.getTracks(ids);
      const fresh = tracks.filter((t: any) => t && t.id && !this.profile.seenTrackIds.has(t.id));

      console.log(`Corpus co-occurrence: ${fresh.length} tracks from our index`);
      this.registerBranch(branchId, []);
      const branch = this.profile.branches.get(branchId);
      if (branch) branch.confidence = 0.9;

      return fresh.map((t: any) => {
        const c = byId.get(t.id);
        return toAppTrack(t, [], branchId, "corpus_cooccur", "edge", {
          searchQuery: "our playlist index",
          matchedBecause: c
            ? `Sits alongside your liked songs on ${c.sharedPlaylists} real playlist${c.sharedPlaylists === 1 ? "" : "s"}.`
            : undefined,
        });
      });
    } catch (err) {
      console.log("Corpus co-occurrence failed:", err);
      return [];
    }
  }

  // ================================================
  // STRATEGY 2D: Last.fm similar tracks (borrowed scale)
  // "People who play X also play Y", computed from millions of real
  // Last.fm listeners. Carries quality while our own corpus densifies.
  // Names come back from Last.fm; we resolve a handful via Spotify search.
  // ================================================
  private async lastfmSimilar(seed: AppTrack): Promise<AppTrack[]> {
    const artist = seed.artistNames[0];
    if (!artist) return [];

    const cacheKey = `lastfm:${seed.id}`;
    if (this.searchedQueries.has(cacheKey)) return [];
    this.searchedQueries.add(cacheKey);

    const branchId = `lastfm_${seed.id.slice(0, 8)}`;
    try {
      const similar = await ServerAPI.lastfmSimilar(artist, seed.name, 12);
      if (similar.length === 0) return [];

      const out: AppTrack[] = [];
      // Resolve only a handful per refill to keep Spotify calls bounded.
      for (const s of similar.slice(0, 6)) {
        try {
          const res = await SpotifyAPI.search(`${s.name} ${s.artist}`, ["track"], 3, 0);
          const hit = (res.tracks?.items || []).find(
            (t: any) =>
              t &&
              t.id &&
              !this.profile.seenTrackIds.has(t.id) &&
              (t.artists || []).some((a: any) =>
                String(a?.name || "").toLowerCase().includes(s.artist.toLowerCase().slice(0, 12))
              )
          );
          if (hit) {
            out.push(
              toAppTrack(hit, seed.genres, branchId, "lastfm_similar", "edge", {
                searchQuery: `${s.name} — ${s.artist}`,
                matchedBecause: `People who play "${seed.name}" also play this (Last.fm, ${Math.round(s.match * 100)}% match).`,
              })
            );
          }
        } catch {
          /* skip this similar track */
        }
      }

      console.log(`Last.fm similar to "${seed.name}": ${out.length} resolved`);
      if (out.length > 0) {
        this.registerBranch(branchId, seed.genres);
        const branch = this.profile.branches.get(branchId);
        if (branch) branch.confidence = 0.8;
      }
      return out;
    } catch (err) {
      console.log("Last.fm similar failed:", err);
      return [];
    }
  }

  private isSameTrack(spotifyTrack: any, appTrack: AppTrack): boolean {
    if (spotifyTrack?.id && spotifyTrack.id === appTrack.id) return true;

    const spotifyName = String(spotifyTrack?.name || "").toLowerCase().trim();
    const appName = appTrack.name.toLowerCase().trim();
    const spotifyArtists = (spotifyTrack?.artists || [])
      .map((artist: any) => String(artist?.name || "").toLowerCase())
      .join(" ");
    const appArtists = appTrack.artistNames.join(" ").toLowerCase();

    return spotifyName === appName && appTrack.artistNames.some((artist) =>
      spotifyArtists.includes(artist.toLowerCase()) || appArtists.includes(artist.toLowerCase())
    );
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
          const data = await SpotifyAPI.getPlaylistTracks(playlist.id, 40, 0);
          ServerAPI.ingestPlaylist(playlist.id, playlist.name || null, (data as any).total ?? null, data.items || []);
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
      const intentTerms = this.getSpecificIntentTerms();
      if (intentTerms.length > 0) {
        query = `${this.playlistName} ${liked.artistNames[0]}`;
      } else {
        const moods = ["vibes", "chill", "hype", "late night", "feels", "energy", "mood", "similar to"];
        const mood = moods[Math.floor(Math.random() * moods.length)];
        query = `${mood} ${liked.artistNames[0]}`;
      }
      if (this.searchedQueries.has(query.toLowerCase())) {
        query = `${this.playlistName} ${liked.name}`;
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
    if (this.likedTracks.length > 0 && Date.now() < this.playlistSearchCooldownUntil) {
      return;
    }
    this.isRefilling = true;
    this.refillCount++;

    try {
      const promises: Promise<AppTrack[]>[] = [];

      if (this.likedTracks.length > 0) {
        // ─── PLAYLIST-FIRST PHASE ───
        // Once the user has liked songs, prioritize other Spotify playlists
        // that contain those songs. Artist/query search is only a cold-start
        // fallback, not the main engine for active playlists.
        const recentLiked = this.likedTracks.slice(-8);
        const pick = recentLiked[Math.floor(Math.random() * recentLiked.length)];
        const strictIntent = this.getSpecificIntentTerms().length > 0;

        console.log(
          `Playlist-first refill: ${recentLiked.length} liked song${recentLiked.length === 1 ? "" : "s"}`
        );
        this.statusMessage = `Searching Spotify playlists that match your ${recentLiked.length} liked song${recentLiked.length === 1 ? "" : "s"}...`;

        // The corpus is the primary source once there are >=2 likes —
        // a direct "playlists containing these songs" lookup, no name
        // guessing. (Self-gates below 2 likes / when server unreachable.)
        promises.push(this.corpusCooccurrence());

        // Borrowed collaborative filtering from Last.fm's millions of
        // listeners — strongest while our own corpus is still young.
        promises.push(this.lastfmSimilar(pick));

        if (recentLiked.length <= 2) {
          // Never let early likes ride on a single strategy — that was the
          // starvation bug. Overlap + co-occurrence + name search together.
          promises.push(this.playlistOverlapFromLikedSet(recentLiked[recentLiked.length - 1]));
          promises.push(this.playlistCoOccurrence(pick.artistNames[0], pick.genres));
          promises.push(this.playlistNameSearch());
          promises.push(this.searchArtist(pick.artistNames[0], pick.genres));

        } else if (strictIntent) {
          // Specific country/culture sessions should stay anchored to the named intent.
          promises.push(this.playlistOverlapFromLikedSet(recentLiked[recentLiked.length - 1]));
          promises.push(this.playlistCoOccurrence(pick.artistNames[0], pick.genres));
          promises.push(this.playlistCoOccurrence(pick.name, pick.genres));
          promises.push(this.playlistNameSearch());

        } else {
          // Playlist-first discovery from the liked set.
          const r = Math.random();

          if (r < 0.30) {
            // Exact overlap + playlist co-occurrence from liked track.
            promises.push(this.playlistOverlapFromLikedSet(pick));
            promises.push(this.playlistCoOccurrence(pick.artistNames[0], pick.genres));
            const pick2 = recentLiked[Math.floor(Math.random() * recentLiked.length)];
            if (pick2.id !== pick.id) {
              promises.push(this.playlistCoOccurrence(pick2.artistNames[0], pick2.genres));
            }
            promises.push(this.playlistNameSearch());

          } else if (r < 0.55) {
            // Playlist co-occurrence heavy (user's core idea!)
            promises.push(this.playlistOverlapFromLikedSet(pick));
            promises.push(this.playlistCoOccurrence(pick.artistNames[0], pick.genres));
            promises.push(this.playlistCoOccurrence(pick.name, pick.genres));
            promises.push(this.playlistNameSearch());

          } else {
            // Broaden through playlists related to the playlist name and liked artists.
            promises.push(this.playlistOverlapFromLikedSet(recentLiked[recentLiked.length - 1]));
            promises.push(this.playlistNameSearch());
            for (const liked of recentLiked.slice(-3)) {
              promises.push(this.playlistCoOccurrence(liked.artistNames[0], liked.genres));
            }
          }
        }

      } else if (this.totalSwipes < 5) {
        // ─── COLD START ───
        // Use playlist seeds for discovery + playlist name search + some library
        const lastLike = this.likedTracks[this.likedTracks.length - 1];
        if (lastLike) {
          promises.push(this.playlistOverlapFromLikedSet(lastLike));
        }

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
      this.statusMessage = `Found ${allCandidates.length} playlist candidates.`;

      const intentMatches = allCandidates.filter((track) => this.matchesSpecificIntent(track));
      if (intentMatches.length >= 5) {
        allCandidates.length = 0;
        allCandidates.push(...intentMatches);
        console.log(`Intent guardrail kept ${allCandidates.length} candidates for "${this.playlistName}"`);
      }

      // Emergency fallback — the deck must NEVER starve. If playlist-first
      // came back empty, widen: artist searches from liked tracks, then
      // library. (Previously this hard-returned with nothing, killing the
      // queue after ~60 cards.)
      if (allCandidates.length === 0) {
        const playlistError = SpotifyAPI.getLastPlaylistSearchError();
        if (playlistError?.status === 429) {
          this.statusMessage =
            "Spotify is rate-limiting playlist search right now. Easing off for a minute.";
          this.playlistSearchCooldownUntil = Date.now() + 60_000;
        }

        if (this.likedTracks.length > 0) {
          console.log("Playlist-first empty: widening to artist search + library");
          const recent = this.likedTracks.slice(-3);
          const widen = await Promise.allSettled(
            recent.map((t) => this.searchArtist(t.artistNames[0], t.genres))
          );
          for (const r of widen) {
            if (r.status === "fulfilled") {
              for (const t of r.value) {
                if (!this.profile.seenTrackIds.has(t.id) && !candidateIds.has(t.id)) {
                  allCandidates.push(t);
                  candidateIds.add(t.id);
                }
              }
            }
          }
        }

        if (allCandidates.length === 0) {
          const lib = await this.userLibrary(this.refillCount % 2 === 0 ? "top" : "saved");
          for (const t of lib) {
            if (!this.profile.seenTrackIds.has(t.id) && !this.queue.find((q) => q.id === t.id)) {
              allCandidates.push(t);
            }
          }
          console.log(`Emergency library: ${allCandidates.length} tracks`);
        }
      }

      if (allCandidates.length === 0) {
        this.isRefilling = false;
        return;
      }

      // Score, rank, light shuffle for variety
      const ranked = rankCandidates(
        allCandidates, this.profile, this.profile.branches, this.likedTracks
      );

      ranked.sort((a, b) => {
        const priority = (track: AppTrack) => track.strategy === "playlist_overlap" ? 1 : 0;
        return priority(b.track) - priority(a.track) || b.score.total - a.score.total;
      });

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
      this.statusMessage = `Ready: ${this.queue.length} playlist-based recommendations queued.`;
      console.log(`Queue: ${this.queue.length} tracks`);
    } catch (err) {
      console.error("Refill error:", err);
    } finally {
      this.isRefilling = false;
    }
  }

  async getReactiveTracksAfterLike(count = 5): Promise<AppTrack[]> {
    await this.refillPool();

    const tracks: AppTrack[] = [];
    for (let i = 0; i < count; i++) {
      const track = await this.getNextTrack();
      if (track) tracks.push(track);
    }
    return tracks;
  }

  getGenreWeights(): Record<string, number> {
    const obj: Record<string, number> = {};
    for (const [genre, weight] of this.profile.genreWeights) {
      if (weight > 0.05) obj[genre] = Math.round(weight * 100) / 100;
    }
    return obj;
  }
}
