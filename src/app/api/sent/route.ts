import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/profile/server";
import { getCorpusClient } from "@/lib/supabase/server";

/** GET — recommendations I sent, with recipient + listened status.
 *  This is the payoff side of the loop: "did they actually listen?" */
export async function GET() {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const supabase = getCorpusClient();
  const { data, error } = await supabase
    .from("recommendations")
    .select(
      "id, track, note, status, created_at, listened_at, to:to_id(id,username,display_name,avatar_url)"
    )
    .eq("from_id", me.id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("sent fetch error:", error);
    return NextResponse.json({ error: "Could not load sent" }, { status: 500 });
  }
  return NextResponse.json({ items: data || [] });
}
