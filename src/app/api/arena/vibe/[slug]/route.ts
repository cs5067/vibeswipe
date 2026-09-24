import { NextResponse } from "next/server";
import { getCorpusClient } from "@/lib/supabase/server";
import {
  fetchDrops,
  getVibeBySlug,
  getVoterKey,
  isVibeSlug,
  tallyVotes,
  EMPTY_TALLY,
} from "@/lib/arena/server";

/**
 * One vibe room — its drops ranked by score. Public, no login.
 * dropper is a display name, or null = "the algorithm" seeded it.
 *
 * GET -> { vibe: { slug, name }, drops: [{ id, track, note, dropper,
 *          score, fires, nahs, myVote, createdAt }] }
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  if (!isVibeSlug(slug)) {
    return NextResponse.json({ error: "Invalid vibe" }, { status: 400 });
  }

  try {
    const vibe = await getVibeBySlug(slug);
    if (!vibe) {
      return NextResponse.json({ error: "No such vibe" }, { status: 404 });
    }

    const allDrops = await fetchDrops(vibe.id);
    const voterKey = await getVoterKey();
    const tallies = await tallyVotes(allDrops.map((d) => d.id), voterKey);

    // Resolve dropper display names in one query.
    const dropperIds = [
      ...new Set(allDrops.map((d) => d.dropped_by).filter((x): x is string => !!x)),
    ];
    const names = new Map<string, string | null>();
    if (dropperIds.length > 0) {
      const { data: profiles } = await getCorpusClient()
        .from("profiles")
        .select("id, display_name, username")
        .in("id", dropperIds);
      for (const p of profiles ?? []) {
        names.set(p.id, p.display_name || p.username || null);
      }
    }

    const ranked = allDrops
      .map((d) => {
        const tally = tallies.get(d.id) ?? EMPTY_TALLY;
        return {
          id: d.id,
          track: d.track,
          note: d.note,
          dropper: d.dropped_by ? names.get(d.dropped_by) ?? null : null,
          score: tally.score,
          fires: tally.fires,
          nahs: tally.nahs,
          myVote: tally.myVote,
          createdAt: d.created_at,
        };
      })
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return b.createdAt < a.createdAt ? -1 : 1;
      });

    return NextResponse.json({
      vibe: { slug: vibe.slug, name: vibe.name },
      drops: ranked,
    });
  } catch (err) {
    console.error("arena vibe error:", err);
    return NextResponse.json({ error: "Could not load vibe" }, { status: 500 });
  }
}
