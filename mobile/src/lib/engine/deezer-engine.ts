import type { AppTrack } from "../../types/track";
import { searchPlaylists, readPlaylist, type DiscoveryPlaylist } from "../deezer/client";

/** Pure overlap ranking: one playlist must contain the whole matched set.
 * Many separate one-song matches cannot outrank a single full-set match.
 * Only the best nonempty tier is dealt; lower tiers wait until it is exhausted.
 */
export function rankPlaylistMatches(playlists: DiscoveryPlaylist[], likes: AppTrack[], excluded: Set<string>): AppTrack[] {
  const anchors = [...new Map(likes.map((t) => [t.id, t])).values()];
  const likedIds = new Set(anchors.map((t) => t.id));
  const candidates = new Map<string, { track: AppTrack; matches: number; support: number; size: number }>();
  for (const playlist of playlists) {
    const ids = new Set(playlist.tracks.map((t) => t.id));
    const matched = anchors.filter((t) => ids.has(t.id));
    if (anchors.length && !matched.length) continue;
    for (const track of playlist.tracks) {
      if (!track.previewUrl || excluded.has(track.id) || likedIds.has(track.id)) continue;
      const existing = candidates.get(track.id);
      if (existing && existing.matches > matched.length) continue;
      if (existing && existing.matches === matched.length) {
        existing.support++;
        if (existing.size <= playlist.total) continue;
      }
      candidates.set(track.id, {
        matches: matched.length, size: playlist.total,
        support: existing?.matches === matched.length ? existing.support : 1,
        track: { ...track, strategy: anchors.length ? "deezer_overlap" : "deezer_context",
          _debug: {
            searchQuery: playlist.query, playlistName: playlist.title,
            playlistUrl: `https://www.deezer.com/playlist/${playlist.id}`,
            overlapCount: matched.length, overlapTarget: anchors.length,
            matchedTrackNames: matched.map((t) => t.name), matchedTrackIds: matched.map((t) => t.id),
            matchedBecause: anchors.length
              ? `${matched.length}/${anchors.length} current likes verified by Deezer track ID in this playlist. ${playlist.complete ? "Complete track list checked." : `Partial scan: ${playlist.tracks.length}/${playlist.total} entries.`}`
              : "Context search only: no likes yet. This is not an overlap match.",
          },
        },
      });
    }
  }
  const ranked = [...candidates.values()].sort((a, b) =>
    b.matches - a.matches || b.support - a.support || a.size - b.size || a.track.id.localeCompare(b.track.id));
  const tier = ranked[0]?.matches;
  const best = ranked.filter((r) => r.matches === tier);
  // Round-robin artists within the same evidence tier, without manufacturing genres.
  const groups = new Map<string, AppTrack[]>();
  for (const { track } of best) {
    const artist = track.artistIds[0] || track.artistNames[0];
    if (!groups.has(artist)) groups.set(artist, []);
    groups.get(artist)!.push(track);
  }
  const result: AppTrack[] = [];
  while ([...groups.values()].some((g) => g.length)) {
    for (const group of groups.values()) if (group.length) result.push(group.shift()!);
  }
  return result.map((track, i) => ({ ...track, _debug: { ...track._debug, rank: i + 1, totalCandidates: result.length } }));
}

export class DeezerRecommendationEngine {
  private name = "";
  private likes: AppTrack[] = [];
  private playlists = new Map<string, DiscoveryPlaylist>();
  private queries = new Set<string>();
  private seen = new Set<string>();
  private held = new Set<string>();
  private queue: AppTrack[] = [];
  private revision = 0;
  private pending: Promise<void> | null = null;
  private initialization: Promise<void> | null = null;
  private status = "Searching Deezer playlists...";
  private lastAttemptRevision = -1;
  private failure = "";

  initialize(name = "", vibes: string[] = [], likes: AppTrack[] = []): Promise<void> {
    if (this.initialization) return this.initialization;
    this.name = name.trim() || vibes.join(" ") || "music";
    this.syncLikedTracks(likes);
    this.initialization = this.refill();
    return this.initialization;
  }

  restoreSeen(ids: string[]): void { ids.forEach((id) => this.seen.add(id)); }
  getStatusMessage(): string { return this.status; }

