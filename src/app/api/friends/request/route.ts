import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/profile/server";
import { getCorpusClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";

/**
 * POST { toUsername } — send a friend request.
 * If a request from the other side already exists, this accepts it.
 *
 * Addressing is by username, not profile id: ids are session material and
 * are no longer handed to clients (see /api/friends/search). The username
 * is resolved to a profile id here, server-side.
 */
export async function POST(request: NextRequest) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const limited = rateLimit(`friend-request:${me.id}`, {
    limit: 30,
    windowMs: 60 * 60 * 1000,
  });
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many requests", retryAfterSec: limited.retryAfterSec },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSec) } }
    );
  }

  let body: { toUsername?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const toUsername =
    typeof body.toUsername === "string" && body.toUsername.trim().length >= 2
      ? body.toUsername.trim().toLowerCase()
      : null;
  if (!toUsername) {
    return NextResponse.json({ error: "Invalid target" }, { status: 400 });
  }

  const supabase = getCorpusClient();

  const { data: target } = await supabase
    .from("profiles")
    .select("id")
    .ilike("username", toUsername)
    .maybeSingle();

  // Same response whether the username is missing or is your own, so this
  // endpoint can't be used to probe which usernames exist.
  if (!target?.id || target.id === me.id) {
    return NextResponse.json({ ok: true, status: "pending" });
  }
  const toId = target.id as string;

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
