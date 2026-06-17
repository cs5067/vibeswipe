/**
 * Smart seed generation from playlist name + user's listening genres.
 *
 * Returns: artist names to search, search queries, playlist search terms.
 * Optionally uses Anthropic Claude API for much better interpretation.
 */

export interface PlaylistSeeds {
  seedArtists: string[];       // Specific artist names to search for
  searchQueries: string[];     // Diverse Spotify search queries
  playlistSearches: string[];  // Terms to find playlists on Spotify
  genres: string[];            // Expected genre tags
}

// ─── Anthropic AI interpretation (optional) ────────────────────────────
// NEVER hardcode a key here — this runs on-device and would expose it to
// users. Left disabled; the static mapping is used. If ever enabled, route
// the call through the server, not the client.
const ANTHROPIC_API_KEY = "";

export async function generateSeeds(
  playlistName: string,
  userGenres: string[]
): Promise<PlaylistSeeds> {
  // Try AI first if configured
  if (ANTHROPIC_API_KEY) {
    const aiSeeds = await getAISeeds(playlistName, userGenres);
    if (aiSeeds) {
      console.log("AI seeds:", aiSeeds.seedArtists.length, "artists,", aiSeeds.searchQueries.length, "queries");
      return aiSeeds;
    }
  }

  // Fall back to static mapping
  return getStaticSeeds(playlistName, userGenres);
}

async function getAISeeds(playlistName: string, userGenres: string[]): Promise<PlaylistSeeds | null> {
  try {
    const genreStr = userGenres.length > 0
      ? `They listen to: ${userGenres.slice(0, 10).join(", ")}.`
      : "No genre data available — use the playlist name to infer taste.";

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-5-haiku-20241022",
        max_tokens: 600,
        messages: [{
          role: "user",
          content: `A user is building a Spotify playlist called "${playlistName}". ${genreStr}

Return a JSON object with:
- "seedArtists": array of 20 specific artist names that perfectly fit this playlist vibe (mix well-known and emerging)
- "searchQueries": array of 12 unique Spotify search queries to find songs for this playlist (be creative — use moods, descriptors, subgenres, "artist type beat", etc.)
- "playlistSearches": array of 6 terms to search for similar playlists on Spotify
- "genres": array of 8 genre tags that describe this playlist

ONLY return valid JSON. No markdown, no explanation.`
        }]
      })
    });

    if (!response.ok) return null;
    const data = await response.json();
    const text = data.content?.[0]?.text || "";
    // Try to parse — handle potential markdown wrapping
    const jsonStr = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(jsonStr);
    return {
      seedArtists: parsed.seedArtists || [],
      searchQueries: parsed.searchQueries || [],
      playlistSearches: parsed.playlistSearches || [],
      genres: parsed.genres || [],
    };
  } catch (err) {
    console.log("AI seed generation failed, using static mapping:", err);
    return null;
  }
}

// ─── Static mapping (no AI needed) ────────────────────────────────────

