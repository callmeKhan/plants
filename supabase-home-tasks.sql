-- Apply this in Supabase before using the home to-do list.

begin;

create table if not exists public.home_tasks (
  id text primary key,
  content text not null default '',
  done boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists home_tasks_done_sort_order_idx
  on public.home_tasks (done, sort_order, created_at);

create or replace function public.touch_home_tasks_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_home_tasks_updated_at on public.home_tasks;

create trigger touch_home_tasks_updated_at
before update on public.home_tasks
for each row
execute function public.touch_home_tasks_updated_at();

commit;
