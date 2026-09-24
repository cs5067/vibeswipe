import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  createShareLink,
  dropIntoVibe,
  fetchArenaVibes,
  fetchFriends,
  recommendTrack,
  resolvePreviewUrl,
  type ArenaVibe,
  type Friend,
  type SharedTrack,
} from "../lib/server-api";
import type { AppTrack } from "../types/track";

interface SendSongSheetProps {
  /** The card being forced on someone. null = sheet hidden. */
  track: AppTrack | null;
  onClose: () => void;
}

type SheetStatus = "idle" | "working" | "sent" | "linkReady" | "error";

const friendLabel = (f: Friend) => f.displayName || f.username || "Friend";

export function SendSongSheet({ track, onClose }: SendSongSheetProps) {
  const [note, setNote] = useState("");
  const [friends, setFriends] = useState<Friend[]>([]);
  const [senderName, setSenderName] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<SheetStatus>("idle");
  const [url, setUrl] = useState("");
  const [vibes, setVibes] = useState<ArenaVibe[] | null>(null);
  const [showVibes, setShowVibes] = useState(false);
  const [vibesError, setVibesError] = useState(false);
  const [droppingSlug, setDroppingSlug] = useState<string | null>(null);
  const [dropped, setDropped] = useState<{ vibeName: string; already: boolean } | null>(null);
  const [dropError, setDropError] = useState<string | null>(null);

  // Fresh sheet per card: reset state and (re)load friends when it opens.
  useEffect(() => {
    if (!track) return;
    setNote("");
    setPicked(new Set());
    setStatus("idle");
    setUrl("");
    setShowVibes(false);
    setVibesError(false);
    setDroppingSlug(null);
    setDropped(null);
    setDropError(null);

    let alive = true;
    fetchFriends().then((data) => {
      if (!alive || !data) return;
      setFriends(data.friends || []);
      setSenderName(data.me?.displayName ?? data.me?.username ?? null);
    });
    return () => {
      alive = false;
    };
  }, [track?.id]);

  if (!track) return null;

  // Resolve a working preview BEFORE sending so the recipient's copy always
  // plays — Spotify rarely ships preview_url anymore, Deezer fills the gap.
  const buildSharedTrack = async (): Promise<SharedTrack> => ({
    id: track.id,
    name: track.name,
    artistNames: track.artistNames,
    albumImage: track.albumImageLarge || track.albumImageUrl,
    previewUrl:
      track.previewUrl ||
      (await resolvePreviewUrl(track.artistNames[0] || "", track.name)),
    spotifyUrl: track.spotifyUrl,
  });

  const toggleFriend = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  // Force it on the picked friends' inboxes.
  const sendToFriends = async () => {
    if (picked.size === 0 || status === "working") return;
    setStatus("working");
    try {
      const t = await buildSharedTrack();
      const results = await Promise.all(
        [...picked].map((toId) => recommendTrack(toId, t, note.trim()))
      );
      setStatus(results.some(Boolean) ? "sent" : "error");
    } catch {
      setStatus("error");
    }
  };

  // External share link (invite / non-users) → straight into the share tray.
  const createLink = async () => {
    if (status === "working") return;
    setStatus("working");
    try {
      const data = await createShareLink(await buildSharedTrack(), senderName, note.trim());
      if (!data?.url) {
        setStatus("error");
        return;
      }
      setUrl(data.url);
      setStatus("linkReady");
      Share.share({ message: data.url }).catch(() => {});
    } catch {
      setStatus("error");
    }
  };

  // Public Arena drop: lazy-load the vibe list the first time it opens.
  const toggleVibes = () => {
    const opening = !showVibes;
    setShowVibes(opening);
    if (!opening || vibes !== null) return;
    setVibesError(false);
    fetchArenaVibes().then((list) => {
      if (list) setVibes(list);
      else setVibesError(true);
    });
  };

  const dropIntoVibeRoom = async (vibe: ArenaVibe) => {
    if (droppingSlug) return;
    setDropError(null);
    setDroppingSlug(vibe.slug);
    try {
      const result = await dropIntoVibe(vibe.slug, await buildSharedTrack(), note.trim() || undefined);
      if (!result) {
        setDropError("Couldn't drop it. Try again.");
        return;
      }
      setDropped({ vibeName: vibe.name, already: result.already });
    } finally {
      setDroppingSlug(null);
    }
  };

  const doneButton = (
    <TouchableOpacity onPress={onClose} style={styles.doneButton} activeOpacity={0.8}>
      <Text style={styles.doneButtonText}>Done</Text>
    </TouchableOpacity>
  );

  return (
    <Modal
      visible
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.avoider}
          pointerEvents="box-none"
        >
          <View style={styles.sheet}>
            {/* Track header */}
            <View style={styles.trackHeader}>
              {!!(track.albumImageLarge || track.albumImageUrl) && (
                <Image
                  source={{ uri: track.albumImageLarge || track.albumImageUrl }}
                  style={styles.trackArt}
                />
              )}
              <View style={styles.trackInfo}>
                <Text style={styles.trackName} numberOfLines={1}>
                  {track.name}
                </Text>
                <Text style={styles.trackArtist} numberOfLines={1}>
                  {track.artistNames.join(", ")}
                </Text>
              </View>
            </View>

            {dropped ? (
              <>
                <Text style={styles.successTitle}>
                  {dropped.already
                    ? "already in that vibe 🎧"
                    : `dropped into ${dropped.vibeName} 🔥`}
                </Text>
                <Text style={styles.successSubtitle}>
                  {dropped.already
                    ? "Someone beat you to it — go vote it up in the arena instead."
                    : "It's live in the arena. Watch strangers judge it."}
                </Text>
                {doneButton}
              </>
            ) : status === "sent" ? (
              <>
                <Text style={[styles.successTitle, styles.sentTitle]}>Sent 🔥</Text>
                <Text style={styles.successSubtitle}>
                  They'll see it in their inbox — you'll know when they listen.
                </Text>
                {doneButton}
              </>
            ) : status === "linkReady" ? (
              <>
                <Text style={styles.successTitle}>Link ready</Text>
                <View style={styles.linkBox}>
                  <Text style={styles.linkText} numberOfLines={1}>
                    {url}
                  </Text>
                  <TouchableOpacity onPress={() => Share.share({ message: url }).catch(() => {})}>
                    <Text style={styles.linkShareText}>Share</Text>
                  </TouchableOpacity>
                </View>
                {doneButton}
              </>
            ) : (
              <ScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                style={styles.formScroll}
              >
                <Text style={styles.formTitle}>Make them listen</Text>
                <TextInput
                  value={note}
                  onChangeText={(text) => setNote(text.slice(0, 140))}
                  placeholder="trust me on this one..."
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  multiline
                  style={styles.noteInput}
                  selectionColor="#a78bfa"
                />

                {/* Friend picker */}
                {friends.length > 0 && (
                  <View style={styles.pickerSection}>
                    <Text style={styles.pickerLabel}>Send to a friend</Text>
                    <View style={styles.friendList}>
                      {friends.map((f) => {
                        const isPicked = picked.has(f.id);
                        return (
                          <TouchableOpacity
                            key={f.id}
                            onPress={() => toggleFriend(f.id)}
                            style={[styles.friendRow, isPicked && styles.friendRowPicked]}
                            activeOpacity={0.7}
                          >
                            {f.avatarUrl ? (
                              <Image source={{ uri: f.avatarUrl }} style={styles.friendAvatar} />
                            ) : (
                              <View style={[styles.friendAvatar, styles.friendAvatarPlaceholder]} />
                            )}
                            <Text style={styles.friendName} numberOfLines={1}>
                              {friendLabel(f)}
                            </Text>
                            {isPicked && <Text style={styles.friendCheck}>✓</Text>}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    <TouchableOpacity
                      onPress={() => void sendToFriends()}
                      disabled={picked.size === 0 || status === "working"}
                      style={[
                        styles.recommendButton,
                        (picked.size === 0 || status === "working") && styles.disabled,
                      ]}
                      activeOpacity={0.8}
                    >
                      {status === "working" ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={styles.recommendButtonText}>
                          Recommend to {picked.size || ""} friend{picked.size === 1 ? "" : "s"}
                        </Text>
                      )}
                    </TouchableOpacity>
                  </View>
                )}

                {/* External link fallback / invite */}
                <TouchableOpacity
                  onPress={() => void createLink()}
                  disabled={status === "working"}
                  style={[styles.secondaryButton, status === "working" && styles.disabled]}
                  activeOpacity={0.7}
                >
                  <Text style={styles.secondaryButtonText}>
                    {friends.length > 0
                      ? "or get a share link (for non-users)"
                      : "Get a share link"}
                  </Text>
                </TouchableOpacity>

                {/* Drop into a public Arena vibe */}
                <TouchableOpacity
                  onPress={toggleVibes}
                  disabled={status === "working" || droppingSlug !== null}
                  style={[
                    styles.secondaryButton,
                    (status === "working" || droppingSlug !== null) && styles.disabled,
                  ]}
                  activeOpacity={0.7}
                >
                  <Text style={styles.secondaryButtonText}>or drop it into a public vibe</Text>
                </TouchableOpacity>

                {showVibes && (
                  <View style={styles.vibesWrap}>
                    {vibesError ? (
                      <Text style={styles.vibesHint}>Couldn't load the vibes. Try again later.</Text>
                    ) : vibes === null ? (
                      <Text style={styles.vibesHint}>loading vibes...</Text>
                    ) : vibes.length === 0 ? (
                      <Text style={styles.vibesHint}>No vibes open yet.</Text>
                    ) : (
                      <View style={styles.vibeChips}>
                        {vibes.map((v) => (
                          <TouchableOpacity
                            key={v.slug}
                            onPress={() => void dropIntoVibeRoom(v)}
                            disabled={droppingSlug !== null}
                            style={[
                              styles.vibeChip,
                              droppingSlug === v.slug && styles.vibeChipActive,
                              droppingSlug !== null &&
                                droppingSlug !== v.slug &&
                                styles.disabled,
                            ]}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.vibeChipText}>{v.name}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>
                )}

                {!!dropError && <Text style={styles.errorText}>{dropError}</Text>}
                {status === "error" && (
                  <Text style={styles.errorText}>Something went wrong. Try again.</Text>
                )}
              </ScrollView>
            )}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  avoider: {
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#14141c",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    padding: 24,
    paddingBottom: 36,
    maxHeight: "85%",
  },
  trackHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  trackArt: {
    width: 48,
    height: 48,
    borderRadius: 10,
  },
  trackInfo: {
    flex: 1,
    minWidth: 0,
  },
  trackName: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  trackArtist: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 13,
    marginTop: 1,
  },
  formScroll: {
    flexGrow: 0,
  },
  formTitle: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 8,
  },
  noteInput: {
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: "#fff",
    fontSize: 14,
    minHeight: 56,
    textAlignVertical: "top",
  },
  pickerSection: {
    marginTop: 14,
  },
  pickerLabel: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 12,
    marginBottom: 8,
  },
  friendList: {
    gap: 6,
    maxHeight: 200,
  },
  friendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "transparent",
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  friendRowPicked: {
    backgroundColor: "rgba(99, 102, 241, 0.3)",
    borderColor: "rgba(129, 140, 248, 0.5)",
  },
  friendAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  friendAvatarPlaceholder: {
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  friendName: {
    color: "#fff",
    fontSize: 14,
    flex: 1,
  },
  friendCheck: {
    color: "#a5b4fc",
    fontSize: 13,
    fontWeight: "700",
  },
  recommendButton: {
    marginTop: 12,
    backgroundColor: "#6366f1",
    borderRadius: 24,
    paddingVertical: 13,
    alignItems: "center",
  },
  recommendButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  secondaryButton: {
    marginTop: 8,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 24,
    paddingVertical: 11,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 12,
    fontWeight: "500",
  },
  vibesWrap: {
    marginTop: 10,
  },
  vibesHint: {
    color: "rgba(255,255,255,0.3)",
    fontSize: 12,
    textAlign: "center",
    paddingVertical: 4,
  },
  vibeChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 6,
  },
  vibeChip: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  vibeChipActive: {
    backgroundColor: "rgba(99, 102, 241, 0.3)",
    borderWidth: 1,
    borderColor: "rgba(129, 140, 248, 0.5)",
  },
  vibeChipText: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 12,
  },
  successTitle: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 8,
  },
  sentTitle: {
    color: "#4ade80",
  },
  successSubtitle: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 13,
    marginBottom: 16,
  },
  linkBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
  },
  linkText: {
    flex: 1,
    color: "rgba(255,255,255,0.7)",
    fontSize: 12,
  },
  linkShareText: {
    color: "#a5b4fc",
    fontSize: 12,
    fontWeight: "700",
  },
  doneButton: {
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 24,
    paddingVertical: 12,
    alignItems: "center",
  },
  doneButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "500",
  },
  errorText: {
    color: "#f87171",
    fontSize: 12,
    textAlign: "center",
    marginTop: 10,
  },
  disabled: {
    opacity: 0.4,
  },
});
