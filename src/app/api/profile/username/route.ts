import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/profile/server";
import { getCorpusClient } from "@/lib/supabase/server";

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

/** POST { username } — claim a username for the current profile. */
export async function POST(request: NextRequest) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: { username?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const username =
    typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
  if (!USERNAME_RE.test(username)) {
    return NextResponse.json(
      { error: "3–20 chars: letters, numbers, underscore" },
      { status: 400 }
    );
  }

  const supabase = getCorpusClient();
  const { error } = await supabase
    .from("profiles")
    .update({ username })
    .eq("id", me.id);

  if (error) {
    if ((error as { code?: string }).code === "23505") {
      return NextResponse.json({ error: "Username taken" }, { status: 409 });
    }
    return NextResponse.json({ error: "Could not set username" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, username });
}
