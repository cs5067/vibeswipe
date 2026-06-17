"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { previewPlayer } from "@/lib/audio/preview-player";
import { resolvePreview } from "@/lib/audio/resolve-preview";
import type { SharedTrack } from "@/types/share";

interface Person {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

interface RecItem {
  id: string;
  track: SharedTrack;
  note: string | null;
  status: "unseen" | "seen" | "listened";
  created_at: string;
  listened_at?: string | null;
  from?: Person | null;
  to?: Person | null;
}

const personName = (p?: Person | null) => p?.display_name || p?.username || "A friend";

function statusChip(item: RecItem) {
  if (item.status === "listened")
    return <span className="text-green-400 text-xs font-semibold">🎧 Listened</span>;
  if (item.status === "seen")
    return <span className="text-yellow-300/80 text-xs font-semibold">👀 Seen</span>;
  return <span className="text-white/30 text-xs font-semibold">Sent</span>;
}

export default function InboxPage() {
  const [tab, setTab] = useState<"inbox" | "sent">("inbox");
  const [items, setItems] = useState<RecItem[]>([]);
  const [sentItems, setSentItems] = useState<RecItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [noPreview, setNoPreview] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/inbox");
      if (res.status === 401) {
        window.location.href = "/";
        return;
      }
      const data = await res.json();
      const list: RecItem[] = data.items || [];
      setItems(list);
      for (const r of list.filter((r) => r.status === "unseen")) {
        fetch("/api/inbox", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: r.id, status: "seen" }),
        });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // lazy-load the Sent tab the first time it's opened
  useEffect(() => {
    if (tab !== "sent" || sentItems !== null) return;
    let alive = true;
    fetch("/api/sent")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive && d) setSentItems(d.items || []);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [tab, sentItems]);

  useEffect(() => {
    if (!previewPlayer) return;
    const p = previewPlayer;
    const unsub = p.subscribe(() => {
      if (!p.isPlaying) setPlayingId(null);
    });
    return () => {
      unsub();
      p.stop();
    };
  }, []);

  const play = async (item: RecItem) => {
    if (playingId === item.id) {
      previewPlayer?.pause();
      setPlayingId(null);
      return;
    }
    // Spotify rarely ships preview_url anymore — fall back to Deezer.
    const url = await resolvePreview(
      item.track.name,
      item.track.artistNames,
      item.track.previewUrl
    );
    // first play counts as "listened" — this is what the sender sees
    if (item.status !== "listened") {
      fetch("/api/inbox", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, status: "listened" }),
      });
      setItems((prev) =>
        prev.map((r) => (r.id === item.id ? { ...r, status: "listened" } : r))
      );
    }
    if (url) {
      previewPlayer?.play(url);
      setPlayingId(item.id);
    } else {
      setNoPreview((s) => new Set(s).add(item.id));
      if (item.track.spotifyUrl) window.open(item.track.spotifyUrl, "_blank");
    }
  };

  const list = tab === "inbox" ? items : sentItems ?? [];
  const sentLoading = tab === "sent" && sentItems === null;

  return (
    <main className="relative min-h-screen flex flex-col px-5 py-6 bg-[#0a0a0f]">
      <header className="flex items-center justify-between mb-5">
        <Link href="/swipe" className="text-sm text-white/40 hover:text-white/70">
          ← Swipe
        </Link>
        <h1 className="text-lg font-bold text-gradient">Recommendations</h1>
        <Link href="/friends" className="text-sm text-white/40 hover:text-white/70">
          Friends
        </Link>
      </header>

      {/* Tabs */}
      <div className="flex gap-2 mb-5">
        <button
          onClick={() => setTab("inbox")}
          className={`flex-1 py-2 rounded-full text-sm font-semibold transition-colors ${
            tab === "inbox" ? "bg-white/15 text-white" : "bg-white/5 text-white/40"
          }`}
        >
          For you
        </button>
        <button
          onClick={() => setTab("sent")}
          className={`flex-1 py-2 rounded-full text-sm font-semibold transition-colors ${
            tab === "sent" ? "bg-white/15 text-white" : "bg-white/5 text-white/40"
          }`}
        >
          Sent by you
        </button>
      </div>

      {loading || sentLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-10 h-10 rounded-full border-2 border-white/10 border-t-indigo-500 animate-spin" />
        </div>
      ) : list.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
          {tab === "inbox" ? (
            <>
              <p className="text-white/60 mb-2">No recommendations yet</p>
              <p className="text-white/30 text-sm mb-6">
                When a friend forces a song on you, it shows up here.
              </p>
              <Link
                href="/friends"
                className="px-6 py-3 rounded-full bg-white/10 hover:bg-white/20 text-white text-sm"
              >
                Add friends
              </Link>
            </>
          ) : (
            <>
              <p className="text-white/60 mb-2">Nothing sent yet</p>
              <p className="text-white/30 text-sm">
                Swipe, hit “Make a friend listen”, and watch this fill up.
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {list.map((item) => (
            <div
              key={item.id}
              className={`glass rounded-2xl p-4 flex gap-4 items-center ${
                tab === "inbox" && item.status === "unseen"
                  ? "ring-1 ring-indigo-400/40"
                  : ""
              }`}
            >
              {item.track.albumImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.track.albumImage}
                  alt=""
                  className="w-16 h-16 rounded-xl object-cover shrink-0"
                />
              ) : (
                <div className="w-16 h-16 rounded-xl bg-white/5 shrink-0" />
              )}

              <div className="min-w-0 flex-1">
                {tab === "inbox" ? (
                  <p className="text-indigo-300 text-xs font-semibold">
                    {personName(item.from)} recommends
                  </p>
                ) : (
                  <p className="text-pink-300 text-xs font-semibold flex items-center gap-2">
                    to {personName(item.to)} · {statusChip(item)}
                  </p>
                )}
                <p className="text-white font-semibold truncate">{item.track.name}</p>
                <p className="text-white/50 text-sm truncate">
                  {item.track.artistNames.join(", ")}
                </p>
                {item.note?.trim() && (
                  <p className="text-white/70 text-xs italic mt-1 truncate">
                    “{item.note.trim()}”
                  </p>
                )}
              </div>

              {noPreview.has(item.id) ? (
                <a
                  href={item.track.spotifyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#1DB954] text-xs font-medium shrink-0"
                >
                  Spotify
                </a>
              ) : (
                <button
                  onClick={() => void play(item)}
                  className="w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center shrink-0"
                  aria-label="Play"
                >
                  {playingId === item.id ? (
                    <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  )}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
