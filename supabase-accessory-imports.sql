-- Apply this in Supabase before using the accessory inventory page.

begin;

create table if not exists public.accessory_imports (
  id text primary key,
  name text not null,
  unit_cost numeric(12, 2) not null default 0,
  imported_date date not null default current_date,
  quantity numeric(12, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint accessory_imports_unit_cost_non_negative check (unit_cost >= 0),
  constraint accessory_imports_quantity_positive check (quantity > 0)
);

create index if not exists accessory_imports_imported_date_idx
  on public.accessory_imports (imported_date desc, created_at desc);

create index if not exists accessory_imports_name_idx
  on public.accessory_imports (name);

create or replace function public.touch_accessory_imports_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_accessory_imports_updated_at on public.accessory_imports;

create trigger touch_accessory_imports_updated_at
before update on public.accessory_imports
for each row
execute function public.touch_accessory_imports_updated_at();

commit;