// Genre → representative artist names
const GENRE_ARTISTS: Record<string, string[]> = {
  "r&b": ["Frank Ocean", "SZA", "Daniel Caesar", "The Weeknd", "Brent Faiyaz", "Summer Walker", "H.E.R.", "Giveon", "Jorja Smith", "6LACK", "Snoh Aalegra", "Kali Uchis", "Jhené Aiko", "Bryson Tiller", "Kehlani"],
  "alternative r&b": ["Frank Ocean", "Steve Lacy", "Daniel Caesar", "Brent Faiyaz", "6LACK", "Snoh Aalegra", "Blood Orange", "Ravyn Lenae", "Amaarae", "Jean Dawson"],
  "neo soul": ["Erykah Badu", "D'Angelo", "Lauryn Hill", "Frank Ocean", "Anderson .Paak", "Daniel Caesar", "Snoh Aalegra", "Ravyn Lenae", "Solange", "Steve Lacy"],
  "hip hop": ["Kendrick Lamar", "J. Cole", "Tyler the Creator", "JID", "Denzel Curry", "Earthgang", "Baby Keem", "Isaiah Rashad", "Vince Staples", "Mac Miller", "Joey Badass", "Cordae", "Smino", "Bas", "Saba"],
  "rap": ["Drake", "Travis Scott", "Future", "21 Savage", "Lil Baby", "Gunna", "Don Toliver", "Metro Boomin", "Playboi Carti", "Lil Uzi Vert", "A$AP Rocky", "Pop Smoke", "Jack Harlow", "Central Cee"],
  "trap": ["Travis Scott", "Future", "21 Savage", "Lil Baby", "Young Thug", "Gunna", "Don Toliver", "Metro Boomin", "Playboi Carti", "Lil Uzi Vert"],
  "drill": ["Pop Smoke", "Central Cee", "Fivio Foreign", "Kay Flock", "Ice Spice", "Digga D", "Headie One", "Dave", "Tion Wayne"],
  "uk rap": ["Dave", "Central Cee", "Skepta", "Stormzy", "J Hus", "Headie One", "Tion Wayne", "AJ Tracey", "Aitch", "Digga D", "Santan Dave", "Knucks", "Little Simz", "Slowthai", "Ghetts", "Giggs", "Wretch 32"],
  "uk drill": ["Central Cee", "Digga D", "Headie One", "Tion Wayne", "Russ Millions", "Arrdee", "Pop Smoke", "Fivio Foreign", "K-Trap", "M Huncho"],
  "grime": ["Skepta", "Stormzy", "Wiley", "JME", "Ghetts", "Kano", "Dizzee Rascal", "Chip", "D Double E", "AJ Tracey", "Novelist"],
  "uk": ["Dave", "Central Cee", "Skepta", "Stormzy", "J Hus", "Jorja Smith", "Little Simz", "Headie One", "Knucks", "Raye", "FKA Twigs", "Tion Wayne", "AJ Tracey", "Slowthai", "Aitch"],
  "afrobeats": ["Burna Boy", "Wizkid", "Davido", "Rema", "Tems", "Omah Lay", "Asake", "Ayra Starr", "CKay", "Fireboy DML", "Joeboy", "Tiwa Savage", "Patoranking", "Mr Eazi", "Ruger", "BNXN", "Oxlade", "Gyakie"],
  "afropop": ["Burna Boy", "Wizkid", "Rema", "Tems", "Asake", "Ayra Starr", "CKay", "Fireboy DML", "Omah Lay", "Joeboy"],
  "sudanese": ["Mohammed Wardi", "Abdel Gadir Salim", "Mohammed Al Amin", "Mustafa Sid Ahmed", "Hanan Bulu Bulu", "Nada Al-Qalaa", "Nancy Ajaj", "Rasha", "Alsarah & The Nubatones", "Sinkane", "Ayman Mao", "Kamal Tarbas"],
  "sudanese pop": ["Nancy Ajaj", "Nada Al-Qalaa", "Ayman Mao", "Hanan Bulu Bulu", "Mohammed Al Amin", "Mohammed Wardi", "Alsarah & The Nubatones", "Rasha"],
  "nubian": ["Mohammed Wardi", "Alsarah & The Nubatones", "Rasha", "Sinkane", "Hamza El Din", "Ali Hassan Kuban"],
  "pop": ["Dua Lipa", "Olivia Rodrigo", "Harry Styles", "Billie Eilish", "The Weeknd", "Doja Cat", "Ariana Grande", "Bad Bunny", "Tyla", "Sabrina Carpenter", "Chappell Roan", "Raye"],
  "indie pop": ["Clairo", "beabadoobee", "Dominic Fike", "Rex Orange County", "Wallows", "Still Woozy", "Boy Pablo", "Dayglow", "Faye Webster"],
  "indie rock": ["Arctic Monkeys", "Tame Impala", "Mac DeMarco", "The Neighbourhood", "Khruangbin", "MGMT", "Glass Animals", "Cage the Elephant", "Radiohead", "The Strokes"],
  "bedroom pop": ["Clairo", "beabadoobee", "Boy Pablo", "Cuco", "Still Woozy", "Gus Dapperton", "mxmtoon", "Vacations", "Current Joys"],
  "alternative": ["Tyler the Creator", "Childish Gambino", "Gorillaz", "Tame Impala", "Glass Animals", "Dominic Fike", "Steve Lacy", "Jean Dawson", "Baby Keem"],
  "soul": ["Anderson .Paak", "Leon Bridges", "Silk Sonic", "Ari Lennox", "Lucky Daye", "Jazmine Sullivan", "Musiq Soulchild", "D'Angelo", "John Legend"],
  "lo-fi": ["Joji", "Clairo", "beabadoobee", "Rex Orange County", "Boy Pablo", "Cuco", "Still Woozy", "Mac DeMarco"],
  "reggaeton": ["Bad Bunny", "J Balvin", "Ozuna", "Daddy Yankee", "Rauw Alejandro", "Feid", "Karol G", "Anuel AA", "Mora"],
  "latin": ["Bad Bunny", "J Balvin", "Rosalía", "Rauw Alejandro", "Feid", "Karol G", "Peso Pluma", "Shakira", "Maluma"],
  "electronic": ["Disclosure", "Flume", "ODESZA", "Rufus Du Sol", "Kaytranada", "Jamie xx", "Fred again..", "Four Tet", "Bonobo"],
  "house": ["Disclosure", "Kaytranada", "Fred again..", "Fisher", "Dom Dolla", "Chris Lake", "John Summit", "Peggy Gou"],
  "edm": ["Illenium", "Porter Robinson", "Madeon", "ODESZA", "Flume", "Rufus Du Sol", "Zedd", "Martin Garrix"],
  "jazz": ["Robert Glasper", "Kamasi Washington", "Thundercat", "Norah Jones", "Tom Misch", "Chet Baker", "Masego", "BadBadNotGood"],
  "rock": ["Arctic Monkeys", "The Strokes", "Tame Impala", "Radiohead", "Cage the Elephant", "The Black Keys", "Queens of the Stone Age"],
  "punk rock": ["Green Day", "Blink-182", "My Chemical Romance", "Paramore", "Fall Out Boy", "Sum 41", "The Offspring"],
  "metal": ["Metallica", "Slipknot", "Bring Me the Horizon", "Deftones", "Gojira", "Tool", "System of a Down"],
  "country": ["Morgan Wallen", "Luke Combs", "Zach Bryan", "Tyler Childers", "Chris Stapleton", "Kacey Musgraves", "Bailey Zimmerman"],
  "folk": ["Bon Iver", "Fleet Foxes", "Iron & Wine", "Phoebe Bridgers", "Hozier", "The Lumineers", "Mumford & Sons"],
  "dancehall": ["Sean Paul", "Shenseea", "Vybz Kartel", "Popcaan", "Alkaline", "Skillibeng", "Byron Messia"],
  "amapiano": ["Uncle Waffles", "Kabza De Small", "DJ Maphorisa", "DBN Gogo", "Tyler ICU", "Focalistic", "Major League DJz"],
};

