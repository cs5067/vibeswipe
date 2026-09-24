import type { AppTrack } from "../../types/track";
import type { TasteProfile, Branch } from "../../types/taste";
import { rankCandidates } from "./scoring";

export type Score = ReturnType<typeof rankCandidates>[number]["score"];
export type ScoreTrack = Pick<AppTrack, "genres" | "artistIds" | "popularity" | "branchId">;
export interface RankPayload {
  candidates: ScoreTrack[];
  liked: ScoreTrack[];
  profile: {
    genreWeights: Array<[string, number]>;
    knownArtistIds: string[];
    genreTransitions: Array<[string, string, number]>;
    popularityRange: [number, number];
    sessionVibe: TasteProfile["sessionVibe"];
    lastLikedTracks: Array<{ genres: string[]; energy: number }>;
  };
  branches: Array<[string, { likes: number; dislikes: number }]>;
}
export const scoreFields: Array<keyof Score> = [
  "vibeFit", "genreProximity", "sequenceFit", "artistDiversity",
  "branchHealth", "novelty", "popularityFit", "total",
];

export function scoringPayload(candidates: AppTrack[], profile: TasteProfile,
  branches: Map<string, Branch>, liked: AppTrack[]): RankPayload {
  const track = (t: AppTrack): ScoreTrack => ({
    genres: t.genres, artistIds: t.artistIds, popularity: t.popularity, branchId: t.branchId || "",
  });
  return {
    candidates: candidates.map(track), liked: liked.map(track),
    profile: {
      genreWeights: [...profile.genreWeights], knownArtistIds: [...profile.knownArtistIds],
      genreTransitions: [...profile.genreTransitions].flatMap(([from, values]) =>
        [...values].map(([to, count]): [string, string, number] => [from, to, count])),
      popularityRange: profile.popularityRange, sessionVibe: profile.sessionVibe,
      lastLikedTracks: profile.lastLikedTracks.slice(-1).map(({ genres, energy }) => ({ genres, energy })),
    },
    branches: [...branches].map(([id, { likes, dislikes }]) => [id, { likes, dislikes }]),
  };
}

// A failed backend pauses attempts briefly; ordinary local scoring still works.
let retryAfter = 0;
export async function rankWithNative(candidates: AppTrack[], profile: TasteProfile,
  branches: Map<string, Branch>, liked: AppTrack[], endpoint: string) {
  const fallback = () => rankCandidates(candidates, profile, branches, liked);
  if (!candidates.length || candidates.length > 500 || liked.length > 2000 || Date.now() < retryAfter) return fallback();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(endpoint, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(scoringPayload(candidates, profile, branches, liked)),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error("Native ranking unavailable");
    const data = await response.json();
    if (data.engine !== "cpp17" || !Array.isArray(data.ranked) || data.ranked.length !== candidates.length)
      throw new Error("Invalid native ranking response");
    const seen = new Set<number>();
    let previous = Infinity;
    let previousIndex = -1;
    const ranked = data.ranked.map((row: { index: number; score: Score }) => {
      if (!row || !Number.isInteger(row.index) || row.index < 0 || row.index >= candidates.length || seen.has(row.index)
        || !row.score || !scoreFields.every(key => typeof row.score[key] === "number"
          && Number.isFinite(row.score[key]) && row.score[key] >= 0 && row.score[key] <= 1)
        || row.score.total > previous || (row.score.total === previous && row.index < previousIndex))
        throw new Error("Invalid native ranking row");
      seen.add(row.index); previous = row.score.total; previousIndex = row.index;
      return { track: candidates[row.index], score: row.score };
    });
    return ranked as Array<{ track: AppTrack; score: Score }>;
  } catch {
    retryAfter = Date.now() + 30_000;
    return fallback();
  } finally {
    clearTimeout(timer);
  }
}
