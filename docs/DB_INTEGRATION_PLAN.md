# vibeswipe — Database Integration Plan

*The "John & Michael" engine: real playlist co-occurrence on your own index.*

---

## 1. The problem this solves

Your vision: Abid swipes right on 7 songs → those 7 songs happen to sit together on a stranger's
(John's) public playlist → recommend the *rest* of John's playlist → Abid swipes → another playlist
(Michael's) overlaps → recommend from that → and so on.

This is **item-based collaborative filtering via playlist co-occurrence**. Two facts make it buildable
even though Abid is the only vibeswipe user:

1. **John and Michael don't need vibeswipe.** Their playlists already exist publicly. We mine *existing*
   public playlists — vibeswipe's own user count is irrelevant to the signal.
2. **Spotify has no reverse "which playlists contain track X" endpoint** (verified live: search only
   takes text; `/recommendations` is 404; reading arbitrary public playlists returned 403 under an
   app token). So we cannot do this live against Spotify. **We must precompute our own index.**

The current engine *fakes* co-occurrence: it text-searches playlists by artist name and scrapes them
live. That's (a) not real co-occurrence and (b) the source of the rate-limiting — ~8-11 Spotify calls
per refill, fired every time the queue drops below 8 cards.

**Both problems have the same fix: build a track->playlist inverted index in our own DB and query it
locally.** Swipe sessions then make ~0 Spotify calls (only artwork/preview fetches for upcoming cards).

---

## 2. Data source (the corpus)

### Primary: Spotify Million Playlist Dataset (MPD)
- 1,000,000 real public playlists, ~66M track-playlist pairs, ~2.2M unique tracks.
- Free for research/non-commercial via AIcrowd. **Licensing caveat (must confirm before commercial
  launch):** MPD terms are research-oriented. For a paid product we likely need to either (a) treat MPD
  as bootstrap/dev-only and replace with our own crawled corpus before monetizing, or (b) get clarity
  from Spotify. Flagged as an open legal item - does NOT block building/testing.
- Format: 1,000 JSON slice files, each with 1,000 playlists. Each playlist = name + list of track URIs.

### Ongoing: our own crawl (post-bootstrap)
- Periodically search public playlists by theme keywords (the same search that works today) and ingest
  their tracklists into the same index. Keeps the corpus fresh with new releases MPD (2018) lacks.
- This is also the path to a *legally clean, owned* corpus that doesn't depend on MPD terms.

---

## 3. Storage choice: Postgres (Supabase)

Why Postgres over a graph/vector DB to start:
- Co-occurrence is a **join + group-by + count**, which Postgres does well with the right index.
- Supabase gives managed Postgres + auth + REST/realtime on a free tier, 20-min setup. Matches the
  `<$200/mo` infra target far better than a dedicated graph store at this stage.
- The whole thing is a fancy inverted index; we don't need graph traversal primitives yet. Revisit
  (Neo4j / a vector store / Redis cache) only if query latency demands it at scale.

---

## 4. Schema

```sql
-- Tracks seen across the corpus (dedup by spotify track id)
create table tracks (
  id           text primary key,         -- spotify track id (base62)
  name         text not null,
  artist_name  text not null,
  artist_id    text,
  album_name   text,
  album_image  text,                     -- cached art url (nullable; refresh lazily)
  popularity   int,                      -- optional, backfilled from Spotify
  inserted_at  timestamptz default now()
);

-- Playlists in the corpus
create table playlists (
  id           text primary key,         -- mpd:<pid> for MPD, spotify id for crawled
  name         text,
  source       text not null,            -- 'mpd' | 'crawl'
  track_count  int,
  inserted_at  timestamptz default now()
);

-- THE INVERTED INDEX: one row per (track, playlist) membership.
-- This single table powers the entire co-occurrence engine.
create table playlist_tracks (
  playlist_id  text not null references playlists(id) on delete cascade,
  track_id     text not null references tracks(id)    on delete cascade,
  position     int,
  primary key (playlist_id, track_id)
);

-- The critical index: "give me every playlist containing track X" must be instant.
create index idx_pt_track on playlist_tracks (track_id);
-- And the reverse for fetching a playlist's contents.
create index idx_pt_playlist on playlist_tracks (playlist_id);
```

### Optional precomputed co-occurrence (phase 2 optimization)
If live aggregation gets slow, materialize the top co-occurring pairs:
```sql
create table track_cooccurrence (
  track_a   text not null,
  track_b   text not null,
  weight    int  not null,    -- # of corpus playlists containing both
  primary key (track_a, track_b)
);
create index idx_cooc_a on track_cooccurrence (track_a, weight desc);
```
Start WITHOUT this (live query is fine at MPD scale with the indexes above). Add it only if needed.

---

## 5. The core query (the actual algorithm)

Given the set of track IDs Abid has swiped right on (`liked`), recommend tracks that co-occur most
often with them across the corpus, excluding ones he's already seen:

```sql
-- :liked      = array of liked track ids (the 7 songs)
-- :seen       = array of already-shown track ids (don't repeat)
-- returns ranked candidate track ids + a co-occurrence score
select pt2.track_id,
       count(distinct pt2.playlist_id)            as cooccur_playlists,  -- how many shared playlists
       sum(1.0)                                   as raw_score
from   playlist_tracks pt1
join   playlist_tracks pt2
       on pt1.playlist_id = pt2.playlist_id        -- same playlist...
      and pt2.track_id <> pt1.track_id             -- ...different track
where  pt1.track_id = any(:liked)                  -- playlists containing a liked track
  and  pt2.track_id <> all(:seen)                  -- exclude already-shown
group by pt2.track_id
order by cooccur_playlists desc, raw_score desc
limit 50;
```

Plain English: "Find every playlist that contains one of Abid's liked songs. Look at all the *other*
songs on those playlists. Rank them by how many of those shared playlists they appear on." A track that
shows up alongside his likes on 40 different playlists outranks one that appears on 2. That is exactly
the John->Michael chain, computed in one indexed query.

### Refinements (layer in after the basic version works)
- **Weight by overlap depth:** a playlist sharing 5 of Abid's 7 likes is stronger signal than one
  sharing 1. Weight by `count(distinct pt1.track_id)` per playlist.
- **Down-weight giant playlists:** a 10,000-track "all music" playlist is noise. Join `playlists` and
  divide by `track_count` (TF-IDF-style) so tight, curated playlists dominate.
- **Blend with taste profile:** keep the existing genre/artist scoring as a secondary multiplier so
  cold-start (0 likes) still works before co-occurrence has signal.

---

## 6. How it plugs into the existing engine

`recommendation-engine.ts` already has the right *shape* - strategies + a scored queue. We swap the
data source, not the architecture:

- **New `/api/reco/cooccur` route** (server-side) runs the SQL above against Supabase and returns
  candidate track IDs.
- **`playlistCoOccurrence()` is replaced**: instead of live Spotify search, it calls `/api/reco/cooccur`
  with the liked-track IDs. No Spotify hit.
- **Spotify is used only for:** (1) initial taste seed (top tracks/artists - once per session),
  (2) hydrating the ~5 upcoming cards with fresh artwork/preview, (3) final playlist export. That drops
  per-session Spotify calls from "hundreds" to "a handful" -> rate-limit problem gone.
- **Cold start** (no likes yet): fall back to the existing seed-artist/genre search for the first few
  cards, then switch to co-occurrence as soon as there are >=3 likes.

---

## 7. Ingestion pipeline (one-time bootstrap + ongoing)

**Bootstrap (MPD):** a Node/Python script reads the 1,000 MPD slice files and bulk-inserts into
`tracks` / `playlists` / `playlist_tracks` using Postgres `COPY` (not row-by-row inserts - COPY loads
66M rows in a reasonable window). Runs once, offline, on your machine or a cheap worker. Album art is
NOT in MPD, so leave `album_image` null and hydrate lazily from Spotify when a track is about to be
shown.

**Ongoing crawl:** a scheduled worker (cron) that searches public playlists by rotating theme keywords,
reads their tracklists (the endpoint that works), and upserts into the same tables. Rate-limited and
off the user's critical path, so it never affects swipe latency.

---

## 8. Cost / scale sanity check

- `playlist_tracks` ~ 66M rows. With the two btree indexes this is a few GB - comfortably inside
  Supabase paid tiers; testable on free tier with a subset (e.g. load 50k playlists first).
- Co-occurrence query against indexed 66M rows for ~7 liked tracks touches a bounded slice; expect
  tens of ms with proper indexes. Add the materialized `track_cooccurrence` table only if profiling
  says so.
- Swipe sessions hit our DB (cheap, owned) instead of Spotify (rate-limited, external). This is the
  whole point.

---

## 9. Build order (incremental, each step verifiable)

1. **Spin up Supabase**, create the 3 tables + indexes.
2. **Load a SUBSET** of MPD (e.g. 20k playlists) via COPY - enough to validate the query end-to-end
   without waiting on 66M rows.
3. **Write `/api/reco/cooccur`** and unit-test the SQL with a known liked-set (verify John->Michael
   behavior by hand on real data).
4. **Swap `playlistCoOccurrence()`** in the engine to call it; keep the old path as cold-start fallback.
5. **Measure:** swipe a session, confirm Spotify call count drops and recs feel like "songs that belong
   together," not "songs by the same artist."
6. **Full MPD load + scheduled crawler** once the loop feels right.
7. **Resolve MPD licensing** before any paid launch (replace with owned crawl corpus if needed).

---

## 10. Open decisions for Abid

- **Supabase vs self-hosted Postgres?** (Recommend Supabase to start - fits budget + setup speed.)
- **Where does the crawler/worker run?** (Supabase Edge Function on a cron, a tiny Fly.io/Railway
  worker, or your machine for now.)
- **MPD as permanent corpus vs bootstrap-only** - tied to the licensing question.
- **Ingest language:** Python (pandas + psycopg COPY) vs Node. Either works; Python is slightly comfier
  for the one-time 66M-row munge.
