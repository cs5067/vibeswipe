import React, { useEffect } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSpotifyAuth, exchangeCodeForTokens } from "../lib/spotify/auth";
import { getMe } from "../lib/spotify/client";
import { useSessionStore } from "../stores/session-store";

interface LoginScreenProps {
  onLogin: () => void;
}

export function LoginScreen({ onLogin }: LoginScreenProps) {
  const { request, response, promptAsync, redirectUri } = useSpotifyAuth();
  const setAuth = useSessionStore((s) => s.setAuth);

  // Log redirect URI for Spotify dashboard setup
  console.log("=== ADD THIS REDIRECT URI TO SPOTIFY DASHBOARD ===");
  console.log(redirectUri);
  console.log("===================================================");

  useEffect(() => {
    if (response?.type === "success" && response.params.code) {
      const code = response.params.code;
      const codeVerifier = request?.codeVerifier;

      if (!codeVerifier) return;

      (async () => {
        try {
          await exchangeCodeForTokens(code, codeVerifier, redirectUri);
          const user = await getMe();
          setAuth(user.id, user.display_name, user.images?.[0]?.url || null);
          onLogin();
        } catch (err) {
          console.error("Auth error:", err);
        }
      })();
    }
  }, [response]);

  return (
    <View style={styles.container}>
      {/* Background blobs */}
      <View style={[styles.blob, styles.blob1]} />
      <View style={[styles.blob, styles.blob2]} />

      {/* Content */}
      <View style={styles.content}>
        {/* Icon */}
        <View style={styles.iconContainer}>
          <Text style={styles.icon}>🎵</Text>
        </View>

        <Text style={styles.title}>vibeswipe</Text>
        <Text style={styles.subtitle}>
          Swipe right on music you love.{"\n"}
          Build playlists that match your vibe.
        </Text>

        {/* Feature cards */}
        <View style={styles.featureRow}>
          {[
            { emoji: "👆", label: "Swipe to\ndiscover" },
            { emoji: "🎯", label: "AI-powered\nvibes" },
            { emoji: "📋", label: "Export\nplaylists" },
          ].map((f) => (
            <View key={f.label} style={styles.featureCard}>
              <Text style={styles.featureEmoji}>{f.emoji}</Text>
              <Text style={styles.featureLabel}>{f.label}</Text>
            </View>
          ))}
        </View>

        {/* Login button */}
        <TouchableOpacity
          style={styles.loginButton}
          onPress={() => promptAsync()}
          disabled={!request}
          activeOpacity={0.8}
        >
          <Text style={styles.spotifyIcon}>●</Text>
          <Text style={styles.loginText}>Connect with Spotify</Text>
        </TouchableOpacity>

        <Text style={styles.privacy}>
          Your listening data stays private.{"\n"}We never store your credentials.
        </Text>
      </View>
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
    top: -100,
    left: -80,
    width: 300,
    height: 300,
    backgroundColor: "rgba(99, 102, 241, 0.15)",
  },
  blob2: {
    bottom: -100,
    right: -80,
    width: 250,
    height: 250,
    backgroundColor: "rgba(139, 92, 246, 0.12)",
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: "#6366f1",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
    shadowColor: "#8b5cf6",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
  },
  icon: {
    fontSize: 36,
  },
  title: {
    fontSize: 48,
    fontWeight: "800",
    color: "#a78bfa",
    letterSpacing: -1,
  },
  subtitle: {
    fontSize: 16,
    color: "rgba(255,255,255,0.4)",
    textAlign: "center",
    marginTop: 12,
    lineHeight: 24,
  },
  featureRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 36,
  },
  featureCard: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  featureEmoji: {
    fontSize: 24,
    marginBottom: 8,
  },
  featureLabel: {
    fontSize: 11,
    color: "rgba(255,255,255,0.35)",
    textAlign: "center",
    fontWeight: "500",
  },
  loginButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1DB954",
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 999,
    marginTop: 36,
    gap: 12,
    shadowColor: "#1DB954",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
  },
  spotifyIcon: {
    color: "#000",
    fontSize: 20,
    fontWeight: "900",
  },
  loginText: {
    color: "#000",
    fontSize: 17,
    fontWeight: "700",
  },
  privacy: {
    marginTop: 24,
    fontSize: 11,
    color: "rgba(255,255,255,0.15)",
    textAlign: "center",
    lineHeight: 16,
  },
});
