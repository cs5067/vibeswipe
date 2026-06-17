import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/profile/server";
import { getCorpusClient } from "@/lib/supabase/server";

/** POST { requestId, accept } — accept or decline a pending request sent to me. */
export async function POST(request: NextRequest) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: { requestId?: unknown; accept?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const requestId = typeof body.requestId === "string" ? body.requestId : null;
  const accept = body.accept === true;
  if (!requestId) return NextResponse.json({ error: "Missing requestId" }, { status: 400 });

  const supabase = getCorpusClient();

  if (accept) {
    const { error } = await supabase
      .from("friendships")
      .update({ status: "accepted", responded_at: new Date().toISOString() })
      .eq("id", requestId)
      .eq("addressee_id", me.id); // only the recipient can accept
    if (error) return NextResponse.json({ error: "Failed" }, { status: 500 });
  } else {
    await supabase
      .from("friendships")
      .delete()
      .eq("id", requestId)
      .eq("addressee_id", me.id);
  }
  return NextResponse.json({ ok: true });
}
