import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/profile/server";
import { listFriends } from "@/lib/friends/server";
import { getCorpusClient } from "@/lib/supabase/server";

/** GET — my accepted friends + pending requests sent to me. */
export async function GET() {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const supabase = getCorpusClient();
  const friends = await listFriends(me.id);

  const { data: pending } = await supabase
    .from("friendships")
    .select("id, requester:requester_id(id,username,display_name,avatar_url)")
    .eq("addressee_id", me.id)
    .eq("status", "pending");

  return NextResponse.json({
    friends,
    pending: pending || [],
    me: { id: me.id, username: me.username, displayName: me.displayName },
  });
}
