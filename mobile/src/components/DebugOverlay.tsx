import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import type { AppTrack } from "../types/track";

interface DebugOverlayProps {
  track: AppTrack;
}

const STRATEGY_LABELS: Record<string, { label: string; color: string; desc: string }> = {
  artist_search: {
    label: "ARTIST SEARCH",
    color: "#60a5fa",
    desc: "Found by searching an artist name on Spotify",
  },
  playlist_cooccur: {
    label: "PLAYLIST CO-OCCUR",
    color: "#34d399",
    desc: "Found in a playlist that also contains music you like",
  },
  playlist_overlap: {
    label: "EXACT PLAYLIST MATCH",
    color: "#22c55e",
    desc: "Found after verifying a liked song appears in the source playlist",
  },
  name_search: {
    label: "PLAYLIST NAME",
    color: "#a78bfa",
    desc: "Found in a playlist matching your session name",
  },
  album_dive: {
    label: "ALBUM DIVE",
    color: "#fb923c",
    desc: "Found by exploring albums from an artist",
  },
  query_search: {
    label: "QUERY SEARCH",
    color: "#f472b6",
    desc: "Found via a mood/genre search query",
  },
  library: {
    label: "YOUR LIBRARY",
    color: "#fbbf24",
    desc: "From your Spotify listening history",
  },
};

const SCORE_LABELS: Record<string, { label: string; desc: string }> = {
  vibeFit: { label: "Vibe Fit", desc: "Matches playlist mood" },
  genreProximity: { label: "Genre Match", desc: "Close to liked genres" },
  sequenceFit: { label: "Flow", desc: "Smooth transition" },
  artistDiversity: { label: "Diversity", desc: "Fresh artist" },
  branchHealth: { label: "Branch", desc: "Branch success rate" },
  novelty: { label: "Discovery", desc: "New to you" },
  popularityFit: { label: "Popularity", desc: "In your range" },
};

const SCORE_WEIGHTS: Record<string, number> = {
  vibeFit: 0.25,
  genreProximity: 0.20,
  sequenceFit: 0.15,
  artistDiversity: 0.12,
  branchHealth: 0.10,
  novelty: 0.08,
  popularityFit: 0.10,
};

function ScoreBar({ label, value, weight, desc }: { label: string; value: number; weight: number; desc: string }) {
  const pct = Math.round(value * 100);
  const weighted = Math.round(value * weight * 100);
  const barColor = value > 0.7 ? "#4ade80" : value > 0.4 ? "#fbbf24" : "#f87171";

  return (
    <View style={styles.scoreRow}>
      <View style={styles.scoreLabelRow}>
        <Text style={styles.scoreLabel}>{label}</Text>
        <Text style={styles.scoreValue}>{pct}% ({weighted}w)</Text>
      </View>
      <View style={styles.barBg}>
        <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: barColor }]} />
      </View>
      <Text style={styles.scoreDesc}>{desc}</Text>
    </View>
  );
}

