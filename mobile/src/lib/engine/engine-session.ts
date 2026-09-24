import { RecommendationEngine } from "./recommendation-engine";
import { DeezerRecommendationEngine } from "./deezer-engine";
import { DEEZER_TEST_MODE } from "../discovery-mode";

export type SessionEngine = Pick<RecommendationEngine,
  "initialize" | "getNextTrack" | "requeue" | "syncLikedTracks" |
  "getStatusMessage" | "recordSwipe" | "getReactiveTracksAfterLike"> & {
  restoreSeen?: (ids: string[]) => void;
  retry?: () => Promise<void>;
};

/**
 * Module-level engine holder — the engine must OUTLIVE SwipeScreen.
 *
 * App.tsx conditionally renders screens, so opening the playlist unmounts
 * SwipeScreen entirely. Keeping the engine (queue, seen-set, taste state)
 * here means coming back resumes exactly where the user left off instead
 * of cold-starting the session.
 *
 * Identity is `${playlistName}::${sessionStartTime}` — resetSession/logout
 * bump sessionStartTime, so a genuinely new session gets a fresh engine
 * automatically.
 */

interface EngineSession {
  key: string;
  engine: SessionEngine;
  initialized: boolean;
}

let session: EngineSession | null = null;

/** Get (or create) the engine for this session key. `needsInit` is true
 *  until markEngineInitialized() is called — a failed initialize() retries
 *  on next mount instead of resuming a broken engine. */
export function getEngineSession(key: string): {
  engine: SessionEngine;
  needsInit: boolean;
} {
  if (session && session.key === key) {
    return { engine: session.engine, needsInit: !session.initialized };
  }
  session = { key, engine: DEEZER_TEST_MODE ? new DeezerRecommendationEngine() : new RecommendationEngine(), initialized: false };
  return { engine: session.engine, needsInit: true };
}

export function markEngineInitialized(key: string): void {
  if (session?.key === key) session.initialized = true;
}

export function resetEngineSession(): void {
  session = null;
}