// Theme keywords → vibe descriptors and search modifiers
interface ThemeData {
  keywords: string[];
  searchModifiers: string[];   // Words to append/prepend to search queries
  vibeDescriptors: string[];   // Mood words for playlist search
  defaultArtists: string[];    // Universal artists for this theme
}

const THEMES: ThemeData[] = [
  {
    keywords: ["night", "late night", "midnight", "after dark", "nocturnal", "3am", "2am"],
    searchModifiers: ["late night", "midnight", "nocturnal", "after hours", "dark"],
    vibeDescriptors: ["late night vibes", "midnight music", "after dark playlist", "3am songs"],
    defaultArtists: ["Frank Ocean", "The Weeknd", "Daniel Caesar", "6LACK", "Don Toliver", "SZA", "Brent Faiyaz", "Partynextdoor"],
  },
  {
    keywords: ["drive", "driving", "road trip", "cruise", "highway", "ride", "windows down"],
    searchModifiers: ["driving", "road trip", "cruising", "car music"],
    vibeDescriptors: ["night drive playlist", "driving music", "road trip vibes", "cruise songs"],
    defaultArtists: ["Tame Impala", "Frank Ocean", "Arctic Monkeys", "Tyler the Creator", "Mac DeMarco", "The Weeknd", "Travis Scott", "Glass Animals"],
  },
  {
    keywords: ["workout", "gym", "hype", "pump", "beast mode", "gains", "run", "lift"],
    searchModifiers: ["hype", "workout", "gym motivation", "high energy"],
    vibeDescriptors: ["workout playlist", "gym hype", "pump up music", "running songs"],
    defaultArtists: ["Travis Scott", "Megan Thee Stallion", "Denzel Curry", "Pop Smoke", "Lil Uzi Vert", "21 Savage", "Future", "Playboi Carti"],
  },
  {
    keywords: ["chill", "relax", "calm", "peaceful", "zen", "unwind", "mellow"],
    searchModifiers: ["chill", "relaxing", "mellow", "calm", "peaceful"],
    vibeDescriptors: ["chill vibes", "relaxing music", "mellow playlist", "calm songs"],
    defaultArtists: ["Mac DeMarco", "Clairo", "Frank Ocean", "Khruangbin", "Tom Misch", "Joji", "Rex Orange County", "Boy Pablo"],
  },
  {
    keywords: ["party", "turn up", "pregame", "lit", "club", "dance", "function"],
    searchModifiers: ["party", "club", "dance", "turn up", "pregame"],
    vibeDescriptors: ["party playlist", "club bangers", "turn up music", "pregame songs"],
    defaultArtists: ["Drake", "Bad Bunny", "Doja Cat", "Travis Scott", "Future", "Megan Thee Stallion", "Dua Lipa", "Lil Uzi Vert"],
  },
  {
    keywords: ["sad", "heartbreak", "cry", "emotional", "pain", "feels", "breakup", "lonely", "miss"],
    searchModifiers: ["sad", "emotional", "heartbreak", "melancholy"],
    vibeDescriptors: ["sad songs", "heartbreak playlist", "in my feels", "emotional music"],
    defaultArtists: ["Frank Ocean", "SZA", "Billie Eilish", "Phoebe Bridgers", "Daniel Caesar", "Bon Iver", "Giveon", "Adele"],
  },
  {
    keywords: ["study", "focus", "concentrate", "work", "productive", "homework"],
    searchModifiers: ["study", "focus", "concentration", "ambient"],
    vibeDescriptors: ["study playlist", "focus music", "concentration", "study beats"],
    defaultArtists: ["Tom Misch", "Khruangbin", "Bonobo", "Four Tet", "Tycho", "Nujabes", "Toro y Moi"],
  },
  {
    keywords: ["love", "romantic", "date", "slow jam", "slow dance", "boo"],
    searchModifiers: ["romantic", "love songs", "slow jam", "sensual"],
    vibeDescriptors: ["love songs", "romantic playlist", "date night", "slow jams"],
    defaultArtists: ["Daniel Caesar", "SZA", "Frank Ocean", "Giveon", "H.E.R.", "Lucky Daye", "Ari Lennox", "Brent Faiyaz"],
  },
  {
    keywords: ["summer", "sunshine", "beach", "vacation", "tropical"],
    searchModifiers: ["summer", "sunny", "tropical", "beach"],
    vibeDescriptors: ["summer playlist", "beach vibes", "tropical music", "summer hits"],
    defaultArtists: ["Bad Bunny", "Doja Cat", "Rema", "Burna Boy", "Tyla", "Tyler the Creator", "Harry Styles", "Karol G"],
  },
  {
    keywords: ["vibe", "vibes", "good vibes", "feel good", "happy", "positive"],
    searchModifiers: ["vibes", "feel good", "good energy", "positive"],
    vibeDescriptors: ["good vibes playlist", "feel good music", "positive energy", "happy songs"],
    defaultArtists: ["Anderson .Paak", "Tyler the Creator", "Doja Cat", "Silk Sonic", "Glass Animals", "Steve Lacy", "Childish Gambino", "Kaytranada"],
  },
  {
    keywords: ["throwback", "nostalgia", "old school", "retro", "classic", "90s", "2000s", "80s"],
    searchModifiers: ["throwback", "classic", "retro", "old school"],
    vibeDescriptors: ["throwback playlist", "nostalgia hits", "old school", "classic hits"],
    defaultArtists: ["Lauryn Hill", "Outkast", "Aaliyah", "Usher", "Erykah Badu", "D'Angelo", "A Tribe Called Quest", "Kanye West"],
  },
  {
    keywords: ["smoke", "420", "high", "stoned", "blazed"],
    searchModifiers: ["smoke session", "420", "stoner", "high vibes"],
    vibeDescriptors: ["smoke playlist", "420 vibes", "stoner music"],
    defaultArtists: ["Kid Cudi", "Travis Scott", "Wiz Khalifa", "Mac Miller", "Isaiah Rashad", "Don Toliver", "A$AP Rocky", "Tame Impala"],
  },
  {
    keywords: ["rage", "angry", "aggressive", "hard", "heavy", "intense"],
    searchModifiers: ["rage", "aggressive", "hard hitting", "intense"],
    vibeDescriptors: ["rage playlist", "aggressive music", "hard rap", "intense beats"],
    defaultArtists: ["Playboi Carti", "Denzel Curry", "Travis Scott", "XXXTentacion", "Scarlxrd", "City Morgue", "Ken Carson"],
  },
  {
    keywords: ["underground", "experimental", "weird", "different", "unique"],
    searchModifiers: ["underground", "experimental", "alternative"],
    vibeDescriptors: ["underground playlist", "experimental music", "alternative finds"],
    defaultArtists: ["JPEGMAFIA", "Danny Brown", "Injury Reserve", "Arca", "100 gecs", "FKA Twigs", "Earl Sweatshirt", "Billy Woods"],
  },
  {
    keywords: ["uk", "british", "london", "grime", "uk rap", "uk drill", "class"],
    searchModifiers: ["uk rap", "uk drill", "grime", "british rap", "london"],
    vibeDescriptors: ["uk rap playlist", "grime essentials", "uk drill", "british hip hop", "london rap"],
    defaultArtists: ["Dave", "Central Cee", "Skepta", "Stormzy", "J Hus", "Headie One", "Little Simz", "Knucks", "Tion Wayne", "AJ Tracey", "Aitch", "Slowthai"],
  },
  {
    keywords: ["confidence", "boss", "slay", "main character", "that girl", "iconic", "bad"],
    searchModifiers: ["confident", "boss", "empowering", "baddie"],
    vibeDescriptors: ["confidence playlist", "boss music", "main character energy"],
    defaultArtists: ["Beyoncé", "Doja Cat", "Megan Thee Stallion", "Nicki Minaj", "Rihanna", "SZA", "Cardi B", "GloRilla"],
  },
];

