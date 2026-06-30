-- Apply this in Supabase before using per-plant notes and independent plant images.
-- R2 stores the image bytes; Supabase stores notes plus public image metadata.

begin;

create table if not exists public.plant_notes (
  id text primary key,
  plant_id text not null references public.plants(id) on delete cascade,
  content text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.plant_note_images (
  id text primary key,
  plant_id text not null references public.plants(id) on delete cascade,
  image_url text not null,
  object_key text not null,
  content_type text not null check (content_type in ('image/jpeg', 'image/png', 'image/webp')),
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  size_bytes integer check (size_bytes is null or size_bytes > 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (object_key)
);

create index if not exists plant_notes_plant_created_at_idx
  on public.plant_notes (plant_id, created_at desc);

create index if not exists plant_note_images_plant_created_at_idx
  on public.plant_note_images (plant_id, created_at desc);

create index if not exists plant_note_images_plant_sort_order_idx
  on public.plant_note_images (plant_id, sort_order, created_at);

-- Migration for existing DBs that created images as note-owned rows.
alter table public.plant_note_images
  drop constraint if exists plant_note_images_note_id_fkey;

drop index if exists public.plant_note_images_note_sort_order_idx;

alter table public.plant_note_images
  drop column if exists note_id;

create or replace function public.touch_plant_notes_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_plant_notes_updated_at on public.plant_notes;

create trigger touch_plant_notes_updated_at
before update on public.plant_notes
for each row
execute function public.touch_plant_notes_updated_at();

commit;
