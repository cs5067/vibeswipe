import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Per-playlist swipe memory — survives app restarts.
 *
 * The engine's seen-set was in-memory only, so "continuing" a playlist in a
 * later app session re-dealt every card from the beginning. This persists
 * the ids of tracks the user actually DECIDED on (swiped left/right/down)
 * keyed by playlist name, and the engine hydrates it on initialize.
 *
 * Dealt-but-unswiped cards are deliberately NOT persisted — an undecided
 * card should greet you again next session.
 */

const KEY_PREFIX = "vibeswipe_seen::";
const MAX_IDS = 2000;
const FLUSH_MS = 500;

let cache: { key: string; ids: string[]; idSet: Set<string> } | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function storageKey(playlistName: string): string {
  return KEY_PREFIX + playlistName.trim().toLowerCase();
}

export async function loadSeen(playlistName: string): Promise<string[]> {
  const key = storageKey(playlistName);
  try {
    const raw = await AsyncStorage.getItem(key);
    const ids: string[] = raw ? JSON.parse(raw) : [];
    cache = { key, ids, idSet: new Set(ids) };
    return ids;
  } catch {
    cache = { key, ids: [], idSet: new Set() };
    return [];
  }
}

export function rememberSeen(playlistName: string, trackId: string): void {
  const key = storageKey(playlistName);
  if (!cache || cache.key !== key) {
    cache = { key, ids: [], idSet: new Set() };
  }
  if (cache.idSet.has(trackId)) return;
  cache.idSet.add(trackId);
  cache.ids.push(trackId);
  if (cache.ids.length > MAX_IDS) {
    const dropped = cache.ids.splice(0, cache.ids.length - MAX_IDS);
    for (const id of dropped) cache.idSet.delete(id);
  }

  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushTimer = null;
    const snapshot = cache;
    if (snapshot) {
      AsyncStorage.setItem(snapshot.key, JSON.stringify(snapshot.ids)).catch(() => {});
    }
  }, FLUSH_MS);
}

export async function clearSeen(playlistName: string): Promise<void> {
  const key = storageKey(playlistName);
  if (cache?.key === key) cache = null;
  await AsyncStorage.removeItem(key).catch(() => {});
}
