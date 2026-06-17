"use client";

import { useEffect, useState } from "react";
import { motion, useMotionValue, useTransform, type PanInfo } from "framer-motion";
import Image from "next/image";
import type { AppTrack } from "@/types/track";
import { useAudioPreview } from "@/hooks/useAudioPreview";
import { resolvePreview } from "@/lib/audio/resolve-preview";

const SWIPE_THRESHOLD = 120;
const SWIPE_VELOCITY = 500;

interface SwipeCardProps {
  track: AppTrack;
  onSwipe: (direction: "left" | "right") => void;
  isTop: boolean;
  index: number;
}

export function SwipeCard({ track, onSwipe, isTop, index }: SwipeCardProps) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-300, 0, 300], [-18, 0, 18]);
  const likeOpacity = useTransform(x, [0, 80, 150], [0, 0.5, 1]);
  const nopeOpacity = useTransform(x, [-150, -80, 0], [1, 0.5, 0]);
  const scale = useTransform(x, [-300, 0, 300], [0.95, 1, 0.95]);
  const { isPlaying, progress, toggle } = useAudioPreview();

  // Spotify rarely ships preview_url anymore — resolve via Deezer when this
  // card reaches the top of the stack. undefined = resolving, null = none.
  const [resolved, setResolved] = useState<string | null | undefined>(
    track.previewUrl || undefined
  );
  useEffect(() => {
    if (!isTop || track.previewUrl) return;
    let alive = true;
    resolvePreview(track.name, track.artistNames, track.previewUrl).then((url) => {
      if (alive) setResolved(url);
    });
    return () => {
      alive = false;
    };
  }, [isTop, track.previewUrl, track.name, track.artistNames]);

  const previewUrl = track.previewUrl || resolved || null;

  const handleDragEnd = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const swipeRight =
      info.offset.x > SWIPE_THRESHOLD || info.velocity.x > SWIPE_VELOCITY;
    const swipeLeft =
      info.offset.x < -SWIPE_THRESHOLD || info.velocity.x < -SWIPE_VELOCITY;

    if (swipeRight) {
      onSwipe("right");
    } else if (swipeLeft) {
      onSwipe("left");
    }
  };

  // Stack positioning
  const stackScale = 1 - index * 0.05;
  const stackY = index * 12;

  return (
    <motion.div
      className="absolute inset-0 cursor-grab active:cursor-grabbing"
      style={{
        x: isTop ? x : 0,
        rotate: isTop ? rotate : 0,
        scale: isTop ? scale : stackScale,
        y: stackY,
        zIndex: 10 - index,
      }}
      drag={isTop ? "x" : false}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.9}
      onDragEnd={isTop ? handleDragEnd : undefined}
      initial={{ scale: stackScale, y: stackY + 20, opacity: 0 }}
      animate={{ scale: stackScale, y: stackY, opacity: index < 3 ? 1 : 0 }}
      exit={{
        x: 500 * (x.get() > 0 ? 1 : -1),
        opacity: 0,
        rotate: x.get() > 0 ? 20 : -20,
        transition: { duration: 0.3 },
      }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
    >
      <div className="relative w-full h-full rounded-3xl overflow-hidden glass-strong shadow-2xl">
        {/* Album Art */}
        <div className="relative w-full h-[65%]">
          {track.albumImageLarge ? (
            <Image
              src={track.albumImageLarge}
              alt={track.albumName}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 90vw, 400px"
              priority={index === 0}
            />
          ) : (
            <div className="w-full h-full bg-white/5 flex items-center justify-center">
              <svg className="w-20 h-20 text-white/20" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
              </svg>
            </div>
          )}

          {/* Gradient overlay at bottom of image */}
          <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-black/80 to-transparent" />

          {/* LIKE indicator */}
          {isTop && (
            <motion.div
              className="absolute top-6 left-6 px-4 py-2 rounded-xl border-3 border-green-400 bg-green-400/20 backdrop-blur-sm"
              style={{ opacity: likeOpacity }}
            >
              <span className="text-green-400 font-bold text-xl tracking-wider">LIKE</span>
            </motion.div>
          )}

          {/* NOPE indicator */}
          {isTop && (
            <motion.div
              className="absolute top-6 right-6 px-4 py-2 rounded-xl border-3 border-red-400 bg-red-400/20 backdrop-blur-sm"
              style={{ opacity: nopeOpacity }}
            >
              <span className="text-red-400 font-bold text-xl tracking-wider">NOPE</span>
            </motion.div>
          )}

          {/* Explicit badge */}
          {track.explicit && (
            <div className="absolute top-6 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-white/20 backdrop-blur-sm rounded text-[10px] font-bold text-white/80 tracking-widest">
              EXPLICIT
            </div>
          )}
        </div>

        {/* Track Info */}
        <div className="relative h-[35%] p-5 flex flex-col justify-between bg-black/40">
          <div>
            <h2 className="text-xl font-bold text-white truncate leading-tight">
              {track.name}
            </h2>
            <p className="text-white/60 text-sm mt-1 truncate">
              {track.artistNames.join(", ")}
            </p>
            <p className="text-white/40 text-xs mt-0.5 truncate">
              {track.albumName}
            </p>

            {/* Genre tags */}
            {track.genres.length > 0 && (
              <div className="flex gap-1.5 mt-2.5 flex-wrap">
                {track.genres.slice(0, 3).map((genre) => (
                  <span
                    key={genre}
                    className="px-2.5 py-0.5 rounded-full bg-white/10 text-white/50 text-[10px] font-medium"
                  >
                    {genre}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Audio preview button + progress */}
          {isTop && (
            <div className="flex items-center gap-3">
              {previewUrl ? (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggle(previewUrl);
                    }}
                    className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
                  >
                    {isPlaying ? (
                      <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    )}
                  </button>
                  <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-white/50 rounded-full transition-all duration-100"
                      style={{ width: `${progress * 100}%` }}
                    />
                  </div>
                </>
              ) : resolved === undefined ? (
                <span className="text-xs text-white/25">finding preview…</span>
              ) : (
                <a
                  href={track.spotifyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-xs text-[#1DB954] hover:text-[#1ed760] font-medium flex items-center gap-1.5"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
                  </svg>
                  Open in Spotify
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
