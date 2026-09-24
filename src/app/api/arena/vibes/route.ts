import { NextResponse } from "next/server";
import { getCorpusClient } from "@/lib/supabase/server";
import { fetchDrops, tallyVotes, EMPTY_TALLY, type DropRow } from "@/lib/arena/server";

/**
 * The Arena lobby — every vibe room with its drop count and the album
 * art of its top-scored drops. Public, no login.
 *
 * GET -> { vibes: [{ slug, name, dropCount, topArt: string[] }] }
 */
export async function GET() {
  try {
    const supabase = getCorpusClient();

    const { data: vibes, error: vibesErr } = await supabase
      .from("vibes")
      .select("id, slug, name")
      .order("created_at", { ascending: true });

    if (vibesErr) {
      console.error("arena vibes fetch error:", vibesErr);
      return NextResponse.json({ error: "Could not load vibes" }, { status: 500 });
    }

    const allDrops = await fetchDrops();
    const tallies = await tallyVotes(allDrops.map((d) => d.id), null);

    const byVibe = new Map<string, DropRow[]>();
    for (const drop of allDrops) {
      const list = byVibe.get(drop.vibe_id);
      if (list) list.push(drop);
      else byVibe.set(drop.vibe_id, [drop]);
    }

    const result = (vibes ?? []).map((vibe) => {
      const vibeDrops = (byVibe.get(vibe.id) ?? []).slice().sort((a, b) => {
        const scoreDiff =
          (tallies.get(b.id) ?? EMPTY_TALLY).score - (tallies.get(a.id) ?? EMPTY_TALLY).score;
        if (scoreDiff !== 0) return scoreDiff;
        return b.created_at < a.created_at ? -1 : 1;
      });

      const topArt: string[] = [];
      for (const drop of vibeDrops) {
        const image = drop.track?.albumImage;
        if (typeof image === "string" && image && !topArt.includes(image)) {
          topArt.push(image);
          if (topArt.length === 3) break;
        }
      }

      return {
        slug: vibe.slug,
        name: vibe.name,
        dropCount: vibeDrops.length,
        topArt,
      };
    });

    return NextResponse.json({ vibes: result });
  } catch (err) {
    console.error("arena vibes error:", err);
    return NextResponse.json({ error: "Could not load vibes" }, { status: 500 });
  }
}
