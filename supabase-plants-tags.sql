-- Apply this in Supabase before using plant tags.

begin;

alter table public.plants
  add column if not exists tags text[] not null default '{}';

commit;