  syncLikedTracks(tracks: AppTrack[]): { changed: boolean; removed: boolean } {
    const next = [...new Map(tracks.map((t) => [t.id, t])).values()];
    const ids = new Set(next.map((t) => t.id));
    const removed = this.likes.some((t) => !ids.has(t.id));
    const changed = this.likes.map((t) => t.id).join("|") !== next.map((t) => t.id).join("|");
    if (changed) {
      this.likes = next;
      this.revision++;
      this.queue = [];
      this.held.clear();
    }
    return { changed, removed };
  }

  recordSwipe(track: AppTrack, direction: "left" | "right" | "down"): void {
    this.seen.add(track.id);
    this.held.delete(track.id);
    if (direction === "right") this.syncLikedTracks([...this.likes, track]);
    console.log(`[Deezer] ${direction}: ${track.name}; ${track._debug?.overlapCount}/${track._debug?.overlapTarget}; ${track._debug?.playlistUrl}`);
  }

  requeue(tracks: AppTrack[]): void {
    const ids = new Set(this.queue.map((t) => t.id));
    this.queue.unshift(...tracks.filter((t) => this.held.has(t.id) && !this.seen.has(t.id) && !ids.has(t.id)));
    tracks.forEach((t) => this.held.delete(t.id));
  }

  async getNextTrack(): Promise<AppTrack | null> {
    if (!this.queue.length) await this.refill();
    const track = this.queue.shift() || null;
    if (track) this.held.add(track.id);
    return track;
  }

  async getReactiveTracksAfterLike(count = 5): Promise<AppTrack[]> {
    const revision = this.revision;
    const tracks: AppTrack[] = [];
    for (let i = 0; i < count; i++) {
      const track = await this.getNextTrack();
      if (!track) break;
      if (revision !== this.revision) {
        this.requeue([track]);
        return [];
      }
      tracks.push(track);
    }
    return tracks;
  }

  private refill(): Promise<void> {
    if (this.pending) return this.pending;
    this.pending = (async () => {
      let revision: number;
      do {
        revision = this.revision;
        const artist = this.likes.at(-1)?.artistNames[0];
        const candidates = [this.name, ...(artist ? [`${this.name} ${artist}`, artist] : [])];
        const query = candidates.find((q) => !this.queries.has(q));
        // No automatic repeated searches on an empty deck. Retry is explicit.
        if (query && this.lastAttemptRevision !== revision && this.playlists.size < 12) {
          this.failure = "";
          this.lastAttemptRevision = revision;
          this.status = `Deezer: searching "${query}"...`;
          try {
            const deadline = Date.now() + 15_000;
            const hits = await searchPlaylists(query);
            this.queries.add(query);
            for (const hit of hits.filter((p) => !this.playlists.has(p.id)).slice(0, 4)) {
              if (this.revision !== revision || Date.now() >= deadline) break;
              this.status = `Deezer: checking "${hit.title}" (${this.playlists.size + 1} playlists)...`;
              this.playlists.set(hit.id, await readPlaylist(hit));
            }
          } catch (error) { this.failure = error instanceof Error ? error.message : "Deezer unavailable."; }
        }
        if (revision !== this.revision) continue;
        const excluded = new Set([...this.seen, ...this.held]);
        this.queue = rankPlaylistMatches([...this.playlists.values()], this.likes, excluded).slice(0, 30);
        const overlap = this.queue[0]?._debug?.overlapCount || 0;
        const partial = [...this.playlists.values()].filter((p) => !p.complete).length;
        const coverage = `${this.playlists.size} playlists checked${partial ? `, ${partial} partial` : ""}`;
        this.status = [this.failure, this.queue.length
          ? this.likes.length ? `Deezer: best available ${overlap}/${this.likes.length} overlap. ${coverage}.`
            : `Deezer context results. ${coverage}; no likes yet.`
          : `No more playable matches in ${coverage}. No Spotify fallback.`].filter(Boolean).join(" ");
        console.log(`[Deezer] ${this.status} ${this.queue.length} candidates.`);
      } while (revision !== this.revision);
    })().finally(() => { this.pending = null; });
    return this.pending;
  }

  retry(): Promise<void> {
    this.lastAttemptRevision = -1;
    if (this.failure) this.queries.clear();
    return this.refill();
  }
}
