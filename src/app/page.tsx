"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";

const REACTIONS = ["🔥", "❤️", "😂", "😭", "🤢"];

const STEPS = [
  {
    step: "01",
    title: "Swipe the vibe",
    body: "Swipe songs Tinder-style to build a playlist around a vibe. Swipe down to save a banger that doesn't fit.",
  },
  {
    step: "02",
    title: "Force it on a friend",
    body: "Found the song? Send it to a friend with a note. They don't get to scroll past it.",
  },
  {
    step: "03",
    title: "Get the receipt",
    body: "You'll know the moment they ACTUALLY listen — 🎧 Listened — and they hit you back with a reaction.",
  },
];

export default function LandingPage() {
  const [email, setEmail] = useState("");
  const [joined, setJoined] = useState(false);
  const [invalid, setInvalid] = useState(false);

  function joinWaitlist(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed)) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    // Optimistic: flip to success immediately, fire the request behind it.
    setJoined(true);
    void fetch("/api/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: trimmed, source: "landing" }),
    }).catch(() => {});
  }

  return (
    <main className="relative min-h-screen flex flex-col items-center overflow-hidden px-6 py-16 sm:py-24">
      {/* Background */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[#0a0a0f]" />
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full blur-[150px] opacity-20 bg-indigo-600 animate-pulse-glow" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full blur-[130px] opacity-15 bg-purple-600 animate-pulse-glow" style={{ animationDelay: "1s" }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[40%] h-[40%] rounded-full blur-[100px] opacity-10 bg-pink-600" />
      </div>

      {/* Logo + Hero */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="text-center max-w-xl"
      >
        {/* Icon */}
        <motion.div
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ duration: 0.6, delay: 0.2, type: "spring", stiffness: 200 }}
          className="mx-auto mb-8 w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-purple-500/25"
        >
          <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z" />
          </svg>
        </motion.div>

        <h1 className="text-5xl sm:text-6xl font-bold tracking-tight">
          <span className="text-gradient">vibeswipe</span>
        </h1>
        <p className="mt-5 text-2xl sm:text-3xl font-bold text-white/90 leading-snug">
          Force your friends
          <br />
          to listen to your music.
        </p>
        <p className="mt-4 text-lg text-white/50 leading-relaxed">
          Your taste. Their ears. No escape.
        </p>
      </motion.div>

      {/* Waitlist */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.4 }}
        className="mt-10 w-full max-w-md"
      >
        {joined ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass-strong rounded-2xl px-6 py-5 text-center"
          >
            <p className="text-lg font-semibold text-white">you&apos;re on the list 🎧</p>
            <p className="mt-1 text-sm text-white/40">
              We&apos;ll email you when it&apos;s your turn to force songs on people.
            </p>
          </motion.div>
        ) : (
          <form onSubmit={joinWaitlist} noValidate className="glass rounded-2xl p-2 flex flex-col sm:flex-row gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (invalid) setInvalid(false);
              }}
              placeholder="your@email.com"
              aria-label="Email address"
              className="flex-1 bg-transparent px-4 py-3 text-white placeholder:text-white/30 outline-none rounded-xl"
            />
            <motion.button
              type="submit"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              className="px-6 py-3 rounded-xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 text-white font-bold
                         shadow-lg shadow-purple-500/25 whitespace-nowrap"
            >
              Join the waitlist
            </motion.button>
          </form>
        )}
        {invalid && !joined && (
          <p className="mt-2 text-sm text-pink-400/80 text-center">That email doesn&apos;t look right.</p>
        )}
        <p className="mt-4 text-center">
          <Link
            href="/arena"
            className="text-sm text-white/30 hover:text-white/50 transition-colors"
          >
            or wander the arena first — no signup, come judge the algorithm&apos;s picks →
          </Link>
        </p>
      </motion.div>

      {/* How it works */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.6 }}
        className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl w-full"
      >
        {STEPS.map((s, i) => (
          <motion.div
            key={s.step}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 + i * 0.12 }}
            className="glass rounded-2xl p-5 flex flex-col"
          >
            <span className="text-xs font-mono text-white/25">{s.step}</span>
            <h3 className="mt-2 font-bold text-white/90">{s.title}</h3>
            <p className="mt-2 text-sm text-white/40 leading-relaxed flex-1">{s.body}</p>
            {i === 2 && (
              <div className="mt-4 flex gap-2">
                {REACTIONS.map((r, j) => (
                  <motion.span
                    key={r}
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 1.1 + j * 0.08, type: "spring", stiffness: 300 }}
                    className="glass rounded-full w-9 h-9 flex items-center justify-center text-base"
                  >
                    {r}
                  </motion.span>
                ))}
              </div>
            )}
          </motion.div>
        ))}
      </motion.div>

      {/* Tester login */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2 }}
        className="mt-14 text-center"
      >
        <a
          href="/api/auth/login"
          className="inline-flex items-center gap-2 text-sm text-white/30 hover:text-[#1DB954] transition-colors no-underline"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
          </svg>
          Already a tester? Connect with Spotify
        </a>
      </motion.div>

      {/* Footer note */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.4 }}
        className="mt-8 text-xs text-white/20 text-center"
      >
        Your listening data stays private. We never store your credentials.
      </motion.p>
    </main>
  );
}
