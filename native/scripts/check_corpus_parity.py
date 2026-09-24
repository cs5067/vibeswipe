#!/usr/bin/env python3
"""Offline CLI parity against an independent SQLite relational model.

The CTE mirrors the COUNT / DISTINCT / membership / SUM formula in the
original cooccur_recommend SQL function. PostgreSQL ANY/ALL arrays become
deduplicated temporary liked/seen tables, and sqrt is registered from Python.
This checks offline arithmetic and CLI behavior, not live PostgreSQL integration
or exact equivalence of PostgreSQL numeric and C++ double on arbitrary inputs.
"""

from __future__ import annotations

import argparse
import math
import random
import sqlite3
import subprocess
import tempfile
from pathlib import Path


QUERY = """
WITH hit_playlists AS (
    SELECT pt.playlist_id, COUNT(*) AS overlap,
           COALESCE(pl.track_count, 1) AS plsize
    FROM playlist_tracks pt
    JOIN playlists pl ON pl.id = pt.playlist_id
    WHERE pt.track_id IN (SELECT id FROM liked)
    GROUP BY pt.playlist_id, pl.track_count
)
SELECT pt2.track_id, COUNT(DISTINCT pt2.playlist_id) AS shared_playlists,
       SUM(1.0 * hp.overlap / sqrt(hp.plsize)) AS score
FROM hit_playlists hp
JOIN playlist_tracks pt2 ON pt2.playlist_id = hp.playlist_id
WHERE pt2.track_id NOT IN (SELECT id FROM liked)
  AND pt2.track_id NOT IN (SELECT id FROM seen)
GROUP BY pt2.track_id
ORDER BY score DESC, shared_playlists DESC, pt2.track_id COLLATE BINARY ASC
LIMIT ?
"""


def oracle(playlists, liked, seen, limit):
    with sqlite3.connect(":memory:") as db:
        db.create_function("sqrt", 1, math.sqrt)
        db.executescript("""
            CREATE TABLE playlists(id TEXT PRIMARY KEY, track_count INTEGER);
            CREATE TABLE playlist_tracks(
                playlist_id TEXT, track_id TEXT,
                PRIMARY KEY(playlist_id, track_id));
            CREATE TABLE liked(id TEXT PRIMARY KEY);
            CREATE TABLE seen(id TEXT PRIMARY KEY);
        """)
        db.executemany("INSERT INTO playlists VALUES (?, ?)", [(pid, size) for pid, size, _ in playlists])
        db.executemany("INSERT OR IGNORE INTO playlist_tracks VALUES (?, ?)",
                       [(pid, track) for pid, _, tracks in playlists for track in tracks])
        db.executemany("INSERT OR IGNORE INTO liked VALUES (?)", [(track,) for track in liked])
        db.executemany("INSERT OR IGNORE INTO seen VALUES (?)", [(track,) for track in seen])
        return db.execute(QUERY, (limit,)).fetchall()


def csv(ids):
    return ",".join(ids) if ids else "-"


def run(binary, corpus_path, liked, seen, limit):
    return subprocess.run([str(binary), "recommend", str(corpus_path), csv(liked), csv(seen), str(limit)],
                          capture_output=True, text=True, timeout=10, check=False)


def serialize(playlists):
    return "# playlist_id\tdeclared_size\ttrack_ids\n" + "".join(
        f"{pid}\t{size if size is not None else '-'}\t{csv(tracks)}\n"
        for pid, size, tracks in playlists)


def check_case(binary, path, playlists, liked, seen, limit, name, newline="\n"):
    path.write_bytes(serialize(playlists).replace("\n", newline).encode("utf-8"))
    result = run(binary, path, liked, seen, limit)
    assert result.returncode == 0, f"{name}: CLI rejected valid case: {result.stderr}"
    assert not result.stderr, f"{name}: unexpected stderr: {result.stderr}"
    lines = result.stdout.splitlines()
    assert lines and lines[0] == "track_id\tshared_playlists\tscore", f"{name}: missing TSV header"
    actual = []
    for line in lines[1:]:
        fields = line.split("\t")
        assert len(fields) == 3, f"{name}: bad TSV row {line!r}"
        actual.append((fields[0], int(fields[1]), float(fields[2])))
    expected = oracle(playlists, liked, seen, limit)
    assert len(actual) == len(expected), f"{name}: expected {expected!r}, got {actual!r}"
    for found, wanted in zip(actual, expected):
        assert found[:2] == wanted[:2], f"{name}: identity/order/count: {found!r} != {wanted!r}"
        assert math.isfinite(found[2]) and math.isclose(found[2], wanted[2], rel_tol=1e-12, abs_tol=1e-12), (
            f"{name}: score: {found!r} != {wanted!r}")


