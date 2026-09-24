-- Early-access waitlist (public signups from the landing/share pages).
create table if not exists public.waitlist (
  id         uuid primary key default gen_random_uuid(),
  email      text not null unique,
  source     text,
  created_at timestamptz not null default now()
);
alter table public.waitlist enable row level security;
