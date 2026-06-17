import React, { useMemo } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSessionStore } from "../stores/session-store";

interface SummaryScreenProps {
  onViewPlaylist: () => void;
  onNewSession: () => void;
  onGoHome: () => void;
}

export function SummaryScreen({ onViewPlaylist, onNewSession, onGoHome }: SummaryScreenProps) {
  const { likedTracks, savedForLater, swipeCount, swipeHistory, sessionStartTime, resetSession, saveCurrentPlaylist } =
    useSessionStore();

  // Auto-save on summary view
  React.useEffect(() => {
    saveCurrentPlaylist();
  }, []);

  const stats = useMemo(() => {
    const rightSwipes = swipeHistory.filter((s) => s.direction === "right").length;
    const likeRatio = swipeCount > 0 ? Math.round((rightSwipes / swipeCount) * 100) : 0;
    const minutes = Math.floor((Date.now() - sessionStartTime) / 60000);

    const genreCounts = new Map<string, number>();
    for (const track of likedTracks) {
      for (const genre of track.genres) {
        genreCounts.set(genre, (genreCounts.get(genre) || 0) + 1);
      }
    }
    const topGenres = Array.from(genreCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);

    const artistCounts = new Map<string, number>();
    for (const track of likedTracks) {
      const artist = track.artistNames[0];
      if (artist) artistCounts.set(artist, (artistCounts.get(artist) || 0) + 1);
    }
    const topArtists = Array.from(artistCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    return { rightSwipes, likeRatio, minutes, topGenres, topArtists };
  }, [likedTracks, swipeCount, swipeHistory, sessionStartTime]);

  const maxGenreCount = stats.topGenres.length > 0 ? stats.topGenres[0][1] : 1;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Background blobs */}
      <View style={[styles.blob, { top: -60, right: -60, backgroundColor: "rgba(139,92,246,0.1)" }]} />
      <View style={[styles.blob, { bottom: -40, left: -40, backgroundColor: "rgba(99,102,241,0.08)" }]} />

      <Text style={styles.title}>Session Complete</Text>
      <Text style={styles.subtitle}>{stats.minutes} min session</Text>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{swipeCount}</Text>
          <Text style={styles.statLabel}>Total Swipes</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statNumber, { color: "#4ade80" }]}>{stats.rightSwipes}</Text>
          <Text style={styles.statLabel}>Liked</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{stats.likeRatio}%</Text>
          <Text style={styles.statLabel}>Like Rate</Text>
        </View>
      </View>

      {/* Top genres */}
      {stats.topGenres.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your Vibe</Text>
          {stats.topGenres.map(([genre, count]) => (
            <View key={genre} style={styles.genreRow}>
              <View style={styles.genreHeader}>
                <Text style={styles.genreName}>{genre}</Text>
                <Text style={styles.genreCount}>{count}</Text>
              </View>
              <View style={styles.barBg}>
                <View
                  style={[
                    styles.barFill,
                    { width: `${(count / maxGenreCount) * 100}%` },
                  ]}
                />
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Top artists */}
      {stats.topArtists.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Top Artists</Text>
          <View style={styles.tagRow}>
            {stats.topArtists.map(([artist, count]) => (
              <View key={artist} style={styles.tag}>
                <Text style={styles.tagText}>
                  {artist} <Text style={{ opacity: 0.4 }}>{count}</Text>
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Actions */}
      <TouchableOpacity style={styles.primaryButton} onPress={onViewPlaylist}>
        <Text style={styles.primaryButtonText}>
          View Playlist ({likedTracks.length} tracks)
        </Text>
      </TouchableOpacity>

      {savedForLater.length > 0 && (
        <View style={styles.savedNote}>
          <Text style={styles.savedNoteText}>
            ★ {savedForLater.length} tracks saved for later
          </Text>
        </View>
      )}

      <TouchableOpacity
        style={styles.secondaryButton}
        onPress={() => {
          resetSession();
          onNewSession();
        }}
      >
        <Text style={styles.secondaryButtonText}>New Session</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={onGoHome} style={styles.homeLink}>
        <Text style={styles.homeLinkText}>Back to Home</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0a0f",
  },
  content: {
    padding: 24,
    paddingTop: 80,
    paddingBottom: 60,
  },
  blob: {
    position: "absolute",
    width: 200,
    height: 200,
    borderRadius: 999,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: "#a78bfa",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    color: "rgba(255,255,255,0.35)",
    textAlign: "center",
    marginTop: 4,
    marginBottom: 32,
  },
  statsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  statNumber: {
    fontSize: 24,
    fontWeight: "800",
    color: "#fff",
  },
  statLabel: {
    fontSize: 10,
    color: "rgba(255,255,255,0.25)",
    marginTop: 4,
  },
  section: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "rgba(255,255,255,0.6)",
    marginBottom: 16,
  },
  genreRow: {
    marginBottom: 10,
  },
  genreHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  genreName: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 12,
  },
  genreCount: {
    color: "rgba(255,255,255,0.2)",
    fontSize: 12,
  },
  barBg: {
    height: 6,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 3,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: 3,
    backgroundColor: "#6366f1",
  },
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  tag: {
    backgroundColor: "rgba(255,255,255,0.05)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  tagText: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 12,
  },
  primaryButton: {
    backgroundColor: "#1DB954",
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 24,
  },
  primaryButtonText: {
    color: "#000",
    fontSize: 15,
    fontWeight: "700",
  },
  secondaryButton: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 10,
  },
  secondaryButtonText: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 14,
    fontWeight: "500",
  },
  homeLink: {
    alignItems: "center",
    marginTop: 16,
  },
  homeLinkText: {
    color: "rgba(255,255,255,0.15)",
    fontSize: 12,
  },
  savedNote: {
    alignItems: "center",
    marginTop: 12,
    paddingVertical: 10,
    backgroundColor: "rgba(167, 139, 250, 0.08)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(167, 139, 250, 0.15)",
  },
  savedNoteText: {
    color: "#a78bfa",
    fontSize: 13,
    fontWeight: "600",
  },
});
