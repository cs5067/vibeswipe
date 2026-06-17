"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { useSessionStore } from "@/stores/session-store";

export default function PlaylistPage() {
  const { likedTracks, removeLikedTrack, playlistName, setPlaylistName } =
    useSessionStore();
  const [isExporting, setIsExporting] = useState(false);
  const [exportedUrl, setExportedUrl] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  const handleExport = async () => {
    if (likedTracks.length === 0 || isExporting) return;
    setIsExporting(true);

    try {
      // Create playlist
      const createRes = await fetch("/api/spotify/playlist/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: playlistName,
          description: `Created with vibeswipe — ${likedTracks.length} tracks curated by swiping.`,
        }),
      });

      if (!createRes.ok) throw new Error("Failed to create playlist");
      const playlist = await createRes.json();

      // Add tracks
      const addRes = await fetch(`/api/spotify/playlist/${playlist.id}/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uris: likedTracks.map((t) => t.uri) }),
      });

      if (!addRes.ok) throw new Error("Failed to add tracks");

      setExportedUrl(playlist.external_urls.spotify);
    } catch (err) {
      console.error("Export error:", err);
      alert("Failed to export playlist. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <main className="relative min-h-screen bg-[#0a0a0f]">
      {/* Background glow */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute top-[-20%] left-1/2 -translate-x-1/2 w-[60%] h-[40%] rounded-full blur-[150px] opacity-10 bg-indigo-600" />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-30 glass-strong px-5 py-4">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <Link
            href="/swipe"
            className="flex items-center gap-2 text-white/50 hover:text-white/70 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            <span className="text-sm">Back</span>
          </Link>

          <div className="text-center flex-1 px-4">
            {isEditing ? (
              <input
                type="text"
                value={playlistName}
                onChange={(e) => setPlaylistName(e.target.value)}
                onBlur={() => setIsEditing(false)}
                onKeyDown={(e) => e.key === "Enter" && setIsEditing(false)}
                autoFocus
                className="bg-transparent text-center text-sm font-bold text-white outline-none border-b border-white/20 w-full"
              />
            ) : (
              <button
                onClick={() => setIsEditing(true)}
                className="text-sm font-bold text-white hover:text-white/80 transition-colors"
              >
                {playlistName}
                <svg className="w-3 h-3 inline ml-1.5 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </button>
            )}
            <p className="text-[10px] text-white/30 mt-0.5">
              {likedTracks.length} {likedTracks.length === 1 ? "track" : "tracks"}
            </p>
          </div>

          {!exportedUrl ? (
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={handleExport}
              disabled={likedTracks.length === 0 || isExporting}
              className="px-4 py-2 rounded-full bg-[#1DB954] text-black text-xs font-bold
                         disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[#1ed760] transition-colors"
            >
              {isExporting ? (
                <span className="flex items-center gap-2">
                  <div className="w-3 h-3 border border-black/30 border-t-black rounded-full animate-spin" />
                  Saving
                </span>
              ) : (
                "Export"
              )}
            </motion.button>
          ) : (
            <a
              href={exportedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 rounded-full bg-[#1DB954] text-black text-xs font-bold hover:bg-[#1ed760] transition-colors"
            >
              Open ↗
            </a>
          )}
        </div>
      </header>

      {/* Export success banner */}
      <AnimatePresence>
        {exportedUrl && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-[#1DB954]/10 border-b border-[#1DB954]/20 px-5 py-3 text-center">
              <p className="text-sm text-[#1DB954]">
                Playlist saved to Spotify!
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Track list */}
      <div className="max-w-lg mx-auto px-5 py-4">
        {likedTracks.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-white/5 flex items-center justify-center">
              <svg className="w-8 h-8 text-white/20" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
              </svg>
            </div>
            <p className="text-white/30 text-sm">No tracks yet</p>
            <p className="text-white/15 text-xs mt-1">
              Swipe right on tracks you like
            </p>
            <Link
              href="/swipe"
              className="inline-block mt-6 px-5 py-2.5 rounded-full bg-white/5 text-white/50 text-sm hover:bg-white/10 transition-colors"
            >
              Start Swiping
            </Link>
          </div>
        ) : (
          <motion.div layout className="space-y-1">
            <AnimatePresence>
              {likedTracks.map((track, index) => (
                <motion.div
                  key={track.id}
                  layout
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20, height: 0 }}
                  transition={{ delay: index * 0.02 }}
                  className="group flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-colors"
                >
                  {/* Number */}
                  <span className="text-[10px] text-white/20 w-5 text-right font-mono">
                    {index + 1}
                  </span>

                  {/* Album art */}
                  <div className="relative w-11 h-11 rounded-lg overflow-hidden flex-shrink-0 bg-white/5">
                    {track.albumImageUrl ? (
                      <Image
                        src={track.albumImageUrl}
                        alt={track.albumName}
                        fill
                        className="object-cover"
                        sizes="44px"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <svg className="w-5 h-5 text-white/10" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                        </svg>
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">
                      {track.name}
                    </p>
                    <p className="text-xs text-white/40 truncate">
                      {track.artistNames.join(", ")}
                    </p>
                  </div>

                  {/* Remove button */}
                  <button
                    onClick={() => removeLikedTrack(track.id)}
                    className="w-8 h-8 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-white/10 transition-all"
                  >
                    <svg className="w-4 h-4 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </div>
    </main>
  );
}
