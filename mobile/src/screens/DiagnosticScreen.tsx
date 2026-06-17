import React, { useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { getAccessToken } from "../lib/spotify/auth";

const BASE_URL = "https://api.spotify.com/v1";

interface TestResult {
  name: string;
  endpoint: string;
  status: "pending" | "pass" | "fail";
  statusCode?: number;
  error?: string;
}

async function testEndpoint(path: string, token: string, method = "GET", body?: string): Promise<{ ok: boolean; status: number; error?: string }> {
  try {
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
    if (body) headers["Content-Type"] = "application/json";

    const res = await fetch(`${BASE_URL}${path}`, { method, headers, body });
    if (res.ok || res.status === 204) return { ok: true, status: res.status };

    const errorText = await res.text();
    return { ok: false, status: res.status, error: errorText.slice(0, 200) };
  } catch (err: any) {
    return { ok: false, status: 0, error: err.message };
  }
}

export function DiagnosticScreen({ onDone }: { onDone: () => void }) {
  const [results, setResults] = useState<TestResult[]>([]);
  const [running, setRunning] = useState(false);
  const [token, setToken] = useState("");

  const runDiagnostics = async () => {
    setRunning(true);
    const t = await getAccessToken();
    if (!t) {
      setResults([{ name: "Auth", endpoint: "-", status: "fail", error: "No token" }]);
      setRunning(false);
      return;
    }
    setToken(t.slice(0, 20) + "...");

    // Define all tests
    const tests: Array<{ name: string; endpoint: string; method?: string; body?: string }> = [
      { name: "Get Profile", endpoint: "/me" },
      { name: "Top Tracks (short)", endpoint: "/me/top/tracks?time_range=short_term&limit=5" },
      { name: "Top Artists (short)", endpoint: "/me/top/artists?time_range=short_term&limit=5" },
      { name: "Recently Played", endpoint: "/me/player/recently-played?limit=5" },
      { name: "Saved Tracks", endpoint: "/me/tracks?limit=5" },
      { name: "My Playlists", endpoint: "/me/playlists?limit=5" },
      { name: "Search (basic)", endpoint: "/search?q=test&type=track&limit=5" },
      { name: "Search (limit 10)", endpoint: "/search?q=drake&type=track&limit=10" },
      { name: "Search (limit 1)", endpoint: "/search?q=drake&type=track&limit=1" },
      // Will fill artist ID dynamically after getting top artists
      { name: "Artist Top Tracks", endpoint: "__DYNAMIC_ARTIST__" },
      { name: "Artist Albums", endpoint: "__DYNAMIC_ARTIST_ALBUMS__" },
      { name: "Get Artists (batch)", endpoint: "__DYNAMIC_ARTISTS_BATCH__" },
      { name: "Get Devices", endpoint: "/me/player/devices" },
      { name: "Playback State", endpoint: "/me/player" },
      { name: "Browse Categories", endpoint: "/browse/categories?limit=5" },
      { name: "Featured Playlists", endpoint: "/browse/featured-playlists?limit=5" },
    ];

    const updatedResults: TestResult[] = tests.map((t) => ({
      name: t.name,
      endpoint: t.endpoint,
      status: "pending" as const,
    }));
    setResults([...updatedResults]);

    // First get an artist ID for dynamic tests
    let artistId = "";
    try {
      const res = await fetch(`${BASE_URL}/me/top/artists?time_range=short_term&limit=1`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (res.ok) {
        const data = await res.json();
        artistId = data.items?.[0]?.id || "";
      }
    } catch {}

    // Run each test sequentially to avoid rate limits
    for (let i = 0; i < tests.length; i++) {
      let endpoint = tests[i].endpoint;

      // Fill in dynamic endpoints
      if (endpoint === "__DYNAMIC_ARTIST__") {
        endpoint = artistId ? `/artists/${artistId}/top-tracks?market=US` : "/artists/06HL4z0CvFAxyc27GXpf02/top-tracks?market=US";
      } else if (endpoint === "__DYNAMIC_ARTIST_ALBUMS__") {
        endpoint = artistId ? `/artists/${artistId}/albums?limit=5` : "/artists/06HL4z0CvFAxyc27GXpf02/albums?limit=5";
      } else if (endpoint === "__DYNAMIC_ARTISTS_BATCH__") {
        endpoint = artistId ? `/artists?ids=${artistId}` : "/artists?ids=06HL4z0CvFAxyc27GXpf02";
      }

      const result = await testEndpoint(endpoint, t, tests[i].method, tests[i].body);

      updatedResults[i] = {
        name: tests[i].name,
        endpoint: endpoint,
        status: result.ok ? "pass" : "fail",
        statusCode: result.status,
        error: result.error,
      };
      setResults([...updatedResults]);

      // Small delay between requests to avoid rate limiting
      await new Promise((r) => setTimeout(r, 300));
    }

    setRunning(false);
  };

  const passCount = results.filter((r) => r.status === "pass").length;
  const failCount = results.filter((r) => r.status === "fail").length;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>API Diagnostics</Text>
        <TouchableOpacity onPress={onDone}>
          <Text style={styles.doneButton}>Done</Text>
        </TouchableOpacity>
      </View>

      {token ? (
        <Text style={styles.tokenText}>Token: {token}</Text>
      ) : null}

      {!running && results.length === 0 && (
        <View style={styles.startContainer}>
          <Text style={styles.description}>
            This tests every Spotify API endpoint to see what your app has access to.
          </Text>
          <TouchableOpacity style={styles.runButton} onPress={runDiagnostics}>
            <Text style={styles.runButtonText}>Run Diagnostics</Text>
          </TouchableOpacity>
        </View>
      )}

      {running && results.length === 0 && (
        <View style={styles.startContainer}>
          <ActivityIndicator size="large" color="#6366f1" />
        </View>
      )}

      {results.length > 0 && (
        <>
          <View style={styles.summary}>
            <Text style={styles.summaryText}>
              {passCount > 0 && <Text style={{ color: "#4ade80" }}>{passCount} passed</Text>}
              {passCount > 0 && failCount > 0 && <Text> · </Text>}
              {failCount > 0 && <Text style={{ color: "#f87171" }}>{failCount} failed</Text>}
              {running && <Text style={{ color: "rgba(255,255,255,0.3)" }}> · testing...</Text>}
            </Text>
          </View>

          <ScrollView style={styles.resultsList}>
            {results.map((r, i) => (
              <View key={i} style={styles.resultRow}>
                <View style={styles.resultHeader}>
                  <Text style={[
                    styles.statusDot,
                    r.status === "pass" ? styles.pass :
                    r.status === "fail" ? styles.fail :
                    styles.pending
                  ]}>
                    {r.status === "pass" ? "✓" : r.status === "fail" ? "✗" : "○"}
                  </Text>
                  <Text style={styles.resultName}>{r.name}</Text>
                  {r.statusCode ? (
                    <Text style={[
                      styles.statusCode,
                      r.statusCode < 300 ? styles.codeOk : styles.codeBad
                    ]}>
                      {r.statusCode}
                    </Text>
                  ) : null}
                </View>
                {r.status === "fail" && r.error && (
                  <Text style={styles.errorText} numberOfLines={2}>{r.error}</Text>
                )}
              </View>
            ))}
          </ScrollView>

          {!running && (
            <TouchableOpacity style={styles.rerunButton} onPress={runDiagnostics}>
              <Text style={styles.rerunText}>Re-run</Text>
            </TouchableOpacity>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0a0a0f" },
  header: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16,
  },
  title: { color: "#fff", fontSize: 20, fontWeight: "800" },
  doneButton: { color: "#a78bfa", fontSize: 14, fontWeight: "600" },
  tokenText: { color: "rgba(255,255,255,0.2)", fontSize: 10, paddingHorizontal: 20, marginBottom: 8, fontFamily: "monospace" },
  startContainer: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 40 },
  description: { color: "rgba(255,255,255,0.4)", fontSize: 14, textAlign: "center", marginBottom: 24, lineHeight: 22 },
  runButton: { backgroundColor: "#6366f1", paddingHorizontal: 32, paddingVertical: 14, borderRadius: 999 },
  runButtonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  summary: { paddingHorizontal: 20, paddingBottom: 12 },
  summaryText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  resultsList: { flex: 1, paddingHorizontal: 20 },
  resultRow: {
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.05)",
  },
  resultHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  statusDot: { fontSize: 16, width: 20 },
  pass: { color: "#4ade80" },
  fail: { color: "#f87171" },
  pending: { color: "rgba(255,255,255,0.2)" },
  resultName: { color: "#fff", fontSize: 13, fontWeight: "500", flex: 1 },
  statusCode: { fontSize: 11, fontWeight: "700", fontFamily: "monospace" },
  codeOk: { color: "#4ade80" },
  codeBad: { color: "#f87171" },
  errorText: { color: "rgba(255,255,255,0.25)", fontSize: 10, marginTop: 4, marginLeft: 30 },
  rerunButton: { margin: 20, alignItems: "center", paddingVertical: 12 },
  rerunText: { color: "#a78bfa", fontSize: 14, fontWeight: "600" },
});
