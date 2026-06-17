"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function InviteAccept({
  inviterId,
  inviterName,
  alreadyMe,
}: {
  inviterId: string;
  inviterName: string;
  alreadyMe: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "sending" | "done">("idle");

  if (alreadyMe) {
    return <p className="text-white/40 text-sm">This is your own invite link 🙂</p>;
  }

  const accept = async () => {
    setStatus("sending");
    await fetch("/api/friends/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toId: inviterId }),
    });
    setStatus("done");
    setTimeout(() => router.push("/friends"), 900);
  };

  if (status === "done") {
    return <p className="text-green-400 font-semibold">You&apos;re connected with {inviterName}! 🎉</p>;
  }

  return (
    <button
      onClick={accept}
      disabled={status === "sending"}
      className="px-8 py-4 rounded-full bg-gradient-to-r from-indigo-500 to-pink-500 text-white font-bold text-lg disabled:opacity-50"
    >
      {status === "sending" ? "Connecting..." : `Add ${inviterName}`}
    </button>
  );
}
