import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Linking,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";
import {
  fetchInbox,
  fetchSent,
  markInbox,
  resolvePreviewUrl,
  type InboxItem,
  type Person,
  type SentItem,
} from "../lib/server-api";

interface InboxScreenProps {
  onBack: () => void;
}

const REACTIONS = ["🔥", "❤️", "😂", "😭", "🤢"];

const personName = (p?: Person | null) => p?.display_name || p?.username || "A friend";

export function InboxScreen({ onBack }: InboxScreenProps) {
  const [tab, setTab] = useState<"inbox" | "sent">("inbox");
  const [items, setItems] = useState<InboxItem[]>([]);
  const [sentItems, setSentItems] = useState<SentItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [noPreview, setNoPreview] = useState<Set<string>>(new Set());

  // Simple local preview player — this screen owns its own instance instead
  // of the swipe playbackController (which is tied to the card stack).
  const playerRef = useRef<AudioPlayer | null>(null);
  const audioModeReadyRef = useRef(false);

  const stopPlayer = useCallback(() => {
    if (playerRef.current) {
      try {
        playerRef.current.pause();
        playerRef.current.remove();
      } catch {
        /* already released */
      }
      playerRef.current = null;
    }
    setPlayingId(null);
  }, []);

  useEffect(() => {
    return () => {
      stopPlayer();
    };
  }, [stopPlayer]);

  const loadInbox = useCallback(async () => {
    const data = await fetchInbox();
    if (!data) {
      setFailed(true);
      return;
    }
    setFailed(false);
    const list = data.items || [];
    setItems(list);
    // Receipts: everything unseen becomes 👀 seen the moment it's on screen.
    // Local state keeps "unseen" so the highlight ring survives this visit.
    for (const item of list.filter((i) => i.status === "unseen")) {
      void markInbox(item.id, { status: "seen" });
    }
  }, []);

  const loadSent = useCallback(async () => {
    const list = await fetchSent();
    if (list === null) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setSentItems(list);
  }, []);

  useEffect(() => {
    (async () => {
      await loadInbox();
      setLoading(false);
    })();
  }, [loadInbox]);

  // Lazy-load the Sent tab the first time it's opened.
  useEffect(() => {
    if (tab !== "sent" || sentItems !== null) return;
    void loadSent();
  }, [tab, sentItems, loadSent]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    if (tab === "inbox") await loadInbox();
    else await loadSent();
    setRefreshing(false);
  }, [tab, loadInbox, loadSent]);

  const play = async (item: InboxItem) => {
    if (playingId === item.id) {
      stopPlayer();
      return;
    }
    stopPlayer();

    // First play counts as 🎧 listened — this is what the sender sees.
    if (item.status !== "listened") {
      setItems((prev) =>
        prev.map((r) => (r.id === item.id ? { ...r, status: "listened" } : r))
      );
      void markInbox(item.id, { status: "listened" });
    }

    // Prefer the preview resolved at send time, fall back to Deezer.
    setResolvingId(item.id);
    let url = item.track.previewUrl;
    if (!url) {
      url = await resolvePreviewUrl(item.track.artistNames[0] || "", item.track.name);
    }
    setResolvingId(null);

    if (!url) {
      setNoPreview((s) => new Set(s).add(item.id));
      if (item.track.spotifyUrl) {
        Linking.openURL(item.track.spotifyUrl).catch(() => {});
      }
      return;
    }

    try {
      if (!audioModeReadyRef.current) {
        // iOS: audible even with the silent switch on.
        await setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
        audioModeReadyRef.current = true;
      }
      const player = createAudioPlayer({ uri: url });
      player.play();
      playerRef.current = player;
      setPlayingId(item.id);
    } catch {
      setNoPreview((s) => new Set(s).add(item.id));
    }
  };

  const react = (item: InboxItem, emoji: string) => {
    if (item.reaction === emoji) return; // already picked — nothing to do
    setItems((prev) =>
      prev.map((r) => (r.id === item.id ? { ...r, reaction: emoji } : r))
    );
    void markInbox(item.id, { reaction: emoji });
  };

  const statusChip = (item: SentItem) => {
    if (item.status === "listened")
      return <Text style={styles.chipListened}>🎧 Listened</Text>;
    if (item.status === "seen") return <Text style={styles.chipSeen}>👀 Seen</Text>;
    return <Text style={styles.chipSent}>Sent</Text>;
  };

  const renderInboxItem = ({ item }: { item: InboxItem }) => (
    <View style={[styles.card, item.status === "unseen" && styles.cardUnseen]}>
      {item.track.albumImage ? (
        <Image source={{ uri: item.track.albumImage }} style={styles.art} />
      ) : (
        <View style={[styles.art, styles.artPlaceholder]} />
      )}

      <View style={styles.cardBody}>
        <Text style={styles.fromLabel} numberOfLines={1}>
          {personName(item.from)} recommends
        </Text>
        <Text style={styles.trackName} numberOfLines={1}>
          {item.track.name}
        </Text>
        <Text style={styles.trackArtist} numberOfLines={1}>
          {item.track.artistNames.join(", ")}
        </Text>
        {!!item.note?.trim() && (
          <Text style={styles.note} numberOfLines={2}>
            “{item.note.trim()}”
          </Text>
        )}
        <View style={styles.reactionRow}>
          {REACTIONS.map((emoji) => (
            <TouchableOpacity
              key={emoji}
              onPress={() => react(item, emoji)}
              style={[
                styles.reactionButton,
                item.reaction === emoji && styles.reactionPicked,
              ]}
              activeOpacity={0.7}
            >
              <Text style={styles.reactionEmoji}>{emoji}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {noPreview.has(item.id) ? (
        <TouchableOpacity
          onPress={() => Linking.openURL(item.track.spotifyUrl).catch(() => {})}
          style={styles.spotifyLink}
        >
          <Text style={styles.spotifyLinkText}>Spotify</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          onPress={() => void play(item)}
          style={styles.playButton}
          activeOpacity={0.7}
        >
          {resolvingId === item.id ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.playIcon}>{playingId === item.id ? "❚❚" : "▶"}</Text>
          )}
        </TouchableOpacity>
      )}
    </View>
  );

  const renderSentItem = ({ item }: { item: SentItem }) => (
    <View style={styles.card}>
      {item.track.albumImage ? (
        <Image source={{ uri: item.track.albumImage }} style={styles.art} />
      ) : (
        <View style={[styles.art, styles.artPlaceholder]} />
      )}

      <View style={styles.cardBody}>
        <View style={styles.sentMetaRow}>
          <Text style={styles.toLabel} numberOfLines={1}>
            to {personName(item.to)} ·{" "}
          </Text>
          {statusChip(item)}
          {!!item.reaction && (
            <View style={styles.reactionPill}>
              <Text style={styles.reactionEmoji}>{item.reaction}</Text>
            </View>
          )}
        </View>
        <Text style={styles.trackName} numberOfLines={1}>
          {item.track.name}
        </Text>
        <Text style={styles.trackArtist} numberOfLines={1}>
          {item.track.artistNames.join(", ")}
        </Text>
        {!!item.note?.trim() && (
          <Text style={styles.note} numberOfLines={2}>
            “{item.note.trim()}”
          </Text>
        )}
      </View>
    </View>
  );

  const sentLoading = tab === "sent" && sentItems === null && !failed;

  const emptyState = (
    <View style={styles.empty}>
      {failed ? (
        <>
          <Text style={styles.emptyText}>Couldn't reach the server</Text>
          <Text style={styles.emptySubtext}>Pull to try again.</Text>
        </>
      ) : tab === "inbox" ? (
        <>
          <Text style={styles.emptyText}>No recommendations yet</Text>
          <Text style={styles.emptySubtext}>
            When a friend forces a song on you, it shows up here.
          </Text>
        </>
      ) : (
        <>
          <Text style={styles.emptyText}>Nothing sent yet</Text>
          <Text style={styles.emptySubtext}>
            Send a song from the swipe screen and watch this fill up.
          </Text>
        </>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Recommendations</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Tabs */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, tab === "inbox" && styles.tabActive]}
          onPress={() => setTab("inbox")}
        >
          <Text style={[styles.tabText, tab === "inbox" && styles.tabTextActive]}>
            For you
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === "sent" && styles.tabActive]}
          onPress={() => setTab("sent")}
        >
          <Text style={[styles.tabText, tab === "sent" && styles.tabTextActive]}>
            Sent by you
          </Text>
        </TouchableOpacity>
      </View>

      {loading || sentLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#6366f1" />
        </View>
      ) : tab === "inbox" ? (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={renderInboxItem}
          contentContainerStyle={items.length === 0 ? styles.listEmpty : styles.list}
          ListEmptyComponent={emptyState}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#a78bfa" />
          }
        />
      ) : (
        <FlatList
          data={sentItems ?? []}
          keyExtractor={(item) => item.id}
          renderItem={renderSentItem}
          contentContainerStyle={
            (sentItems ?? []).length === 0 ? styles.listEmpty : styles.list
          }
          ListEmptyComponent={emptyState}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#a78bfa" />
          }
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
  },
  backButton: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 14,
  },
  title: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  headerSpacer: {
    width: 48,
  },
  tabBar: {
    flexDirection: "row",
    marginHorizontal: 20,
    marginBottom: 12,
    gap: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.05)",
    alignItems: "center",
  },
  tabActive: {
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  tabText: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 13,
    fontWeight: "600",
  },
  tabTextActive: {
    color: "#fff",
  },
  loadingWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 40,
    gap: 10,
  },
  listEmpty: {
    flexGrow: 1,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    padding: 12,
  },
  cardUnseen: {
    borderColor: "rgba(129, 140, 248, 0.4)",
  },
  art: {
    width: 56,
    height: 56,
    borderRadius: 12,
  },
  artPlaceholder: {
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  cardBody: {
    flex: 1,
    minWidth: 0,
  },
  fromLabel: {
    color: "#a5b4fc",
    fontSize: 11,
    fontWeight: "700",
  },
  toLabel: {
    color: "#f9a8d4",
    fontSize: 11,
    fontWeight: "700",
  },
  sentMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 4,
  },
  chipListened: {
    color: "#4ade80",
    fontSize: 11,
    fontWeight: "700",
  },
  chipSeen: {
    color: "rgba(253, 224, 71, 0.8)",
    fontSize: 11,
    fontWeight: "700",
  },
  chipSent: {
    color: "rgba(255,255,255,0.3)",
    fontSize: 11,
    fontWeight: "700",
  },
  reactionPill: {
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  trackName: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
    marginTop: 2,
  },
  trackArtist: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 12,
    marginTop: 1,
  },
  note: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 12,
    fontStyle: "italic",
    marginTop: 4,
  },
  reactionRow: {
    flexDirection: "row",
    gap: 4,
    marginTop: 8,
  },
  reactionButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: "center",
    alignItems: "center",
  },
  reactionPicked: {
    backgroundColor: "rgba(255,255,255,0.15)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
  },
  reactionEmoji: {
    fontSize: 14,
  },
  playButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  playIcon: {
    color: "#fff",
    fontSize: 15,
  },
  spotifyLink: {
    paddingHorizontal: 4,
  },
  spotifyLinkText: {
    color: "#1DB954",
    fontSize: 11,
    fontWeight: "600",
  },
  empty: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
  },
  emptyText: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 15,
    fontWeight: "500",
    textAlign: "center",
  },
  emptySubtext: {
    color: "rgba(255,255,255,0.3)",
    fontSize: 13,
    marginTop: 6,
    textAlign: "center",
  },
});
