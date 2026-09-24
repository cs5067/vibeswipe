// Static genre adjacency graph — used to find related genres
// since Spotify deprecated the recommendations and audio-features endpoints.
// This replaces collaborative filtering with genre-proximity-based discovery.

const GENRE_ADJACENCY: Record<string, string[]> = {
  // Hip-Hop & Rap
  "hip hop": ["rap", "trap", "r&b", "southern hip hop", "conscious hip hop", "gangsta rap", "boom bap"],
  rap: ["hip hop", "trap", "drill", "grime", "underground hip hop", "west coast rap"],
  trap: ["hip hop", "rap", "drill", "southern hip hop", "mumble rap", "cloud rap"],
  drill: ["trap", "uk drill", "grime", "rap", "chicago rap"],
  "uk drill": ["drill", "grime", "uk hip hop", "afroswing"],
  grime: ["uk hip hop", "drill", "uk drill", "electronic", "garage"],
  "underground hip hop": ["hip hop", "conscious hip hop", "boom bap", "abstract hip hop"],
  "conscious hip hop": ["hip hop", "underground hip hop", "neo soul", "jazz rap"],
  "boom bap": ["hip hop", "underground hip hop", "jazz rap", "east coast hip hop"],
  "jazz rap": ["hip hop", "boom bap", "neo soul", "jazz", "conscious hip hop"],
  "west coast rap": ["hip hop", "rap", "g-funk", "gangsta rap"],
  "gangsta rap": ["hip hop", "west coast rap", "southern hip hop", "rap"],
  "southern hip hop": ["hip hop", "trap", "crunk", "bounce", "gangsta rap"],
  "cloud rap": ["trap", "hip hop", "lo-fi hip hop", "experimental hip hop"],
  "lo-fi hip hop": ["hip hop", "lo-fi", "chillhop", "cloud rap", "jazz rap"],
  chillhop: ["lo-fi hip hop", "lo-fi", "jazz hop", "downtempo"],

  // R&B & Soul
  "r&b": ["hip hop", "neo soul", "soul", "pop r&b", "alternative r&b"],
  "neo soul": ["r&b", "soul", "jazz", "conscious hip hop", "alternative r&b"],
  soul: ["r&b", "neo soul", "funk", "motown", "gospel"],
  "alternative r&b": ["r&b", "neo soul", "indie pop", "electronic", "art pop"],
  funk: ["soul", "disco", "r&b", "jazz funk", "afrobeat"],
  gospel: ["soul", "r&b", "christian", "worship"],
  motown: ["soul", "r&b", "funk", "classic rock"],

  // Pop
  pop: ["dance pop", "synth-pop", "indie pop", "electropop", "art pop", "pop rock"],
  "dance pop": ["pop", "electropop", "edm", "house", "disco"],
  "synth-pop": ["pop", "new wave", "electropop", "darkwave", "indie pop"],
  "indie pop": ["indie rock", "pop", "dream pop", "bedroom pop", "alternative r&b"],
  electropop: ["pop", "synth-pop", "edm", "dance pop", "electronic"],
  "art pop": ["pop", "experimental", "indie pop", "alternative r&b", "avant-garde"],
  "bedroom pop": ["indie pop", "lo-fi", "dream pop", "chill"],
  "pop rock": ["pop", "rock", "alternative rock", "power pop"],
  "k-pop": ["pop", "dance pop", "electropop", "r&b"],

  // Rock
  rock: ["alternative rock", "indie rock", "classic rock", "hard rock", "pop rock"],
  "alternative rock": ["indie rock", "rock", "grunge", "post-punk", "shoegaze"],
  "indie rock": ["alternative rock", "indie pop", "post-punk", "garage rock", "math rock"],
  "classic rock": ["rock", "blues rock", "hard rock", "folk rock", "psychedelic rock"],
  "hard rock": ["rock", "metal", "classic rock", "punk rock"],
  grunge: ["alternative rock", "rock", "punk rock", "hard rock"],
  "post-punk": ["indie rock", "new wave", "darkwave", "goth", "shoegaze"],
  shoegaze: ["dream pop", "post-punk", "noise pop", "indie rock", "ambient"],
  "dream pop": ["shoegaze", "indie pop", "ambient pop", "chillwave", "ethereal"],
  "garage rock": ["indie rock", "punk rock", "lo-fi", "garage revival"],
  "psychedelic rock": ["classic rock", "psychedelic", "progressive rock", "acid rock"],
  "progressive rock": ["psychedelic rock", "art rock", "math rock", "post-rock"],
  "post-rock": ["ambient", "shoegaze", "experimental", "progressive rock"],
  "math rock": ["indie rock", "progressive rock", "post-rock", "emo"],
  "noise pop": ["shoegaze", "indie rock", "noise", "lo-fi"],
  emo: ["punk rock", "alternative rock", "screamo", "indie rock", "math rock"],
  punk: ["punk rock", "hardcore", "post-punk", "ska punk"],
  "punk rock": ["punk", "pop punk", "hardcore", "garage rock", "grunge"],
  "pop punk": ["punk rock", "emo", "pop rock", "alternative rock"],
  hardcore: ["punk rock", "metal", "post-hardcore", "screamo"],

  // Metal
  metal: ["hard rock", "heavy metal", "thrash metal", "death metal", "black metal"],
  "heavy metal": ["metal", "hard rock", "thrash metal", "power metal"],
  "thrash metal": ["metal", "heavy metal", "death metal", "speed metal"],
  "death metal": ["metal", "thrash metal", "black metal", "deathcore"],
  "black metal": ["metal", "death metal", "atmospheric black metal", "doom metal"],
  "doom metal": ["metal", "stoner rock", "sludge metal", "drone"],
  "nu metal": ["metal", "alternative rock", "rap", "hard rock"],

  // Electronic
  electronic: ["edm", "house", "techno", "ambient", "synth-pop", "electropop"],
  edm: ["house", "dance pop", "trance", "dubstep", "electronic"],
  house: ["deep house", "tech house", "disco", "edm", "electronic"],
  "deep house": ["house", "tech house", "lo-fi house", "minimal"],
  "tech house": ["house", "techno", "deep house", "minimal"],
  techno: ["electronic", "tech house", "industrial", "minimal", "ambient techno"],
  trance: ["edm", "progressive trance", "psytrance", "electronic"],
  dubstep: ["edm", "bass music", "electronic", "drum and bass"],
  "drum and bass": ["dubstep", "jungle", "electronic", "bass music", "liquid dnb"],
  ambient: ["electronic", "post-rock", "shoegaze", "new age", "drone"],
  "ambient techno": ["ambient", "techno", "idm", "downtempo"],
  idm: ["electronic", "ambient", "experimental", "glitch"],
  downtempo: ["chillout", "trip hop", "ambient", "lo-fi", "electronic"],
  "trip hop": ["downtempo", "electronic", "hip hop", "alternative"],
  chillwave: ["dream pop", "synth-pop", "lo-fi", "indie pop", "vaporwave"],
  vaporwave: ["chillwave", "electronic", "synth-pop", "lo-fi"],
  garage: ["uk garage", "2-step", "grime", "house"],

  // Jazz
  jazz: ["jazz rap", "neo soul", "fusion", "bebop", "smooth jazz"],
  fusion: ["jazz", "funk", "progressive rock", "experimental"],
  "smooth jazz": ["jazz", "r&b", "easy listening"],

  // Folk & Country
  folk: ["indie folk", "folk rock", "singer-songwriter", "acoustic", "americana"],
  "indie folk": ["folk", "indie rock", "singer-songwriter", "chamber pop"],
  "folk rock": ["folk", "rock", "classic rock", "singer-songwriter"],
  "singer-songwriter": ["folk", "indie folk", "acoustic", "alternative"],
  country: ["americana", "country rock", "folk", "bluegrass"],
  americana: ["country", "folk", "singer-songwriter", "alt-country"],
  bluegrass: ["country", "folk", "americana", "acoustic"],

  // Latin
  reggaeton: ["latin", "latin pop", "trap latino", "dancehall"],
  "latin pop": ["pop", "reggaeton", "latin", "tropical"],
  "trap latino": ["reggaeton", "trap", "latin", "hip hop"],
  latin: ["reggaeton", "latin pop", "salsa", "bachata"],
  salsa: ["latin", "tropical", "cumbia", "merengue"],
  bachata: ["latin", "reggaeton", "tropical"],

  // African
  afrobeat: ["afropop", "highlife", "funk", "world"],
  afrobeats: ["afropop", "afroswing", "dancehall", "r&b"],
  afropop: ["afrobeats", "afrobeat", "pop", "world"],
  afroswing: ["afrobeats", "uk hip hop", "r&b", "dancehall"],

  // Caribbean
  reggae: ["dub", "dancehall", "ska", "roots reggae"],
  dancehall: ["reggae", "reggaeton", "afrobeats", "soca"],
  ska: ["reggae", "punk rock", "ska punk"],

  // Other
  "lo-fi": ["bedroom pop", "chillhop", "lo-fi hip hop", "ambient", "chillwave"],
  chill: ["lo-fi", "ambient", "downtempo", "chillhop"],
  experimental: ["art pop", "avant-garde", "noise", "idm", "post-rock"],
  classical: ["orchestral", "chamber music", "contemporary classical", "piano"],
  "new wave": ["synth-pop", "post-punk", "alternative rock", "darkwave"],
  darkwave: ["post-punk", "goth", "synth-pop", "industrial"],
  industrial: ["electronic", "metal", "darkwave", "noise"],
  disco: ["funk", "house", "dance pop", "nu-disco"],
  "nu-disco": ["disco", "house", "synth-pop", "french house"],
};

