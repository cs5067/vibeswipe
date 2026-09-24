import type { Metadata } from "next";
import { VibeRoom } from "./VibeRoom";

interface PageProps {
  params: Promise<{ slug: string }>;
}

// Vibe names are the slug words with spaces, so metadata needs no DB round-trip.
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const name = slug.replace(/-/g, " ");
  const title = `${name} — the arena — vibeswipe`;
  const description = `drop a song into ${name}. strangers judge. come judge the algorithm's picks.`;

  return {
    title,
    description,
    openGraph: { title, description },
    twitter: { card: "summary", title, description },
  };
}

export default async function VibePage({ params }: PageProps) {
  const { slug } = await params;
  return <VibeRoom slug={slug} />;
}
