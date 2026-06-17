import type { Metadata } from "next";
import Link from "next/link";
import { getShare } from "@/lib/share/server";
import { SharedSongView } from "./SharedSongView";

interface PageProps {
  params: Promise<{ code: string }>;
}

// Rich link preview (the unfurl in iMessage/WhatsApp/Discord) — this IS the ad.
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { code } = await params;
  const share = await getShare(code);
  if (!share) return { title: "vibeswipe" };

  const sender = share.senderName?.trim() || "Someone";
  const title = `${sender} sent you "${share.track.name}"`;
  const description =
    share.note?.trim() ||
    `${share.track.artistNames.join(", ")} — tap to listen on vibeswipe`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: share.track.albumImage ? [{ url: share.track.albumImage }] : [],
      type: "music.song",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: share.track.albumImage ? [share.track.albumImage] : [],
    },
  };
}

export default async function SharePage({ params }: PageProps) {
  const { code } = await params;
  const share = await getShare(code, { countOpen: true });

  if (!share) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <p className="text-white/60 mb-4">This link expired or doesn’t exist.</p>
        <Link
          href="/"
          className="px-6 py-3 rounded-full bg-white/10 hover:bg-white/20 text-white text-sm no-underline"
        >
          Go to vibeswipe
        </Link>
      </main>
    );
  }

  return <SharedSongView share={share} />;
}
