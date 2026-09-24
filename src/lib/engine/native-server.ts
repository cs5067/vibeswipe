import { execFile } from "node:child_process";
import path from "node:path";
import type { RankPayload, Score } from "./native-ranking";

const fields: Array<keyof Score> = ["vibeFit", "genreProximity", "sequenceFit", "artistDiversity", "branchHealth", "novelty", "popularityFit", "total"];
export class RankingInputError extends Error {}
export class RankingUnavailableError extends Error {}

// Validate the HTTP representation before allocating a child process. The C++
// reader independently checks counts, framing, finite values and scoring ranges.
export function encodeRanking(input: unknown): { wire: string; count: number } {
  const tokens = ["VIBESWIPE_RANK_V1"];
  const reject = (): never => { throw new RankingInputError("Invalid ranking payload"); };
  const object = (v: unknown): Record<string, unknown> => {
    if (!v || typeof v !== "object" || Array.isArray(v)) return reject();
    return v as Record<string, unknown>;
  };
  const list = (v: unknown, max: number): unknown[] => {
    if (!Array.isArray(v) || v.length > max) return reject();
    return v;
  };
  const number = (v: unknown, low = -Number.MAX_VALUE, high = Number.MAX_VALUE) => {
    if (typeof v !== "number" || !Number.isFinite(v) || v < low || v > high) return reject();
    tokens.push(String(v));
    return v;
  };
  const text = (v: unknown) => {
    if (typeof v !== "string" || Buffer.byteLength(v, "utf8") > 4096) return reject();
    tokens.push(Buffer.from(v, "utf8").toString("hex") || "-");
  };
  const strings = (v: unknown, max: number) => {
    const values = list(v, max); tokens.push(String(values.length)); values.forEach(text);
  };
  const tuple = (v: unknown, size: number) => {
    const values = list(v, size); if (values.length !== size) return reject(); return values;
  };
  const each = (v: unknown, max: number, append: (item: unknown) => void) => {
    const values = list(v, max); tokens.push(String(values.length)); values.forEach(append); return values.length;
  };
  const track = (v: unknown) => {
    const t = object(v); strings(t.genres, 50); strings(t.artistIds, 32);
    number(t.popularity, 0, 100); text(t.branchId ?? "");
  };
  const body = object(input), profile = object(body.profile), vibe = object(profile.sessionVibe);
  for (const dim of ["energy", "mood", "tempo", "intimacy", "experimental"]) number(vibe[dim], 0, 1);
  const range = tuple(profile.popularityRange, 2);
  const low = number(range[0], 0, 100); number(range[1], low, 100);
  each(profile.genreWeights, 1000, v => { const pair = tuple(v, 2); text(pair[0]); number(pair[1]); });
  strings(profile.knownArtistIds, 5000);
  each(profile.genreTransitions, 10000, v => {
    const item = tuple(v, 3); text(item[0]); text(item[1]); number(item[2], 0);
  });
  each(profile.lastLikedTracks, 1, v => { const item = object(v); strings(item.genres, 50); number(item.energy, 0, 1); });
  each(body.branches, 1000, v => {
    const pair = tuple(v, 2), branch = object(pair[1]); text(pair[0]);
    const likes = number(branch.likes, 0), dislikes = number(branch.dislikes, 0);
    if (!Number.isFinite(likes + dislikes)) reject();
  });
  each(body.liked, 2000, track);
  const count = each(body.candidates, 500, track);
  const wire = tokens.join("\n") + "\n";
  if (Buffer.byteLength(wire) > 2 * 1024 * 1024) reject();
  return { wire, count };
}

export function parseRanking(output: string, count: number) {
  const [header, ...lines] = output.trim().split("\n");
  if (header !== "VIBESWIPE_RANK_V1" || lines.length !== count) throw new RankingUnavailableError("Invalid native output");
  const seen = new Set<number>();
  let previous = Infinity, previousIndex = -1;
  return lines.map(line => {
    const values = line.split("\t");
    const index = Number(values[0]);
    const scores = values.slice(1).map(Number);
    if (values.length !== 9 || values.some(v => v.trim() === "") || !Number.isInteger(index) || index < 0 || index >= count || seen.has(index)
      || scores.some(v => !Number.isFinite(v) || v < 0 || v > 1)
      || scores[7] > previous || (scores[7] === previous && index < previousIndex))
      throw new RankingUnavailableError("Invalid native output");
    seen.add(index); previous = scores[7]; previousIndex = index;
    return { index, score: Object.fromEntries(fields.map((key, i) => [key, scores[i]])) as unknown as Score };
  });
}

let active = 0;
export async function nativeRank(input: RankPayload | unknown) {
  const { wire, count } = encodeRanking(input);
  if (active >= 4) throw new RankingUnavailableError("Native ranking is busy");
  active++;
  try {
    const output = await new Promise<string>((resolve, reject) => {
      const child = execFile(path.join(process.cwd(), "native/build/vibeswipe-rank"), [], {
        encoding: "utf8", timeout: 2000, killSignal: "SIGKILL", maxBuffer: 512 * 1024,
      }, (error, stdout) => {
        if (error) reject(new RankingUnavailableError("Native ranking unavailable"));
        else resolve(stdout);
      });
      // EPIPE is possible if a malformed stream makes the reader exit early.
      child.stdin?.on("error", () => {});
      child.stdin?.end(wire);
    });
    return parseRanking(output, count);
  } finally {
    active--;
  }
}
