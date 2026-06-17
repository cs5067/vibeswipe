"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { AnimatePresence } from "framer-motion";
import Link from "next/link";
import { CardStack } from "@/components/swipe/CardStack";
import { ActionButtons } from "@/components/swipe/ActionButtons";
import { SendSheet } from "@/components/swipe/SendSheet";
import { GradientBackground } from "@/components/ui/GradientBackground";
import { useAlbumColors } from "@/hooks/useAlbumColors";
import { useAudioPreview } from "@/hooks/useAudioPreview";
import { useSessionStore } from "@/stores/session-store";
import { RecommendationEngine } from "@/lib/engine/recommendation-engine";
import type { AppTrack } from "@/types/track";

export default function SwipePage() {
  const engineRef = useRef<RecommendationEngine | null>(null);
  const [visibleTracks, setVisibleTracks] = useState<AppTrack[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [sendTrack, setSendTrack] = useState<AppTrack | null>(null);
  const [unseen, setUnseen] = useState(0);
  const { stop } = useAudioPreview();

  const { addLikedTrack, addSkippedTrack, likedTracks, swipeCount, playlistName, userName, setAuth } =
    useSessionStore();

  const currentTrack = visibleTracks[0] || null;
  const colors = useAlbumColors(currentTrack?.albumImageLarge || null);

  // Fetch user profile
  useEffect(() => {
    fetch("/api/spotify/me")
      .then((r) => {
        if (!r.ok) {
          window.location.href = "/";
          throw new Error("Not authenticated");
        }
        return r.json();
      })
      .then((user) => {
        setAuth(user.id, user.display_name, user.images?.[0]?.url || null);
        setAuthChecked(true);
      })
      .catch((err) => {
        console.error("Auth check failed:", err);
      });
  }, [setAuth]);

  // Initialize engine only after auth is confirmed
  useEffect(() => {
    if (!authChecked) return;

    const engine = new RecommendationEngine();
    engineRef.current = engine;

    engine
      .initialize(playlistName)
      .then(async () => {
        const tracks: AppTrack[] = [];
        for (let i = 0; i < 5; i++) {
          const track = await engine.getNextTrack();
          if (track) tracks.push(track);
        }
        setVisibleTracks(tracks);
        setIsLoading(false);
      })
      .catch((err) => {
        console.error("Engine init error:", err);
        setError("Failed to load your music data. Please try reconnecting.");
        setIsLoading(false);
      });
  }, [authChecked, playlistName]);

  const loadMoreTracks = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine) return;

    const newTrack = await engine.getNextTrack();
    if (newTrack) {
      setVisibleTracks((prev) => [...prev, newTrack]);
    }
  }, []);

  const handleSwipe = useCallback(
    (track: AppTrack, direction: "left" | "right") => {
      stop();

      if (direction === "right") {
        addLikedTrack(track);
      } else {
        addSkippedTrack(track);
      }

      engineRef.current?.recordSwipe(track, direction);
      setVisibleTracks((prev) => prev.filter((t) => t.id !== track.id));
      loadMoreTracks();
    },
    [addLikedTrack, addSkippedTrack, stop, loadMoreTracks]
  );

  const handleButtonSwipe = useCallback(
    (direction: "left" | "right") => {
      if (currentTrack) {
        handleSwipe(currentTrack, direction);
      }
    },
    [currentTrack, handleSwipe]
  );

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") handleButtonSwipe("left");
      if (e.key === "ArrowRight") handleButtonSwipe("right");
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleButtonSwipe]);

  // Poll inbox for unseen recommendations (in-app notification badge)
  useEffect(() => {
    if (!authChecked) return;
    const check = () => {
      fetch("/api/inbox")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d && setUnseen(d.unseen || 0))
        .catch(() => {});
    };
    check();
    const interval = setInterval(check, 20000);
    return () => clearInterval(interval);
  }, [authChecked]);

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center px-6 bg-[#0a0a0f]">
        <div className="text-center">
          <p className="text-white/60 mb-4">{error}</p>
          <Link
            href="/"
            className="px-6 py-3 rounded-full bg-white/10 text-white text-sm hover:bg-white/20 transition-colors inline-block"
          >
            Back to Home
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen flex flex-col">
      <GradientBackground
        primaryColor={colors.primary}
        secondaryColor={colors.secondary}
      />

      {/* Top Bar */}
      <header className="relative z-20 flex items-center justify-between px-5 pt-5 pb-2">
        <Link href="/" className="text-sm font-bold text-gradient">
          vibeswipe
        </Link>

        <div className="flex items-center gap-3">
          <Link
            href="/inbox"
            className="relative glass rounded-full px-3 py-1.5 text-xs text-white/50 hover:text-white/70 transition-colors"
          >
            Inbox
            {unseen > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-pink-500 text-[10px] text-white font-bold flex items-center justify-center">
                {unseen}
              </span>
            )}
          </Link>

          <Link
            href="/playlist"
            className="relative glass rounded-full px-3 py-1.5 text-xs text-white/50 hover:text-white/70 transition-colors"
          >
            Playlist
            {likedTracks.length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#1DB954] text-[10px] text-black font-bold flex items-center justify-center">
                {likedTracks.length}
              </span>
            )}
          </Link>
        </div>
      </header>

      {/* Card Area */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-5 pb-6">
        <div className="relative w-full max-w-[380px] aspect-[3/4.5]">
          {isLoading ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="w-20 h-20 rounded-full border-2 border-white/10 border-t-indigo-500 animate-spin mb-6" />
              <p className="text-white/40 text-sm">Analyzing your music taste...</p>
              <p className="text-white/20 text-xs mt-2">Building your vibe profile</p>
            </div>
          ) : (
            <AnimatePresence mode="popLayout">
              <CardStack tracks={visibleTracks} onSwipe={handleSwipe} />
            </AnimatePresence>
          )}
        </div>

        {/* Action Buttons */}
        {!isLoading && (
          <div className="mt-6 flex flex-col items-center gap-4">
            <ActionButtons
              onSkip={() => handleButtonSwipe("left")}
              onLike={() => handleButtonSwipe("right")}
              disabled={visibleTracks.length === 0}
            />
            {currentTrack && (
              <button
                onClick={() => setSendTrack(currentTrack)}
                className="flex items-center gap-2 px-5 py-2 rounded-full glass text-sm font-semibold text-white/80 hover:text-white transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.27 3.27a.5.5 0 01.67-.61l16.5 8.25a.5.5 0 010 .9L3.94 20.06a.5.5 0 01-.67-.61L6 12zm0 0h6" />
                </svg>
                Make a friend listen
              </button>
            )}
          </div>
        )}

        {/* Keyboard hint */}
        {!isLoading && (
          <p className="mt-4 text-[10px] text-white/15 hidden sm:block">
            ← → arrow keys to swipe
          </p>
        )}
      </div>

      {/* Send-to-friend sheet */}
      {sendTrack && (
        <SendSheet
          track={sendTrack}
          senderName={userName}
          onClose={() => setSendTrack(null)}
        />
      )}

      {/* Bottom: End Session */}
      {swipeCount > 0 && (
        <div className="relative z-20 pb-5 text-center">
          <Link
            href="/summary"
            className="text-xs text-white/20 hover:text-white/40 transition-colors underline underline-offset-2"
          >
            End Session
          </Link>
        </div>
      )}
    </main>
  );
}
