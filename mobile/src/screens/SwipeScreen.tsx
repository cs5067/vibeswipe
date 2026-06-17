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
import { useSessionStore } from "../stores/session-store";
import { RecommendationEngine } from "../lib/engine/recommendation-engine";
import { playbackController } from "../lib/playback-controller";
import { analytics } from "../lib/foundation/analytics";
import { appDataStore } from "../lib/foundation/app-data";
import type { AppTrack } from "../types/track";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface SwipeScreenProps {
  onOpenPlaylist: () => void;
  onEndSession: () => void;
}

export function SwipeScreen({ onOpenPlaylist, onEndSession }: SwipeScreenProps) {
  const engineRef = useRef<RecommendationEngine | null>(null);
  const [visibleTracks, setVisibleTracks] = useState<AppTrack[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [swipeKey, setSwipeKey] = useState(0);
  const [spotifyConnected, setSpotifyConnected] = useState<boolean | null>(null);
  const [isPlayingTrack, setIsPlayingTrack] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  const [recommendationStatus, setRecommendationStatus] = useState("Building your vibe profile");
  const likedSyncVersionRef = useRef(0);

  const {
    addLikedTrack, addSkippedTrack, addSavedForLater,
    likedTracks, savedForLater, swipeCount,
    playlistName, selectedVibes, saveCurrentPlaylist,
  } = useSessionStore();
  const likedTrackKey = likedTracks.map((track) => track.id).join("|");
  const previousLikedTrackKeyRef = useRef(likedTrackKey);

  // Try to connect to Spotify playback on mount
  useEffect(() => {
    (async () => {
      const found = await playbackController.findDevice();
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
      playbackController.pause();
    };
  }, []);

  // Play the current top track whenever it changes
  useEffect(() => {
    if (visibleTracks.length > 0 && spotifyConnected && playbackController.connected) {
      const topTrack = visibleTracks[0];
      (async () => {
        setIsPlayingTrack(true);
        const success = await playbackController.play(topTrack.uri);
        if (!success) {
          setSpotifyConnected(playbackController.connected);
        }
        setIsPlayingTrack(false);
      })();
    }
  }, [visibleTracks[0]?.id, swipeKey]);

  // Auto-save every 10 swipes
  useEffect(() => {
    if (swipeCount > 0 && swipeCount % 10 === 0) {
      saveCurrentPlaylist();
    }
  }, [swipeCount]);

  useEffect(() => {
    const engine = new RecommendationEngine();
    engineRef.current = engine;

    analytics.track("session_started", {
      playlistName,
      selectedVibes: selectedVibes.join(","),
    });

    engine
      .initialize(playlistName, selectedVibes, likedTracks)
      .then(async () => {
        engine.syncLikedTracks(likedTracks);
        setRecommendationStatus(engine.getStatusMessage());
        const tracks: AppTrack[] = [];
        for (let i = 0; i < 5; i++) {
          const track = await engine.getNextTrack();
          if (track) tracks.push(track);
        }
        setVisibleTracks(tracks);
        setRecommendationStatus(engine.getStatusMessage());
        setIsLoading(false);
      })
      .catch((err) => {
        console.error("Engine init error:", err);
        setError("Failed to load your music data. Please restart the app.");
        setIsLoading(false);
      });
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
        if (syncVersion !== likedSyncVersionRef.current) return;
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
    setRecommendationStatus(engine.getStatusMessage());
    const newTrack = await engine.getNextTrack();
    if (newTrack) {
      setVisibleTracks((prev) => [...prev, newTrack]);
    }
    setRecommendationStatus(engine.getStatusMessage());
  }, []);

  const handleSwipe = useCallback(
    async (track: AppTrack, direction: "left" | "right" | "up") => {
      if (direction === "right") {
        addLikedTrack(track);
        engineRef.current?.recordSwipe(track, "right");
      } else if (direction === "up") {
        addSavedForLater(track);
        // Don't record as like or dislike — it's neutral for the algorithm
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
      appDataStore.recordSwipe({
        userId: "local",
        sessionId: playlistName,
        trackId: track.id,
        direction,
        strategy: track.strategy || "unknown",
      }).catch(() => {});

      if (direction === "right") {
        setIsLoading(true);
        setRecommendationStatus("Checking Spotify playlists that contain your liked songs...");
        const reactiveTracks =
          (await engineRef.current?.getReactiveTracksAfterLike(5)) || [];
        setRecommendationStatus(
          engineRef.current?.getStatusMessage() || "Finding your next vibe..."
        );
        if (reactiveTracks.length > 0) {
          setVisibleTracks(reactiveTracks);
        } else {
          setVisibleTracks((prev) => prev.filter((t) => t.id !== track.id));
          loadMore();
        }
        setIsLoading(false);
        setSwipeKey((k) => k + 1);
        return;
      }

      setVisibleTracks((prev) => prev.filter((t) => t.id !== track.id));
      setSwipeKey((k) => k + 1);
      loadMore();
    },
    [addLikedTrack, addSkippedTrack, addSavedForLater, loadMore, playlistName]
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
            const engine = new RecommendationEngine();
            engineRef.current = engine;
            setRecommendationStatus("Restarting recommendation engine...");
            engine.initialize(playlistName, selectedVibes, likedTracks).then(async () => {
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

      {/* Swipe hint — show once */}
      {swipeCount === 0 && !isLoading && visibleTracks.length > 0 && (
        <View style={styles.hintBar}>
          <Text style={styles.hintText}>← skip · swipe up to save · like →</Text>
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
          disabled={visibleTracks.length === 0}
        />
      )}

      {/* End session */}
      {swipeCount > 0 && (
        <TouchableOpacity onPress={handleEndSession} style={styles.endSession}>
          <Text style={styles.endSessionText}>End Session</Text>
        </TouchableOpacity>
      )}
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
