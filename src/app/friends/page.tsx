"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

interface Person {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
}
interface PendingReq {
  id: string;
  requester: Person;
}

const label = (p: Person) => p.display_name || p.username || "Someone";

export default function FriendsPage() {
  const [friends, setFriends] = useState<Person[]>([]);
  const [pending, setPending] = useState<PendingReq[]>([]);
  const [inviteUrl, setInviteUrl] = useState("");
  const [copied, setCopied] = useState(false);

  const [myUsername, setMyUsername] = useState<string | null>(null);
  const [usernameInput, setUsernameInput] = useState("");
  const [usernameError, setUsernameError] = useState("");

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Person[]>([]);
  const [sent, setSent] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    const res = await fetch("/api/friends");
    if (res.status === 401) {
      window.location.href = "/";
      return;
    }
    const data = await res.json();
    setFriends(data.friends || []);
    setPending(data.pending || []);
    setMyUsername(data.me?.username ?? null);
  }, []);

  const saveUsername = async () => {
    setUsernameError("");
    const res = await fetch("/api/profile/username", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: usernameInput }),
    });
    const data = await res.json();
    if (!res.ok) {
      setUsernameError(data.error || "Failed");
      return;
    }
    setMyUsername(data.username);
  };

  useEffect(() => {
    const run = async () => {
      await load();
      const res = await fetch("/api/friends/invite").catch(() => null);
      if (res?.ok) {
        const d = await res.json();
        setInviteUrl(d.url);
      }
    };
    void run();
  }, [load]);

  // debounced search
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      const clear = setTimeout(() => setResults([]), 0);
      return () => clearTimeout(clear);
    }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/friends/search?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const d = await res.json();
        setResults(d.results || []);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const sendRequest = async (toId: string) => {
    setSent((s) => new Set(s).add(toId));
    await fetch("/api/friends/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toId }),
    });
    load();
  };

  const respond = async (requestId: string, accept: boolean) => {
    await fetch("/api/friends/respond", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId, accept }),
    });
    load();
  };

  const copyInvite = async () => {
    if (navigator.share) {
      navigator.share({ title: "Add me on vibeswipe", url: inviteUrl }).catch(() => {});
      return;
    }
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <main className="relative min-h-screen flex flex-col px-5 py-6 bg-[#0a0a0f]">
      <header className="flex items-center justify-between mb-6">
        <Link href="/swipe" className="text-sm text-white/40 hover:text-white/70">
          ← Swipe
        </Link>
        <h1 className="text-lg font-bold text-gradient">Friends</h1>
        <Link href="/inbox" className="text-sm text-white/40 hover:text-white/70">
          Inbox
        </Link>
      </header>

      {/* Username setup (only until claimed) */}
      {myUsername === null && (
        <section className="glass rounded-2xl p-4 mb-5">
          <p className="text-white font-semibold mb-1">Pick a username</p>
          <p className="text-white/40 text-xs mb-3">
            So friends can find you. Letters, numbers, underscore.
          </p>
          <div className="flex gap-2">
            <input
              value={usernameInput}
              onChange={(e) => setUsernameInput(e.target.value)}
              placeholder="yourname"
              className="flex-1 rounded-full bg-white/5 border border-white/10 px-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/30"
            />
            <button
              onClick={saveUsername}
              className="px-5 py-2.5 rounded-full bg-indigo-500 text-white text-sm font-bold"
            >
              Save
            </button>
          </div>
          {usernameError && <p className="text-red-400 text-xs mt-2">{usernameError}</p>}
        </section>
      )}

      {/* Invite link */}
      <section className="glass rounded-2xl p-4 mb-5">
        <p className="text-white font-semibold mb-1">Invite a friend</p>
        <p className="text-white/40 text-xs mb-3">
          Send them this link — they join and you&apos;re connected.
        </p>
        <button
          onClick={copyInvite}
          disabled={!inviteUrl}
          className="w-full py-3 rounded-full bg-gradient-to-r from-indigo-500 to-pink-500 text-white text-sm font-bold disabled:opacity-50"
        >
          {copied ? "Copied!" : "Share invite link"}
        </button>
      </section>

      {/* Pending requests */}
      {pending.length > 0 && (
        <section className="mb-5">
          <p className="text-white/50 text-xs font-semibold mb-2 uppercase tracking-wide">
            Requests
          </p>
          <div className="flex flex-col gap-2">
            {pending.map((req) => (
              <div key={req.id} className="glass rounded-xl p-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm truncate">{label(req.requester)}</p>
                  {req.requester.username && (
                    <p className="text-white/40 text-xs">@{req.requester.username}</p>
                  )}
                </div>
                <button
                  onClick={() => respond(req.id, true)}
                  className="px-3 py-1.5 rounded-full bg-indigo-500 text-white text-xs font-bold"
                >
                  Accept
                </button>
                <button
                  onClick={() => respond(req.id, false)}
                  className="px-3 py-1.5 rounded-full bg-white/5 text-white/50 text-xs"
                >
                  Ignore
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Search */}
      <section className="mb-5">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by @username"
          className="w-full rounded-full bg-white/5 border border-white/10 px-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/30"
        />
        {results.length > 0 && (
          <div className="flex flex-col gap-2 mt-2">
            {results.map((p) => (
              <div key={p.id} className="glass rounded-xl p-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm truncate">{label(p)}</p>
                  {p.username && <p className="text-white/40 text-xs">@{p.username}</p>}
                </div>
                <button
                  onClick={() => sendRequest(p.id)}
                  disabled={sent.has(p.id)}
                  className="px-3 py-1.5 rounded-full bg-white/10 text-white text-xs font-medium disabled:opacity-40"
                >
                  {sent.has(p.id) ? "Sent" : "Add"}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Friend list */}
      <section>
        <p className="text-white/50 text-xs font-semibold mb-2 uppercase tracking-wide">
          Your friends ({friends.length})
        </p>
        {friends.length === 0 ? (
          <p className="text-white/30 text-sm">No friends yet. Share your invite link above.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {friends.map((f) => (
              <div key={f.id} className="glass rounded-xl p-3 flex items-center gap-3">
                {f.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={f.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover" />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-white/10" />
                )}
                <div className="min-w-0">
                  <p className="text-white text-sm truncate">{label(f)}</p>
                  {f.username && <p className="text-white/40 text-xs">@{f.username}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
