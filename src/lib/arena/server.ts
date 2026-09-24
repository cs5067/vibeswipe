import { cookies } from "next/headers";
import { getCorpusClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile/server";
import type { SharedTrack } from "@/types/share";

/**
 * Server-side helpers for the Arena — public vibe rooms where anyone
 * judges drops. Voting works anonymously via a long-lived httpOnly
 * cookie; dropping requires a profile.
 */

export const VOTER_COOKIE = "vibeswipe_voter";

const VIBE_SLUG_RE = /^[a-z0-9-]{2,40}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SPOTIFY_TRACK_ID_RE = /^[A-Za-z0-9]{22}$/;

/** A drop's track — a SharedTrack plus the Spotify track id when known. */
export interface ArenaTrack extends SharedTrack {
  id?: string;
}

export interface ArenaVibe {
  id: string;
  slug: string;
  name: string;
}

export function isVibeSlug(x: unknown): x is string {
  return typeof x === "string" && VIBE_SLUG_RE.test(x);
}

export function isUuid(x: unknown): x is string {
  return typeof x === "string" && UUID_RE.test(x);
}

/** Validate a user-supplied track payload into a clean ArenaTrack. */
export function parseArenaTrack(t: Partial<ArenaTrack> | undefined | null): ArenaTrack | null {
  if (!t || typeof t.name !== "string" || !t.name.trim() || !Array.isArray(t.artistNames)) {
    return null;
  }
  const track: ArenaTrack = {
    name: t.name.slice(0, 200),
    artistNames: t.artistNames
      .filter((x): x is string => typeof x === "string")
      .map((x) => x.slice(0, 120))
      .slice(0, 10),
    albumImage: typeof t.albumImage === "string" ? t.albumImage.slice(0, 500) : "",
    previewUrl: typeof t.previewUrl === "string" ? t.previewUrl.slice(0, 500) : null,
    spotifyUrl: typeof t.spotifyUrl === "string" ? t.spotifyUrl.slice(0, 200) : "",
  };
  const id = extractSpotifyTrackId(t);
  if (id) track.id = id;
  return track;
}

/** Spotify track id — from track.id, or parsed out of the spotifyUrl. */
export function extractSpotifyTrackId(t: Partial<ArenaTrack>): string | null {
  if (typeof t.id === "string" && SPOTIFY_TRACK_ID_RE.test(t.id)) return t.id;
  if (typeof t.spotifyUrl === "string") {
    const m = t.spotifyUrl.match(/\/track\/([A-Za-z0-9]{22})/);
    if (m) return m[1];
  }
  return null;
}

export async function getVibeBySlug(slug: string): Promise<ArenaVibe | null> {
  const supabase = getCorpusClient();
  const { data } = await supabase
    .from("vibes")
    .select("id, slug, name")
    .eq("slug", slug)
    .maybeSingle();
  return data ?? null;
}

/**
 * Who is voting? Logged-in profile id wins; otherwise the anonymous
 * voter cookie (if one has been issued). Null = brand-new anon visitor.
 */
export async function getVoterKey(): Promise<string | null> {
  const me = await getCurrentProfile();
  if (me) return me.id;
  const jar = await cookies();
  return jar.get(VOTER_COOKIE)?.value || null;
}

export interface DropRow {
  id: string;
  vibe_id: string;
  track: ArenaTrack;
  note: string | null;
  dropped_by: string | null;
  created_at: string;
}

/**
 * All drops (optionally for one vibe), newest first. Paged because
 * PostgREST caps a single response at ~1000 rows and a living vibe
 * room can outgrow that. Throws on query error.
 */
export async function fetchDrops(vibeId?: string): Promise<DropRow[]> {
  const supabase = getCorpusClient();
  const rows: DropRow[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    let query = supabase
      .from("drops")
      .select("id, vibe_id, track, note, dropped_by, created_at")
      .order("created_at", { ascending: false })
      .range(from, from + PAGE - 1);
    if (vibeId) query = query.eq("vibe_id", vibeId);

    const { data, error } = await query;
    if (error) throw error;
    rows.push(...((data ?? []) as DropRow[]));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

export interface VoteTally {
  score: number;
  fires: number;
  nahs: number;
  myVote: 1 | -1 | null;
}

export const EMPTY_TALLY: VoteTally = { score: 0, fires: 0, nahs: 0, myVote: null };

/**
 * Fetch drop_votes for a set of drops in one (paged) query and
 * aggregate score/🔥/🤢 in JS — corpus-tables pattern, no SQL functions.
 */
export async function tallyVotes(
  dropIds: string[],
  voterKey: string | null
): Promise<Map<string, VoteTally>> {
  const tallies = new Map<string, VoteTally>();
  if (dropIds.length === 0) return tallies;

  const supabase = getCorpusClient();
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("drop_votes")
      .select("drop_id, voter_key, value")
      .in("drop_id", dropIds)
      .range(from, from + PAGE - 1);

    if (error) {
      console.error("drop_votes fetch error:", error);
      break;
    }
    for (const row of data ?? []) {
      let t = tallies.get(row.drop_id);
      if (!t) {
        t = { score: 0, fires: 0, nahs: 0, myVote: null };
        tallies.set(row.drop_id, t);
      }
      if (row.value === 1) t.fires += 1;
      else t.nahs += 1;
      t.score += row.value;
      if (voterKey && row.voter_key === voterKey) {
        t.myVote = row.value === 1 ? 1 : -1;
      }
    }
    if (!data || data.length < PAGE) break;
  }
  return tallies;
}
