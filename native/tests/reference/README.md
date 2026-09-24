# Pinned scoring reference

The three `.ts` files are exact snapshots of the existing VibeSwipe web engine
from the candidate's local working tree, captured September 23, 2026. Their
relative original locations and SHA-256 hashes are in `provenance.json`. Web and
mobile `scoring.ts` and `genre-graph.ts` matched byte for byte at capture time.
These files are test inputs, not generated expected outputs or a second port.

`node scripts/check_scoring_parity.mjs` uses Node 24's built-in type stripping
to execute those original modules and compares them with the compiled C++
implementation. It requires a C++17 compiler (`CXX` may override `c++`), no npm
packages, credentials, provider traffic, or original app checkout. Generated
fixtures and the executable stay under `build/scoring-parity`.

The comparison exercises every ordered pair among the source graph's keys and
neighbors, genre vibe constants, 100 reproducible synthetic mixed scenarios,
missing data, an empty candidate set, seven individual score dimensions and
the total, and stable ranking including deliberate equal-score candidates.
Tolerance is `1e-12` absolute; this tests compatibility with existing heuristics,
not whether a recommendation sounds good to a listener.

## Intentional boundary differences

- C++ rejects non-finite values, popularity outside 0–100, vibe/energy outside
  0–1, negative observation counts, overflowed branch totals and inverted
  popularity ranges. The TypeScript scorer does not perform this validation.
- Case folding handles ASCII A–Z. Source genre labels are ASCII; arbitrary
  Unicode upper/lowercase equivalence is outside this standalone API.
- Only fields consumed by scoring are represented. Playlist-name keyword
  interpretation, provider fetching, profile mutation and network state are
  not ported. Genre vibe lookup and matching are ported completely.
- Directed graph semantics, five-hop search limit, last-ten genre context,
  fallback weights, branch uncertainty, popularity fallback width, and stable
  ties are retained. Genre weight and transition map keys are expected to be
  lowercase, as in the original profile construction.
