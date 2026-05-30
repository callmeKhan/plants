-- Apply this in Supabase before using persistent batch color markers.
-- White is the default/reset marker; yellow and red highlight platform cards.

begin;

alter table public.plant_locations
  add column if not exists color text not null default 'white';

alter table public.plant_locations
  drop constraint if exists plant_locations_color_check;

alter table public.plant_locations
  add constraint plant_locations_color_check
  check (color in ('white', 'yellow', 'red'));

commit;
