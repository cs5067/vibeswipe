// A self-contained song share ("force-a-song").
// Everything the recipient page needs is denormalized here so it renders
// and plays without a Spotify login or any corpus lookup.

export interface SharedTrack {
  name: string;
  artistNames: string[];
  albumImage: string;
  previewUrl: string | null;
  spotifyUrl: string;
}

export interface SharedSong {
  code: string;
  track: SharedTrack;
  senderName: string | null;
  note: string | null;
  createdAt: string;
}
