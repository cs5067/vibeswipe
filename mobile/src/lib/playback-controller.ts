import * as SpotifyAPI from "./spotify/client";

/**
 * Controls Spotify playback through the user's Spotify app.
 * Re-tries finding a device periodically instead of permanently disabling.
 */

class PlaybackController {
  private deviceId: string | null = null;
  private isPlaying = false;
  private currentTrackUri: string | null = null;
  private hasDevice = false;
  private consecutiveFails = 0;
  private pausedUntil = 0; // Timestamp — don't retry until this time

  async findDevice(): Promise<boolean> {
    if (Date.now() < this.pausedUntil) return false;

    try {
      const devices = await SpotifyAPI.getDevices();
      if (devices.length === 0) {
        this.hasDevice = false;
        return false;
      }

      const active = devices.find((d) => d.is_active);
      const device = active || devices[0];
      this.deviceId = device.id;
      this.hasDevice = true;
      this.consecutiveFails = 0; // Reset on successful device find
      return true;
    } catch {
      this.hasDevice = false;
      return false;
    }
  }

  async play(trackUri: string): Promise<boolean> {
    if (Date.now() < this.pausedUntil) return false;
    if (trackUri === this.currentTrackUri && this.isPlaying) return true;

    // Always try to refresh the device before playing
    const found = await this.findDevice();
    if (!found) return false;

    const success = await SpotifyAPI.playTrack(trackUri, this.deviceId || undefined, 0);

    if (success) {
      this.isPlaying = true;
      this.currentTrackUri = trackUri;
      this.consecutiveFails = 0;
      return true;
    }

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
    return false;
  }

  async pause(): Promise<void> {
    if (this.isPlaying) {
      await SpotifyAPI.pausePlayback().catch(() => {});
      this.isPlaying = false;
    }
  }

  get connected(): boolean {
    return this.hasDevice && Date.now() >= this.pausedUntil;
  }

  reset(): void {
    this.deviceId = null;
    this.isPlaying = false;
    this.currentTrackUri = null;
    this.hasDevice = false;
    this.consecutiveFails = 0;
    this.pausedUntil = 0;
  }
}

export const playbackController = new PlaybackController();
