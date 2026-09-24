import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/profile/server";
import { getCorpusClient } from "@/lib/supabase/server";
import { rateLimit, requestIp } from "@/lib/rate-limit";

/**
 * GET ?q= — find profiles by username prefix (excluding yourself).
 *
 * Deliberately does NOT return profile ids. The profile id is the value
 * carried in the session cookie; handing it to any signed-in caller made
 * every account enumerable. Callers address people by username and the
 * server resolves it (see /api/friends/request).
 */
export async function GET(request: NextRequest) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const limited = rateLimit(`friend-search:${requestIp(request)}`, {
    limit: 60,
    windowMs: 60 * 1000,
  });
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many requests", retryAfterSec: limited.retryAfterSec },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSec) } }
    );
  }

  const q = (new URL(request.url).searchParams.get("q") || "").trim().toLowerCase();
  if (q.length < 2) return NextResponse.json({ results: [] });

  const supabase = getCorpusClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("username, display_name, avatar_url")
    .ilike("username", `${q}%`)
    .neq("id", me.id)
    .not("username", "is", null)
    .limit(10);

  if (error) {
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
  return NextResponse.json({ results: data || [] });
}
