// Shared client-side types for the Arena — public vibe rooms.
// Shapes mirror the /api/arena/* contracts exactly.

import type { SharedTrack } from "@/types/share";

// A track dropped into a vibe — SharedTrack plus the Spotify id when known.
export type ArenaTrack = SharedTrack & { id?: string };

export interface ArenaDrop {
  id: string;
  track: ArenaTrack;
  note: string | null;
  dropper: string | null; // null = seeded by the algorithm
  score: number;
  fires: number;
  nahs: number;
  myVote: 1 | -1 | null;
  createdAt: string;
}

export interface VibeSummary {
  slug: string;
  name: string;
  dropCount: number;
  topArt: string[];
}
