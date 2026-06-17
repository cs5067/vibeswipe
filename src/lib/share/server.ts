import { getCorpusClient } from "@/lib/supabase/server";
import type { SharedSong, SharedTrack } from "@/types/share";

const CODE_ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function makeCode(length = 7): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return out;
}

/**
 * Create a share row and return its short code.
 * Retries a couple of times on the (vanishingly unlikely) code collision.
 */
export async function createShare(
  track: SharedTrack,
  senderName: string | null,
  note: string | null
): Promise<string> {
  const supabase = getCorpusClient();

  for (let attempt = 0; attempt < 3; attempt++) {
    const code = makeCode();
    const { error } = await supabase.from("shared_songs").insert({
      code,
      track,
      sender_name: senderName,
      note,
    });
    if (!error) return code;
    // 23505 = unique_violation → try a new code; otherwise bail
    if ((error as { code?: string }).code !== "23505") {
      throw new Error(error.message);
    }
  }
  throw new Error("Could not generate a unique share code");
}

/**
 * Fetch a share by code for the public landing page.
 * Pass countOpen: true only from the page render (generateMetadata also
 * fetches the share — counting both would double every view).
 */
export async function getShare(
  code: string,
  opts: { countOpen?: boolean } = {}
): Promise<SharedSong | null> {
  const supabase = getCorpusClient();
  const { data, error } = await supabase
    .from("shared_songs")
    .select("code, track, sender_name, note, created_at")
    .eq("code", code)
    .maybeSingle();

  if (error || !data) return null;

  // bump open count without blocking the render.
  // NOTE: supabase-js builders are lazy — they only execute once .then() is
  // attached, so a bare `void rpc(...)` would silently never fire.
  if (opts.countOpen) {
    void supabase
      .rpc("increment_share_opens", { share_code: code })
      .then(undefined, () => {});
  }

  return {
    code: data.code,
    track: data.track as SharedTrack,
    senderName: data.sender_name,
    note: data.note,
    createdAt: data.created_at,
  };
}