// Direct genre keywords that might appear in playlist names
const GENRE_KEYWORDS: Record<string, string[]> = {
  "afrobeats": ["afrobeats", "afro", "naija", "afropop", "afro pop"],
  "sudanese": ["sudan", "sudanese", "sudan music", "sudanese music", "اغاني سودانية", "سوداني"],
  "sudanese pop": ["sudanese pop", "sudanese songs", "اغاني سودانية", "sudan playlist"],
  "nubian": ["nubian", "nuba", "nubian music"],
  "r&b": ["r&b", "rnb", "rhythm and blues"],
  "hip hop": ["hip hop", "hiphop", "rap"],
  "trap": ["trap"],
  "drill": ["drill"],
  "pop": ["pop"],
  "indie": ["indie"],
  "rock": ["rock"],
  "jazz": ["jazz"],
  "soul": ["soul", "neo soul", "neo-soul"],
  "electronic": ["electronic", "edm", "house", "techno"],
  "reggaeton": ["reggaeton", "latin", "perreo"],
  "country": ["country"],
  "folk": ["folk", "acoustic"],
  "metal": ["metal", "heavy metal"],
  "amapiano": ["amapiano", "piano"],
  "dancehall": ["dancehall"],
  "uk rap": ["uk rap", "uk", "british rap", "london rap"],
  "uk drill": ["uk drill"],
  "grime": ["grime"],
};

