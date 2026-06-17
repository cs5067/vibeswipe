import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/profile/server";
import { getCorpusClient } from "@/lib/supabase/server";

/** GET ?q= — find profiles by username prefix (excluding yourself). */
export async function GET(request: NextRequest) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const q = (new URL(request.url).searchParams.get("q") || "").trim().toLowerCase();
  if (q.length < 2) return NextResponse.json({ results: [] });

  const supabase = getCorpusClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url")
    .ilike("username", `${q}%`)
    .neq("id", me.id)
    .limit(10);

  if (error) {
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
  return NextResponse.json({ results: data || [] });
}
