import { cookies, headers } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getCorpusClient } from "@/lib/supabase/server";

export const PROFILE_COOKIE = "vibeswipe_profile_id";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface Profile {
  id: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}

/* ────────────────────────────────────────────────────────────────────
 * Cookie signing
 *
 * When PROFILE_COOKIE_SECRET is set, the profile cookie carries
 * "<uuid>.<hex hmac-sha256>" so a client can't forge someone else's
 * profile id. When the secret is unset (local dev), cookies stay bare
 * uuids in development only. Production must fail closed.
 * ──────────────────────────────────────────────────────────────────── */

function cookieSecret(): string | null {
  return process.env.PROFILE_COOKIE_SECRET || null;
}

function signProfileId(id: string, secret: string): string {
  return createHmac("sha256", secret).update(id).digest("hex");
}

/**
 * Build the value to store in the profile cookie. Signed when
 * PROFILE_COOKIE_SECRET is set, bare uuid otherwise. Every place that
 * sets PROFILE_COOKIE must go through this helper.
 */
export function makeProfileCookieValue(id: string): string {
  const secret = cookieSecret();
  if (process.env.NODE_ENV === "production" && (!secret || secret.length < 32)) {
    throw new Error("PROFILE_COOKIE_SECRET must contain at least 32 characters in production");
  }
  if (!secret) return id;
  return `${id}.${signProfileId(id, secret)}`;
}

/**
 * Parse + verify a profile cookie value back into a profile id.
 * Returns null on bad format or signature mismatch. With no secret
 * configured, accepts the legacy bare-uuid form.
 */
export function parseProfileCookie(value: string): string | null {
  if (!value) return null;
  const dot = value.indexOf(".");
  const id = dot === -1 ? value : value.slice(0, dot);
  const sig = dot === -1 ? null : value.slice(dot + 1);
  if (!UUID_RE.test(id)) return null;

  const secret = cookieSecret();
  if (process.env.NODE_ENV === "production" && (!secret || secret.length < 32)) return null;
  if (!secret) return id; // Development-only compatibility.

  if (!sig || !/^[0-9a-f]{64}$/.test(sig)) return null;
  const expected = Buffer.from(signProfileId(id, secret), "hex");
  const given = Buffer.from(sig, "hex");
  if (given.length !== expected.length) return null;
  return timingSafeEqual(given, expected) ? id : null;
}

/* ────────────────────────────────────────────────────────────────────
 * Bearer bridge (mobile)
 *
 * The mobile app has no cookie jar — it authenticates every request
 * with "Authorization: Bearer <spotify access token>". We validate the
 * token by calling Spotify's GET /v1/me with it, then map the Spotify
 * user to a vibeswipe profile via provider_identities (creating both
 * on first sight). Validation results are cached in-memory per token
 * so we hit Spotify at most once per token per 10 minutes.
 * ──────────────────────────────────────────────────────────────────── */

interface BearerCacheEntry {
  profileId: string | null; // null = token was rejected by Spotify
  expiresAt: number;
}

const BEARER_TTL_MS = 10 * 60 * 1000; // valid tokens
const BEARER_NEGATIVE_TTL_MS = 60 * 1000; // rejected tokens (brief, in case of refresh races)
const BEARER_CACHE_MAX = 500;
const BEARER_TOKEN_MAX_LEN = 2048;

const bearerCache = new Map<string, BearerCacheEntry>();

function bearerCacheSet(token: string, profileId: string | null): void {
  if (bearerCache.size >= BEARER_CACHE_MAX && !bearerCache.has(token)) {
    // Evict expired entries first; if still full, drop the oldest.
    const now = Date.now();
    for (const [key, entry] of bearerCache) {
      if (entry.expiresAt <= now) bearerCache.delete(key);
    }
    if (bearerCache.size >= BEARER_CACHE_MAX) {
      const oldest = bearerCache.keys().next().value;
      if (oldest !== undefined) bearerCache.delete(oldest);
    }
  }
  bearerCache.set(token, {
    profileId,
    expiresAt:
      Date.now() + (profileId ? BEARER_TTL_MS : BEARER_NEGATIVE_TTL_MS),
  });
}

