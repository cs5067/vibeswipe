"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { AppTrack } from "@/types/track";
import type { SharedTrack } from "@/types/share";
import { resolvePreview } from "@/lib/audio/resolve-preview";

interface Friend {
  id: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}

interface SendSheetProps {
  track: AppTrack | null;
  senderName: string | null;
  onClose: () => void;
}

interface ArenaVibe {
  slug: string;
  name: string;
}

const friendLabel = (f: Friend) => f.displayName || f.username || "Friend";

export function SendSheet({ track, senderName, onClose }: SendSheetProps) {
  const [note, setNote] = useState("");
  const [friends, setFriends] = useState<Friend[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<"idle" | "working" | "sent" | "linkReady" | "error">("idle");
  const [url, setUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [vibes, setVibes] = useState<ArenaVibe[] | null>(null);
  const [showVibes, setShowVibes] = useState(false);
  const [vibesError, setVibesError] = useState(false);
  const [droppingSlug, setDroppingSlug] = useState<string | null>(null);
  const [dropped, setDropped] = useState<{ vibeName: string; already: boolean } | null>(null);
  const [dropError, setDropError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/friends")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setFriends(d.friends || []))
      .catch(() => {});
  }, []);

  if (!track) return null;

  // Resolve a working preview BEFORE sending so the recipient's copy
  // always plays, even though Spotify rarely ships preview_url anymore.
  const sharedTrack = async (): Promise<SharedTrack> => ({
    name: track.name,
    artistNames: track.artistNames,
    albumImage: track.albumImageLarge || track.albumImageUrl,
    previewUrl: await resolvePreview(track.name, track.artistNames, track.previewUrl),
    spotifyUrl: track.spotifyUrl,
  });

  const toggleFriend = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  // Recommend in-app to selected friends.
  const sendToFriends = async () => {
    if (picked.size === 0) return;
    setStatus("working");
    try {
      const t = await sharedTrack();
      await Promise.all(
        [...picked].map((toId) =>
          fetch("/api/recommend", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ toId, track: t, note: note.trim() }),
          })
        )
      );
      setStatus("sent");
    } catch {
      setStatus("error");
    }
  };

  // External share link (invite / non-users).
  const createLink = async () => {
    setStatus("working");
    try {
      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ track: await sharedTrack(), senderName, note: note.trim() }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setUrl(data.url);
      setStatus("linkReady");
      if (typeof navigator !== "undefined" && navigator.share) {
        navigator
          .share({
            title: `You HAVE to hear "${track.name}"`,
            text: note.trim() || `${track.name} — ${track.artistNames.join(", ")}`,
            url: data.url,
          })
          .catch(() => {});
      }
    } catch {
      setStatus("error");
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  // Public Arena drop: lazy-load the vibe list the first time the picker opens.
  const toggleVibes = () => {
    const opening = !showVibes;
    setShowVibes(opening);
    if (!opening || vibes !== null) return;
    setVibesError(false);
    fetch("/api/arena/vibes")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) setVibes((d.vibes || []) as ArenaVibe[]);
        else setVibesError(true);
      })
      .catch(() => setVibesError(true));
  };

  const dropIntoVibe = async (vibe: ArenaVibe) => {
    if (droppingSlug) return;
    setDropError(null);
    setDroppingSlug(vibe.slug);
    try {
      const res = await fetch("/api/arena/drop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vibeSlug: vibe.slug,
          track: {
            id: track.id,
            name: track.name,
            artistNames: track.artistNames,
            albumImage: track.albumImageLarge || track.albumImageUrl,
            previewUrl: track.previewUrl,
            spotifyUrl: track.spotifyUrl,
          },
          note: note.trim() || undefined,
        }),
      });
      if (res.status === 401) {
        setDropError("You need to be logged in to drop into a vibe.");
        return;
      }
      if (!res.ok) throw new Error();
      const data = await res.json();
      setDropped({ vibeName: vibe.name, already: !!data.already });
    } catch {
      setDropError("Couldn't drop it. Try again.");
    } finally {
      setDroppingSlug(null);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

        <motion.div
          className="relative w-full sm:max-w-sm glass-strong rounded-t-3xl sm:rounded-3xl p-6"
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 28 }}
        >
          {/* track header */}
          <div className="flex items-center gap-3 mb-4">
            {(track.albumImageUrl || track.albumImageLarge) && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={track.albumImageLarge || track.albumImageUrl}
                alt=""
                className="w-12 h-12 rounded-lg object-cover"
              />
            )}
            <div className="min-w-0">
              <p className="text-white font-semibold truncate">{track.name}</p>
              <p className="text-white/50 text-sm truncate">{track.artistNames.join(", ")}</p>
            </div>
          </div>

          {dropped ? (
            <>
              <p className="text-white/90 font-bold text-lg mb-3">
                {dropped.already
                  ? "already in that vibe 🎧"
                  : `dropped into ${dropped.vibeName} 🔥`}
              </p>
              <p className="text-white/50 text-sm mb-4">
                {dropped.already
                  ? "Someone beat you to it — go vote it up in the arena instead."
                  : "It's live in the arena. Watch strangers judge it."}
              </p>
              <button
                onClick={onClose}
                className="w-full py-3 rounded-full bg-white/10 text-white text-sm font-medium hover:bg-white/20"
              >
                Done
              </button>
            </>
          ) : status === "sent" ? (
            <>
              <p className="text-green-400 font-bold text-lg mb-3">Sent 😈</p>
              <p className="text-white/50 text-sm mb-4">
                They&apos;ll see it in their inbox — you&apos;ll know when they listen.
              </p>
              <button
                onClick={onClose}
                className="w-full py-3 rounded-full bg-white/10 text-white text-sm font-medium hover:bg-white/20"
              >
                Done
              </button>
            </>
          ) : status === "linkReady" ? (
            <>
              <p className="text-white/80 font-bold text-lg mb-3">Link ready 🔗</p>
              <div className="flex items-center gap-2 rounded-xl bg-white/5 border border-white/10 px-3 py-2.5">
                <span className="text-white/70 text-xs truncate flex-1">{url}</span>
                <button onClick={copy} className="text-xs font-bold text-indigo-300 shrink-0">
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
              <button
                onClick={onClose}
                className="w-full mt-4 py-3 rounded-full bg-white/10 text-white text-sm font-medium hover:bg-white/20"
              >
                Done
              </button>
            </>
          ) : (
            <>
              <p className="text-white/80 font-bold text-lg mb-1">Make them listen 😈</p>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 140))}
                placeholder="trust me on this one..."
                rows={2}
                className="w-full mt-2 rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/30 resize-none"
              />

              {/* friend picker */}
              {friends.length > 0 && (
                <div className="mt-3">
                  <p className="text-white/40 text-xs mb-2">Send to a friend</p>
                  <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto">
                    {friends.map((f) => (
                      <button
                        key={f.id}
                        onClick={() => toggleFriend(f.id)}
                        className={`flex items-center gap-2 rounded-xl px-3 py-2 text-left transition-colors ${
                          picked.has(f.id) ? "bg-indigo-500/30 ring-1 ring-indigo-400/50" : "bg-white/5"
                        }`}
                      >
                        {f.avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={f.avatarUrl} alt="" className="w-7 h-7 rounded-full object-cover" />
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-white/10" />
                        )}
                        <span className="text-white text-sm flex-1 truncate">{friendLabel(f)}</span>
                        {picked.has(f.id) && <span className="text-indigo-300 text-xs">✓</span>}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={sendToFriends}
                    disabled={picked.size === 0 || status === "working"}
                    className="w-full mt-3 py-3 rounded-full bg-gradient-to-r from-indigo-500 to-pink-500 text-white text-sm font-bold disabled:opacity-40"
                  >
                    {status === "working"
                      ? "Sending..."
                      : `Recommend to ${picked.size || ""} friend${picked.size === 1 ? "" : "s"}`}
                  </button>
                </div>
              )}

              {/* external link fallback / invite */}
              <button
                onClick={createLink}
                disabled={status === "working"}
                className="w-full mt-2 py-2.5 rounded-full bg-white/5 text-white/70 text-xs font-medium hover:bg-white/10"
              >
                {friends.length > 0 ? "or get a share link (for non-users)" : "Get a share link"}
              </button>

              {/* drop into a public Arena vibe */}
              <button
                onClick={toggleVibes}
                disabled={status === "working" || droppingSlug !== null}
                className="w-full mt-2 py-2.5 rounded-full bg-white/5 text-white/70 text-xs font-medium hover:bg-white/10"
              >
                or drop it into a public vibe
              </button>

              {showVibes && (
                <div className="mt-2">
                  {vibesError ? (
                    <p className="text-white/30 text-xs text-center py-1">
                      Couldn&apos;t load the vibes. Try again later.
                    </p>
                  ) : vibes === null ? (
                    <p className="text-white/30 text-xs text-center py-1">loading vibes...</p>
                  ) : vibes.length === 0 ? (
                    <p className="text-white/30 text-xs text-center py-1">No vibes open yet.</p>
                  ) : (
                    <div className="flex flex-wrap justify-center gap-1.5">
                      {vibes.map((v) => (
                        <button
                          key={v.slug}
                          onClick={() => void dropIntoVibe(v)}
                          disabled={droppingSlug !== null}
                          className={`px-3 py-1.5 rounded-full text-xs transition-colors ${
                            droppingSlug === v.slug
                              ? "bg-indigo-500/30 text-white ring-1 ring-indigo-400/50"
                              : "bg-white/5 text-white/70 hover:bg-white/10 disabled:opacity-40"
                          }`}
                        >
                          {v.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {dropError && (
                <p className="text-red-400 text-xs mt-2 text-center">{dropError}</p>
              )}

              {status === "error" && (
                <p className="text-red-400 text-xs mt-2 text-center">Something went wrong. Try again.</p>
              )}
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
