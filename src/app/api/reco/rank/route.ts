import { nativeRank, RankingInputError } from "@/lib/engine/native-server";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
const MAX_BYTES = 1024 * 1024;

export async function POST(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  // Stateless public computation, with no account or database access. Global
  // per-process budget also bounds callers that spoof forwarding headers.
  const budget = rateLimit("native-ranking", { limit: 60, windowMs: 60_000 });
  if (!budget.ok) return Response.json({ error: "Ranking busy" }, {
    status: 429, headers: { ...headers, "Retry-After": String(budget.retryAfterSec) },
  });
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))
    return Response.json({ error: "Expected JSON" }, { status: 415, headers });
  const reader = request.body?.getReader();
  if (!reader) return Response.json({ error: "Missing body" }, { status: 400, headers });
  let bytes = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BYTES) {
        await reader.cancel();
        return Response.json({ error: "Payload too large" }, { status: 413, headers });
      }
      chunks.push(value);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const ranked = await nativeRank(body);
    return Response.json({ engine: "cpp17", ranked }, { headers });
  } catch (error) {
    const invalid = error instanceof RankingInputError || error instanceof SyntaxError;
    return Response.json({ error: invalid ? "Invalid ranking payload" : "Native ranking unavailable" }, {
      status: invalid ? 400 : 503, headers,
    });
  } finally {
    reader.releaseLock();
  }
}