export function getRelatedGenres(genre: string, depth = 1): string[] {
  const normalized = genre.toLowerCase();
  const visited = new Set<string>([normalized]);
  let frontier = [normalized];

  for (let d = 0; d < depth; d++) {
    const nextFrontier: string[] = [];
    for (const g of frontier) {
      const neighbors = GENRE_ADJACENCY[g] || [];
      for (const n of neighbors) {
        if (!visited.has(n)) {
          visited.add(n);
          nextFrontier.push(n);
        }
      }
    }
    frontier = nextFrontier;
  }

  visited.delete(normalized);
  return Array.from(visited);
}

export function genreSimilarity(a: string, b: string): number {
  const na = a.toLowerCase();
  const nb = b.toLowerCase();
  if (na === nb) return 1;

  // BFS shortest path
  const visited = new Set<string>([na]);
  let frontier = [na];
  let dist = 0;
  const maxDist = 5;

  while (frontier.length > 0 && dist < maxDist) {
    dist++;
    const nextFrontier: string[] = [];
    for (const g of frontier) {
      const neighbors = GENRE_ADJACENCY[g] || [];
      for (const n of neighbors) {
        if (n === nb) return 1 - dist / (maxDist + 1);
        if (!visited.has(n)) {
          visited.add(n);
          nextFrontier.push(n);
        }
      }
    }
    frontier = nextFrontier;
  }

  return 0;
}

export function expandGenreSet(genres: string[]): string[] {
  const expanded = new Set<string>();
  for (const g of genres) {
    expanded.add(g.toLowerCase());
    const related = getRelatedGenres(g, 1);
    related.forEach((r) => expanded.add(r));
  }
  return Array.from(expanded);
}

export function getGenreSearchTerms(genre: string): string[] {
  // Return the genre and close variants for search queries
  const terms = [genre];
  const related = GENRE_ADJACENCY[genre.toLowerCase()];
  if (related) {
    terms.push(...related.slice(0, 2));
  }
  return terms;
}