function getStaticSeeds(playlistName: string, userGenres: string[]): PlaylistSeeds {
  const lower = playlistName.toLowerCase();
  const seedArtists: string[] = [];
  const searchQueries: string[] = [];
  const playlistSearches: string[] = [];
  const genres: string[] = [];

  // 1. Match themes from playlist name
  const matchedThemes: ThemeData[] = [];
  for (const theme of THEMES) {
    for (const kw of theme.keywords) {
      if (lower.includes(kw)) {
        matchedThemes.push(theme);
        break;
      }
    }
  }

  // 2. Detect genres mentioned in the playlist name
  const detectedGenres: string[] = [];
  for (const [genre, keywords] of Object.entries(GENRE_KEYWORDS)) {
    for (const kw of keywords) {
      if (lower.includes(kw)) {
        detectedGenres.push(genre);
        break;
      }
    }
  }

  // 3. Combine user's listening genres + detected genres
  const relevantGenres = [...new Set([...detectedGenres, ...userGenres.slice(0, 5)])];

  // 4. Get artists from matched themes
  for (const theme of matchedThemes) {
    seedArtists.push(...theme.defaultArtists);
    playlistSearches.push(...theme.vibeDescriptors);

    // Generate search queries: theme modifier + genre
    for (const mod of theme.searchModifiers.slice(0, 3)) {
      searchQueries.push(mod);
      for (const g of relevantGenres.slice(0, 3)) {
        searchQueries.push(`${mod} ${g}`);
      }
    }
  }

  // 5. Get artists from relevant genres
  for (const genre of relevantGenres) {
    genres.push(genre);
    const artists = GENRE_ARTISTS[genre];
    if (artists) {
      seedArtists.push(...artists);
    }
  }

  // 6. If no themes matched, use playlist name directly + genre artists
  if (matchedThemes.length === 0 && detectedGenres.length === 0) {
    // The playlist name itself might be a good search term
    playlistSearches.push(playlistName);
    playlistSearches.push(`${playlistName} playlist`);
    playlistSearches.push(`${playlistName} music`);
    searchQueries.push(playlistName);

    // Use whatever user genres we have
    for (const g of userGenres.slice(0, 5)) {
      searchQueries.push(`${playlistName} ${g}`);
      const artists = GENRE_ARTISTS[g];
      if (artists) seedArtists.push(...artists.slice(0, 5));
    }

    // If we STILL have nothing, add popular diverse artists
    if (seedArtists.length === 0) {
      seedArtists.push(
        "Drake", "The Weeknd", "Tyler the Creator", "SZA", "Kendrick Lamar",
        "Bad Bunny", "Doja Cat", "Billie Eilish", "Frank Ocean", "Travis Scott"
      );
    }
  }

  // 7. If playlist name is directly a genre (e.g., "Afrobeats"), make it the primary focus
  if (detectedGenres.length > 0 && matchedThemes.length === 0) {
    for (const g of detectedGenres) {
      playlistSearches.push(`best ${g}`, `${g} playlist`, `${g} hits`, `new ${g}`);
      searchQueries.push(`${g} 2025`, `${g} new`, `best ${g}`, `${g} hits`);
    }
  }

  if (detectedGenres.some((g) => g.includes("sudanese") || g === "nubian")) {
    playlistSearches.unshift(
      "Sudanese music",
      "Sudanese songs",
      "اغاني سودانية",
      "Sudan playlist",
      "Sudanese classics"
    );
    searchQueries.unshift(
      "Sudanese music",
      "Sudanese songs",
      "اغاني سودانية",
      "Mohammed Wardi",
      "Sudanese pop"
    );
  }

  // 8. Add the playlist name itself as a search
  if (playlistName.length > 2) {
    playlistSearches.unshift(playlistName);
    searchQueries.unshift(playlistName);
  }

  // Deduplicate
  const uniqueArtists = [...new Set(seedArtists)];
  const uniqueQueries = [...new Set(searchQueries)];
  const uniquePlaylistSearches = [...new Set(playlistSearches)];
  const uniqueGenres = [...new Set(genres)];

  // Shuffle artists for variety each session
  for (let i = uniqueArtists.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [uniqueArtists[i], uniqueArtists[j]] = [uniqueArtists[j], uniqueArtists[i]];
  }

  console.log(`Static seeds: ${uniqueArtists.length} artists, ${uniqueQueries.length} queries, ${uniquePlaylistSearches.length} playlist searches`);

  return {
    seedArtists: uniqueArtists,
    searchQueries: uniqueQueries,
    playlistSearches: uniquePlaylistSearches,
    genres: uniqueGenres,
  };
}
