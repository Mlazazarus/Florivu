create extension if not exists "pgcrypto";

create table if not exists observations (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users(id) on delete cascade not null,
  photo_url       text not null,
  common_name     text not null,
  scientific_name text not null,
  family          text not null,
  genus           text not null,
  species         text not null,
  confidence      numeric not null,
  date_found      timestamptz not null default now(),
  zip_code        text,
  notes           text,
  created_at      timestamptz not null default now()
);

create table if not exists profiles (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  display_name       text not null,
  profile_photo_url  text,
  home_zip_code      text,
  facebook_url       text,
  is_public          boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table observations add column if not exists zip_code text;
alter table profiles add column if not exists profile_photo_url text;
alter table profiles add column if not exists home_zip_code text;
alter table profiles add column if not exists facebook_url text;
alter table profiles add column if not exists is_public boolean not null default false;
alter table profiles add column if not exists updated_at timestamptz not null default now();

update profiles
set updated_at = now()
where updated_at is null;

alter table observations enable row level security;
alter table profiles enable row level security;

create policy "Users can view own observations"
  on observations for select using (auth.uid() = user_id);
create policy "Users can insert own observations"
  on observations for insert with check (auth.uid() = user_id);
create policy "Users can delete own observations"
  on observations for delete using (auth.uid() = user_id);

create policy "Users can view own profile"
  on profiles for select using (auth.uid() = user_id);
create policy "Anyone can view public profiles"
  on profiles for select using (is_public = true);
create policy "Users can insert own profile"
  on profiles for insert with check (auth.uid() = user_id);
create policy "Users can update own profile"
  on profiles for update using (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values ('plant-photos', 'plant-photos', true) on conflict do nothing;

create policy "Anyone can view plant photos"
  on storage.objects for select using (bucket_id = 'plant-photos');
create policy "Authenticated users can upload plant photos"
  on storage.objects for insert
  with check (bucket_id = 'plant-photos' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "Users can delete own plant photos"
  on storage.objects for delete
  using (bucket_id = 'plant-photos' and auth.uid()::text = (storage.foldername(name))[1]);
