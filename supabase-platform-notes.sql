-- Apply this in Supabase before using per-platform notes.

begin;

create table if not exists public.platform_notes (
  id text primary key,
  platform_id text not null references public.platforms(id) on delete cascade,
  content text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists platform_notes_platform_created_at_idx
  on public.platform_notes (platform_id, created_at desc);

create or replace function public.touch_platform_notes_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_platform_notes_updated_at on public.platform_notes;

create trigger touch_platform_notes_updated_at
before update on public.platform_notes
for each row
execute function public.touch_platform_notes_updated_at();

commit;
