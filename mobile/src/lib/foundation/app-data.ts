import type { AppTrack } from "../../types/track";

export interface StoredSwipe {
  userId: string;
  sessionId: string;
  trackId: string;
  direction: "left" | "right" | "up";
  strategy: string;
  createdAt: string;
}

export interface StoredSession {
  id: string;
  userId: string;
  playlistName: string;
  selectedVibes: string[];
  createdAt: string;
}

export interface AppDataStore {
  createSession(input: Omit<StoredSession, "id" | "createdAt">): Promise<StoredSession>;
  recordSwipe(input: Omit<StoredSwipe, "createdAt">): Promise<void>;
  savePlaylist(input: {
    userId: string;
    sessionId: string;
    name: string;
    tracks: AppTrack[];
  }): Promise<void>;
}

class LocalOnlyDataStore implements AppDataStore {
  async createSession(input: Omit<StoredSession, "id" | "createdAt">): Promise<StoredSession> {
    return {
      ...input,
      id: `session_${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
  }

  async recordSwipe(): Promise<void> {}

  async savePlaylist(): Promise<void> {}
}

export const appDataStore: AppDataStore = new LocalOnlyDataStore();
