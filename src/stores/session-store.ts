"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AppTrack } from "@/types/track";
import type { SwipeRecord } from "@/types/session";

interface SessionState {
  isAuthenticated: boolean;
  userId: string | null;
  userName: string | null;
  userImage: string | null;
  likedTracks: AppTrack[];
  skippedTrackIds: string[];
  swipeHistory: SwipeRecord[];
  swipeCount: number;
  sessionStartTime: number;
  playlistName: string;

  setAuth: (userId: string, userName: string, userImage: string | null) => void;
  addLikedTrack: (track: AppTrack) => void;
  removeLikedTrack: (trackId: string) => void;
  addSkippedTrack: (track: AppTrack) => void;
  setPlaylistName: (name: string) => void;
  resetSession: () => void;
  logout: () => void;
}

const getDefaultPlaylistName = () => {
  const date = new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  return `Vibe Session - ${date}`;
};

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      isAuthenticated: false,
      userId: null,
      userName: null,
      userImage: null,
      likedTracks: [],
      skippedTrackIds: [],
      swipeHistory: [],
      swipeCount: 0,
      sessionStartTime: Date.now(),
      playlistName: getDefaultPlaylistName(),

      setAuth: (userId, userName, userImage) =>
        set({ isAuthenticated: true, userId, userName, userImage }),

      addLikedTrack: (track) =>
        set((state) => ({
          likedTracks: [...state.likedTracks, track],
          swipeCount: state.swipeCount + 1,
          swipeHistory: [
            ...state.swipeHistory,
            { track, direction: "right", timestamp: Date.now(), strategy: track.strategy || "unknown" },
          ],
        })),

      removeLikedTrack: (trackId) =>
        set((state) => ({
          likedTracks: state.likedTracks.filter((t) => t.id !== trackId),
        })),

      addSkippedTrack: (track) =>
        set((state) => ({
          skippedTrackIds: [...state.skippedTrackIds, track.id],
          swipeCount: state.swipeCount + 1,
          swipeHistory: [
            ...state.swipeHistory,
            { track, direction: "left", timestamp: Date.now(), strategy: track.strategy || "unknown" },
          ],
        })),

      setPlaylistName: (name) => set({ playlistName: name }),

      resetSession: () =>
        set({
          likedTracks: [],
          skippedTrackIds: [],
          swipeHistory: [],
          swipeCount: 0,
          sessionStartTime: Date.now(),
          playlistName: getDefaultPlaylistName(),
        }),

      logout: () =>
        set({
          isAuthenticated: false,
          userId: null,
          userName: null,
          userImage: null,
          likedTracks: [],
          skippedTrackIds: [],
          swipeHistory: [],
          swipeCount: 0,
          sessionStartTime: Date.now(),
          playlistName: getDefaultPlaylistName(),
        }),
    }),
    {
      name: "music-tinder-session",
      partialize: (state) => ({
        likedTracks: state.likedTracks,
        playlistName: state.playlistName,
        swipeCount: state.swipeCount,
        sessionStartTime: state.sessionStartTime,
      }),
    }
  )
);
