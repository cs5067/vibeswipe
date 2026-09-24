import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  authedPost,
  fetchFriends,
  fetchInviteUrl,
  respondFriendRequest,
  searchFriends,
  sendFriendRequest,
  type Friend,
  type FriendSearchResult,
  type PendingRequest,
  type Person,
} from "../lib/server-api";

interface FriendsScreenProps {
  onBack: () => void;
}

const personLabel = (p: Pick<Person, "display_name" | "username">) => p.display_name || p.username || "Someone";
const friendLabel = (f: Friend) => f.displayName || f.username || "Friend";

export function FriendsScreen({ onBack }: FriendsScreenProps) {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [pending, setPending] = useState<PendingRequest[]>([]);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);

  // null = loaded and unclaimed → show setup; undefined = not loaded yet
  const [myUsername, setMyUsername] = useState<string | null | undefined>(undefined);
  const [usernameInput, setUsernameInput] = useState("");
  const [usernameError, setUsernameError] = useState("");
  const [savingUsername, setSavingUsername] = useState(false);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FriendSearchResult[]>([]);
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    const data = await fetchFriends();
    if (!data) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setFriends(data.friends || []);
    setPending(data.pending || []);
    setMyUsername(data.me?.username ?? null);
  }, []);

  useEffect(() => {
    (async () => {
      await load();
      setLoading(false);
      const url = await fetchInviteUrl();
      if (url) setInviteUrl(url);
    })();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  // Debounced username search.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    let active = true;
    const t = setTimeout(async () => {
      const matches = await searchFriends(q);
      if (active) setResults(matches);
    }, 250);
    return () => { active = false; clearTimeout(t); };
  }, [query]);

  const saveUsername = async () => {
    const username = usernameInput.trim().toLowerCase();
    if (!username) return;
    setUsernameError("");
    setSavingUsername(true);
    const data = await authedPost<{ ok?: boolean; username?: string }>(
      "/api/profile/username",
      { username }
    );
    setSavingUsername(false);
    if (data?.username) {
      setMyUsername(data.username);
    } else {
      setUsernameError("Couldn't claim it — 3–20 letters, numbers, underscore. Taken names don't count.");
    }
  };

  const shareInvite = async () => {
    if (!inviteUrl) return;
    try {
      await Share.share({ message: inviteUrl });
    } catch {
      /* user dismissed */
    }
  };

  const sendRequest = async (username: string) => {
    setSending((s) => new Set(s).add(username));
    const success = await sendFriendRequest(username);
    setSending((s) => {
      const next = new Set(s);
      next.delete(username);
      return next;
    });
    if (success) {
      setSent((s) => new Set(s).add(username));
      void load();
    } else {
      Alert.alert("Request not sent", "Couldn't send your friend request. Please try again.");
    }
  };

  const respond = async (requestId: string, accept: boolean) => {
    // Optimistic: the row disappears immediately.
    setPending((prev) => prev.filter((r) => r.id !== requestId));
    await respondFriendRequest(requestId, accept);
    void load();
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack}>
            <Text style={styles.backButton}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Friends</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#6366f1" />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Friends</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#a78bfa" />
        }
      >
        {failed && (
          <View style={styles.section}>
            <Text style={styles.errorText}>
              Couldn't reach the server. Pull to try again.
            </Text>
          </View>
        )}

        {/* Username setup (only until claimed) */}
        {myUsername === null && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Pick a username</Text>
            <Text style={styles.sectionSubtitle}>
              So friends can find you. Letters, numbers, underscore.
            </Text>
            <View style={styles.inputRow}>
              <TextInput
                value={usernameInput}
                onChangeText={setUsernameInput}
                placeholder="yourname"
                placeholderTextColor="rgba(255,255,255,0.3)"
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.input}
                selectionColor="#a78bfa"
              />
              <TouchableOpacity
                onPress={saveUsername}
                disabled={savingUsername || !usernameInput.trim()}
                style={[
                  styles.saveButton,
                  (savingUsername || !usernameInput.trim()) && styles.disabled,
                ]}
              >
                {savingUsername ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.saveButtonText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
            {!!usernameError && <Text style={styles.errorText}>{usernameError}</Text>}
          </View>
        )}

        {/* Invite link */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Invite a friend</Text>
          <Text style={styles.sectionSubtitle}>
            Send them this link — they join and you're connected.
          </Text>
          <TouchableOpacity
            onPress={shareInvite}
            disabled={!inviteUrl}
            style={[styles.inviteButton, !inviteUrl && styles.disabled]}
            activeOpacity={0.8}
          >
            <Text style={styles.inviteButtonText}>Share invite link</Text>
          </TouchableOpacity>
        </View>

        {/* Pending requests */}
        {pending.length > 0 && (
          <View style={styles.listSection}>
            <Text style={styles.listLabel}>REQUESTS</Text>
            {pending.map((req) => (
              <View key={req.id} style={styles.personRow}>
                <View style={styles.personInfo}>
                  <Text style={styles.personName} numberOfLines={1}>
                    {personLabel(req.requester)}
                  </Text>
                  {!!req.requester.username && (
                    <Text style={styles.personUsername}>@{req.requester.username}</Text>
                  )}
                </View>
                <TouchableOpacity
                  onPress={() => void respond(req.id, true)}
                  style={styles.acceptButton}
                >
                  <Text style={styles.acceptText}>Accept</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => void respond(req.id, false)}
                  style={styles.ignoreButton}
                >
                  <Text style={styles.ignoreText}>Ignore</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* Search */}
        <View style={styles.listSection}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search by @username"
            placeholderTextColor="rgba(255,255,255,0.3)"
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.searchInput}
            selectionColor="#a78bfa"
          />
          {results.map((p) => (
            <View key={p.username} style={styles.personRow}>
              <View style={styles.personInfo}>
                <Text style={styles.personName} numberOfLines={1}>
                  {personLabel(p)}
                </Text>
                {!!p.username && (
                  <Text style={styles.personUsername}>@{p.username}</Text>
                )}
              </View>
              <TouchableOpacity
                onPress={() => void sendRequest(p.username)}
                disabled={sent.has(p.username) || sending.has(p.username)}
                style={[styles.addButton, (sent.has(p.username) || sending.has(p.username)) && styles.disabled]}
              >
                <Text style={styles.addText}>{sent.has(p.username) ? "Sent" : sending.has(p.username) ? "Sending" : "Add"}</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>

        {/* Friend list */}
        <View style={styles.listSection}>
          <Text style={styles.listLabel}>YOUR FRIENDS ({friends.length})</Text>
          {friends.length === 0 ? (
            <Text style={styles.emptyText}>
              No friends yet. Share your invite link above.
            </Text>
          ) : (
            friends.map((f) => (
              <View key={f.id} style={styles.personRow}>
                {f.avatarUrl ? (
                  <Image source={{ uri: f.avatarUrl }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, styles.avatarPlaceholder]} />
                )}
                <View style={styles.personInfo}>
                  <Text style={styles.personName} numberOfLines={1}>
                    {friendLabel(f)}
                  </Text>
                  {!!f.username && (
                    <Text style={styles.personUsername}>@{f.username}</Text>
                  )}
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>
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
  loadingWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  scroll: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  section: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    padding: 16,
    marginBottom: 14,
  },
  sectionTitle: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 2,
  },
  sectionSubtitle: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 12,
    marginBottom: 12,
  },
  inputRow: {
    flexDirection: "row",
    gap: 8,
  },
  input: {
    flex: 1,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: "#fff",
    fontSize: 14,
  },
  saveButton: {
    backgroundColor: "#6366f1",
    borderRadius: 20,
    paddingHorizontal: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  saveButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },
  inviteButton: {
    backgroundColor: "#6366f1",
    borderRadius: 24,
    paddingVertical: 12,
    alignItems: "center",
  },
  inviteButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  listSection: {
    marginBottom: 18,
  },
  listLabel: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    marginBottom: 8,
  },
  searchInput: {
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: "#fff",
    fontSize: 14,
    marginBottom: 8,
  },
  personRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    padding: 12,
    marginBottom: 8,
  },
  personInfo: {
    flex: 1,
    minWidth: 0,
  },
  personName: {
    color: "#fff",
    fontSize: 14,
  },
  personUsername: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 12,
    marginTop: 1,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  avatarPlaceholder: {
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  acceptButton: {
    backgroundColor: "#6366f1",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  acceptText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  ignoreButton: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  ignoreText: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 12,
  },
  addButton: {
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  addText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  emptyText: {
    color: "rgba(255,255,255,0.3)",
    fontSize: 13,
  },
  errorText: {
    color: "#f87171",
    fontSize: 12,
    marginTop: 8,
  },
  disabled: {
    opacity: 0.4,
  },
});
