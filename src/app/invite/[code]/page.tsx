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

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
      <p className="text-white/60 mb-1">
        <span className="font-bold text-white">{name}</span> wants to swap music with you
      </p>
      <p className="text-white/30 text-sm mb-8">on vibeswipe</p>

      {me ? (
        <InviteAccept inviterId={inviter.id} inviterName={name} alreadyMe={me.id === inviter.id} />
      ) : (
        <Link
          href="/api/auth/login"
          className="px-8 py-4 rounded-full bg-[#1DB954] text-black font-bold text-lg no-underline"
        >
          Connect Spotify to accept
        </Link>
      )}
    </main>
  );
}
