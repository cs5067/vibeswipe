import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { AppTrack, SwipeRecord } from "../types/track";

// ─── Saved playlist shape (persisted to AsyncStorage) ───
export interface SavedPlaylist {
  id: string;
  name: string;
  vibes: string[];
  tracks: AppTrack[];
  savedForLater: AppTrack[];
  createdAt: number;
  updatedAt: number;
  swipeCount: number;
}

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
  selectedVibes: string[];
  savedForLater: AppTrack[];
  savedPlaylists: SavedPlaylist[];
  currentPlaylistId: string | null;

  setAuth: (userId: string, userName: string, userImage: string | null) => void;
  addLikedTrack: (track: AppTrack) => void;
  removeLikedTrack: (trackId: string) => void;
  addSkippedTrack: (track: AppTrack) => void;
  addSavedForLater: (track: AppTrack) => void;
  setPlaylistName: (name: string) => void;
  setSelectedVibes: (vibes: string[]) => void;
  resetSession: () => void;
  logout: () => void;
  saveCurrentPlaylist: () => Promise<void>;
  loadSavedPlaylists: () => Promise<void>;
  resumePlaylist: (id: string) => void;
  deletePlaylist: (id: string) => Promise<void>;
}

const getDefaultPlaylistName = () => {
  const date = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `Vibe Session - ${date}`;
};

const STORAGE_KEY = "vibeswipe_playlists";

export const useSessionStore = create<SessionState>((set, get) => ({
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
  selectedVibes: [],
  savedForLater: [],
  savedPlaylists: [],
  currentPlaylistId: null,

  setAuth: (userId, userName, userImage) =>
    set({ isAuthenticated: true, userId, userName, userImage }),

  addLikedTrack: (track) =>
    set((state) => {
      const alreadyLiked = state.likedTracks.some((liked) => liked.id === track.id);
      return {
        likedTracks: alreadyLiked ? state.likedTracks : [...state.likedTracks, track],
        swipeCount: state.swipeCount + 1,
        swipeHistory: [
          ...state.swipeHistory,
          { track, direction: "right", timestamp: Date.now(), strategy: track.strategy || "unknown" },
        ],
      };
    }),

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

  addSavedForLater: (track) =>
    set((state) => {
      // Don't add duplicates
      if (state.savedForLater.some((t) => t.id === track.id)) return {};
      return {
        savedForLater: [...state.savedForLater, track],
        swipeCount: state.swipeCount + 1,
      };
    }),

  setPlaylistName: (name) => set({ playlistName: name }),

  setSelectedVibes: (vibes) => set({ selectedVibes: vibes }),

  resetSession: () =>
    set({
      likedTracks: [],
      skippedTrackIds: [],
      swipeHistory: [],
      swipeCount: 0,
      sessionStartTime: Date.now(),
      playlistName: getDefaultPlaylistName(),
      selectedVibes: [],
      savedForLater: [],
      currentPlaylistId: null,
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
      selectedVibes: [],
      savedForLater: [],
      currentPlaylistId: null,
    }),

  saveCurrentPlaylist: async () => {
    const state = get();
    if (state.likedTracks.length === 0 && state.savedForLater.length === 0) return;

    const id = state.currentPlaylistId || `playlist_${Date.now()}`;
    const playlist: SavedPlaylist = {
      id,
      name: state.playlistName,
      vibes: state.selectedVibes,
      tracks: state.likedTracks,
      savedForLater: state.savedForLater,
      createdAt: state.currentPlaylistId
        ? state.savedPlaylists.find((p) => p.id === id)?.createdAt || Date.now()
        : Date.now(),
      updatedAt: Date.now(),
      swipeCount: state.swipeCount,
    };

    const existing = state.savedPlaylists.filter((p) => p.id !== id);
    const updated = [playlist, ...existing];

    set({ savedPlaylists: updated, currentPlaylistId: id });

    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      console.log(`Saved playlist "${playlist.name}" (${playlist.tracks.length} tracks)`);
    } catch (err) {
      console.error("Failed to save playlist:", err);
    }
  },

  loadSavedPlaylists: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const playlists: SavedPlaylist[] = JSON.parse(raw);
        set({ savedPlaylists: playlists });
      }
    } catch (err) {
      console.error("Failed to load playlists:", err);
    }
  },

  resumePlaylist: (id) => {
    const state = get();
    const playlist = state.savedPlaylists.find((p) => p.id === id);
    if (!playlist) return;

    set({
      playlistName: playlist.name,
      selectedVibes: playlist.vibes,
      likedTracks: playlist.tracks,
      savedForLater: playlist.savedForLater,
      swipeCount: playlist.swipeCount,
      currentPlaylistId: id,
      sessionStartTime: Date.now(),
    });
  },

  deletePlaylist: async (id) => {
    const state = get();
    const updated = state.savedPlaylists.filter((p) => p.id !== id);
    set({ savedPlaylists: updated });
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (err) {
      console.error("Failed to delete playlist:", err);
    }
  },
}));
