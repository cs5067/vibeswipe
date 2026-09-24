import type { AppTrack } from "../../types/track";
import type { TasteProfile, Branch } from "../../types/taste";
import { buildTasteProfile, estimateTrackEnergy } from "./taste-profile";
import { rankCandidates } from "./scoring";
import { rankWithNative } from "./native-ranking";
import { generateSeeds, type PlaylistSeeds } from "./playlist-seeds";
import * as SpotifyAPI from "../spotify/client";
import * as ServerAPI from "../server-api";
import { loadSeen, rememberSeen } from "./playlist-memory";

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
 * Mobile recommendation session.
 *
 * Retrieve candidates from corpus co-occurrence, Last.fm, authorized playlists
 * and track/artist searches. Arbitrary public-playlist strategies require
 * approved extended access; a mode flag cannot grant that permission.
 *
 * Likes are the session's anchors. Revisions prevent an older retrieval from
 * repopulating the queue after those anchors change. Ranking retains corpus
 * evidence before applying taste heuristics; full-set-first SQL is still TODO.
 * Debug metadata names the actual source, including generic fallback searches.
 */
export class RecommendationEngine {
  private profile!: TasteProfile;
  private queue: AppTrack[] = [];
  private refillPromise: Promise<void> | null = null;
  private likedRevision = 0;
  private initialized = false;
  private initializationPromise: Promise<void> | null = null;
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

  initialize(
    playlistName?: string,
    selectedVibes?: string[],
    initialLikedTracks: AppTrack[] = []
  ): Promise<void> {
    if (this.initializationPromise) return this.initializationPromise;
    this.initializationPromise = this.initializeSession(playlistName, selectedVibes, initialLikedTracks)
      .finally(() => { this.initializationPromise = null; });
    return this.initializationPromise;
  }

  private async initializeSession(
    playlistName?: string,
    selectedVibes?: string[],
    initialLikedTracks: AppTrack[] = []
  ): Promise<void> {
    this.playlistName = playlistName || "My Playlist";
    this.selectedVibes = selectedVibes || [];

    console.log("Engine init: step 1 — fetching user data");

    // Fetch sequentially; each failure is isolated and respects the shared cooldown.
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

    // Restore this playlist's swipe memory from previous app sessions so
    // "continue" actually continues — decided cards never re-deal.
    try {
      const seen = await loadSeen(this.playlistName);
      for (const id of seen) this.profile.seenTrackIds.add(id);
      if (seen.length > 0) {
        console.log(`Engine init: restored ${seen.length} previously swiped tracks`);
      }
    } catch {
      /* memory is a nicety — never block init on it */
    }

    if (initialLikedTracks.length > 0) {
      this.likedTracks = initialLikedTracks.filter((track, index, tracks) =>
        tracks.findIndex((candidate) => candidate.id === track.id) === index
      );
      // Liked songs are decided — never re-deal them either.
      for (const t of this.likedTracks) this.profile.seenTrackIds.add(t.id);
      this.rebuildLikedSessionProfile();
      console.log(`Engine init: hydrated ${this.likedTracks.length} saved liked tracks`);
    }

    console.log(`Engine v6 initialized:`);
    console.log(`  ${this.profile.anchorArtists.length} anchor artists, ${this.profile.genreWeights.size} genres`);
    console.log(`  ${this.seeds.seedArtists.length} seed artists, ${this.seeds.searchQueries.length} search queries`);

    await this.refillPool();
  }

  /** Put unswiped cards back at the FRONT of the queue — used when the
   *  swipe screen unmounts (e.g. user checks their playlist) so the same
   *  cards greet them on return. Queue-dealt tracks bypass the seen-filter,
   *  so requeued cards deal again fine. */
  requeue(tracks: AppTrack[]): void {
    if (tracks.length === 0) return;
    const queuedIds = new Set(this.queue.map((t) => t.id));
    const fresh = tracks.filter((t) => !queuedIds.has(t.id));
    this.queue.unshift(...fresh);
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
    if (this.queue.length === 0) await this.refillPool();
    const track = this.queue.shift() || null;
    if (track) {
      this.profile.seenTrackIds.add(track.id);
      this.swipeStartTime = Date.now();
    }
    if (track && this.queue.length < 8) void this.refillPool();
    return track;
  }

