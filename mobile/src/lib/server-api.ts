/**
 * Bridge to the vibeswipe server (Next.js on the Mac during dev).
 *
 * Three jobs:
 *  1. corpusRecommend — ask OUR index "which songs sit next to my liked
 *     songs on real playlists" (the lookup Spotify's API cannot do).
 *  2. ingestPlaylist — donate every playlist this phone scans to the index,
 *     so the base widens with every session.
 *  3. Social API — friends, inbox, recommendations, arena. These calls are
 *     authenticated: the server accepts "Authorization: Bearer <spotify
 *     access token>" and maps it to a profile, so every web route works
 *     from the phone unchanged.
 *
 * All calls fail silently and fast — the engine must work offline from
 * the server too.
 */

import { getAccessToken } from "./spotify/auth";

// Server base URL. Override per environment via EXPO_PUBLIC_SERVER_URL;
// defaults to the Mac's LAN IP for local Expo Go dev.
export const SERVER_BASE_URL =
  process.env.EXPO_PUBLIC_SERVER_URL || "http://localhost:3005";

// Matches CORPUS_INGEST_TOKEN on the server when ingestion is gated (prod).
const INGEST_TOKEN = process.env.EXPO_PUBLIC_CORPUS_INGEST_TOKEN || "";

const TIMEOUT_MS = 4000;

