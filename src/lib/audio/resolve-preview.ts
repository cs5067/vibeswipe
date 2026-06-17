// Client-side preview resolution with an in-memory cache.
// Order: track's own previewUrl (rare since Spotify removed them) → Deezer
// via our /api/preview proxy → null (caller falls back to "open in Spotify").

const cache = new Map<string, string | null>();

export async function resolvePreview(
  title: string,
  artistNames: string[],
  existing: string | null | undefined
): Promise<string | null> {
  if (existing) return existing;

  const artist = artistNames[0] || "";
  const key = `${title}::${artist}`.toLowerCase();
  if (cache.has(key)) return cache.get(key) ?? null;

  try {
    const params = new URLSearchParams({ title, artist });
    const res = await fetch(`/api/preview?${params}`);
    if (!res.ok) {
      cache.set(key, null);
      return null;
    }
    const data = await res.json();
    const url: string | null = data.previewUrl || null;
    cache.set(key, url);
    return url;
  } catch {
    cache.set(key, null);
    return null;
  }
}
