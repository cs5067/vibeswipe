"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { previewPlayer } from "@/lib/audio/preview-player";
import { resolvePreview } from "@/lib/audio/resolve-preview";
import type { ArenaDrop } from "../types";
import { DropComposer } from "./DropComposer";

export function VibeRoom({ slug }: { slug: string }) {
  const [vibeName, setVibeName] = useState(slug.replace(/-/g, " "));
  const [drops, setDrops] = useState<ArenaDrop[]>([]);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [noPreview, setNoPreview] = useState<Set<string>>(new Set());

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) setLoading(true);
      try {
        const res = await fetch(`/api/arena/vibe/${slug}`);
        if (!res.ok) {
          if (!opts?.silent) setMissing(true);
          return;
        }
        const data = await res.json();
        if (data?.vibe?.name) setVibeName(data.vibe.name);
        setDrops(data?.drops || []);
      } catch {
        // keep whatever we have — the retry is just a reload away
      } finally {
        if (!opts?.silent) setLoading(false);
      }
    },
    [slug]
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!previewPlayer) return;
    const p = previewPlayer;
    const unsub = p.subscribe(() => {
      if (!p.isPlaying) setPlayingId(null);
    });
    return () => {
      unsub();
      p.stop();
    };
  }, []);

  const play = async (drop: ArenaDrop) => {
    if (playingId === drop.id) {
      previewPlayer?.pause();
      setPlayingId(null);
      return;
    }
    // Spotify rarely ships preview_url anymore — fall back to Deezer.
    const url = await resolvePreview(
      drop.track.name,
      drop.track.artistNames,
      drop.track.previewUrl
    );
    if (url) {
      previewPlayer?.play(url);
      setPlayingId(drop.id);
    } else {
      setNoPreview((s) => new Set(s).add(drop.id));
      if (drop.track.spotifyUrl) window.open(drop.track.spotifyUrl, "_blank");
    }
  };

  const vote = async (drop: ArenaDrop, value: 1 | -1) => {
    // Optimistic prepends carry a temp id the server doesn't know yet.
    if (drop.id.startsWith("temp-")) return;
    if (drop.myVote === value) return; // already picked — nothing to do

    setDrops((prev) =>
      prev.map((d) => {
        if (d.id !== drop.id) return d;
        let fires = d.fires;
        let nahs = d.nahs;
        if (d.myVote === 1) fires -= 1;
        if (d.myVote === -1) nahs -= 1;
        if (value === 1) fires += 1;
        else nahs += 1;
        return { ...d, fires, nahs, score: fires - nahs, myVote: value };
      })
    );

    try {
      const res = await fetch("/api/arena/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dropId: drop.id, value }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (typeof data?.score !== "number") return;
      // Reconcile with the server's authoritative counts.
      setDrops((prev) =>
        prev.map((d) =>
          d.id === drop.id
            ? { ...d, score: data.score, fires: data.fires, nahs: data.nahs }
            : d
        )
      );
    } catch {
      // network hiccup — the optimistic state stands until the next load
    }
  };

  const handleDropped = (drop: ArenaDrop) => {
    setDrops((prev) => [drop, ...prev]);
    // Silent refetch swaps the temp id for the real one so votes work.
    void load({ silent: true });
  };

  if (missing) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <p className="text-white/60 mb-4">This vibe doesn’t exist.</p>
        <Link
          href="/arena"
          className="px-6 py-3 rounded-full bg-white/10 hover:bg-white/20 text-white text-sm no-underline"
        >
          Back to the arena
        </Link>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen flex flex-col items-center px-5 py-6 sm:py-10">
      {/* Background */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[#0a0a0f]" />
        <div className="absolute top-[-20%] right-[-10%] w-[60%] h-[60%] rounded-full blur-[150px] opacity-20 bg-indigo-600 animate-pulse-glow" />
        <div
          className="absolute bottom-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full blur-[130px] opacity-15 bg-purple-600 animate-pulse-glow"
          style={{ animationDelay: "1s" }}
        />
      </div>

      <div className="w-full max-w-2xl flex flex-col flex-1">
        <header className="flex items-center justify-between mb-6">
          <Link href="/arena" className="text-sm text-white/40 hover:text-white/70 transition-colors">
            ← the arena
          </Link>
          <Link href="/" className="text-sm text-white/40 hover:text-white/70 transition-colors">
            vibeswipe
          </Link>
        </header>

        <div className="text-center mb-6">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
            <span className="text-gradient">{vibeName}</span>
          </h1>
          <p className="mt-2 text-sm text-white/40">
            ranked by strangers. 🔥 lifts a drop, 🤢 buries it.
          </p>
        </div>

        <div className="mb-6">
          <DropComposer vibeSlug={slug} onDropped={handleDropped} />
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center py-16">
            <div className="w-10 h-10 rounded-full border-2 border-white/10 border-t-indigo-500 animate-spin" />
          </div>
        ) : drops.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-8 py-16">
            <p className="text-white/60 mb-2">No drops in this vibe yet</p>
            <p className="text-white/30 text-sm">Be the first — drop a song above. 🎧</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {drops.map((drop, i) => (
              <div key={drop.id} className="glass rounded-2xl p-4 flex gap-3 items-center">
                <span className="text-xs font-mono text-white/25 w-6 text-right shrink-0">
                  {i + 1}
                </span>

                {drop.track.albumImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={drop.track.albumImage}
                    alt=""
                    className="w-14 h-14 rounded-xl object-cover shrink-0"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-xl bg-white/5 shrink-0" />
                )}

                <div className="min-w-0 flex-1">
                  {drop.dropper === null ? (
                    <p className="text-white/35 text-xs font-semibold">
                      seeded by the algorithm — dethrone it
                    </p>
                  ) : (
                    <p className="text-indigo-300 text-xs font-semibold truncate">
                      dropped by {drop.dropper}
                    </p>
                  )}
                  <p className="text-white font-semibold truncate">{drop.track.name}</p>
                  <p className="text-white/50 text-sm truncate">
                    {drop.track.artistNames.join(", ")}
                  </p>
                  {drop.note?.trim() && (
                    <p className="text-white/70 text-xs italic mt-1 truncate">
                      “{drop.note.trim()}”
                    </p>
                  )}

                  <div className="flex items-center gap-1.5 mt-2">
                    <button
                      onClick={() => void vote(drop, 1)}
                      className={`h-7 px-2.5 rounded-full text-xs flex items-center gap-1 transition-colors ${
                        drop.myVote === 1
                          ? "bg-white/15 ring-1 ring-white/30"
                          : "bg-white/5 hover:bg-white/10"
                      }`}
                      aria-label="Vote 🔥"
                    >
                      🔥 <span className="text-white/70 font-semibold">{drop.fires}</span>
                    </button>
                    <button
                      onClick={() => void vote(drop, -1)}
                      className={`h-7 px-2.5 rounded-full text-xs flex items-center gap-1 transition-colors ${
                        drop.myVote === -1
                          ? "bg-white/15 ring-1 ring-white/30"
                          : "bg-white/5 hover:bg-white/10"
                      }`}
                      aria-label="Vote 🤢"
                    >
                      🤢 <span className="text-white/70 font-semibold">{drop.nahs}</span>
                    </button>
                    <span
                      className={`ml-1 text-xs font-bold ${
                        drop.score > 0
                          ? "text-white/70"
                          : drop.score < 0
                          ? "text-white/30"
                          : "text-white/40"
                      }`}
                    >
                      {drop.score > 0 ? `+${drop.score}` : drop.score}
                    </span>
                  </div>
                </div>

                {noPreview.has(drop.id) ? (
                  <a
                    href={drop.track.spotifyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#1DB954] text-xs font-medium shrink-0"
                  >
                    Spotify
                  </a>
                ) : (
                  <button
                    onClick={() => void play(drop)}
                    className="w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center shrink-0"
                    aria-label="Play"
                  >
                    {playingId === drop.id ? (
                      <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    )}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        <p className="mt-12 pb-2 text-center text-xs text-white/25">
          want the full app?{" "}
          <Link href="/" className="underline underline-offset-2 hover:text-white/50 transition-colors">
            grab a waitlist spot on the home page
          </Link>
        </p>
      </div>
    </main>
  );
}
