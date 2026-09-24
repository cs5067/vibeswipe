# C++ ranking integration

The web and normal Spotify/corpus mobile flows now call a C++17 scorer through
`POST /api/reco/rank`. The phone does not execute a native addon: its existing
TypeScript engine sends a batch to the Next.js Node backend. The separate
Deezer-only Expo experiment retains its full-set-first TypeScript algorithm.

## Data flow

1. Existing retrieval gathers candidate tracks from available providers.
2. The client extracts only scoring inputs: genres, artist IDs, popularity,
   branch statistics, recent taste context and liked-track history. It sends
   no access tokens, account identifiers, audio or artwork to this endpoint.
3. The route validates a bounded request and invokes `native/build/vibeswipe-rank`
   without a shell. A versioned stdin protocol uses hex-encoded UTF-8 strings
   and numeric tokens. The C++ reader independently validates the frame.
4. The response contains original candidate indices and seven score components
   plus the total. The client verifies completeness, uniqueness, ranges and
   stable ordering, and reattaches the original track objects.
5. Mobile applies its existing source/overlap priority after scoring. Likes
   changing during the round-trip invalidate the batch; other swipes trigger
   local rescoring against current taste. Unavailable or malformed responses
   fall back to the original TypeScript scorer and pause attempts for 30 seconds.

Corpus candidate retrieval remains PostgreSQL-backed. The native inverted
corpus index is included as a tested offline library, not connected to a live
database snapshot. No new database schema, provider calls or permissions are
required for native scoring itself.

## Resource boundaries

HTTP input is limited to 1 MiB; the internal frame to 2 MiB. A batch has at most
500 candidates, 2,000 liked tracks, 5,000 known artists, 1,000 genre weights,
10,000 transition entries and 1,000 branches. Track genre/artist lists and string
sizes are bounded. Oversized client batches use local scoring without truncating
taste history. The process timeout is two seconds; the client timeout is 2.5
seconds. At most four native processes run per backend instance, and the route
allows 60 calls per minute per instance. These are prototype safeguards, not a
distributed rate-limit service or throughput claim.

## Build and deployment

From the repository root:

```sh
npm ci
npm run native:build
npm test
npm run native:test
npm run native:parity
npm run dev
```

The Node host must permit child processes. Compile the executable for the
deployment operating system/architecture during its build; do not copy a macOS
binary to Linux. `next.config.ts` includes the executable in the ranking route's
file trace. Local production verification confirms that the traced executable is present,
executable and reachable from the application working directory. Repeat this
check on the intended hosting platform. Edge runtimes
and static-only hosting cannot run this route. A missing executable returns
503, allowing the client fallback. This work does not deploy the app.

## Verification on 25 September 2026

- 63 offline app tests passed, including both client adapters calling the actual
  route handler and compiled C++ process, stable tie ordering, Unicode transport,
  metadata preservation, invalid frames, size limits, fallback, budget rejection
  and stale-batch invalidation.
- Web and mobile TypeScript checks passed. ESLint passed with zero errors and
  three existing web-navigation warnings.
- C++ tests passed: 190,228 corpus assertions across 600 randomized scenarios and
  47 scorer checks. UBSan reported no issues in these suites.
- Corpus parity passed 841 SQL-model/CLI cases and 42 invalid-input cases.
- Scoring parity passed 1,101 tracks, 102 rankings and 31,329 genre pairs against
  pinned original TypeScript, with maximum absolute error 2.22e-16.
- The Next.js production build passed on macOS with `npm run build -- --webpack`.
  A real loopback HTTP check against `next start` returned `engine: "cpp17"`,
  expected scores and stable ties. Unicode and empty batches passed; malformed
  JSON, unsupported content types and oversized bodies returned 400, 415 and
  413. The native executable is included in the production file trace.
- AddressSanitizer remains unavailable on this Mac: even a minimal program
  stalls during runtime initialization. CI includes the sanitizer suite for a
  Linux host. GitHub Actions could not start its jobs because of an account
  infrastructure restriction; no remote test result is available. The local
  checks above passed independently.

No authenticated provider session, real phone listening test, production
deployment, live database change or performance comparison was performed.
