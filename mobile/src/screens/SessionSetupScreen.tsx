import React, { useState, useEffect } from "react";
import {
  Dimensions,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSessionStore, type SavedPlaylist } from "../stores/session-store";
import { logout as spotifyLogout } from "../lib/spotify/auth";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface SessionSetupScreenProps {
  onStart: () => void;
  onLogout?: () => void;
}

// ─── Vibe categories the user can pick ───
const VIBE_OPTIONS = [
  { id: "hip hop", label: "Hip-Hop", emoji: "🎤" },
  { id: "r&b", label: "R&B", emoji: "💜" },
  { id: "afrobeats", label: "Afrobeats", emoji: "🌍" },
  { id: "pop", label: "Pop", emoji: "✨" },
  { id: "rock", label: "Rock", emoji: "🎸" },
  { id: "electronic", label: "Electronic", emoji: "🎛" },
  { id: "latin", label: "Latin", emoji: "🔥" },
  { id: "indie", label: "Indie", emoji: "🌿" },
  { id: "uk rap", label: "UK Rap", emoji: "🇬🇧" },
  { id: "jazz", label: "Jazz", emoji: "🎷" },
  { id: "soul", label: "Soul", emoji: "🎹" },
  { id: "country", label: "Country", emoji: "🤠" },
  { id: "amapiano", label: "Amapiano", emoji: "🪘" },
  { id: "dancehall", label: "Dancehall", emoji: "🏝" },
  { id: "lo-fi", label: "Lo-Fi", emoji: "🌙" },
  { id: "trap", label: "Trap", emoji: "💀" },
];

const VIBE_SUGGESTIONS = [
  "Late Night Drives",
  "Morning Energy",
  "Chill Vibes Only",
  "Workout Mode",
  "Study Session",
  "Party Starter",
  "Sad Boi Hours",
  "Feel Good Mix",
  "Underground Finds",
  "Main Character Energy",
];