export function DebugOverlay({ track }: DebugOverlayProps) {
  const debug = track._debug;
  const strategy = STRATEGY_LABELS[track.strategy || ""] || {
    label: track.strategy || "UNKNOWN",
    color: "#9ca3af",
    desc: "Unknown strategy",
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Strategy */}
      <View style={[styles.strategyBadge, { borderColor: strategy.color }]}>
        <Text style={[styles.strategyLabel, { color: strategy.color }]}>{strategy.label}</Text>
      </View>
      <Text style={styles.strategyDesc}>{strategy.desc}</Text>

      {/* Source info */}
      {debug?.searchQuery && (
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Search/Source:</Text>
          <Text style={styles.infoValue}>"{debug.searchQuery}"</Text>
        </View>
      )}
      {debug?.playlistName && (
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>From playlist:</Text>
          <Text style={styles.infoValue}>"{debug.playlistName}"</Text>
        </View>
      )}
      {debug?.matchedBecause && (
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Why this appeared:</Text>
          <Text style={styles.infoValue}>{debug.matchedBecause}</Text>
        </View>
      )}
      {debug?.matchedTrackName && (
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Playlist contained your like:</Text>
          <Text style={styles.infoValue}>"{debug.matchedTrackName}"</Text>
        </View>
      )}
      {debug?.overlapCount !== undefined && (
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Playlist overlap:</Text>
          <Text style={styles.infoValue}>
            {debug.overlapCount}/{debug.overlapTarget} liked songs matched
          </Text>
        </View>
      )}
      {debug?.matchedTrackNames && debug.matchedTrackNames.length > 0 && (
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Matched liked songs:</Text>
          <Text style={styles.infoValue}>{debug.matchedTrackNames.join(", ")}</Text>
        </View>
      )}

      {/* Branch */}
      {track.branchId && (
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Branch:</Text>
          <Text style={styles.infoValue}>{track.branchId}</Text>
        </View>
      )}

      {/* Source type */}
      <View style={styles.infoRow}>
        <Text style={styles.infoLabel}>Zone:</Text>
        <Text style={[
          styles.zoneBadge,
          { color: track.sourceType === "safe" ? "#4ade80" : track.sourceType === "edge" ? "#fbbf24" : "#f472b6" },
        ]}>
          {track.sourceType === "safe" ? "SAFE (known territory)" :
           track.sourceType === "edge" ? "EDGE (neighborhood)" :
           "JUMP (exploration)"}
        </Text>
      </View>

      {/* Popularity */}
      <View style={styles.infoRow}>
        <Text style={styles.infoLabel}>Popularity:</Text>
        <Text style={styles.infoValue}>{track.popularity}/100</Text>
      </View>

      {/* Ranking */}
      {debug?.rank && (
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Ranked:</Text>
          <Text style={styles.infoValue}>
            #{debug.rank} of {debug.totalCandidates} candidates (round {debug.refillRound})
          </Text>
        </View>
      )}

      {/* Score breakdown */}
      {debug?.score && (
        <View style={styles.scoreSection}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total Score</Text>
            <Text style={styles.totalValue}>{Math.round(debug.score.total * 100)}%</Text>
          </View>

          {Object.entries(SCORE_LABELS).map(([key, info]) => (
            <ScoreBar
              key={key}
              label={info.label}
              value={(debug.score as any)[key] || 0}
              weight={SCORE_WEIGHTS[key] || 0}
              desc={info.desc}
            />
          ))}
        </View>
      )}

      {/* Genres */}
      {track.genres.length > 0 && (
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Genres:</Text>
          <Text style={styles.infoValue}>{track.genres.join(", ")}</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.92)",
    borderRadius: 24,
  },
  content: {
    padding: 20,
    paddingTop: 24,
    paddingBottom: 40,
  },
  strategyBadge: {
    alignSelf: "flex-start",
    borderWidth: 1.5,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 6,
  },
  strategyLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
  },
  strategyDesc: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 11,
    marginBottom: 16,
  },
  infoRow: {
    marginBottom: 10,
  },
  infoLabel: {
    color: "rgba(255,255,255,0.35)",
    fontSize: 10,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  infoValue: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 13,
    fontWeight: "500",
  },
  zoneBadge: {
    fontSize: 12,
    fontWeight: "700",
  },
  scoreSection: {
    marginTop: 8,
    marginBottom: 12,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  totalLabel: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 14,
    fontWeight: "700",
  },
  totalValue: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "800",
  },
  scoreRow: {
    marginBottom: 10,
  },
  scoreLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 3,
  },
  scoreLabel: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 11,
    fontWeight: "600",
  },
  scoreValue: {
    color: "rgba(255,255,255,0.35)",
    fontSize: 10,
    fontFamily: "monospace",
  },
  barBg: {
    height: 5,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 3,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: 3,
  },
  scoreDesc: {
    color: "rgba(255,255,255,0.2)",
    fontSize: 9,
    marginTop: 2,
  },
});
