import * as AuthSession from "expo-auth-session";
import * as SecureStore from "expo-secure-store";

const SPOTIFY_CLIENT_ID = "29b3a344ed9f449aa3428b82f4f8864e";

const discovery = {
  authorizationEndpoint: "https://accounts.spotify.com/authorize",
  tokenEndpoint: "https://accounts.spotify.com/api/token",
};

const SCOPES = [
  "user-read-recently-played",
  "user-top-read",
  "user-library-read",
  "user-library-modify",
  "playlist-read-private",
  "playlist-read-collaborative",
  "playlist-modify-public",
  "playlist-modify-private",
  "user-read-private",
  "user-read-email",
  "streaming",
  "user-modify-playback-state",
  "user-read-playback-state",
];

const TOKEN_KEY = "spotify_tokens";
// Must match (1) the Mac's current LAN IP, (2) the port Metro runs on
// (start with `npx expo start --port 8082`), and (3) a redirect URI
// registered verbatim in the Spotify developer dashboard.
const EXPO_GO_REDIRECT_URI = "exp://192.168.100.95:8082/--/callback";

interface TokenData {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

async function saveTokens(tokens: TokenData): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, JSON.stringify(tokens), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

async function loadTokens(): Promise<TokenData | null> {
  const stored = await SecureStore.getItemAsync(TOKEN_KEY);
  if (!stored) return null;

  try {
    return JSON.parse(stored) as TokenData;
  } catch {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    return null;
  }
}

export function useSpotifyAuth() {
  const redirectUri = __DEV__
    ? EXPO_GO_REDIRECT_URI
    : AuthSession.makeRedirectUri({
        native: "vibeswipe://callback",
        scheme: "vibeswipe",
        path: "callback",
      });

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: SPOTIFY_CLIENT_ID,
      scopes: SCOPES,
      usePKCE: true,
      redirectUri,
      responseType: AuthSession.ResponseType.Code,
    },
    discovery
  );

  return { request, response, promptAsync, redirectUri };
}

export async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string,
  redirectUri: string
): Promise<TokenData> {
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: SPOTIFY_CLIENT_ID,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    }).toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${error}`);
  }

  const data = await response.json();
  const tokenData: TokenData = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  await saveTokens(tokenData);
  return tokenData;
}

export async function getAccessToken(): Promise<string | null> {
  const tokenData = await loadTokens();
  if (!tokenData) return null;

  // Refresh if expired (with 5 min buffer)
  if (Date.now() > tokenData.expiresAt - 300000) {
    try {
      return await refreshToken(tokenData.refreshToken);
    } catch {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
      return null;
    }
  }

  return tokenData.accessToken;
}

async function refreshToken(refreshTokenValue: string): Promise<string> {
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: SPOTIFY_CLIENT_ID,
      grant_type: "refresh_token",
      refresh_token: refreshTokenValue,
    }).toString(),
  });

  if (!response.ok) throw new Error("Refresh failed");

  const data = await response.json();
  const tokenData: TokenData = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshTokenValue,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  await saveTokens(tokenData);
  return tokenData.accessToken;
}

export async function logout(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}
