import React, { useRef, useEffect, useState } from "react";
import {
  Animated,
  Dimensions,
  Image,
  PanResponder,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import type { AppTrack } from "../types/track";
import { DebugOverlay } from "./DebugOverlay";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.25;
const SWIPE_UP_THRESHOLD = SCREEN_HEIGHT * 0.12;

interface SwipeCardProps {
  track: AppTrack;
  onSwipe: (direction: "left" | "right" | "up") => void;
  isTop: boolean;
  index: number;
  debugMode?: boolean;
}

export function SwipeCard({ track, onSwipe, isTop, index, debugMode }: SwipeCardProps) {
  const position = useRef(new Animated.ValueXY()).current;
  const isTopRef = useRef(isTop);
  const [showDebug, setShowDebug] = useState(false);
  // Track if a gesture moved enough to be a swipe (not a tap)
  const didMoveRef = useRef(false);

  useEffect(() => {
    isTopRef.current = isTop;
  }, [isTop]);

  // Reset debug when card changes
  useEffect(() => {
    setShowDebug(false);
  }, [track.id]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => isTopRef.current,
      onMoveShouldSetPanResponder: (_, gesture) =>
        isTopRef.current && (Math.abs(gesture.dx) > 5 || Math.abs(gesture.dy) > 5),
      onPanResponderGrant: () => {
        didMoveRef.current = false;
      },
      onPanResponderMove: (_, gesture) => {
        if (Math.abs(gesture.dx) > 10 || Math.abs(gesture.dy) > 10) {
          didMoveRef.current = true;
        }
        if (gesture.dy < -30 && Math.abs(gesture.dy) > Math.abs(gesture.dx)) {
          position.setValue({ x: gesture.dx * 0.3, y: gesture.dy });
        } else {
          position.setValue({ x: gesture.dx, y: gesture.dy * 0.3 });
        }
      },
      onPanResponderRelease: (_, gesture) => {
        // Swipe UP
        if (gesture.dy < -SWIPE_UP_THRESHOLD && gesture.vy < -0.5) {
          Animated.timing(position, {
            toValue: { x: 0, y: -SCREEN_HEIGHT },
            duration: 300,
            useNativeDriver: true,
          }).start(() => onSwipe("up"));
        }
        // Swipe RIGHT
        else if (gesture.dx > SWIPE_THRESHOLD || gesture.vx > 1.2) {
          Animated.timing(position, {
            toValue: { x: SCREEN_WIDTH * 1.5, y: gesture.dy },
            duration: 250,
            useNativeDriver: true,
          }).start(() => onSwipe("right"));
        }
        // Swipe LEFT
        else if (gesture.dx < -SWIPE_THRESHOLD || gesture.vx < -1.2) {
          Animated.timing(position, {
            toValue: { x: -SCREEN_WIDTH * 1.5, y: gesture.dy },
            duration: 250,
            useNativeDriver: true,
          }).start(() => onSwipe("left"));
        }
        // Snap back
        else {
          Animated.spring(position, {
            toValue: { x: 0, y: 0 },
            friction: 6,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  const handleTap = () => {
    // Only toggle debug if it was a tap, not a swipe
    if (!didMoveRef.current && debugMode && isTop) {
      setShowDebug((prev) => !prev);
    }
  };

  const rotate = position.x.interpolate({
    inputRange: [-SCREEN_WIDTH, 0, SCREEN_WIDTH],
    outputRange: ["-12deg", "0deg", "12deg"],
  });

  const likeOpacity = position.x.interpolate({
    inputRange: [0, SWIPE_THRESHOLD],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });

  const nopeOpacity = position.x.interpolate({
    inputRange: [-SWIPE_THRESHOLD, 0],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });

  const saveOpacity = position.y.interpolate({
    inputRange: [-SWIPE_UP_THRESHOLD, 0],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });

  const stackScale = 1 - index * 0.05;
  const stackTranslateY = index * 12;

  const animatedStyle = isTop
    ? {
        transform: [
          { translateX: position.x },
          { translateY: position.y },
          { rotate },
        ],
      }
    : {
        transform: [{ scale: stackScale }, { translateY: stackTranslateY }],
        opacity: index < 3 ? 1 - index * 0.2 : 0,
      };

  return (
    <Animated.View
      style={[styles.card, animatedStyle, { zIndex: 10 - index }]}
      {...(isTop ? panResponder.panHandlers : {})}
    >
      <TouchableWithoutFeedback onPress={handleTap}>
        <View style={styles.cardInner}>
          {/* Full-bleed album art */}
          <Image
            source={{ uri: track.albumImageLarge || track.albumImageUrl }}
            style={styles.albumImage}
          />

          {/* Dark gradient overlay for readability */}
          <View style={styles.gradientBottom} />

          {/* LIKE stamp */}
          {isTop && (
            <Animated.View style={[styles.likeOverlay, { opacity: likeOpacity }]}>
              <Text style={styles.likeText}>LIKE</Text>
            </Animated.View>
          )}

          {/* NOPE stamp */}
          {isTop && (
            <Animated.View style={[styles.nopeOverlay, { opacity: nopeOpacity }]}>
              <Text style={styles.nopeText}>NOPE</Text>
            </Animated.View>
          )}

          {/* SAVE stamp — swipe up */}
          {isTop && (
            <Animated.View style={[styles.saveOverlay, { opacity: saveOpacity }]}>
              <Text style={styles.saveText}>SAVE</Text>
              <Text style={styles.saveSubtext}>for later</Text>
            </Animated.View>
          )}

          {/* Track info at the bottom */}
          <View style={styles.infoContainer}>
            <Text style={styles.trackName} numberOfLines={2}>
              {track.name}
            </Text>
            <Text style={styles.artistName} numberOfLines={1}>
              {track.artistNames.join(", ")}
            </Text>
            <Text style={styles.albumNameText} numberOfLines={1}>
              {track.albumName}
            </Text>

            {track.genres.length > 0 && (
              <View style={styles.genreRow}>
                {track.genres.slice(0, 3).map((genre) => (
                  <View key={genre} style={styles.genreTag}>
                    <Text style={styles.genreText}>{genre}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Debug mode hint */}
          {debugMode && isTop && !showDebug && (
            <View style={styles.debugHint}>
              <Text style={styles.debugHintText}>tap for debug</Text>
            </View>
          )}

          {/* Debug overlay */}
          {showDebug && isTop && <DebugOverlay track={track} />}
        </View>
      </TouchableWithoutFeedback>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: "absolute",
    width: SCREEN_WIDTH - 40,
    height: "100%",
    borderRadius: 24,
    backgroundColor: "#1a1a2e",
    overflow: "hidden",
    alignSelf: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 10,
  },
  cardInner: {
    flex: 1,
  },
  albumImage: {
    width: "100%",
    height: "100%",
    position: "absolute",
    resizeMode: "cover",
  },
  gradientBottom: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: "55%",
    backgroundColor: "rgba(0,0,0,0.7)",
  },
  likeOverlay: {
    position: "absolute",
    top: 40,
    left: 24,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: "#4ade80",
    backgroundColor: "rgba(74, 222, 128, 0.25)",
    zIndex: 20,
  },
  likeText: {
    color: "#4ade80",
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: 3,
  },
  nopeOverlay: {
    position: "absolute",
    top: 40,
    right: 24,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: "#f87171",
    backgroundColor: "rgba(248, 113, 113, 0.25)",
    zIndex: 20,
  },
  nopeText: {
    color: "#f87171",
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: 3,
  },
  saveOverlay: {
    position: "absolute",
    top: "35%",
    alignSelf: "center",
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 3,
    borderColor: "#a78bfa",
    backgroundColor: "rgba(167, 139, 250, 0.3)",
    zIndex: 20,
    alignItems: "center",
  },
  saveText: {
    color: "#a78bfa",
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: 3,
  },
  saveSubtext: {
    color: "#a78bfa",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 2,
    opacity: 0.8,
  },
  infoContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 24,
    paddingBottom: 28,
  },
  trackName: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "800",
    textShadowColor: "rgba(0,0,0,0.8)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  artistName: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 16,
    marginTop: 4,
    fontWeight: "600",
    textShadowColor: "rgba(0,0,0,0.8)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  albumNameText: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 13,
    marginTop: 2,
    textShadowColor: "rgba(0,0,0,0.8)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  genreRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 12,
  },
  genreTag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  genreText: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 11,
    fontWeight: "600",
  },
  debugHint: {
    position: "absolute",
    top: 12,
    alignSelf: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
  },
  debugHintText: {
    color: "rgba(255,255,255,0.3)",
    fontSize: 9,
    fontWeight: "600",
  },
});
