"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { useSessionStore } from "@/stores/session-store";

export default function SummaryPage() {
  const [summaryTime] = useState(() => Date.now());
  const { likedTracks, swipeCount, swipeHistory, sessionStartTime, resetSession } =
    useSessionStore();

  const stats = useMemo(() => {
    const rightSwipes = swipeHistory.filter((s) => s.direction === "right").length;
    const leftSwipes = swipeHistory.filter((s) => s.direction === "left").length;
    const likeRatio = swipeCount > 0 ? Math.round((rightSwipes / swipeCount) * 100) : 0;

    // Session duration
    const durationMs = summaryTime - sessionStartTime;
    const minutes = Math.floor(durationMs / 60000);

    // Top genres from liked tracks
    const genreCounts = new Map<string, number>();
    for (const track of likedTracks) {
      for (const genre of track.genres) {
        genreCounts.set(genre, (genreCounts.get(genre) || 0) + 1);
      }
    }
    const topGenres = Array.from(genreCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);

    // Top artists from liked tracks
    const artistCounts = new Map<string, number>();
    for (const track of likedTracks) {
      const artist = track.artistNames[0];
      if (artist) artistCounts.set(artist, (artistCounts.get(artist) || 0) + 1);
    }
    const topArtists = Array.from(artistCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    // Strategy breakdown
    const strategyCounts = new Map<string, number>();
    for (const s of swipeHistory.filter((s) => s.direction === "right")) {
      strategyCounts.set(s.strategy, (strategyCounts.get(s.strategy) || 0) + 1);
    }

    return {
      rightSwipes,
      leftSwipes,
      likeRatio,
      minutes,
      topGenres,
      topArtists,
      strategyCounts: Array.from(strategyCounts.entries()),
    };
  }, [likedTracks, swipeCount, swipeHistory, sessionStartTime, summaryTime]);

  const maxGenreCount = stats.topGenres.length > 0 ? stats.topGenres[0][1] : 1;

  return (
    <main className="relative min-h-screen bg-[#0a0a0f]">
      {/* Background */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full blur-[150px] opacity-15 bg-purple-600" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full blur-[120px] opacity-10 bg-indigo-600" />
      </div>

      <div className="max-w-lg mx-auto px-5 py-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-10"
        >
          <h1 className="text-3xl font-bold text-gradient mb-2">Session Complete</h1>
          <p className="text-white/40 text-sm">
            {stats.minutes} min session
          </p>
        </motion.div>

        {/* Stats Grid */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-3 gap-3 mb-8"
        >
          <div className="glass rounded-2xl p-4 text-center">
            <p className="text-2xl font-bold text-white">{swipeCount}</p>
            <p className="text-[10px] text-white/30 mt-1">Total Swipes</p>
          </div>
          <div className="glass rounded-2xl p-4 text-center">
            <p className="text-2xl font-bold text-green-400">{stats.rightSwipes}</p>
            <p className="text-[10px] text-white/30 mt-1">Liked</p>
          </div>
          <div className="glass rounded-2xl p-4 text-center">
            <p className="text-2xl font-bold text-white">{stats.likeRatio}%</p>
            <p className="text-[10px] text-white/30 mt-1">Like Rate</p>
          </div>
        </motion.div>

        {/* Top Genres */}
        {stats.topGenres.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="glass rounded-2xl p-5 mb-4"
          >
            <h2 className="text-sm font-bold text-white/70 mb-4">Your Vibe</h2>
            <div className="space-y-2.5">
              {stats.topGenres.map(([genre, count], i) => (
                <motion.div
                  key={genre}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + i * 0.05 }}
                >
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-white/60">{genre}</span>
                    <span className="text-white/20">{count}</span>
                  </div>
                  <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${(count / maxGenreCount) * 100}%` }}
                      transition={{ delay: 0.4 + i * 0.05, duration: 0.5 }}
                      className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500"
                    />
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Top Artists */}
        {stats.topArtists.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="glass rounded-2xl p-5 mb-4"
          >
            <h2 className="text-sm font-bold text-white/70 mb-3">Top Artists</h2>
            <div className="flex flex-wrap gap-2">
              {stats.topArtists.map(([artist, count]) => (
                <span
                  key={artist}
                  className="px-3 py-1.5 rounded-full bg-white/5 text-xs text-white/50"
                >
                  {artist}
                  <span className="ml-1.5 text-white/20">{count}</span>
                </span>
              ))}
            </div>
          </motion.div>
        )}

        {/* Discovery breakdown */}
        {stats.strategyCounts.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="glass rounded-2xl p-5 mb-8"
          >
            <h2 className="text-sm font-bold text-white/70 mb-3">How You Discovered</h2>
            <div className="flex flex-wrap gap-2">
              {stats.strategyCounts.map(([strategy, count]) => {
                const labels: Record<string, string> = {
                  genre_search: "Genre Match",
                  adjacent_genre: "Genre Exploration",
                  artist_deep_dive: "Deep Dive",
                  sequential: "Flow Match",
                  artist_crawl: "Artist Discovery",
                };
                return (
                  <span
                    key={strategy}
                    className="px-3 py-1.5 rounded-full bg-white/5 text-xs text-white/40"
                  >
                    {labels[strategy] || strategy}
                    <span className="ml-1.5 text-white/20">{count}</span>
                  </span>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* Actions */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="flex flex-col gap-3"
        >
          <Link
            href="/playlist"
            className="w-full py-3.5 rounded-full bg-[#1DB954] text-black font-bold text-center text-sm hover:bg-[#1ed760] transition-colors"
          >
            View Playlist ({likedTracks.length} tracks)
          </Link>
          <Link
            href="/swipe"
            onClick={() => resetSession()}
            className="w-full py-3.5 rounded-full bg-white/5 text-white/60 font-medium text-center text-sm hover:bg-white/10 transition-colors"
          >
            New Session
          </Link>
          <Link
            href="/"
            className="w-full py-3 text-center text-xs text-white/20 hover:text-white/40 transition-colors"
          >
            Back to Home
          </Link>
        </motion.div>
      </div>
    </main>
  );
}
