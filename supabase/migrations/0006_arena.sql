-- The Arena — public vibe rooms where anyone judges drops.
-- vibes = rooms, drops = song submissions, drop_votes = 🔥/🤢 (anon-capable).

create table if not exists public.vibes (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,
  name       text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.drops (
  id         uuid primary key default gen_random_uuid(),
  vibe_id    uuid not null references public.vibes(id) on delete cascade,
  track      jsonb not null,
  note       text,
  dropped_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_drops_vibe on public.drops (vibe_id, created_at desc);
create unique index if not exists idx_drops_vibe_track
  on public.drops (vibe_id, (track->>'spotifyUrl'));

create table if not exists public.drop_votes (
  drop_id    uuid not null references public.drops(id) on delete cascade,
  voter_key  text not null,
  value      smallint not null check (value in (1,-1)),
  created_at timestamptz not null default now(),
  primary key (drop_id, voter_key)
);
create index if not exists idx_votes_drop on public.drop_votes (drop_id);

alter table public.vibes      enable row level security;
alter table public.drops      enable row level security;
alter table public.drop_votes enable row level security;

insert into public.vibes (slug, name) values
  ('late-night-drive','late night drive'),
  ('gym-rage','gym rage'),
  ('heartbreak-hours','heartbreak hours'),
  ('main-character','main character'),
  ('sunday-reset','sunday reset'),
  ('villain-era','villain era'),
  ('pregame-heat','pregame heat'),
  ('3am-thoughts','3am thoughts')
on conflict (slug) do nothing;
