-- vibeswipe corpus schema — playlist co-occurrence engine
-- See docs/DB_INTEGRATION_PLAN.md for rationale.

-- ────────────────────────────────────────────────────────────
-- Tables
-- ────────────────────────────────────────────────────────────

-- Unique tracks seen across the corpus (dedup by Spotify track id)
create table if not exists public.tracks (
  id           text primary key,          -- spotify track id (base62)
  name         text not null,
  artist_name  text not null,
  artist_id    text,
  album_name   text,
  album_image  text,                      -- cached art url (nullable; hydrate lazily)
  popularity   int,
  inserted_at  timestamptz not null default now()
);

-- Playlists in the corpus (MPD bootstrap + ongoing crawl)
create table if not exists public.playlists (
  id           text primary key,          -- 'mpd:<pid>' for MPD, spotify id for crawl
  name         text,
  source       text not null,             -- 'mpd' | 'crawl'
  track_count  int,
  inserted_at  timestamptz not null default now()
);

-- THE INVERTED INDEX: one row per (playlist, track) membership.
-- Powers the entire co-occurrence engine.
create table if not exists public.playlist_tracks (
  playlist_id  text not null references public.playlists(id) on delete cascade,
  track_id     text not null references public.tracks(id)    on delete cascade,
  position     int,
  primary key (playlist_id, track_id)
);

-- ────────────────────────────────────────────────────────────
-- Indexes (the critical ones for co-occurrence)
-- ────────────────────────────────────────────────────────────
-- "give me every playlist containing track X" — must be instant
create index if not exists idx_pt_track    on public.playlist_tracks (track_id);
-- reverse: fetch a playlist's contents
create index if not exists idx_pt_playlist on public.playlist_tracks (playlist_id);

-- ────────────────────────────────────────────────────────────
-- RLS — corpus is read-only reference data, not user data.
-- Enable RLS on all tables (required for any table in the public schema).
-- No public policies: the corpus is reached only via the server-side
-- service role (which bypasses RLS), never directly from the browser.
-- ────────────────────────────────────────────────────────────
alter table public.tracks          enable row level security;
alter table public.playlists       enable row level security;
alter table public.playlist_tracks enable row level security;

-- ────────────────────────────────────────────────────────────
-- Co-occurrence recommendation function
-- Given the user's liked track ids, return tracks that co-occur with
-- them most across the corpus. Weighted by overlap depth and
-- down-weighted for giant catch-all playlists (TF-IDF-style).
-- ────────────────────────────────────────────────────────────
create or replace function public.cooccur_recommend(
  liked_ids  text[],
  seen_ids   text[]  default '{}',
  max_results int     default 50
)
returns table (
  track_id          text,
  shared_playlists  bigint,
  score             numeric
)
language sql
stable
set search_path = ''
as $$
  with hit_playlists as (
    select pt.playlist_id,
           count(*)                    as overlap,
           coalesce(pl.track_count, 1) as plsize
    from   public.playlist_tracks pt
    join   public.playlists pl on pl.id = pt.playlist_id
    where  pt.track_id = any(liked_ids)
    group  by pt.playlist_id, pl.track_count
  )
  select pt2.track_id,
         count(distinct pt2.playlist_id) as shared_playlists,
         sum( hp.overlap::numeric / sqrt(hp.plsize::numeric) ) as score
  from   hit_playlists hp
  join   public.playlist_tracks pt2 on pt2.playlist_id = hp.playlist_id
  where  pt2.track_id <> all(liked_ids)
    and  pt2.track_id <> all(seen_ids)
  group  by pt2.track_id
  order  by score desc, shared_playlists desc
  limit  max_results;
$$;