  recordSwipe(track: AppTrack, direction: "left" | "right" | "down"): void {
    this.totalSwipes++;
    // Persist the decision so continuing this playlist in a later app
    // session never re-deals it.
    rememberSeen(this.playlistName, track.id);
    const timeToDecide = this.swipeStartTime > 0 ? Date.now() - this.swipeStartTime : 3000;

    this.profile.swipeSignals.push({
      trackId: track.id,
      direction,
      timeToDecideMs: timeToDecide,
      branchId: track.branchId || "unknown",
      timestamp: Date.now(),
    });

    const strength =
      direction === "left"
        ? timeToDecide < 1500 ? 1.2 : timeToDecide < 5000 ? 0.8 : 0.5
        : timeToDecide < 2000 ? 1.5 : timeToDecide < 5000 ? 1.0 : 0.7;

    if (direction === "right") this.handleLike(track, strength);
    else if (direction === "down") this.handleSaveToLiked(track, strength);
    else this.handleDislike(track, strength);
  }

  private handleLike(track: AppTrack, strength: number): void {
    if (this.likedTracks.some((liked) => liked.id === track.id)) return;

    this.likedTracks.push(track);
    this.likedRevision++;
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

    // A like changes the evidence. Rebuild instead of draining old candidates.
    this.queue = [];
  }

