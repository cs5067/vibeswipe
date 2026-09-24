import * as SpotifyAPI from "./spotify/client";
import * as ServerAPI from "./server-api";
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";

/**
 * Plays the current card. Two tiers:
 *  1. Spotify Connect — FULL songs through the user's Spotify app (Premium
 *     + app open). Preferred when it works.
 *  2. Deezer 30s preview via the server proxy, played on-device with
 *     expo-audio — kicks in whenever Connect can't (no device, 502s,
 *     backoff window, no Premium). Returns false when neither source can play.
 */

class PlaybackController {
  private deviceId: string | null = null;
  private isPlaying = false;
  private currentTrackUri: string | null = null;
  private hasDevice = false;
  private consecutiveFails = 0;
  private pausedUntil = 0; // Timestamp — don't retry Connect until this time
  private generation = 0;
  private deviceCheckedAt = 0;
  private deviceLookup: Promise<boolean> | null = null;
  private connectCommands: Promise<unknown> = Promise.resolve();
  private spotifyPlaying = false;

  private previewPlayer: AudioPlayer | null = null;
  private audioModeReady = false;

  private stopPreview(): void {
    if (this.previewPlayer) {
      try {
        this.previewPlayer.pause();
        this.previewPlayer.remove();
      } catch {
        /* already released */
      }
      this.previewPlayer = null;
    }
  }

  private async playPreview(meta: { name: string; artist: string; provider?: string; previewUrl?: string | null }, generation: number): Promise<boolean> {
    try {
      const url = meta.provider === "deezer" ? meta.previewUrl : await ServerAPI.resolvePreviewUrl(meta.artist, meta.name);
      if (!url || generation !== this.generation) return false;

      if (!this.audioModeReady) {
        // iOS: audible even with the silent switch on.
        await setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
        this.audioModeReady = true;
      }

      if (generation !== this.generation) return false;
      this.stopPreview();
      this.previewPlayer = createAudioPlayer({ uri: url });
      this.previewPlayer.play();
      this.isPlaying = true;
      console.log(`Playback: Deezer preview fallback for "${meta.name}"`);
      return true;
    } catch (err) {
      console.log("Preview fallback failed:", err);
      return false;
    }
  }

  findDevice(): Promise<boolean> {
    if (Date.now() < this.pausedUntil) return Promise.resolve(false);
    if (this.deviceLookup) return this.deviceLookup;
    if (Date.now() - this.deviceCheckedAt < 30_000) return Promise.resolve(this.hasDevice);
    this.deviceLookup = this.lookupDevice().finally(() => { this.deviceLookup = null; });
    return this.deviceLookup;
  }

  private async lookupDevice(): Promise<boolean> {
    try {
      const devices = await SpotifyAPI.getDevices();
      this.deviceCheckedAt = Date.now();
      if (devices.length === 0) {
        this.hasDevice = false;
        return false;
      }

      const active = devices.find((d) => d.is_active);
      const device = active || devices[0];
      this.deviceId = device.id;
      this.hasDevice = true;
      return true;
    } catch {
      this.hasDevice = false;
      return false;
    }
  }

  // A generation check alone cannot undo an in-flight remote PUT. Serialize
  // Connect commands so the latest play/pause is also the last command sent.
  private command(generation: number, action: () => Promise<boolean>): Promise<boolean> {
    const next = this.connectCommands.catch(() => {}).then(() =>
      generation === this.generation ? action() : false
    );
    this.connectCommands = next;
    return next;
  }

  async play(
    trackUri: string,
    meta?: { name: string; artist: string; provider?: string; previewUrl?: string | null }
  ): Promise<boolean> {
    if (trackUri === this.currentTrackUri && this.isPlaying) return true;
    const generation = ++this.generation;
    this.currentTrackUri = trackUri;
    this.stopPreview();
    this.isPlaying = false;

    // Deezer test cards are never sent to Spotify or resolved through its catalog.
    if (meta?.provider === "deezer") {
      if (this.spotifyPlaying) {
        const stopped = await this.command(generation, () => SpotifyAPI.pausePlayback());
        if (!stopped || generation !== this.generation) return false;
        this.spotifyPlaying = false;
      }
      return this.playPreview(meta, generation);
    }

    // Tier 1: Spotify Connect (full song), unless it's in a backoff window.
    if (Date.now() >= this.pausedUntil) {
      const found = await this.findDevice();
      if (generation !== this.generation) return false;
      if (found) {
        const success = await this.command(generation, async () => {
          const played = await SpotifyAPI.playTrack(trackUri, this.deviceId || undefined, 0);
          if (played) this.spotifyPlaying = true;
          return played;
        });
        if (generation !== this.generation) return false;
        if (success) {
          this.isPlaying = true;
          this.consecutiveFails = 0;
          return true;
        }
        this.trackConnectFailure();
      }
    }

    // Stop any previous Connect song before switching to local audio.
    if (this.spotifyPlaying) {
      const stopped = await this.command(generation, () => SpotifyAPI.pausePlayback());
      if (!stopped || generation !== this.generation) return false;
      this.spotifyPlaying = false;
    }
    if (meta?.name) {
      return this.playPreview(meta, generation);
    }
    return false;
  }

  private trackConnectFailure(): void {

    // Track failure but back off instead of permanently disabling
    this.consecutiveFails++;
    if (this.consecutiveFails >= 3) {
      // Back off for 30 seconds, then try again
      console.log("Playback: backing off for 30s after 3 failures");
      this.pausedUntil = Date.now() + 30000;
      this.consecutiveFails = 0;
      this.hasDevice = false;
      this.deviceId = null;
    }
  }

  async pause(): Promise<void> {
    const generation = ++this.generation;
    this.stopPreview();
    this.isPlaying = false;
    await this.command(generation, async () => {
      if (!this.spotifyPlaying) return true;
      const stopped = await SpotifyAPI.pausePlayback();
      if (stopped) this.spotifyPlaying = false;
      return stopped;
    }).catch(() => {});
  }

  get connected(): boolean {
    return this.hasDevice && Date.now() >= this.pausedUntil;
  }

  reset(): void {
    void this.pause();
    this.deviceId = null;
    this.deviceCheckedAt = 0;
    this.isPlaying = false;
    this.currentTrackUri = null;
    this.hasDevice = false;
    this.consecutiveFails = 0;
    this.pausedUntil = 0;
  }
}

export const playbackController = new PlaybackController();
