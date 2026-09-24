import { NextRequest, NextResponse } from "next/server";
import { getCorpusClient } from "@/lib/supabase/server";
import { rateLimit, requestIp } from "@/lib/rate-limit";

/**
 * Join the waitlist.
 *
 * POST body: { email: string, source?: string }
 * Returns:   { ok: true } — also on duplicate email (already on the list).
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(request: NextRequest) {
  const limited = rateLimit(`waitlist:${requestIp(request)}`, {
    limit: 10,
    windowMs: 60 * 60 * 1000,
  });
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many requests", retryAfterSec: limited.retryAfterSec },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSec) } }
    );
  }

  let body: { email?: unknown; source?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  const source =
    typeof body.source === "string" ? body.source.slice(0, 40) : null;

  try {
    const supabase = getCorpusClient();
    let { error } = await supabase.from("waitlist").insert({ email, source });
    // 42703 = undefined_column → table has no source column, retry email-only
    if (error && (error as { code?: string }).code === "42703") {
      ({ error } = await supabase.from("waitlist").insert({ email }));
    }
    // 23505 = unique_violation → already on the list, treat as success
    if (error && (error as { code?: string }).code !== "23505") {
      console.error("waitlist insert error:", error);
      return NextResponse.json({ error: "Could not join waitlist" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("waitlist error:", err);
    return NextResponse.json({ error: "Could not join waitlist" }, { status: 500 });
  }
}
