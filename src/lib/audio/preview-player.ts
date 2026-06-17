class PreviewPlayer {
  private audio: HTMLAudioElement | null = null;
  private currentUrl: string | null = null;
  private listeners: Set<() => void> = new Set();
  private _isPlaying = false;
  private _progress = 0;
  private animFrame: number | null = null;

  get isPlaying(): boolean {
    return this._isPlaying;
  }

  get progress(): number {
    return this._progress;
  }

  get currentTime(): number {
    return this.audio?.currentTime || 0;
  }

  get duration(): number {
    return this.audio?.duration || 30;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.listeners.forEach((l) => l());
  }

  private startProgressTracking(): void {
    const update = () => {
      if (this.audio && this._isPlaying) {
        this._progress = this.audio.currentTime / (this.audio.duration || 30);
        this.notify();
        this.animFrame = requestAnimationFrame(update);
      }
    };
    this.animFrame = requestAnimationFrame(update);
  }

  private stopProgressTracking(): void {
    if (this.animFrame) {
      cancelAnimationFrame(this.animFrame);
      this.animFrame = null;
    }
  }

  play(url: string): void {
    if (this.currentUrl === url && this.audio) {
      this.audio.play();
      this._isPlaying = true;
      this.startProgressTracking();
      this.notify();
      return;
    }

    this.stop();

    this.audio = new Audio(url);
    this.audio.volume = 0.7;
    this.currentUrl = url;

    this.audio.addEventListener("ended", () => {
      this._isPlaying = false;
      this._progress = 0;
      this.stopProgressTracking();
      this.notify();
    });

    this.audio.addEventListener("error", () => {
      this._isPlaying = false;
      this._progress = 0;
      this.stopProgressTracking();
      this.notify();
    });

    this.audio.play().then(() => {
      this._isPlaying = true;
      this.startProgressTracking();
      this.notify();
    }).catch(() => {
      // Autoplay blocked — user needs to interact first
      this._isPlaying = false;
      this.notify();
    });
  }

  pause(): void {
    if (this.audio) {
      this.audio.pause();
      this._isPlaying = false;
      this.stopProgressTracking();
      this.notify();
    }
  }

  stop(): void {
    if (this.audio) {
      this.audio.pause();
      this.audio.src = "";
      this.audio = null;
    }
    this.currentUrl = null;
    this._isPlaying = false;
    this._progress = 0;
    this.stopProgressTracking();
    this.notify();
  }

  toggle(url: string): void {
    if (this._isPlaying && this.currentUrl === url) {
      this.pause();
    } else {
      this.play(url);
    }
  }

  setVolume(vol: number): void {
    if (this.audio) this.audio.volume = Math.max(0, Math.min(1, vol));
  }
}

// Singleton
export const previewPlayer = typeof window !== "undefined" ? new PreviewPlayer() : null;
