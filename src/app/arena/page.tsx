import type { Metadata } from "next";
import { ArenaHome } from "./ArenaHome";

const title = "the arena — vibeswipe";
const description = "come judge the algorithm's picks";

export const metadata: Metadata = {
  title,
  description: "drop songs into a vibe. strangers judge. your taste. their ears. no escape.",
  openGraph: {
    title,
    description,
  },
  twitter: {
    card: "summary",
    title,
    description,
  },
};

export default function ArenaPage() {
  return <ArenaHome />;
}
