import { cookies } from "next/headers";
import { getCorpusClient } from "@/lib/supabase/server";

export const PROFILE_COOKIE = "vibeswipe_profile_id";

export interface Profile {
  id: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
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
    const { data: existing } = await supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .eq("id", link.profile_id)
      .maybeSingle();
    if (existing) {
      return {
        id: existing.id,
        username: existing.username,
        displayName: existing.display_name,
        avatarUrl: existing.avatar_url,
      };
    }
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

/** Read the current profile from the session cookie, if any. */
export async function getCurrentProfile(): Promise<Profile | null> {
  const jar = await cookies();
  const id = jar.get(PROFILE_COOKIE)?.value;
  if (!id) return null;

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
