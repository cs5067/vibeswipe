import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUUID } from "crypto";
import { getCurrentProfile } from "@/lib/profile/server";
import { getCorpusClient } from "@/lib/supabase/server";
import { isUuid, tallyVotes, EMPTY_TALLY, VOTER_COOKIE } from "@/lib/arena/server";
import { rateLimit, requestIp } from "@/lib/rate-limit";

/**
 * 🔥 / 🤢 a drop. Works anonymously — no login required.
 *
 * voter_key = profile id if logged in, else a uuid in the httpOnly
 * "vibeswipe_voter" cookie (minted here on first vote). Upsert = revote.
 *
 * POST { dropId, value: 1 | -1 } -> { ok: true, score, fires, nahs }
 */
export async function POST(request: NextRequest) {
  const limited = rateLimit(`arena-vote:${requestIp(request)}`, {
    limit: 120,
    windowMs: 60 * 60 * 1000,
  });
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many requests", retryAfterSec: limited.retryAfterSec },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSec) } }
    );
  }

  let body: { dropId?: unknown; value?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!isUuid(body.dropId)) {
    return NextResponse.json({ error: "Invalid dropId" }, { status: 400 });
  }
  if (body.value !== 1 && body.value !== -1) {
    return NextResponse.json({ error: "value must be 1 or -1" }, { status: 400 });
  }
  const dropId = body.dropId;
  const value = body.value;

  try {
    // Identify the voter: profile id beats the anonymous cookie.
    const me = await getCurrentProfile();
    let voterKey = me?.id ?? null;
    let mintCookie = false;
    if (!voterKey) {
      const jar = await cookies();
      const existing = jar.get(VOTER_COOKIE)?.value;
      if (existing && isUuid(existing)) {
        voterKey = existing;
      } else {
        voterKey = randomUUID();
        mintCookie = true;
      }
    }

    const supabase = getCorpusClient();
    const { error } = await supabase
      .from("drop_votes")
      .upsert(
        { drop_id: dropId, voter_key: voterKey, value },
        { onConflict: "drop_id,voter_key" }
      );

    if (error) {
      if (error.code === "23503") {
        return NextResponse.json({ error: "No such drop" }, { status: 404 });
      }
      console.error("arena vote upsert error:", error);
      return NextResponse.json({ error: "Could not vote" }, { status: 500 });
    }

    const tally = (await tallyVotes([dropId], voterKey)).get(dropId) ?? EMPTY_TALLY;
    const res = NextResponse.json({
      ok: true,
      score: tally.score,
      fires: tally.fires,
      nahs: tally.nahs,
    });

    if (mintCookie) {
      res.cookies.set(VOTER_COOKIE, voterKey, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 365, // 1 year
        path: "/",
      });
    }
    return res;
  } catch (err) {
    console.error("arena vote error:", err);
    return NextResponse.json({ error: "Could not vote" }, { status: 500 });
  }
}
