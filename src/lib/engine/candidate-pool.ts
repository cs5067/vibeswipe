import type { AppTrack } from "@/types/track";

export class CandidatePool {
  private queue: AppTrack[] = [];
  private readonly MIN_SIZE = 3;

  get length(): number {
    return this.queue.length;
  }

  needsRefill(): boolean {
    return this.queue.length < this.MIN_SIZE;
  }

  next(): AppTrack | null {
    return this.queue.shift() || null;
  }

  peek(): AppTrack | null {
    return this.queue[0] || null;
  }

  peekAll(): AppTrack[] {
    return [...this.queue];
  }

  addTracks(tracks: AppTrack[], seenIds: Set<string>): number {
    let added = 0;
    for (const track of tracks) {
      if (!seenIds.has(track.id) && !this.queue.find((t) => t.id === track.id)) {
        this.queue.push(track);
        added++;
      }
    }
    return added;
  }

  shuffle(): void {
    for (let i = this.queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.queue[i], this.queue[j]] = [this.queue[j], this.queue[i]];
    }
  }

  clear(): void {
    this.queue = [];
  }
}
