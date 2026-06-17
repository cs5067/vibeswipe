import React, { useState, useEffect } from "react";
import { View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { LoginScreen } from "./src/screens/LoginScreen";
import { SessionSetupScreen } from "./src/screens/SessionSetupScreen";
import { SwipeScreen } from "./src/screens/SwipeScreen";
import { PlaylistScreen } from "./src/screens/PlaylistScreen";
import { SummaryScreen } from "./src/screens/SummaryScreen";
import { getAccessToken } from "./src/lib/spotify/auth";

type Screen = "login" | "setup" | "swipe" | "playlist" | "summary";

export default function App() {
  const [screen, setScreen] = useState<Screen>("login");
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    (async () => {
      // Check if we already have a valid token
      const token = await getAccessToken();
      if (token) {
        // Already logged in — skip straight to setup
        setScreen("setup");
      }
      setCheckingAuth(false);
    })();
  }, []);

  if (checkingAuth) {
    return <View style={{ flex: 1, backgroundColor: "#0a0a0f" }} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#0a0a0f" }}>
      <StatusBar style="light" />

      {screen === "login" && (
        <LoginScreen onLogin={() => setScreen("setup")} />
      )}

      {screen === "setup" && (
        <SessionSetupScreen
          onStart={() => setScreen("swipe")}
          onLogout={() => setScreen("login")}
        />
      )}

      {screen === "swipe" && (
        <SwipeScreen
          onOpenPlaylist={() => setScreen("playlist")}
          onEndSession={() => setScreen("summary")}
        />
      )}

      {screen === "playlist" && (
        <PlaylistScreen onBack={() => setScreen("swipe")} />
      )}

      {screen === "summary" && (
        <SummaryScreen
          onViewPlaylist={() => setScreen("playlist")}
          onNewSession={() => setScreen("setup")}
          onGoHome={() => setScreen("login")}
        />
      )}
    </View>
  );
}
