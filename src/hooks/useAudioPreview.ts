"use client";

import { useState, useEffect, useCallback } from "react";
import { previewPlayer } from "@/lib/audio/preview-player";

export function useAudioPreview() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!previewPlayer) return;

    const player = previewPlayer;
    const unsubscribe = player.subscribe(() => {
      setIsPlaying(player.isPlaying);
      setProgress(player.progress);
    });

    return unsubscribe;
  }, []);

  const play = useCallback((url: string) => {
    previewPlayer?.play(url);
  }, []);

  const pause = useCallback(() => {
    previewPlayer?.pause();
  }, []);

  const stop = useCallback(() => {
    previewPlayer?.stop();
  }, []);

  const toggle = useCallback((url: string) => {
    previewPlayer?.toggle(url);
  }, []);

  return { isPlaying, progress, play, pause, stop, toggle };
}