def check_errors(binary, path):
    valid = "p\t4\tseed,a,b\n"
    bad_limits = ["-1", "1.5", "1x", "", " 1", "+1", "9223372036854775808", "99999999999999999999999999999"]
    invalid_files = [
        "p\t4\n", "p\t4\tseed,a\textra\n", "p\t0\tseed,a\n", "p\t-1\tseed,a\n",
        "p\t1.5\tseed,a\n", "p\tx\tseed,a\n", "p\t\tseed,a\n", "\t1\tseed,a\n",
        "p\t1\tseed,a,\n", "p\t1\tseed,,a\n", "p\t1\tseed,a\np\t2\tseed,b\n",
        "p\t99999999999999999999999999999\tseed,a\n",
        "-\t4\tseed,a\n", "p,bad\t4\tseed,a\n", "p\tbad\t4\tseed,a\n",
        "p\rbad\t4\tseed,a\n", "p\nbad\t4\tseed,a\n",
        "p\t4\tseed,-,a\n", "p\t4\tseed,a\tbad\n",
        "p\t4\tseed,a\rbad\n", "p\t4\tseed,a\nbad\n",
    ]
    count = 0

    def rejected(result, name):
        assert result.returncode != 0, f"accepted invalid input: {name}"
        assert "error:" in result.stderr.lower(), f"no useful error for {name}: {result.stderr!r}"
        assert not result.stdout, f"partial success output for {name}: {result.stdout!r}"

    path.write_text(valid, encoding="utf-8")
    for limit in bad_limits:
        rejected(run(binary, path, ["seed"], [], limit), f"limit {limit!r}")
        count += 1
    for contents in invalid_files:
        path.write_text(contents, encoding="utf-8")
        rejected(run(binary, path, ["seed"], [], 50), f"TSV {contents!r}")
        count += 1
    path.write_text(valid, encoding="utf-8")
    invalid_queries = [
        (["seed", ""], []), (["", "seed"], []), (["seed"], ["a", ""]),
        (["seed", "-"], []), (["-", "seed"], []), (["seed"], ["a", "-"]),
        (["seed\tbad"], []), (["seed\rbad"], []), (["seed\nbad"], []),
        (["seed"], ["a\tbad"]), (["seed"], ["a\rbad"]), (["seed"], ["a\nbad"]),
    ]
    for liked, seen in invalid_queries:
        rejected(run(binary, path, liked, seen, 50), f"malformed query IDs: {liked!r}, {seen!r}")
        count += 1
    rejected(run(binary, path.with_name("nonexistent.tsv"), ["seed"], [], 50), "missing corpus")
    return count + 1


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--binary", type=Path, default=Path(__file__).resolve().parents[1] / "build/vibeswipe-cpp")
    parser.add_argument("--iterations", type=int, default=200)
    parser.add_argument("--seed", type=int, default=5067)
    args = parser.parse_args()
    if args.iterations < 0:
        parser.error("--iterations must be nonnegative")
    binary = args.binary.resolve()
    if not binary.is_file():
        parser.error(f"build the CLI first; executable not found: {binary}")
    cases = 0
    with tempfile.TemporaryDirectory(prefix="vibeswipe-parity-") as directory:
        path = Path(directory) / "corpus.tsv"
        manual = [
            ([("p1", 4, ["s1", "s2", "x", "y", "x"]), ("p2", 9, ["s1", "x", "z"]),
              ("p3", None, ["s2", "seen"]), ("p4", 1, ["unrelated"])], ["s1", "s1", "s2"], ["seen", "seen"]),
            ([("p", None, ["seed", "candidate", "other"])], ["seed"], []),
            ([("p", 7, ["seed", "candidate"])], ["seed"], []),
            ([("p", 16, ["seed", "candidate", "other"])], ["seed"], []),
            ([("p1", 1, ["seed", "a", "b"]), ("p2", 4, ["seed", "z"]),
              ("p3", 4, ["seed", "z"])], ["seed"], []),
            ([], ["seed"], []), ([("empty", None, [])], ["seed"], []),
            ([("p", 1, ["seed", "candidate"])], [], []),
            ([("p", 1, ["seed", "candidate"])], ["unknown"], []),
            ([("p", 1, ["seed", "candidate"])], ["seed"], ["candidate", "seed"]),
        ]
        for i, (playlists, liked, seen) in enumerate(manual):
            for limit in [0, 1, 50, 9223372036854775807]:
                check_case(binary, path, playlists, liked, seen, limit, f"manual {i}, limit {limit}")
                cases += 1

        check_case(binary, path,
                   [("p1", 4, ["seed", "a", "b"]), ("p2", None, ["seed", "b"])],
                   ["seed"], [], 50, "valid Windows CRLF corpus", newline="\r\n")
        cases += 1

        rng = random.Random(args.seed)
        for iteration in range(args.iterations):
            playlists = []
            for p in range(rng.randrange(35)):
                tracks = [f"t{rng.randrange(40):02d}" for _ in range(rng.randrange(30))]
                # Dyadic weights preserve exact mathematical ties despite differing
                # SQLite/C++ aggregation orders. Irrational weights are tested above.
                size = rng.choice([None, 1, 4, 16, 64, 256])
                playlists.append((f"p{p:03d}", size, tracks))
            liked = [f"t{rng.randrange(50):02d}" for _ in range(rng.randrange(15))]
            seen = [f"t{rng.randrange(50):02d}" for _ in range(rng.randrange(20))]
            for limit in [0, 1, 7, 1000]:
                check_case(binary, path, playlists, liked, seen, limit,
                           f"seed {args.seed}, iteration {iteration}, limit {limit}")
                cases += 1
        error_cases = check_errors(binary, path)
    print(f"PASS: {cases} offline SQLite/CLI parity cases; {error_cases} invalid-input cases; seed={args.seed}")
    print("Not a live PostgreSQL integration test; numeric comparisons use a 1e-12 tolerance.")


if __name__ == "__main__":
    main()
