import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/profile/server";

/**
 * GET — returns an invite link for the current profile.
 * The link is just /invite/<profileId>; opening it (while signed in)
 * sends a friend request to that profile.
 */
export async function GET() {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const base = process.env.NEXT_PUBLIC_BASE_URL || "";
  return NextResponse.json({ url: `${base}/invite/${me.id}` });
}
