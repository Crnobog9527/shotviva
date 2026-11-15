-- The vessel library of the food templates' tableware toggle (ARCHITECTURE §5.1c「器皿图库」):
-- empty serving pieces sorted by dish shape, each with a one-line generic shape description that
-- goes into the image prompt. Images live in the private bucket under dishware/ (the key carries
-- the row id and a content hash). Private: RLS on, no policy, service role only; written only
-- through admin_save_dishware / admin_delete_dishware (1563).
create table public.dishware_library (
  id uuid primary key,
  label text not null
    constraint dishware_library_label_check check (char_length(label) between 1 and 40 and label = btrim(label)),
  category text not null
    constraint dishware_library_category_check check (category in ('long', 'soup_stew', 'stir_fry', 'dim_sum', 'cold', 'noodle_rice')),
  shape text not null
    constraint dishware_library_shape_check check (char_length(shape) between 1 and 200 and shape = btrim(shape)),
  image_key text not null
    constraint dishware_library_image_key_check check (image_key ~ '^dishware/[0-9a-f-]{36}-[0-9a-f]{16}\.webp$'),
  width integer not null constraint dishware_library_width_check check (width > 0),
  height integer not null constraint dishware_library_height_check check (height > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

create unique index dishware_library_image_key_key on public.dishware_library (image_key);

create trigger dishware_library_set_updated_at
  before update on public.dishware_library
  for each row execute function public.set_updated_at();

alter table public.dishware_library enable row level security;
revoke all on public.dishware_library from anon, authenticated;
grant all on public.dishware_library to service_role;
