"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { ArenaDrop, ArenaTrack } from "../types";

// Raw Spotify search result item — we only read what we map into ArenaTrack.
interface SpotifyTrackResult {
  id: string;
  name: string;
  preview_url: string | null;
  artists: { name: string }[];
  album?: { images?: { url: string }[] };
  external_urls?: { spotify?: string };
}

interface DropComposerProps {
  vibeSlug: string;
  onDropped: (drop: ArenaDrop) => void;
}

export function DropComposer({ vibeSlug, onDropped }: DropComposerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SpotifyTrackResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [picked, setPicked] = useState<ArenaTrack | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [already, setAlready] = useState(false);
  const [failed, setFailed] = useState(false);
  const requestSeq = useRef(0);

  // Debounced Spotify search — 300ms, ignore out-of-order responses.
  useEffect(() => {
    if (!open || picked || needsLogin) return;
    const q = query.trim();
    if (q.length < 2) {
      setResults(null);
      setSearching(false);
      return;
    }
    const seq = ++requestSeq.current;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const params = new URLSearchParams({ q, type: "track", limit: "5" });
        const res = await fetch(`/api/spotify/search?${params}`);
        if (seq !== requestSeq.current) return;
        if (res.status === 401) {
          setNeedsLogin(true);
          return;
        }
        const data = res.ok ? await res.json() : null;
        if (seq !== requestSeq.current) return;
        setResults(data?.tracks?.items || []);
      } catch {
        if (seq === requestSeq.current) setResults([]);
      } finally {
        if (seq === requestSeq.current) setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query, open, picked, needsLogin]);

  const reset = () => {
    setOpen(false);
    setQuery("");
    setResults(null);
    setSearching(false);
    setPicked(null);
    setNote("");
    setAlready(false);
    setFailed(false);
  };

  const pick = (t: SpotifyTrackResult) => {
    setPicked({
      id: t.id,
      name: t.name,
      artistNames: t.artists.map((a) => a.name),
      albumImage: t.album?.images?.[1]?.url || t.album?.images?.[0]?.url || "",
      previewUrl: t.preview_url || null,
      spotifyUrl: t.external_urls?.spotify || "",
    });
    setAlready(false);
    setFailed(false);
  };

  const submit = async () => {
    if (!picked || submitting) return;
    setSubmitting(true);
    setAlready(false);
    setFailed(false);
    const trimmedNote = note.trim().slice(0, 140);
    try {
      const res = await fetch("/api/arena/drop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vibeSlug,
          track: picked,
          note: trimmedNote || undefined,
        }),
      });
      if (res.status === 401) {
        setNeedsLogin(true);
        return;
      }
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setFailed(true);
        return;
      }
      if (data.already) {
        setAlready(true);
        return;
      }
      onDropped({
        id: `temp-${Date.now()}`,
        track: picked,
        note: trimmedNote || null,
        dropper: "you",
        score: 0,
        fires: 0,
        nahs: 0,
        myVote: null,
        createdAt: new Date().toISOString(),
      });
      reset();
    } catch {
      setFailed(true);
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full glass-strong rounded-2xl py-3.5 text-sm font-semibold text-white hover:bg-white/15 transition-colors"
      >
        🎧 drop a song into this vibe
      </button>
    );
  }

  if (needsLogin) {
    return (
      <div className="glass rounded-2xl p-5 text-center">
        <p className="text-white/70 text-sm mb-3">
          connect Spotify on the home page to drop songs
        </p>
        <Link
          href="/"
          className="inline-block px-5 py-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white text-sm no-underline"
        >
          take me there
        </Link>
        <button
          onClick={reset}
          className="block mx-auto mt-3 text-xs text-white/30 hover:text-white/60 transition-colors"
        >
          never mind
        </button>
      </div>
    );
  }

  return (
    <div className="glass rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-white/60 text-xs font-semibold">drop a song into this vibe</p>
        <button
          onClick={reset}
          className="text-xs text-white/40 hover:text-white/70 transition-colors"
        >
          close
        </button>
      </div>

      {!picked ? (
        <>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="search a song…"
            aria-label="Search a song"
            className="w-full bg-white/5 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/30 outline-none focus:bg-white/10 transition-colors"
          />
          {searching && (
            <p className="mt-3 text-xs text-white/30 text-center">searching…</p>
          )}
          {!searching && results && results.length === 0 && (
            <p className="mt-3 text-xs text-white/30 text-center">
              nothing found — try another search
            </p>
          )}
          {!searching && results && results.length > 0 && (
            <div className="mt-3 flex flex-col gap-1">
              {results.map((t) => (
                <button
                  key={t.id}
                  onClick={() => pick(t)}
                  className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/10 transition-colors text-left"
                >
                  {t.album?.images?.[1]?.url || t.album?.images?.[0]?.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={t.album?.images?.[1]?.url || t.album?.images?.[0]?.url}
                      alt=""
                      className="w-10 h-10 rounded-lg object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-white/5 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="text-white text-sm font-medium truncate">{t.name}</p>
                    <p className="text-white/40 text-xs truncate">
                      {t.artists.map((a) => a.name).join(", ")}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="flex items-center gap-3 mb-3">
            {picked.albumImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={picked.albumImage}
                alt=""
                className="w-12 h-12 rounded-xl object-cover shrink-0"
              />
            ) : (
              <div className="w-12 h-12 rounded-xl bg-white/5 shrink-0" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-white text-sm font-semibold truncate">{picked.name}</p>
              <p className="text-white/40 text-xs truncate">
                {picked.artistNames.join(", ")}
              </p>
            </div>
            <button
              onClick={() => {
                setPicked(null);
                setAlready(false);
                setFailed(false);
              }}
              className="text-xs text-white/40 hover:text-white/70 transition-colors shrink-0"
            >
              change
            </button>
          </div>

          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={140}
            placeholder="add a note (optional)"
            aria-label="Note"
            className="w-full bg-white/5 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/30 outline-none focus:bg-white/10 transition-colors"
          />
          <p className="mt-1 text-right text-[10px] text-white/25">{note.length}/140</p>

          <button
            onClick={() => void submit()}
            disabled={submitting}
            className="w-full mt-2 py-3 rounded-full bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 text-white text-sm font-bold shadow-lg shadow-purple-500/25 disabled:opacity-50 transition-opacity"
          >
            {submitting ? "dropping…" : "drop it 🔥"}
          </button>

          {already && (
            <p className="mt-2 text-xs text-white/50 text-center">
              already in this vibe — go vote for it instead
            </p>
          )}
          {failed && (
            <p className="mt-2 text-xs text-pink-400/80 text-center">
              couldn’t drop that one — try again
            </p>
          )}
        </>
      )}
    </div>
  );
}
