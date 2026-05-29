-- Apply this in Supabase before using persistent platform batch reordering.
-- It adds a per-platform display order for rows in plant_locations.

begin;

alter table public.plant_locations
  add column if not exists sort_order integer not null default 0;

with ranked_locations as (
  select
    id,
    row_number() over (
      partition by platform_id
      order by planted_date nulls last, id
    ) - 1 as next_sort_order
  from public.plant_locations
)
update public.plant_locations as plant_locations
set sort_order = ranked_locations.next_sort_order
from ranked_locations
where plant_locations.id = ranked_locations.id;

create index if not exists plant_locations_platform_sort_order_idx
  on public.plant_locations (platform_id, sort_order);

commit;
