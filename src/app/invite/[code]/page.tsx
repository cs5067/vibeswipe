import Link from "next/link";
import { getCurrentProfile } from "@/lib/profile/server";
import { getCorpusClient } from "@/lib/supabase/server";
import { InviteAccept } from "./InviteAccept";

interface PageProps {
  params: Promise<{ code: string }>;
}

export default async function InvitePage({ params }: PageProps) {
  const { code: inviterId } = await params;
  const supabase = getCorpusClient();

  const { data: inviter } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url")
    .eq("id", inviterId)
    .maybeSingle();

  if (!inviter) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <p className="text-white/60 mb-4">This invite link is invalid.</p>
        <Link href="/" className="px-6 py-3 rounded-full bg-white/10 text-white text-sm no-underline">
          Go to vibeswipe
        </Link>
      </main>
    );
  }

  const me = await getCurrentProfile();
  const name = inviter.display_name || inviter.username || "Someone";
  const initial = (name.trim()[0] ?? "?").toUpperCase();

  return (
    <main className="relative min-h-screen flex flex-col items-center justify-center px-6 text-center overflow-hidden">
      {/* ambient background */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[#0a0a0f]" />
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full blur-[150px] opacity-20 bg-indigo-600 animate-pulse-glow" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full blur-[130px] opacity-15 bg-purple-600 animate-pulse-glow" style={{ animationDelay: "1s" }} />
      </div>

      {/* the duo: them + you */}
      <div className="flex items-center gap-4 mb-8">
        <div className="w-20 h-20 rounded-full overflow-hidden ring-2 ring-white/20 bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center shadow-lg shadow-purple-500/25">
          {inviter.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- avatar hosts vary; next/image remotePatterns can't cover them
            <img src={inviter.avatar_url} alt={name} className="w-full h-full object-cover" />
          ) : (
            <span className="text-2xl font-bold text-white">{initial}</span>
          )}
        </div>
        <span className="text-white/30 text-xl font-bold">×</span>
        <div className="w-20 h-20 rounded-full border-2 border-dashed border-white/25 flex items-center justify-center">
          <span className="text-white/40 text-sm font-semibold">you</span>
        </div>
      </div>

      <h1 className="text-2xl font-bold text-white">
        {name} picked you
      </h1>
      <p className="mt-2 mb-8 text-white/50 text-sm max-w-xs leading-relaxed">
        Swap songs. You get a 🎧 receipt when they actually listen.
      </p>

      {me ? (
        <InviteAccept inviterId={inviter.id} inviterName={name} alreadyMe={me.id === inviter.id} />
      ) : (
        <Link
          href="/api/auth/login"
          className="px-8 py-4 rounded-full bg-[#1DB954] text-black font-bold text-lg no-underline shadow-lg shadow-[#1DB954]/20"
        >
          Connect Spotify to join {name}
        </Link>
      )}

      <p className="mt-10 text-xs text-white/30 max-w-xs leading-relaxed">
        this is <span className="text-gradient font-bold">vibeswipe</span> —
        where friends force songs on each other and get receipts
      </p>
    </main>
  );
}
