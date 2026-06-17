"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { previewPlayer } from "@/lib/audio/preview-player";
import { resolvePreview } from "@/lib/audio/resolve-preview";
import type { SharedSong } from "@/types/share";

export function SharedSongView({ share }: { share: SharedSong }) {
  const { track, senderName, note } = share;
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(track.previewUrl);

  useEffect(() => {
    if (!previewPlayer) return;
    const p = previewPlayer;
    const unsub = p.subscribe(() => {
      setIsPlaying(p.isPlaying);
      setProgress(p.progress);
    });
    return () => {
      unsub();
      p.stop();
    };
  }, []);

  // Deezer fallback so the recipient can always hear the song.
  useEffect(() => {
    if (track.previewUrl) return;
    let alive = true;
    resolvePreview(track.name, track.artistNames, track.previewUrl).then((url) => {
      if (alive && url) setPreviewUrl(url);
    });
    return () => {
      alive = false;
    };
  }, [track.previewUrl, track.name, track.artistNames]);

  const sender = senderName?.trim() || "Someone";

  return (
    <main className="relative min-h-screen flex flex-col items-center justify-center px-6 py-10 overflow-hidden">
      {/* ambient background from album art */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[#0a0a0f]" />
        {track.albumImage && (
          <Image
            src={track.albumImage}
            alt=""
            fill
            className="object-cover opacity-30 blur-3xl scale-110"
            priority
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/60 to-black/90" />
      </div>

      {/* sender line */}
      <p className="text-white/60 text-sm mb-5 text-center">
        <span className="font-semibold text-white">{sender}</span> says you
        <span className="text-white"> have</span> to hear this 👇
      </p>

      {/* the song card */}
      <div className="w-full max-w-[340px] rounded-3xl overflow-hidden glass-strong shadow-2xl">
        <div className="relative aspect-square w-full">
          {track.albumImage ? (
            <Image
              src={track.albumImage}
              alt={track.name}
              fill
              className="object-cover"
              sizes="340px"
              priority
            />
          ) : (
            <div className="w-full h-full bg-white/5" />
          )}

          {/* play button overlay */}
          {previewUrl && (
            <button
              onClick={() => previewPlayer?.toggle(previewUrl)}
              className="absolute inset-0 flex items-center justify-center group"
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              <span className="w-16 h-16 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center group-hover:scale-110 transition-transform">
                {isPlaying ? (
                  <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                  </svg>
                ) : (
                  <svg className="w-7 h-7 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </span>
            </button>
          )}
        </div>

        <div className="p-5 bg-black/40">
          <h1 className="text-xl font-bold text-white truncate">{track.name}</h1>
          <p className="text-white/60 text-sm mt-1 truncate">
            {track.artistNames.join(", ")}
          </p>

          {/* progress bar */}
          {previewUrl && (
            <div className="mt-3 h-1 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-white/60 rounded-full"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
          )}

          {/* note */}
          {note?.trim() && (
            <p className="mt-4 text-sm text-white/80 italic border-l-2 border-white/20 pl-3">
              “{note.trim()}”
            </p>
          )}

          {/* open in spotify */}
          {track.spotifyUrl && (
            <a
              href={track.spotifyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 w-full flex items-center justify-center gap-2 py-3 rounded-full bg-[#1DB954] text-black font-bold text-sm no-underline"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
              </svg>
              Open in Spotify
            </a>
          )}
        </div>
      </div>

      {/* the loop: send one back */}
      <div className="mt-8 text-center">
        <p className="text-white/40 text-sm mb-3">
          Think your taste is better?
        </p>
        <Link
          href="/"
          className="inline-block px-7 py-3 rounded-full bg-white/10 hover:bg-white/20 text-white font-semibold text-sm transition-colors no-underline"
        >
          Send one back →
        </Link>
        <p className="mt-5 text-[11px] text-white/20">
          made with <span className="text-gradient font-bold">vibeswipe</span>
        </p>
      </div>
    </main>
  );
}