async function post<T>(path: string, body: unknown): Promise<T | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (INGEST_TOKEN) headers["x-ingest-token"] = INGEST_TOKEN;
    const res = await fetch(`${SERVER_BASE_URL}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export interface CorpusCandidate {
  trackId: string;
  sharedPlaylists: number;
  score: number;
}

/** Songs that co-occur with the liked set across the corpus. */
export async function corpusRecommend(
  liked: string[],
  seen: string[],
  limit = 20
): Promise<CorpusCandidate[]> {
  const data = await post<{ candidates?: CorpusCandidate[] }>("/api/reco/cooccur", {
    liked,
    seen,
    limit,
  });
  return data?.candidates ?? [];
}

/** Resolve a 30s Deezer preview via the server proxy — the playback fallback
 *  for when Spotify Connect has no device / errors / user lacks Premium. */
export async function resolvePreviewUrl(
  artist: string,
  title: string
): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const params = new URLSearchParams({ artist, title });
    const res = await fetch(`${SERVER_BASE_URL}/api/preview?${params}`, {
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    return data.previewUrl || null;
  } catch {
    return null;
  }
}

export interface LastfmSimilar {
  name: string;
  artist: string;
  match: number;
}

/** "People who play X also play Y" — Last.fm's collaborative filtering,
 *  computed from millions of real listeners. Carries quality while our
 *  own corpus grows. */
export async function lastfmSimilar(
  artist: string,
  title: string,
  limit = 12
): Promise<LastfmSimilar[]> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const params = new URLSearchParams({ artist, title, limit: String(limit) });
    const res = await fetch(`${SERVER_BASE_URL}/api/lastfm/similar?${params}`, {
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.similar) ? data.similar : [];
  } catch {
    return [];
  }
}

/** Fire-and-forget: donate a scanned playlist to the corpus. */
export function ingestPlaylist(
  playlistId: string,
  playlistName: string | null,
  totalTracks: number | null,
  items: Array<{ track?: unknown } | null>
): void {
  void post("/api/corpus/ingest", {
    playlistId,
    playlistName,
    totalTracks,
    items: items.slice(0, 200),
  });
}

// ---------------------------------------------------------------------------
// Authenticated social API
// ---------------------------------------------------------------------------

// Social calls get a little more headroom than the fire-and-forget corpus
// calls — the server may need a round-trip to Spotify to validate the bearer.
const AUTHED_TIMEOUT_MS = 6000;

async function authedRequest<T>(
  method: "GET" | "POST" | "PATCH",
  path: string,
  body?: unknown
): Promise<T | null> {
  try {
    const token = await getAccessToken();
    if (!token) return null;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AUTHED_TIMEOUT_MS);
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
    };
    if (body !== undefined) headers["Content-Type"] = "application/json";

    const res = await fetch(`${SERVER_BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export function authedGet<T>(path: string): Promise<T | null> {
  return authedRequest<T>("GET", path);
}

export function authedPost<T>(path: string, body: unknown): Promise<T | null> {
  return authedRequest<T>("POST", path, body);
}

export function authedPatch<T>(path: string, body: unknown): Promise<T | null> {
  return authedRequest<T>("PATCH", path, body);
}

// --- Shapes (mirror the web API responses exactly) -------------------------

/** Denormalized song payload — everything a recipient needs to render + play. */
export interface SharedTrack {
  id?: string;
  name: string;
  artistNames: string[];
  albumImage: string;
  previewUrl: string | null;
  spotifyUrl: string;
}

/** snake_case person — how /api/friends/search, inbox and sent rows ship it. */
export interface Person {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

// Search intentionally exposes usernames, not internal profile IDs.
export type FriendSearchResult = Omit<Person, "id" | "username"> & { username: string };

/** camelCase friend — how /api/friends ships the accepted-friends list. */
export interface Friend {
  id: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface PendingRequest {
  id: string;
  requester: Person;
}

export interface FriendsPayload {
  friends: Friend[];
  pending: PendingRequest[];
  me: { id: string; username: string | null; displayName: string | null };
}

export type RecStatus = "unseen" | "seen" | "listened";

export interface InboxItem {
  id: string;
  track: SharedTrack;
  note: string | null;
  status: RecStatus;
  reaction: string | null;
  created_at: string;
  from: Person | null;
}

export interface InboxPayload {
  items: InboxItem[];
  unseen: number;
}

export interface SentItem {
  id: string;
  track: SharedTrack;
  note: string | null;
  status: RecStatus;
  created_at: string;
  listened_at: string | null;
  reaction: string | null;
  reacted_at: string | null;
  to: Person | null;
}

export interface ArenaVibe {
  slug: string;
  name: string;
  dropCount: number;
  topArt: string[];
}

// --- Typed wrappers ---------------------------------------------------------

export function fetchFriends(): Promise<FriendsPayload | null> {
  return authedGet<FriendsPayload>("/api/friends");
}

export async function searchFriends(q: string): Promise<FriendSearchResult[]> {
  const data = await authedGet<{ results?: FriendSearchResult[] }>(
    `/api/friends/search?q=${encodeURIComponent(q)}`
  );
  return (data?.results ?? []).filter((person) => typeof person.username === "string");
}

export async function sendFriendRequest(toUsername: string): Promise<boolean> {
  const result = await authedPost<{ ok?: boolean }>("/api/friends/request", {
    toUsername: toUsername.trim().toLowerCase(),
  });
  return result?.ok === true;
}

export async function respondFriendRequest(
  requestId: string,
  accept: boolean
): Promise<boolean> {
  return (await authedPost("/api/friends/respond", { requestId, accept })) !== null;
}

export async function fetchInviteUrl(): Promise<string | null> {
  const data = await authedGet<{ url?: string }>("/api/friends/invite");
  return data?.url ?? null;
}

export function fetchInbox(): Promise<InboxPayload | null> {
  return authedGet<InboxPayload>("/api/inbox");
}

export async function markInbox(
  id: string,
  patch: { status?: "seen" | "listened"; reaction?: string }
): Promise<boolean> {
  return (await authedPatch("/api/inbox", { id, ...patch })) !== null;
}

export async function fetchSent(): Promise<SentItem[] | null> {
  const data = await authedGet<{ items?: SentItem[] }>("/api/sent");
  return data ? data.items ?? [] : null;
}

export async function recommendTrack(
  toId: string,
  track: SharedTrack,
  note?: string
): Promise<boolean> {
  return (await authedPost("/api/recommend", { toId, track, note })) !== null;
}

export async function createShareLink(
  track: SharedTrack,
  senderName: string | null,
  note?: string
): Promise<{ code: string; url: string } | null> {
  return authedPost<{ code: string; url: string }>("/api/share", {
    track,
    senderName,
    note,
  });
}

/** Public — no auth needed, anyone can browse the Arena lobby. */
export async function fetchArenaVibes(): Promise<ArenaVibe[] | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AUTHED_TIMEOUT_MS);
    const res = await fetch(`${SERVER_BASE_URL}/api/arena/vibes`, {
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data.vibes) ? (data.vibes as ArenaVibe[]) : [];
  } catch {
    return null;
  }
}

/** Drop the track into a public vibe. Returns null on failure,
 *  { already } on success (already = someone dropped it there first). */
export async function dropIntoVibe(
  vibeSlug: string,
  track: SharedTrack,
  note?: string
): Promise<{ already: boolean } | null> {
  const data = await authedPost<{ ok?: boolean; already?: boolean }>(
    "/api/arena/drop",
    { vibeSlug, track, note }
  );
  if (!data?.ok) return null;
  return { already: !!data.already };
}
