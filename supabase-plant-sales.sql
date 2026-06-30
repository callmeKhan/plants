-- Apply this in Supabase before using per-plant sale history.
-- It stores each confirmed sale quantity by plant with a database timestamp.

create table if not exists public.plant_sales (
  id text primary key,
  plant_id text not null references public.plants(id) on delete cascade,
  quantity numeric not null check (quantity > 0),
  created_at timestamptz not null default now()
);

create index if not exists plant_sales_plant_created_at_idx
  on public.plant_sales (plant_id, created_at desc);
