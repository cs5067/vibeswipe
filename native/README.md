# VibeSwipe C++ recommendation core

A C++17 library implementing two algorithms from VibeSwipe: playlist co-occurrence candidate selection and seven-factor track scoring. Its CLI examples and tests run offline with synthetic data, without provider credentials or third-party C++ libraries.

The seven-factor scorer is integrated into VibeSwipe's web and normal mobile flows through a batch endpoint on the Next.js backend. See [integration details](../NATIVE_INTEGRATION.md). The corpus index remains an offline library; live corpus retrieval still uses PostgreSQL. The separate Deezer full-set-first experiment remains TypeScript.

## Build and run

Requires a C++17 compiler and Make. Python 3 and Node.js 24 or newer are needed only for the additional parity checks. No package installation is required.

```sh
make
./build/vibeswipe-cpp --demo
./build/vibeswipe-cpp --score-demo
./build/vibeswipe-cpp recommend examples/corpus.tsv seed-a,seed-b seen-track 50
make test
make parity
make ubsan
make sanitize
make benchmark
```

Override tool locations with `CXX=clang++`, `PYTHON=/path/to/python3` and `NODE=/path/to/node` if needed. CMake configuration is also supplied:

```sh
cmake -S . -B build/cmake
cmake --build build/cmake
ctest --test-dir build/cmake --output-on-failure
```

The Make build is verified locally. `make sanitize` requires a working AddressSanitizer runtime; it stalls before `main` on the current host, including for a minimal diagnostic program. `make ubsan` runs the separate undefined-behavior checks. Check `VERIFICATION.md` for completed checks and limitations.

## What the algorithms do

### Playlist co-occurrence

For every playlist containing a liked track, each eligible candidate receives:

```text
playlist contribution = number of distinct liked tracks in that playlist
                        / sqrt(declared playlist size)
candidate score = sum of contributions from its matching playlists
```

The index maps track IDs to playlist positions. A query visits only playlists reached from the seed tracks, excludes liked and seen candidates, and returns the best K. Multiple appearances of a track in one playlist are deduplicated, matching the original membership primary key. Duplicate likes do not increase overlap.

The original SQL uses a declared playlist size, not the number of memberships currently available. Missing size defaults to 1, exactly as its `COALESCE` does. The port rejects zero or negative declared sizes rather than allowing an undefined division or square root. It does not pretend that partial corpus coverage is complete.

Candidate order is descending score, then descending shared-playlist count. Exact ties use the track ID to make the CLI output deterministic; the SQL does not specify that last tie-break. C++ uses double precision, so comparisons to a database's numeric arithmetic require a tolerance. Near ties can differ across numeric implementations.

Expected query cost is proportional to the seed posting lists and memberships in matching playlists, plus ordering matching playlists and selecting top K from the accumulated candidates. `std::partial_sort` avoids fully sorting candidates when only a small K is requested. The immutable index supports concurrent read-only calls with query-local accumulators; there is no parallel query implementation or concurrency benchmark.

### Seven-factor scoring

Each candidate receives a breakdown for vibe fit (25%), genre proximity (20%), sequence fit (15%), artist diversity (12%), branch health (10%), novelty (8%) and popularity fit (10%). The port retains genre-distance breadth-first search, five-dimensional vibe matching, recent-like context, known-artist penalties, branch confidence and popularity-range behavior from the TypeScript scorer. Exact score ties preserve input order.

The API validates finite numbers, sensible ranges and nonnegative observation counts before scoring. This is stricter than the original TypeScript. Genre case folding supports ASCII, matching the source genre labels; arbitrary Unicode case equivalence is outside this port. Profile map keys should already be lowercase. See `tests/reference/README.md` for the compatibility boundaries.

The corpus scores and the seven-factor scores are separate signals, as in the source. This project does not invent a blend between them or claim to reproduce the entire application's candidate-source orchestration. A future adapter must explicitly preserve evidence ordering when combining sources.

## Input format

`recommend` reads a UTF-8 text file with three tab-separated fields per playlist:

```text
playlist_id<TAB>declared_size<TAB>track_id_1,track_id_2,...
```

`-` represents a missing declared size or an empty track list. Query liked/seen arguments also use comma-separated IDs, with `-` for an empty list. Blank lines and lines beginning with `#` are ignored; CRLF is supported. IDs cannot contain commas, tabs, newlines or the reserved single `-` marker. This small protocol is for offline fixtures, not a production API. Invalid input returns a nonzero status with an error on stderr. Recommendation output is TSV on stdout.

The C++ API in `include/vibeswipe/` supports typed inputs without the CLI encoding restrictions. `--score-demo` exposes the scoring breakdown on a synthetic three-track scenario; arbitrary scoring inputs currently use the library API.

## Verification approach

- C++ behavioral tests cover ranking, exclusions, default values, stable ordering and invalid inputs.
- Corpus parity compares the C++ CLI with an independent relational model using synthetic memberships. This is not a live PostgreSQL integration test.
- Scoring parity executes snapshots of the actual TypeScript scoring logic and compares all seven dimensions, total scores and ranking order with C++.
- AddressSanitizer and UndefinedBehaviorSanitizer check the C++ test executables.
- The repeatable benchmark generates a fixed synthetic corpus. Its timings measure this machine and workload, not production latency, recommendation quality or an improvement over TypeScript/PostgreSQL.

## Source and scope

Based on the local VibeSwipe source reviewed on 23 September 2026:

- `src/lib/engine/scoring.ts`
- `src/lib/engine/genre-graph.ts`
- `src/lib/engine/vibe-interpreter.ts`
- `supabase/migrations/0001_corpus_schema.sql`

The web and mobile scorer and genre graph matched when inspected. Source hashes and reference snapshots record the exact baseline. The newer Deezer experiment's full-set-first tiers are a different algorithm and are not ported here.

Provider discovery, playback, OAuth, UI, persistence and swipe-event mutation remain in the app. The native scorer consumes snapshots of their state. It does not access databases or provider accounts.

## Application adapter

`src/rank_main.cpp` exposes the versioned batch protocol used by the backend. `../src/lib/engine/native-server.ts` validates the HTTP shape, encodes the frame and manages the child process. `../src/lib/engine/native-ranking.ts` and its mobile counterpart validate responses and provide TypeScript fallback. The root app tests exercise this path against the real compiled executable.

Construct and reuse `CorpusIndex` for offline corpus queries. Connecting it to live corpus snapshots remains future work; rebuilding that index per HTTP request is not the intended design.
