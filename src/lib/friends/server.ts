import { getCorpusClient } from "@/lib/supabase/server";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Strict UUID check — profile ids are interpolated into PostgREST filter
 * strings, so anything that isn't a bare UUID must be rejected. */
export function isProfileId(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/** Are these two profiles accepted friends? */
export async function areFriends(a: string, b: string): Promise<boolean> {
  if (!isProfileId(a) || !isProfileId(b)) return false;
  const supabase = getCorpusClient();
  const { data } = await supabase
    .from("friendships")
    .select("id")
    .eq("status", "accepted")
    .or(
      `and(requester_id.eq.${a},addressee_id.eq.${b}),and(requester_id.eq.${b},addressee_id.eq.${a})`
    )
    .limit(1);
  return (data?.length ?? 0) > 0;
}

export interface FriendSummary {
  id: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}

/** All accepted friends of a profile. */
export async function listFriends(profileId: string): Promise<FriendSummary[]> {
  const supabase = getCorpusClient();
  const { data } = await supabase
    .from("friendships")
    .select(
      "requester:requester_id(id,username,display_name,avatar_url), addressee:addressee_id(id,username,display_name,avatar_url), requester_id, addressee_id"
    )
    .eq("status", "accepted")
    .or(`requester_id.eq.${profileId},addressee_id.eq.${profileId}`);

  if (!data) return [];
  return data.map((row: Record<string, unknown>) => {
    const other = (
      row.requester_id === profileId ? row.addressee : row.requester
    ) as {
      id: string;
      username: string | null;
      display_name: string | null;
      avatar_url: string | null;
    };
    return {
      id: other.id,
      username: other.username,
      displayName: other.display_name,
      avatarUrl: other.avatar_url,
    };
  });
}
