/**
 * Shared keyword bank for corpus seeders (Spotify + Deezer).
 *
 * Deliberately diverse — genres × moods × cultures × decades, far beyond any
 * one user's taste — so the co-occurrence corpus starts broad, not biased.
 * Seeders shuffle this bank per run and skip already-known playlists, so
 * every run mines new ground.
 */
export const KEYWORD_BANK = [
  // Moods / contexts
  "late night drive", "gym hype", "sad hours", "study lofi", "summer party",
  "rainy day", "road trip", "morning coffee", "heartbreak", "feel good",
  "throwback", "wedding dance", "chill vibes", "rage workout", "sunset",
  "main character", "slow dance", "pregame", "deep focus", "3am thoughts",
  // Genres — wide on purpose
  "indie rock essentials", "classic rock", "90s hip hop", "trap bangers",
  "uk drill", "grime classics", "afrobeats", "amapiano", "dancehall",
  "reggaeton exitos", "latin pop", "k-pop hits", "j-pop", "city pop",
  "country roads", "folk acoustic", "bluegrass", "jazz classics",
  "smooth jazz", "neo soul", "r&b slow jams", "funk grooves", "disco",
  "house music", "deep house", "techno", "drum and bass", "dubstep",
  "edm festival", "synthwave", "vaporwave", "hyperpop", "shoegaze",
  "dream pop", "post punk", "emo", "pop punk", "metalcore", "heavy metal",
  "death metal", "punk rock", "grunge", "alt rock 2000s", "britpop",
  "classical essentials", "film scores", "lo-fi beats", "ambient",
  "gospel praise", "worship", "blues legends", "soul classics", "motown",
  // Cultures / languages / scenes
  "arabic pop", "bollywood hits", "desi hip hop", "french rap",
  "german rap", "italian classics", "spanish indie", "brazilian funk",
  "mpb brasil", "nigerian afrobeats", "ghana highlife", "south african house",
  "turkish pop", "russian rap", "thai pop", "viet pop", "mandopop",
  "cantopop", "reggae roots", "soca carnival", "kompa", "cumbia",
  // Decades / eras
  "60s classics", "70s rock", "80s hits", "90s alternative", "2000s pop",
  "2010s throwback", "one hit wonders", "deep cuts", "underground hip hop",
  "indie sleeper hits", "viral tiktok songs", "fresh finds",
] as const;
