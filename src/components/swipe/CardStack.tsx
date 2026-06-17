"use client";

import { AnimatePresence } from "framer-motion";
import { SwipeCard } from "./SwipeCard";
import type { AppTrack } from "@/types/track";

interface CardStackProps {
  tracks: AppTrack[];
  onSwipe: (track: AppTrack, direction: "left" | "right") => void;
}

export function CardStack({ tracks, onSwipe }: CardStackProps) {
  if (tracks.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin-slow w-16 h-16 mx-auto mb-4 rounded-full border-2 border-white/10 border-t-white/40" />
          <p className="text-white/40 text-sm">Finding your next vibe...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      <AnimatePresence mode="popLayout">
        {tracks.slice(0, 3).map((track, index) => (
          <SwipeCard
            key={track.id}
            track={track}
            onSwipe={(direction) => onSwipe(track, direction)}
            isTop={index === 0}
            index={index}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