  /**
   * Swipe down: "I like this song, but it does NOT fit this playlist's vibe."
   * The song goes to the user's Spotify Liked Songs, NOT the playlist. So:
   * mild positive artist/genre signal (the user does like the music), but no
   * likedTracks entry and no branch confidence boost (the vibe did not match).
   */
  private handleSaveToLiked(track: AppTrack, strength: number): void {
    this.profile.seenTrackIds.add(track.id);
    for (const id of track.artistIds) this.profile.likedArtistIds.add(id);
    for (const genre of track.genres) {
      const g = genre.toLowerCase();
      const cur = this.profile.genreWeights.get(g) || 0;
      this.profile.genreWeights.set(g, Math.min(cur + 0.04 * strength, 1.5));
    }
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
    this.likedRevision++;
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
    if (!SpotifyAPI.supportsPublicPlaylistDiscovery()) return [];
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
    if (!SpotifyAPI.supportsPublicPlaylistDiscovery()) return [];
    const likedSet = this.likedTracks.slice(-8);
    if (seedTrack && !likedSet.some((track) => track.id === seedTrack.id)) {
      likedSet.push(seedTrack);
    }
    if (likedSet.length === 0) return [];

    // RATE DISCIPLINE: this strategy text-searches playlists and reads their
    // tracklists — the most expensive thing we do against Spotify. Run at
    // full cadence only early (≤2 likes); after that once every 3rd refill.
    // Burning 6–9 searches per refill here caused live 503s and starved the
    // passive corpus ingestion that rides on successful playlist reads.
    if (this.likedTracks.length > 2 && this.refillCount % 3 !== 0) {
      return [];
    }

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

    // One well-aimed query (track+artist — the one most likely to surface
    // playlists that genuinely contain it) instead of 2-3 broad ones.
    const maxQueries = 1;

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
  // calls), so it widens with use. Also works with one remaining like.
  // ================================================
  private async corpusCooccurrence(): Promise<AppTrack[]> {
    const likedIds = this.likedTracks.map((t) => t.id);
    if (likedIds.length === 0) return [];

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
        const track = toAppTrack(t, [], branchId, "corpus_cooccur", "edge", {
          searchQuery: "our playlist index",
          matchedBecause: c
            ? `Sits alongside your liked songs on ${c.sharedPlaylists} real playlist${c.sharedPlaylists === 1 ? "" : "s"}. Corpus score: ${Number(c.score).toFixed(3)}.`
            : undefined,
        });
        track.corpusScore = c && Number.isFinite(Number(c.score)) ? Number(c.score) : 0;
        return track;
      });
    } catch (err) {
      console.log("Corpus co-occurrence failed:", err);
      return [];
    }
  }

  // ================================================
  // STRATEGY 2E: The user's OWN playlists
  // If the session is called "Sudani" and the user HAS a playlist whose
  // name matches, that playlist is the single best source in existence —
  // hand-curated by the exact person we're recommending to. Reads use the
  // /me/playlists endpoint (not the rate-limited search surface). One-shot
  // per session; results also feed the corpus.
  // ================================================
  private ownPlaylistsChecked = false;

  private async ownPlaylistMatches(): Promise<AppTrack[]> {
    if (this.ownPlaylistsChecked) return [];
    this.ownPlaylistsChecked = true;

    try {
      const res = await SpotifyAPI.getMyPlaylists(50, 0);
      const mine = (res.items || []).filter((p) => p && p.id);
      if (mine.length === 0) return [];

      const words = this.playlistName
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 2);
      const matches = mine
        .filter((p) => {
          const n = (p.name || "").toLowerCase();
          return words.some((w) => n.includes(w));
        })
        .slice(0, 3);
      if (matches.length === 0) {
        console.log("Own playlists: no name matches for this vibe");
        return [];
      }

      const branchId = `own_${this.refillCount}`;
      const out: AppTrack[] = [];
      for (const pl of matches) {
        try {
          const data = await SpotifyAPI.getPlaylistTracks(pl.id, 100, 0);
          ServerAPI.ingestPlaylist(pl.id, pl.name || null, (data as any).total ?? null, data.items || []);
          const tracks = (data.items || [])
            .map((item: any) => item?.track)
            .filter((t: any) => t && t.id && !this.profile.seenTrackIds.has(t.id));
          console.log(`Own playlist "${pl.name}": ${tracks.length} fresh tracks`);
          for (const t of tracks) {
            out.push(
              toAppTrack(t, [], branchId, "own_playlist", "safe", {
                searchQuery: `your playlist: ${pl.name}`,
                playlistName: pl.name,
                matchedBecause: `From your own "${pl.name}" playlist — you already vouched for this.`,
              })
            );
          }
        } catch {
          /* skip unreadable playlist */
        }
      }

      if (out.length > 0) {
        this.registerBranch(branchId, []);
        const b = this.profile.branches.get(branchId);
        if (b) b.confidence = 0.95;
      }
      return out;
    } catch (err) {
      console.log("Own playlists lookup failed:", err);
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
    const spotifyArtists = new Set((spotifyTrack?.artists || [])
      .map((artist: any) => String(artist?.name || "").toLowerCase().trim())
      .filter(Boolean));
    return spotifyName.length > 0 && spotifyName === appName &&
      appTrack.artistNames.some((artist) => spotifyArtists.has(artist.toLowerCase().trim()));
  }

  // ================================================
  // STRATEGY 3: Playlist name search (NEW!)
  // Search for playlists matching the user's chosen playlist name
  // This IS collaborative filtering — other users curated these playlists
  // ================================================
  private async playlistNameSearch(): Promise<AppTrack[]> {
    if (!SpotifyAPI.supportsPublicPlaylistDiscovery()) return [];
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
  refillPool(): Promise<void> {
    if (this.refillPromise) return this.refillPromise;
    this.refillPromise = this.refillCurrentRevision().finally(() => {
      this.refillPromise = null;
    });
    return this.refillPromise;
  }

  private async refillCurrentRevision(): Promise<void> {
    let revision: number;
    do {
      revision = this.likedRevision;
      await this.refillOnce(revision);
    } while (revision !== this.likedRevision);
  }

  private async refillOnce(revision: number): Promise<void> {
    const cooldown = SpotifyAPI.getSpotifyCooldownUntil();
    if (Date.now() < cooldown) {
      this.playlistSearchCooldownUntil = cooldown;
      this.statusMessage = `Spotify paused requests until ${new Date(cooldown).toLocaleTimeString()}.`;
      return;
    }
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
        this.statusMessage = SpotifyAPI.supportsPublicPlaylistDiscovery()
          ? `Checking playlist overlap for ${recentLiked.length} liked songs...`
          : "Checking the playlist index, your playlists and similar tracks. Public Spotify playlist access is unavailable in development mode.";

        // The corpus is queried from the first like —
        // a direct "playlists containing these songs" lookup, no name
        // guessing. Missing coverage can still leave this source empty.
        // The user's own matching playlists — best source there is when the
        // vibe name lines up (one-shot per session, self-gating).
        promises.push(this.ownPlaylistMatches());

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

      } else {
        // ─── NO LIKES YET: deal from the user's OWN library ───
        // Familiar songs mean instant vibe judgment — you know them, so no
        // preview needed to decide fit. Zero search calls burned. Discovery
        // takes over the moment the first like anchors the session.
        this.statusMessage = "Pick the vibe from songs you know...";

        // If the user already OWNS a playlist matching this vibe name,
        // its songs are the perfect cold-start deck.
        promises.push(this.ownPlaylistMatches());

        const lib = await Promise.allSettled([
          this.userLibrary("saved"),
          this.userLibrary("top"),
        ]);
        const libTracks = lib.flatMap((r) =>
          r.status === "fulfilled" ? r.value : []
        );
        promises.push(Promise.resolve(libTracks));

        // Library exhausted (small library, or a long no-like streak burned
        // through it) → widen to seed-based discovery so the deck never dies.
        if (libTracks.length < 8) {
          for (let i = 0; i < 3; i++) {
            const artist = this.getNextSeedArtist();
            if (artist) {
              promises.push(this.searchArtist(artist, this.seeds.genres));
            }
          }
          promises.push(this.playlistNameSearch());
          promises.push(this.querySearch());
        }
      }

      const results = await Promise.allSettled(promises);
      if (revision !== this.likedRevision) return;
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
      this.statusMessage = `Found ${allCandidates.length} candidates from available sources.`;

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
          // Widen with the LIKED ARTISTS' top tracks — stays on-vibe, uses a
          // cheap non-search endpoint, and unlike searchArtist it isn't
          // neutered by the searched-artists dedup. (Re-dealing the user's
          // own library mid-discovery-session was the old, stale behavior.)
          console.log("Playlist-first empty: widening via liked artists' top tracks");
          const recent = this.likedTracks.slice(-3);
          // Hydrated/persisted tracks can arrive with missing or mangled
          // artist ids — requesting /artists/undefined/top-tracks 404s.
          // Validate hard, and fall back to a name search for the rest.
          const isArtistId = (id: unknown): id is string =>
            typeof id === "string" && /^[A-Za-z0-9]{22}$/.test(id);
          const artistIds = [
            ...new Set(recent.map((t) => t.artistIds[0]).filter(isArtistId)),
          ];
          const nameFallbacks = recent
            .filter((t) => !isArtistId(t.artistIds[0]) && t.artistNames[0])
            .map((t) => t.artistNames[0]);
          const widen = await Promise.allSettled([
            ...artistIds.map(async (id) => {
              const tracks = await SpotifyAPI.getArtistTopTracks(id);
              const branchId = `artist_top_${id.slice(0, 8)}`;
              this.registerBranch(branchId, []);
              return tracks
                .filter((t: any) => t && t.id && !this.profile.seenTrackIds.has(t.id))
                .map((t: any) =>
                  toAppTrack(t, [], branchId, "artist_top", "safe", {
                    searchQuery: "liked artist top tracks",
                  })
                );
            }),
            ...nameFallbacks.map(async (artistName) => {
              const res = await SpotifyAPI.search(artistName, ["track"], 10, 0);
              const branchId = `artist_top_${artistName.slice(0, 8)}`;
              this.registerBranch(branchId, []);
              return (res.tracks?.items || [])
                .filter((t: any) => t && t.id && !this.profile.seenTrackIds.has(t.id))
                .map((t: any) =>
                  toAppTrack(t, [], branchId, "artist_top", "safe", {
                    searchQuery: `more by ${artistName}`,
                  })
                );
            }),
          ]);
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

      if (revision !== this.likedRevision) return;
      if (allCandidates.length === 0) {
        const deadline = SpotifyAPI.getSpotifyCooldownUntil();
        this.statusMessage = deadline > Date.now()
          ? `Spotify paused requests until ${new Date(deadline).toLocaleTimeString()}.`
          : "No more matches from the available sources. Try again later or adjust the playlist.";
        return;
      }

      // Batch scoring runs in C++; an unavailable backend uses the local scorer.
      const scoringSwipes = this.totalSwipes;
      let ranked = await rankWithNative(
        allCandidates, this.profile, this.profile.branches, this.likedTracks, `${ServerAPI.SERVER_BASE_URL}/api/reco/rank`
      );
      if (revision !== this.likedRevision) return;
      // A swipe during the round-trip changes the taste inputs. Re-score locally
      // against the current profile rather than enqueueing obsolete scores.
      if (scoringSwipes !== this.totalSwipes) {
        ranked = rankCandidates(allCandidates, this.profile, this.profile.branches, this.likedTracks);
      }
      ranked = ranked.filter(({ track }) => !this.profile.seenTrackIds.has(track.id)
        && !this.queue.some(queued => queued.id === track.id));

      ranked.sort((a, b) => {
        const priority = (track: AppTrack) => track.strategy === "playlist_overlap" ? 2
          : track.strategy === "corpus_cooccur" ? 1 : 0;
        return priority(b.track) - priority(a.track)
          || (b.track._debug?.overlapCount || 0) - (a.track._debug?.overlapCount || 0)
          || (b.track.corpusScore || 0) - (a.track.corpusScore || 0)
          || b.score.total - a.score.total;
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

      // Preserve retrieval evidence ordering; diversity is already part of scoring.

      this.queue.push(...topTracks);
      const sources = [...new Set(topTracks.map((track) => track.strategy || "unknown"))].join(", ");
      this.statusMessage = `Ready: ${this.queue.length} songs. Sources: ${sources}.`;
      console.log(`Queue: ${this.queue.length} tracks`);
    } catch (err) {
      console.error("Refill error:", err);
    }
  }

  async getReactiveTracksAfterLike(count = 5): Promise<AppTrack[]> {
    await this.refillPool();

    const tracks: AppTrack[] = [];
    for (let i = 0; i < count; i++) {
      const track = await this.getNextTrack();
      if (!track) break;
      tracks.push(track);
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
