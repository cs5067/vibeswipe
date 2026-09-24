import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SwipeCard } from "../components/SwipeCard";
import { ActionButtons } from "../components/ActionButtons";
import { SendSongSheet } from "../components/SendSongSheet";
import { useSessionStore } from "../stores/session-store";
import { DEEZER_TEST_MODE } from "../lib/discovery-mode";
import {
  getEngineSession,
  markEngineInitialized,
  resetEngineSession,
  type SessionEngine,
} from "../lib/engine/engine-session";
import * as SpotifyAPI from "../lib/spotify/client";
import { fetchInbox } from "../lib/server-api";
import { playbackController } from "../lib/playback-controller";
import { analytics } from "../lib/foundation/analytics";
import { appDataStore } from "../lib/foundation/app-data";
import type { AppTrack } from "../types/track";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface SwipeScreenProps {
  onOpenPlaylist: () => void;
  onEndSession: () => void;
  onOpenInbox: () => void;
  onOpenFriends: () => void;
}

export function SwipeScreen({
  onOpenPlaylist,
  onEndSession,
  onOpenInbox,
  onOpenFriends,
}: SwipeScreenProps) {
  const engineRef = useRef<SessionEngine | null>(null);
  const [visibleTracks, setVisibleTracks] = useState<AppTrack[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [swipeKey, setSwipeKey] = useState(0);
  const [spotifyConnected, setSpotifyConnected] = useState<boolean | null>(null);
  const [isPlayingTrack, setIsPlayingTrack] = useState(false);
  const [debugMode, setDebugMode] = useState(DEEZER_TEST_MODE);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [recommendationStatus, setRecommendationStatus] = useState("Building your vibe profile");
  const [sendSheetTrack, setSendSheetTrack] = useState<AppTrack | null>(null);
  const [unseenCount, setUnseenCount] = useState(0);
  const likedSyncVersionRef = useRef(0);
  const mountedRef = useRef(true);

  const {
    addLikedTrack, addSkippedTrack, addSavedForLater, addSavedToLiked,
    likedTracks, savedForLater, swipeCount,
    playlistName, selectedVibes, saveCurrentPlaylist, sessionStartTime,
  } = useSessionStore();
  const likedTrackKey = likedTracks.map((track) => track.id).join("|");
  const previousLikedTrackKeyRef = useRef(likedTrackKey);

  // The engine outlives this screen (App.tsx unmounts it when the user
  // views their playlist). Mirror visibleTracks in a ref so the unmount
  // cleanup can hand the on-screen cards back to the persistent queue.
  const visibleTracksRef = useRef<AppTrack[]>([]);
  useEffect(() => {
    visibleTracksRef.current = visibleTracks;
  }, [visibleTracks]);

  // Try to connect to Spotify playback on mount
  useEffect(() => {
    if (DEEZER_TEST_MODE) return () => { void playbackController.pause(); };
    let active = true;
    (async () => {
      const found = await playbackController.findDevice();
      if (!active) return;
      setSpotifyConnected(found);
      if (!found) {
        Alert.alert(
          "Open Spotify",
          "Open the Spotify app and play any song for a second, then come back. This lets vibeswipe play previews through your Spotify.",
          [
            { text: "Open Spotify", onPress: () => Linking.openURL("spotify://") },
            { text: "Skip Previews", style: "cancel" },
          ]
        );
      }
    })();

    return () => {
      active = false;
      void playbackController.pause();
    };
  }, []);

  // Inbox badge: check for unheard forced songs every 30s while this
  // screen is on. Silent-fail like all server calls.
  useEffect(() => {
    if (DEEZER_TEST_MODE) return;
    let alive = true;
    const check = async () => {
      const data = await fetchInbox();
      if (alive && data) setUnseenCount(data.unseen || 0);
    };
    void check();
    const interval = setInterval(() => void check(), 30000);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, []);

  // The controller rejects stale audio; this effect also rejects stale UI updates.
  useEffect(() => {
    let active = true;
    if (visibleTracks.length > 0) {
      const topTrack = visibleTracks[0];
      (async () => {
        setIsPlayingTrack(true);
        setPlaybackError(null);
        const success = await playbackController.play(topTrack.uri, {
          name: topTrack.name,
          artist: topTrack.artistNames[0] || "",
          provider: topTrack.provider,
          previewUrl: topTrack.previewUrl,
        });
        if (!active) return;
        if (!success) {
          if (DEEZER_TEST_MODE) setPlaybackError("Preview unavailable. Try another track.");
          else setSpotifyConnected(playbackController.connected);
        }
        setIsPlayingTrack(false);
      })();
    } else {
      void playbackController.pause();
    }
    return () => { active = false; };
  }, [visibleTracks[0]?.id, swipeKey]);

  // Auto-save every 10 swipes
  useEffect(() => {
    if (swipeCount > 0 && swipeCount % 10 === 0) {
      saveCurrentPlaylist();
    }
  }, [swipeCount]);

  useEffect(() => {
    mountedRef.current = true;
    let active = true;
    const sessionKey = `${playlistName}::${sessionStartTime}`;
    const { engine, needsInit } = getEngineSession(sessionKey);
    engineRef.current = engine;
    const saved = useSessionStore.getState();
    engine.restoreSeen?.([...saved.skippedTrackIds, ...saved.savedTrackIds, ...saved.savedForLater.map((t) => t.id)]);
    const statusTimer = setInterval(() => {
      if (active) setRecommendationStatus(engine.getStatusMessage());
    }, 400);

    const dealCards = async () => {
      const tracks: AppTrack[] = [];
      const version = likedSyncVersionRef.current;
      for (let i = 0; i < 5; i++) {
        const track = await engine.getNextTrack();
        if (!track) break;
        tracks.push(track);
        if (!active || version !== likedSyncVersionRef.current) {
          if (!active) engine.requeue(tracks);
          return;
        }
      }
      if (!active) return;
      setVisibleTracks(tracks);
      setRecommendationStatus(engine.getStatusMessage());
      setIsLoading(false);
    };

    if (!needsInit) {
      // RESUME: same session, engine still warm — deal from the live queue,
      // no re-initialization, no cold start.
      console.log("Engine resume: continuing existing session");
      engine.syncLikedTracks(likedTracks);
      dealCards();
    } else {
      analytics.track("session_started", {
        playlistName,
        selectedVibes: selectedVibes.join(","),
      });

      engine
        .initialize(playlistName, selectedVibes, likedTracks)
        .then(async () => {
          markEngineInitialized(sessionKey);
          if (!active) return;
          engine.syncLikedTracks(likedTracks);
          setRecommendationStatus(engine.getStatusMessage());
          await dealCards();
        })
        .catch((err) => {
          if (!active) return;
          console.error("Engine init error:", err);
          setError("Failed to load your music data. Please restart the app.");
          setIsLoading(false);
        });
    }

    return () => {
      active = false;
      clearInterval(statusTimer);
      mountedRef.current = false;
      likedSyncVersionRef.current++;
      // Hand the on-screen cards back so they're the first ones dealt
      // when the user returns from the playlist screen.
      engine.requeue(visibleTracksRef.current);
    };
  }, []);

  useEffect(() => {
    const engine = engineRef.current;
    const previousIds = previousLikedTrackKeyRef.current
      ? previousLikedTrackKeyRef.current.split("|")
      : [];
    const currentIds = new Set(likedTracks.map((track) => track.id));
    const removedFromPlaylist = previousIds.some((id) => id && !currentIds.has(id));

    previousLikedTrackKeyRef.current = likedTrackKey;
    if (!engine) return;

    const syncResult = engine.syncLikedTracks(likedTracks);
    if (!removedFromPlaylist && !syncResult.removed) return;

    const syncVersion = ++likedSyncVersionRef.current;
    setIsLoading(true);
    setRecommendationStatus(engine.getStatusMessage());
    engine
      .getReactiveTracksAfterLike(5)
      .then((tracks) => {
        if (!mountedRef.current || syncVersion !== likedSyncVersionRef.current) return;
        setVisibleTracks(tracks);
        setRecommendationStatus(engine.getStatusMessage());
        setSwipeKey((key) => key + 1);
      })
      .catch((err) => {
        console.error("Failed to rebuild after playlist edit:", err);
      })
      .finally(() => {
        if (syncVersion === likedSyncVersionRef.current) setIsLoading(false);
      });
  }, [likedTrackKey]);

  const loadMore = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine) return;
    const version = likedSyncVersionRef.current;
    setRecommendationStatus(engine.getStatusMessage());
    const newTrack = await engine.getNextTrack();
    if (!mountedRef.current || version !== likedSyncVersionRef.current) return;
    if (newTrack) {
      setVisibleTracks((prev) => [...prev, newTrack]);
    }
    setRecommendationStatus(engine.getStatusMessage());
  }, []);

  const handleSwipe = useCallback(
    async (track: AppTrack, direction: "left" | "right" | "up" | "down") => {
      if (direction === "right") {
        addLikedTrack(track);
        engineRef.current?.recordSwipe(track, "right");
      } else if (direction === "up") {
        addSavedForLater(track);
        if (DEEZER_TEST_MODE) engineRef.current?.restoreSeen?.([track.id]);
        // Don't record as like or dislike — it's neutral for the algorithm
      } else if (direction === "down") {
        // Like the song, but NOT this playlist's vibe → Spotify Liked Songs only
        addSavedToLiked(track);
        engineRef.current?.recordSwipe(track, "down");
        if (!DEEZER_TEST_MODE) SpotifyAPI.saveTracks([track.id]).then((ok) => {
          if (!ok) console.log("Failed to save to Liked Songs:", track.id);
        });
      } else {
        addSkippedTrack(track);
        engineRef.current?.recordSwipe(track, "left");
      }
      analytics.track("track_swiped", {
        trackId: track.id,
        direction,
        strategy: track.strategy || "unknown",
        playlistName,
      });
      if (!DEEZER_TEST_MODE) appDataStore.recordSwipe({
        userId: "local",
        sessionId: playlistName,
        trackId: track.id,
        direction,
        strategy: track.strategy || "unknown",
      }).catch(() => {});

      if (direction === "right") {
        const version = ++likedSyncVersionRef.current;
        setIsLoading(true);
        setRecommendationStatus("Checking available sources for your updated playlist...");
        const reactiveTracks =
          (await engineRef.current?.getReactiveTracksAfterLike(5)) || [];
        if (!mountedRef.current || version !== likedSyncVersionRef.current) return;
        setRecommendationStatus(
          engineRef.current?.getStatusMessage() || "Finding your next vibe..."
        );
        setVisibleTracks(reactiveTracks);
        setIsLoading(false);
        setSwipeKey((k) => k + 1);
        return;
      }

      setVisibleTracks((prev) => prev.filter((t) => t.id !== track.id));
      setSwipeKey((k) => k + 1);
      loadMore();
    },
    [addLikedTrack, addSkippedTrack, addSavedForLater, addSavedToLiked, loadMore, playlistName]
  );

  const handleEndSession = useCallback(async () => {
    playbackController.pause();
    await saveCurrentPlaylist();
    onEndSession();
  }, [onEndSession, saveCurrentPlaylist]);

  const currentTrack = visibleTracks[0] || null;

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity
          style={styles.retryButton}
          onPress={() => {
            setError(null);
            setIsLoading(true);
            // Route the retry through the session holder so the persistent
            // engine and this screen never disagree about which engine is live.
            resetEngineSession();
            const sessionKey = `${playlistName}::${sessionStartTime}`;
            const { engine } = getEngineSession(sessionKey);
            engineRef.current = engine;
            setRecommendationStatus("Restarting recommendation engine...");
            engine.initialize(playlistName, selectedVibes, likedTracks).then(async () => {
              markEngineInitialized(sessionKey);
              setRecommendationStatus(engine.getStatusMessage());
              const tracks: AppTrack[] = [];
              for (let i = 0; i < 5; i++) {
                const t = await engine.getNextTrack();
                if (t) tracks.push(t);
              }
              setVisibleTracks(tracks);
              setRecommendationStatus(engine.getStatusMessage());
              setIsLoading(false);
            }).catch(() => {
              setError("Still can't connect. Check your internet.");
              setIsLoading(false);
            });
          }}
        >
          <Text style={styles.retryText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <View style={styles.topBarLeft}>
          <TouchableOpacity onPress={() => setDebugMode((d) => !d)} activeOpacity={0.7}>
            <Text style={[styles.logo, debugMode && styles.logoDebug]}>
              {debugMode ? "debug mode" : "vibeswipe"}
            </Text>
          </TouchableOpacity>
          {spotifyConnected === false && (
            <TouchableOpacity
              style={styles.connectBadge}
              onPress={async () => {
                await Linking.openURL("spotify://");
                setTimeout(async () => {
                  const found = await playbackController.findDevice();
                  setSpotifyConnected(found);
                }, 3000);
              }}
            >
              <Text style={styles.connectText}>Connect Audio</Text>
            </TouchableOpacity>
          )}
          {spotifyConnected === true && (
            <View style={styles.connectedDot} />
          )}
        </View>
        <View style={styles.topBarRight}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{swipeCount} swiped</Text>
          </View>
          <TouchableOpacity style={styles.playlistBadge} onPress={onOpenPlaylist}>
            <Text style={styles.badgeText}>Playlist</Text>
            {likedTracks.length > 0 && (
              <View style={styles.countBadge}>
                <Text style={styles.countText}>{likedTracks.length}</Text>
              </View>
            )}
          </TouchableOpacity>
          {savedForLater.length > 0 && (
            <View style={styles.savedBadge}>
              <Text style={styles.savedBadgeText}>★ {savedForLater.length}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Social nav — friends + forced-song inbox */}
      {DEEZER_TEST_MODE ? (
        <View style={styles.socialBar}>
          <Text style={[styles.badgeText, { flex: 1 }]} numberOfLines={3}>
            {playbackError || `Deezer preview test · ${currentTrack?._debug?.overlapTarget ? `${currentTrack._debug.overlapCount}/${currentTrack._debug.overlapTarget} likes matched` : "Context discovery"}`}
          </Text>
          {currentTrack?._debug?.playlistUrl && (
            <TouchableOpacity style={styles.socialBadge} onPress={() => Linking.openURL(currentTrack._debug!.playlistUrl!)}>
              <Text style={styles.badgeText}>Source playlist</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : <View style={styles.socialBar}>
        <TouchableOpacity style={styles.socialBadge} onPress={onOpenFriends} activeOpacity={0.7}>
          <Text style={styles.badgeText}>Friends</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.socialBadge} onPress={onOpenInbox} activeOpacity={0.7}>
          <Text style={styles.badgeText}>Inbox</Text>
          {unseenCount > 0 && (
            <View style={styles.unseenBadge}>
              <Text style={styles.unseenText}>{unseenCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>}

      {/* Swipe hint — show once */}
      {swipeCount === 0 && !isLoading && visibleTracks.length > 0 && (
        <View style={styles.hintBar}>
          <Text style={styles.hintText}>→ fits the vibe · ← nope · ↑ save for later</Text>
          <Text style={styles.hintText}>{DEEZER_TEST_MODE ? "↓ love it but wrong vibe · saved on this phone" : "↓ love it but wrong vibe — goes to your Liked Songs"}</Text>
        </View>
      )}

      {/* Card area */}
      <View style={styles.cardArea}>
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#6366f1" />
            <Text style={styles.loadingText}>Finding your next vibe...</Text>
            <Text style={styles.loadingSubtext}>{recommendationStatus}</Text>
          </View>
        ) : visibleTracks.length === 0 ? (
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>No playlist matches yet</Text>
            <Text style={styles.loadingSubtext}>{recommendationStatus}</Text>
            {DEEZER_TEST_MODE && (
              <TouchableOpacity style={styles.retryButton} onPress={async () => {
                const engine = engineRef.current;
                const version = likedSyncVersionRef.current;
                setIsLoading(true);
                await engine?.retry?.();
                const tracks = await engine?.getReactiveTracksAfterLike(5) || [];
                if (!mountedRef.current || version !== likedSyncVersionRef.current) return;
                setVisibleTracks(tracks);
                setRecommendationStatus(engine?.getStatusMessage() || "No matches.");
                setIsLoading(false);
              }}>
                <Text style={styles.retryText}>Retry discovery</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <>
            {visibleTracks
              .slice(0, 3)
              .reverse()
              .map((track, reverseIndex) => {
                const stackSize = Math.min(3, visibleTracks.length);
                const index = stackSize - 1 - reverseIndex;
                const isTop = index === 0;
                return (
                  <SwipeCard
                    key={`${track.id}-${isTop ? swipeKey : "stack"}`}
                    track={track}
                    onSwipe={(direction) => handleSwipe(track, direction)}
                    isTop={isTop}
                    index={index}
                    debugMode={debugMode}
                  />
                );
              })}
          </>
        )}
      </View>

      {/* Action buttons */}
      {!isLoading && currentTrack && (
        <ActionButtons
          onSkip={() => handleSwipe(currentTrack, "left")}
          onLike={() => handleSwipe(currentTrack, "right")}
          onSave={() => handleSwipe(currentTrack, "up")}
          onSaveToLiked={() => handleSwipe(currentTrack, "down")}
          disabled={visibleTracks.length === 0}
        />
      )}

      {/* Force the current card on a friend */}
      {!DEEZER_TEST_MODE && !isLoading && currentTrack && (
        <TouchableOpacity
          onPress={() => setSendSheetTrack(currentTrack)}
          style={styles.sendPill}
          activeOpacity={0.7}
        >
          <Text style={styles.sendPillText}>Make a friend listen 🎧</Text>
        </TouchableOpacity>
      )}

      {/* End session */}
      {swipeCount > 0 && (
        <TouchableOpacity onPress={handleEndSession} style={styles.endSession}>
          <Text style={styles.endSessionText}>End Session</Text>
        </TouchableOpacity>
      )}

      <SendSongSheet track={sendSheetTrack} onClose={() => setSendSheetTrack(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0a0f",
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 8,
    zIndex: 20,
  },
  topBarLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  logo: {
    fontSize: 18,
    fontWeight: "800",
    color: "#a78bfa",
    letterSpacing: -0.5,
  },
  logoDebug: {
    color: "#f97316",
    fontSize: 14,
  },
  connectBadge: {
    backgroundColor: "rgba(29, 185, 84, 0.15)",
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: "rgba(29, 185, 84, 0.3)",
  },
  connectText: {
    color: "#1DB954",
    fontSize: 9,
    fontWeight: "700",
  },
  connectedDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#1DB954",
  },
  topBarRight: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  badge: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    flexDirection: "row",
    alignItems: "center",
  },
  playlistBadge: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "rgba(99, 102, 241, 0.3)",
    flexDirection: "row",
    alignItems: "center",
  },
  savedBadge: {
    backgroundColor: "rgba(167, 139, 250, 0.12)",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "rgba(167, 139, 250, 0.3)",
  },
  savedBadgeText: {
    color: "#a78bfa",
    fontSize: 11,
    fontWeight: "600",
  },
  badgeText: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 12,
    fontWeight: "500",
  },
  countBadge: {
    backgroundColor: "#1DB954",
    borderRadius: 8,
    width: 18,
    height: 18,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 6,
  },
  countText: {
    color: "#000",
    fontSize: 10,
    fontWeight: "800",
  },
  socialBar: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingBottom: 4,
    zIndex: 20,
  },
  socialBadge: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    flexDirection: "row",
    alignItems: "center",
  },
  unseenBadge: {
    backgroundColor: "#6366f1",
    borderRadius: 8,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 6,
  },
  unseenText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "800",
  },
  hintBar: {
    alignItems: "center",
    paddingVertical: 4,
    zIndex: 20,
  },
  hintText: {
    color: "rgba(255,255,255,0.2)",
    fontSize: 11,
    fontWeight: "500",
  },
  cardArea: {
    flex: 1,
    paddingHorizontal: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingContainer: {
    justifyContent: "center",
    alignItems: "center",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#0a0a0f",
    paddingHorizontal: 40,
  },
  loadingText: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 15,
    marginTop: 16,
    fontWeight: "500",
  },
  loadingSubtext: {
    color: "rgba(255,255,255,0.2)",
    fontSize: 12,
    marginTop: 4,
  },
  errorText: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 15,
    textAlign: "center",
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: "#6366f1",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 20,
  },
  retryText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  sendPill: {
    alignSelf: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(129, 140, 248, 0.3)",
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginBottom: 10,
  },
  sendPillText: {
    color: "#a5b4fc",
    fontSize: 12,
    fontWeight: "600",
  },
  endSession: {
    paddingBottom: 36,
    alignItems: "center",
  },
  endSessionText: {
    color: "rgba(255,255,255,0.2)",
    fontSize: 12,
    textDecorationLine: "underline",
  },
});
