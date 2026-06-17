import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase client for reading the playlist corpus.
 *
 * Uses the service_role key, which BYPASSES RLS. The corpus tables
 * (tracks / playlists / playlist_tracks) have RLS enabled with no public
 * policies, so they are unreachable from the browser — only this
 * server-side client can read them. NEVER import this into a client
 * component or expose the service_role key with a NEXT_PUBLIC_ prefix.
 */
let cached: SupabaseClient | null = null;

export function getCorpusClient(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  if (!serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");

  cached = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
