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

alter table observations add column if not exists zip_code text;

alter table observations enable row level security;

create policy "Users can view own observations"
  on observations for select using (auth.uid() = user_id);
create policy "Users can insert own observations"
  on observations for insert with check (auth.uid() = user_id);
create policy "Users can delete own observations"
  on observations for delete using (auth.uid() = user_id);

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
