# Verification record

Verified locally on 24 September 2026, using Apple Clang 17.0.0 on macOS arm64. The optimized build uses C++17 and `-O2 -Wall -Wextra -Wpedantic -Wconversion`. Additional parity checks use Python 3 and Node.js 24.19.0. All inputs are synthetic; no provider, database or user account was contacted.

## Build and behavioral checks

| Command | Observed result |
| --- | --- |
| `make CXX=clang++ all test` | Passed, without compiler warnings. Corpus: 190,228 assertions across hand-calculated cases and 600 seeded randomized corpus scenarios. Scoring: 47 checks. |
| `./build/vibeswipe-cpp --demo` | Returned candidates x, y, z with scores 4/3, 1 and 1/3. |
| `./build/vibeswipe-cpp --score-demo` | Returned the synthetic chill, ambient and dance tracks in that order, with all seven dimensions and totals. |
| `python3 scripts/check_corpus_parity.py --binary build/vibeswipe-cpp` | 841 offline SQLite/CLI parity cases and 42 invalid-input cases passed. |
| `CXX=clang++ node scripts/check_scoring_parity.mjs` | 1,101 tracks, 102 stable ranking orders, 31,329 directed genre pairs and 41,022 numeric comparisons passed. |

The Make `parity` target runs both scripts. The corpus script was rerun after adding delimiter/marker validation and a CRLF fixture. The scoring script checks the reference file hashes before executing the original TypeScript. Its maximum observed absolute difference was `2.220446049250313e-16`, below the `1e-12` tolerance. Node emits its standard experimental warning for built-in TypeScript stripping.

The corpus oracle uses an independent relational query in SQLite. It is not a live PostgreSQL test. Random relational fixtures use exactly representable weights to avoid database aggregation-order noise; separate hand cases exercise irrational weights. C++ randomized full-scan comparisons also cover non-square playlist sizes. Exact final ties use the port's documented ID ordering.

## Sanitizers

The undefined-behavior checks passed for both suites: 190,228 corpus assertions and 47 scoring checks, with no sanitizer diagnostics. They were compiled using `-fsanitize=undefined -fno-sanitize-recover=all -fno-omit-frame-pointer -O1 -g`. Run `make CXX=clang++ ubsan` to reproduce them.

The combined AddressSanitizer/UndefinedBehaviorSanitizer build compiled, but its executables stalled during runtime initialization. A retry outside the sandbox also stalled. A minimal program that only prints `START` runs normally and under UBSan, but times out under ASan-only and ASan+UBSan. Disabling leak detection did not resolve it; verbose output stopped after `AddressSanitizer: libc interceptors initialized`. Timed-out diagnostic processes were terminated.

This isolates the observed hang from the recommendation code, but its precise runtime/toolchain cause remains undetermined. **AddressSanitizer execution is unverified.** `make sanitize` remains available for a host with a working runtime. The undefined-behavior checks do not replace ASan's memory-access coverage.

## Synthetic benchmark

`make CXX=clang++ benchmark` completed with these values in one observed run:

```text
synthetic_playlists=5000
synthetic_tracks=19999
memberships=200000
queries=100
index_build_ms=29.3131
mean_query_ms=0.160545
returned=5000
checksum=1542.08
```

The fixed seed is 20260923. Each playlist has 40 distinct tracks drawn from a pool of 20,000; each query uses four seed tracks and requests 50 results. Corpus generation is outside the timed region. Index construction and all query calls are timed separately. The mean includes result handling and checksum accumulation. There is no warm-up, latency distribution, memory-usage measurement, concurrent-query test, original-implementation comparison or production workload in this benchmark. These figures support reproducibility, not a speedup or recommendation-quality claim.

## Remaining verification boundaries

- CMake configuration is supplied but was not executed: CMake is unavailable on this host.
- The original standalone record is supplemented by `../NATIVE_INTEGRATION.md`, which covers the new web/mobile scoring adapter. Live corpus database integration and end-to-end playback remain unverified.
- No real-user listening evaluation was performed. Agreement with existing heuristics does not establish recommendation quality.
- The stricter input validation and ASCII case-folding boundary are documented in `tests/reference/README.md`.
