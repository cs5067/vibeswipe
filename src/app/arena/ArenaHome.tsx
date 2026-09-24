"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import type { VibeSummary } from "./types";

export function ArenaHome() {
  const [vibes, setVibes] = useState<VibeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetch("/api/arena/vibes");
      if (!res.ok) {
        setFailed(true);
        return;
      }
      const data = await res.json();
      setVibes(data.vibes || []);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="relative min-h-screen flex flex-col items-center px-5 py-6 sm:py-10">
      {/* Background */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[#0a0a0f]" />
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full blur-[150px] opacity-20 bg-indigo-600 animate-pulse-glow" />
        <div
          className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full blur-[130px] opacity-15 bg-purple-600 animate-pulse-glow"
          style={{ animationDelay: "1s" }}
        />
      </div>

      <div className="w-full max-w-2xl flex flex-col flex-1">
        <header className="flex items-center justify-between mb-8">
          <Link href="/" className="text-sm text-white/40 hover:text-white/70 transition-colors">
            ← vibeswipe
          </Link>
        </header>

        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="text-center mb-10"
        >
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
            <span className="text-gradient">the arena</span>
          </h1>
          <p className="mt-3 text-lg text-white/60">
            drop songs into a vibe. strangers judge.
          </p>
          <p className="mt-1 text-sm text-white/30">
            the algorithm seeded these — dethrone it. no login needed to vote. 🔥
          </p>
        </motion.div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center py-16">
            <div className="w-10 h-10 rounded-full border-2 border-white/10 border-t-indigo-500 animate-spin" />
          </div>
        ) : failed ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-16">
            <p className="text-white/60 mb-4">the arena is warming up.</p>
            <button
              onClick={() => void load()}
              className="px-6 py-3 rounded-full bg-white/10 hover:bg-white/20 text-white text-sm"
            >
              try again
            </button>
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="grid grid-cols-2 gap-3 sm:gap-4"
          >
            {vibes.map((v) => {
              const art = (v.topArt || []).filter(Boolean).slice(0, 3);
              return (
                <Link
                  key={v.slug}
                  href={`/arena/${v.slug}`}
                  className="glass rounded-2xl p-4 flex flex-col gap-3 hover:bg-white/10 transition-colors"
                >
                  <div className="flex -space-x-3 h-10 items-center">
                    {art.length > 0 ? (
                      art.map((url, i) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={`${url}-${i}`}
                          src={url}
                          alt=""
                          className="w-10 h-10 rounded-lg object-cover border border-[#0a0a0f] shrink-0"
                          style={{ zIndex: 3 - i }}
                        />
                      ))
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center text-sm">
                        🎧
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-white font-semibold truncate">{v.name}</p>
                    <p className="text-white/40 text-xs mt-0.5">
                      {v.dropCount} {v.dropCount === 1 ? "drop" : "drops"}
                    </p>
                  </div>
                </Link>
              );
            })}
          </motion.div>
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
