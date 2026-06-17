-- "Force-a-song" social shares — the viral loop.

create table if not exists public.shared_songs (
  code         text primary key,
  track        jsonb not null,
  sender_name  text,
  note         text,
  opens        int  not null default 0,
  created_at   timestamptz not null default now()
);

alter table public.shared_songs enable row level security;

create or replace function public.increment_share_opens(share_code text)
returns void
language sql
volatile
set search_path = ''
as $$
  update public.shared_songs set opens = opens + 1 where code = share_code;
$$;