/** Resolve a Spotify access token to a vibeswipe profile (or null). */
async function profileFromBearer(token: string): Promise<Profile | null> {
  const cached = bearerCache.get(token);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.profileId ? fetchProfileById(cached.profileId) : null;
  }

  let user: { id?: unknown; display_name?: unknown; images?: unknown };
  try {
    const res = await fetch("https://api.spotify.com/v1/me", {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    if (!res.ok) {
      bearerCacheSet(token, null);
      return null;
    }
    user = await res.json();
  } catch (err) {
    // Network hiccup or timeout — fail closed but don't negative-cache,
    // the token may be perfectly fine.
    console.error("Bearer bridge: Spotify /me call failed:", err);
    return null;
  }

  if (typeof user.id !== "string" || !user.id) {
    bearerCacheSet(token, null);
    return null;
  }
  const displayName =
    typeof user.display_name === "string" ? user.display_name : null;
  const images = Array.isArray(user.images)
    ? (user.images as Array<{ url?: unknown } | null>)
    : [];
  const avatarUrl =
    typeof images[0]?.url === "string" ? images[0].url : null;

  try {
    const profile = await getOrCreateProfile(
      "spotify",
      user.id,
      displayName,
      avatarUrl
    );
    bearerCacheSet(token, profile.id);
    return profile;
  } catch (err) {
    console.error("Bearer bridge: profile upsert failed:", err);
    return null;
  }
}

/* ────────────────────────────────────────────────────────────────────
 * Profiles
 * ──────────────────────────────────────────────────────────────────── */

async function fetchProfileById(id: string): Promise<Profile | null> {
  const supabase = getCorpusClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url")
    .eq("id", id)
    .maybeSingle();

  if (!data) return null;
  return {
    id: data.id,
    username: data.username,
    displayName: data.display_name,
    avatarUrl: data.avatar_url,
  };
}

/**
 * Find (or create) the vibeswipe profile for a music-provider identity.
 * This is the cross-platform hinge: a Spotify login and a future Apple
 * Music login can both map to the SAME profile_id.
 */
export async function getOrCreateProfile(
  provider: string,
  providerUserId: string,
  displayName: string | null,
  avatarUrl: string | null
): Promise<Profile> {
  const supabase = getCorpusClient();

  // Already linked?
  const { data: link } = await supabase
    .from("provider_identities")
    .select("profile_id")
    .eq("provider", provider)
    .eq("provider_user_id", providerUserId)
    .maybeSingle();

  if (link?.profile_id) {
    const existing = await fetchProfileById(link.profile_id);
    if (existing) return existing;
  }

  // Create a fresh profile and link this identity to it.
  const { data: created, error: createErr } = await supabase
    .from("profiles")
    .insert({ display_name: displayName, avatar_url: avatarUrl })
    .select("id, username, display_name, avatar_url")
    .single();

  if (createErr || !created) {
    throw new Error(createErr?.message || "Could not create profile");
  }

  await supabase.from("provider_identities").insert({
    provider,
    provider_user_id: providerUserId,
    profile_id: created.id,
  });

  return {
    id: created.id,
    username: created.username,
    displayName: created.display_name,
    avatarUrl: created.avatar_url,
  };
}

/**
 * The current profile, from either supported credential:
 *
 * 1. The httpOnly session cookie (web) — signed when
 *    PROFILE_COOKIE_SECRET is set.
 * 2. An "Authorization: Bearer <spotify access token>" header (mobile),
 *    consulted only when the cookie is absent or invalid.
 *
 * Any route built on this helper automatically serves both platforms.
 */
export async function getCurrentProfile(): Promise<Profile | null> {
  // 1. Cookie (primary — web sessions).
  const jar = await cookies();
  const raw = jar.get(PROFILE_COOKIE)?.value;
  const cookieId = raw ? parseProfileCookie(raw) : null;
  if (cookieId) {
    const profile = await fetchProfileById(cookieId);
    if (profile) return profile;
  }

  // 2. Bearer token (mobile).
  const auth = (await headers()).get("authorization");
  const match = auth?.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1].trim();
  if (!token || token.length > BEARER_TOKEN_MAX_LEN) return null;

  return profileFromBearer(token);
}
