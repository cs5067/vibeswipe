import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/profile/server";
import { isProfileId } from "@/lib/friends/server";
import { getCorpusClient } from "@/lib/supabase/server";

/**
 * POST { toId } — send a friend request.
 * If a request from the other side already exists, this accepts it.
 */
export async function POST(request: NextRequest) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: { toId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const toId = isProfileId(body.toId) ? body.toId : null;
  if (!toId || toId === me.id) {
    return NextResponse.json({ error: "Invalid target" }, { status: 400 });
  }

  const supabase = getCorpusClient();

  // If they already requested ME, accept it instead of duplicating.
  const { data: reverse } = await supabase
    .from("friendships")
    .select("id, status")
    .eq("requester_id", toId)
    .eq("addressee_id", me.id)
    .maybeSingle();

  if (reverse) {
    if (reverse.status !== "accepted") {
      await supabase
        .from("friendships")
        .update({ status: "accepted", responded_at: new Date().toISOString() })
        .eq("id", reverse.id);
    }
    return NextResponse.json({ ok: true, status: "accepted" });
  }

  const { error } = await supabase.from("friendships").insert({
    requester_id: me.id,
    addressee_id: toId,
    status: "pending",
  });

  if (error) {
    if ((error as { code?: string }).code === "23505") {
      return NextResponse.json({ ok: true, status: "pending" }); // already sent
    }
    return NextResponse.json({ error: "Could not send request" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, status: "pending" });
}
