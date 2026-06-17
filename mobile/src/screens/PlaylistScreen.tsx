import React, { useState } from "react";
import {
  FlatList,
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useSessionStore } from "../stores/session-store";
import { getMe, createPlaylist, addTracksToPlaylist } from "../lib/spotify/client";
import type { AppTrack } from "../types/track";

interface PlaylistScreenProps {
  onBack: () => void;
}

export function PlaylistScreen({ onBack }: PlaylistScreenProps) {
  const {
    likedTracks, removeLikedTrack, savedForLater,
    playlistName, setPlaylistName, addLikedTrack,
  } = useSessionStore();

  const [isExporting, setIsExporting] = useState(false);
  const [exported, setExported] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [activeTab, setActiveTab] = useState<"playlist" | "saved">("playlist");

  const handleExport = async () => {
    if (likedTracks.length === 0 || isExporting) return;
    setIsExporting(true);

    try {
      const user = await getMe();
      const playlist = await createPlaylist(
        user.id,
        playlistName,
        `Created with vibeswipe - ${likedTracks.length} tracks curated by swiping.`
      );
      await addTracksToPlaylist(
        playlist.id,
        likedTracks.map((t) => t.uri)
      );
      setExported(true);
      Alert.alert("Success!", "Playlist saved to your Spotify account.");
    } catch (err: any) {
      console.error("Export error:", err);
      const msg = err?.message || "";
      if (msg.includes("403")) {
        Alert.alert(
          "Permission Denied",
          "Spotify is blocking playlist creation in Dev Mode. Your playlist is saved locally in the app — you won't lose it."
        );
      } else {
        Alert.alert("Error", "Failed to export playlist. Your tracks are saved locally.");
      }
    } finally {
      setIsExporting(false);
    }
  };

  const moveToPlaylist = (track: AppTrack) => {
    // Add to liked tracks (playlist)
    addLikedTrack(track);
    // Remove from saved for later
    useSessionStore.setState((state) => ({
      savedForLater: state.savedForLater.filter((t) => t.id !== track.id),
    }));
  };

  const removeFromSaved = (trackId: string) => {
    useSessionStore.setState((state) => ({
      savedForLater: state.savedForLater.filter((t) => t.id !== trackId),
    }));
  };

  const currentList = activeTab === "playlist" ? likedTracks : savedForLater;

  const renderTrack = ({ item, index }: { item: AppTrack; index: number }) => (
    <View style={styles.trackRow}>
      <Text style={styles.trackNumber}>{index + 1}</Text>

      {item.albumImageUrl ? (
        <Image source={{ uri: item.albumImageUrl }} style={styles.trackImage} />
      ) : (
        <View style={[styles.trackImage, styles.trackImagePlaceholder]}>
          <Text style={{ fontSize: 16 }}>🎵</Text>
        </View>
      )}

      <View style={styles.trackInfo}>
        <Text style={styles.trackTitle} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.trackArtist} numberOfLines={1}>
          {item.artistNames.join(", ")}
        </Text>
      </View>

      {activeTab === "saved" && (
        <TouchableOpacity
          onPress={() => moveToPlaylist(item)}
          style={styles.addButton}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.addText}>+ Add</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity
        onPress={() =>
          activeTab === "playlist"
            ? removeLikedTrack(item.id)
            : removeFromSaved(item.id)
        }
        style={styles.removeButton}
      >
        <Text style={styles.removeText}>✕</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          {isEditing ? (
            <TextInput
              value={playlistName}
              onChangeText={setPlaylistName}
              onBlur={() => setIsEditing(false)}
              autoFocus
              style={styles.nameInput}
              selectionColor="#a78bfa"
            />
          ) : (
            <TouchableOpacity onPress={() => setIsEditing(true)}>
              <Text style={styles.playlistName}>{playlistName} ✎</Text>
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          style={[styles.exportButton, (likedTracks.length === 0 || exported) && styles.exportDisabled]}
          onPress={handleExport}
          disabled={likedTracks.length === 0 || isExporting || exported}
        >
          {isExporting ? (
            <ActivityIndicator size="small" color="#000" />
          ) : (
            <Text style={styles.exportText}>{exported ? "Saved ✓" : "Export"}</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === "playlist" && styles.tabActive]}
          onPress={() => setActiveTab("playlist")}
        >
          <Text style={[styles.tabText, activeTab === "playlist" && styles.tabTextActive]}>
            Playlist ({likedTracks.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === "saved" && styles.tabActive]}
          onPress={() => setActiveTab("saved")}
        >
          <Text style={[styles.tabText, activeTab === "saved" && styles.tabTextActive]}>
            ★ Saved ({savedForLater.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Track list */}
      {currentList.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>{activeTab === "playlist" ? "🎵" : "★"}</Text>
          <Text style={styles.emptyText}>
            {activeTab === "playlist" ? "No tracks yet" : "No saved tracks"}
          </Text>
          <Text style={styles.emptySubtext}>
            {activeTab === "playlist"
              ? "Swipe right on tracks you like"
              : "Swipe up on tracks to save for later"}
          </Text>
        </View>
      ) : (
        <FlatList
          data={currentList}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={renderTrack}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0a0f",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 12,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  backButton: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 14,
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 16,
  },
  playlistName: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  nameInput: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
    textAlign: "center",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.2)",
    paddingBottom: 4,
    minWidth: 150,
  },
  exportButton: {
    backgroundColor: "#1DB954",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  exportDisabled: {
    opacity: 0.4,
  },
  exportText: {
    color: "#000",
    fontSize: 12,
    fontWeight: "700",
  },
  tabBar: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabActive: {
    borderBottomColor: "#a78bfa",
  },
  tabText: {
    color: "rgba(255,255,255,0.3)",
    fontSize: 13,
    fontWeight: "600",
  },
  tabTextActive: {
    color: "#a78bfa",
  },
  list: {
    padding: 16,
  },
  trackRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 8,
    gap: 12,
  },
  trackNumber: {
    color: "rgba(255,255,255,0.15)",
    fontSize: 10,
    width: 20,
    textAlign: "right",
    fontFamily: "monospace",
  },
  trackImage: {
    width: 44,
    height: 44,
    borderRadius: 8,
  },
  trackImagePlaceholder: {
    backgroundColor: "rgba(255,255,255,0.05)",
    justifyContent: "center",
    alignItems: "center",
  },
  trackInfo: {
    flex: 1,
  },
  trackTitle: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "500",
  },
  trackArtist: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 12,
    marginTop: 2,
  },
  addButton: {
    backgroundColor: "rgba(74, 222, 128, 0.12)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(74, 222, 128, 0.3)",
  },
  addText: {
    color: "#4ade80",
    fontSize: 11,
    fontWeight: "700",
  },
  removeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  removeText: {
    color: "rgba(255,255,255,0.2)",
    fontSize: 14,
  },
  empty: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
    opacity: 0.3,
  },
  emptyText: {
    color: "rgba(255,255,255,0.3)",
    fontSize: 16,
  },
  emptySubtext: {
    color: "rgba(255,255,255,0.15)",
    fontSize: 12,
    marginTop: 4,
  },
});
