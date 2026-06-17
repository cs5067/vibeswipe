import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/profile/server";
import { getCorpusClient } from "@/lib/supabase/server";

/** GET — recommendations sent to me, newest first, with sender info. */
export async function GET() {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const supabase = getCorpusClient();
  const { data, error } = await supabase
    .from("recommendations")
    .select(
      "id, track, note, status, created_at, from:from_id(id,username,display_name,avatar_url)"
    )
    .eq("to_id", me.id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("inbox fetch error:", error);
    return NextResponse.json({ error: "Could not load inbox" }, { status: 500 });
  }

  const unseen = (data || []).filter((r) => r.status === "unseen").length;
  return NextResponse.json({ items: data || [], unseen });
}

/** PATCH { id, status } — mark a rec 'seen' or 'listened'. */
export async function PATCH(request: NextRequest) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: { id?: unknown; status?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id : null;
  const status = body.status === "seen" || body.status === "listened" ? body.status : null;
  if (!id || !status) {
    return NextResponse.json({ error: "Missing id or status" }, { status: 400 });
  }

  const supabase = getCorpusClient();
  const patch: Record<string, unknown> = { status };
  if (status === "listened") patch.listened_at = new Date().toISOString();

  const { error } = await supabase
    .from("recommendations")
    .update(patch)
    .eq("id", id)
    .eq("to_id", me.id); // can only touch your own inbox

  if (error) {
    console.error("inbox patch error:", error);
    return NextResponse.json({ error: "Could not update" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