export function SessionSetupScreen({ onStart, onLogout }: SessionSetupScreenProps) {
  const {
    playlistName, setPlaylistName, userName,
    selectedVibes, setSelectedVibes,
    savedPlaylists, loadSavedPlaylists, resumePlaylist, deletePlaylist,
    resetSession,
  } = useSessionStore();

  const [customName, setCustomName] = useState(playlistName);
  const [step, setStep] = useState<"vibes" | "name">("vibes");

  useEffect(() => {
    loadSavedPlaylists();
  }, []);

  const toggleVibe = (id: string) => {
    if (selectedVibes.includes(id)) {
      setSelectedVibes(selectedVibes.filter((v) => v !== id));
    } else if (selectedVibes.length < 3) {
      setSelectedVibes([...selectedVibes, id]);
    }
  };

  const handleStart = () => {
    const name = customName.trim() || playlistName;
    setPlaylistName(name);
    onStart();
  };

  const pickSuggestion = (name: string) => {
    setCustomName(name);
    setPlaylistName(name);
  };

  const handleResume = (playlist: SavedPlaylist) => {
    resumePlaylist(playlist.id);
    onStart();
  };

  const handleNewSession = () => {
    resetSession();
    setCustomName("");
    setSelectedVibes([]);
    setStep("vibes");
  };

  // ─── Step 1: Pick vibes ───
  if (step === "vibes") {
    return (
      <View style={styles.container}>
        <View style={[styles.blob, styles.blob1]} />
        <View style={[styles.blob, styles.blob2]} />

        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          <Text style={styles.greeting}>
            {userName ? `Hey, ${userName.split(" ")[0]}` : "Hey there"}
          </Text>
          <Text style={styles.title}>What are you feeling?</Text>
          <Text style={styles.subtitle}>
            Pick up to 3 genres to anchor your session
          </Text>

          <View style={styles.vibeGrid}>
            {VIBE_OPTIONS.map((vibe) => {
              const selected = selectedVibes.includes(vibe.id);
              return (
                <TouchableOpacity
                  key={vibe.id}
                  style={[styles.vibeChip, selected && styles.vibeChipSelected]}
                  onPress={() => toggleVibe(vibe.id)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.vibeEmoji}>{vibe.emoji}</Text>
                  <Text style={[styles.vibeLabel, selected && styles.vibeLabelSelected]}>
                    {vibe.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            style={[styles.nextButton, selectedVibes.length === 0 && styles.nextButtonDim]}
            onPress={() => setStep("name")}
            activeOpacity={0.8}
          >
            <Text style={styles.nextButtonText}>
              {selectedVibes.length === 0 ? "Skip — surprise me" : "Next"}
            </Text>
          </TouchableOpacity>

          {/* Saved playlists */}
          {savedPlaylists.length > 0 && (
            <View style={styles.savedSection}>
              <Text style={styles.savedTitle}>Continue a session</Text>
              {savedPlaylists.slice(0, 5).map((pl) => (
                <TouchableOpacity
                  key={pl.id}
                  style={styles.savedItem}
                  onPress={() => handleResume(pl)}
                  activeOpacity={0.7}
                >
                  <View style={styles.savedItemLeft}>
                    <Text style={styles.savedItemName} numberOfLines={1}>
                      {pl.name}
                    </Text>
                    <Text style={styles.savedItemMeta}>
                      {pl.tracks.length} tracks · {pl.swipeCount} swiped
                      {pl.savedForLater.length > 0 && ` · ★ ${pl.savedForLater.length} saved`}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.deleteBtn}
                    onPress={(e) => {
                      e.stopPropagation();
                      deletePlaylist(pl.id);
                    }}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Text style={styles.deleteBtnText}>✕</Text>
                  </TouchableOpacity>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {onLogout && (
            <TouchableOpacity
              style={styles.logoutButton}
              onPress={async () => {
                await spotifyLogout();
                onLogout();
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.logoutText}>Switch Spotify Account</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>
    );
  }

  // ─── Step 2: Name the playlist ───
  return (
    <View style={styles.container}>
      <View style={[styles.blob, styles.blob1]} />
      <View style={[styles.blob, styles.blob2]} />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.content}
      >
        <TouchableOpacity onPress={() => setStep("vibes")} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Name your playlist</Text>

        {selectedVibes.length > 0 && (
          <View style={styles.selectedVibesRow}>
            {selectedVibes.map((v) => {
              const option = VIBE_OPTIONS.find((o) => o.id === v);
              return (
                <View key={v} style={styles.selectedVibeTag}>
                  <Text style={styles.selectedVibeText}>
                    {option?.emoji} {option?.label}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        <Text style={styles.subtitle}>
          Give it a name — anything goes.{"\n"}
          The name helps find the right music.
        </Text>

        <View style={styles.inputContainer}>
          <TextInput
            value={customName}
            onChangeText={(text) => {
              setCustomName(text);
              setPlaylistName(text);
            }}
            placeholder="My awesome playlist..."
            placeholderTextColor="rgba(255,255,255,0.2)"
            style={styles.input}
            selectionColor="#a78bfa"
            autoFocus={false}
          />
        </View>

        <Text style={styles.orText}>or pick a vibe:</Text>
        <View style={styles.suggestions}>
          {VIBE_SUGGESTIONS.map((name) => (
            <TouchableOpacity
              key={name}
              style={[
                styles.suggestionChip,
                customName === name && styles.suggestionChipActive,
              ]}
              onPress={() => pickSuggestion(name)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.suggestionText,
                  customName === name && styles.suggestionTextActive,
                ]}
              >
                {name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={styles.startButton}
          onPress={handleStart}
          activeOpacity={0.8}
        >
          <Text style={styles.startButtonText}>Start Swiping</Text>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0a0f",
  },
  blob: {
    position: "absolute",
    borderRadius: 999,
  },
  blob1: {
    top: -80,
    right: -60,
    width: 250,
    height: 250,
    backgroundColor: "rgba(99, 102, 241, 0.12)",
  },
  blob2: {
    bottom: -80,
    left: -60,
    width: 200,
    height: 200,
    backgroundColor: "rgba(139, 92, 246, 0.1)",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 100,
    paddingBottom: 60,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 80,
  },
  backBtn: {
    marginBottom: 16,
  },
  backText: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 14,
    fontWeight: "500",
  },
  greeting: {
    fontSize: 16,
    color: "rgba(255,255,255,0.4)",
    marginBottom: 8,
  },
  title: {
    fontSize: 32,
    fontWeight: "800",
    color: "#fff",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: "rgba(255,255,255,0.35)",
    lineHeight: 22,
    marginBottom: 24,
  },
  vibeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 32,
  },
  vibeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  vibeChipSelected: {
    backgroundColor: "rgba(99, 102, 241, 0.2)",
    borderColor: "#6366f1",
  },
  vibeEmoji: {
    fontSize: 16,
  },
  vibeLabel: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 14,
    fontWeight: "500",
  },
  vibeLabelSelected: {
    color: "#a78bfa",
    fontWeight: "600",
  },
  selectedVibesRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  selectedVibeTag: {
    backgroundColor: "rgba(99, 102, 241, 0.15)",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "rgba(99, 102, 241, 0.3)",
  },
  selectedVibeText: {
    color: "#a78bfa",
    fontSize: 12,
    fontWeight: "600",
  },
  nextButton: {
    backgroundColor: "#6366f1",
    paddingVertical: 18,
    borderRadius: 999,
    alignItems: "center",
    marginBottom: 32,
    shadowColor: "#6366f1",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
  },
  nextButtonDim: {
    backgroundColor: "rgba(99, 102, 241, 0.5)",
  },
  nextButtonText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
  },
  savedSection: {
    marginBottom: 24,
  },
  savedTitle: {
    color: "rgba(255,255,255,0.3)",
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 12,
  },
  savedItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  savedItemLeft: {
    flex: 1,
  },
  savedItemName: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  savedItemMeta: {
    color: "rgba(255,255,255,0.3)",
    fontSize: 12,
    marginTop: 2,
  },
  deleteBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(248, 113, 113, 0.1)",
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 8,
  },
  deleteBtnText: {
    color: "#f87171",
    fontSize: 12,
    fontWeight: "600",
  },
  inputContainer: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 20,
    paddingVertical: 16,
    marginBottom: 20,
  },
  input: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
  },
  orText: {
    color: "rgba(255,255,255,0.2)",
    fontSize: 12,
    marginBottom: 12,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  suggestions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 40,
  },
  suggestionChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  suggestionChipActive: {
    backgroundColor: "rgba(167, 139, 250, 0.2)",
    borderColor: "#a78bfa",
  },
  suggestionText: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 13,
    fontWeight: "500",
  },
  suggestionTextActive: {
    color: "#a78bfa",
  },
  startButton: {
    backgroundColor: "#6366f1",
    paddingVertical: 18,
    borderRadius: 999,
    alignItems: "center",
    shadowColor: "#6366f1",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
  },
  startButtonText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
  },
  logoutButton: {
    marginTop: 16,
    alignItems: "center",
    paddingVertical: 8,
  },
  logoutText: {
    color: "rgba(255,255,255,0.2)",
    fontSize: 12,
    textDecorationLine: "underline",
  },
});
