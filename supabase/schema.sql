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
  is_favorite     boolean not null default false,
  is_house_plant  boolean not null default false,
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

create table if not exists friendships (
  user_id         uuid references auth.users(id) on delete cascade not null,
  friend_user_id  uuid references auth.users(id) on delete cascade not null,
  created_at      timestamptz not null default now(),
  primary key (user_id, friend_user_id),
  check (user_id <> friend_user_id)
);

alter table observations add column if not exists zip_code text;
alter table observations add column if not exists is_favorite boolean not null default false;
alter table observations add column if not exists is_house_plant boolean not null default false;
alter table profiles add column if not exists profile_photo_url text;
alter table profiles add column if not exists home_zip_code text;
alter table profiles add column if not exists facebook_url text;
alter table profiles add column if not exists is_public boolean not null default false;
alter table profiles add column if not exists updated_at timestamptz not null default now();

create unique index if not exists profiles_display_name_lower_unique_idx
  on profiles (lower(display_name));

update profiles
set updated_at = now()
where updated_at is null;

create or replace function public.find_profile_by_display_name(target_display_name text)
returns table (
  user_id uuid,
  display_name text,
  profile_photo_url text,
  is_public boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    p.user_id,
    p.display_name,
    p.profile_photo_url,
    p.is_public,
    p.created_at,
    p.updated_at
  from profiles as p
  where auth.uid() is not null
    and lower(p.display_name) = lower(btrim(target_display_name))
  limit 1
$$;

revoke all on function public.find_profile_by_display_name(text) from public;
grant execute on function public.find_profile_by_display_name(text) to authenticated, service_role;

create or replace function public.search_profiles_by_display_name(
  target_query text,
  result_limit integer default 5
)
returns table (
  user_id uuid,
  display_name text,
  profile_photo_url text,
  is_public boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  with normalized as (
    select lower(btrim(target_query)) as query
  )
  select
    p.user_id,
    p.display_name,
    p.profile_photo_url,
    p.is_public,
    p.created_at,
    p.updated_at
  from profiles as p
  cross join normalized
  where auth.uid() is not null
    and normalized.query <> ''
    and p.user_id <> auth.uid()
    and lower(p.display_name) like '%' || normalized.query || '%'
  order by
    case
      when lower(p.display_name) = normalized.query then 0
      when lower(p.display_name) like normalized.query || '%' then 1
      else 2
    end,
    position(normalized.query in lower(p.display_name)),
    abs(char_length(lower(p.display_name)) - char_length(normalized.query)),
    lower(p.display_name)
  limit greatest(1, least(coalesce(result_limit, 5), 5))
$$;

revoke all on function public.search_profiles_by_display_name(text, integer) from public;
grant execute on function public.search_profiles_by_display_name(text, integer) to authenticated, service_role;

create or replace function public.get_mutual_friend_stats()
returns table (
  user_id uuid,
  display_name text,
  profile_photo_url text,
  home_zip_code text,
  facebook_url text,
  is_public boolean,
  is_placeholder boolean,
  created_at timestamptz,
  updated_at timestamptz,
  observation_count integer,
  species_count integer
)
language sql
security definer
set search_path = public
as $$
  with mutual_friend_ids as (
    select distinct
      case
        when sent.user_id = auth.uid() then sent.friend_user_id
        else sent.user_id
      end as friend_user_id
    from friendships as sent
    join friendships as received
      on sent.user_id = received.friend_user_id
     and sent.friend_user_id = received.user_id
    where auth.uid() is not null
      and (sent.user_id = auth.uid() or sent.friend_user_id = auth.uid())
  ),
  observation_stats as (
    select
      o.user_id,
      count(*)::integer as observation_count,
      count(
        distinct lower(
          coalesce(
            nullif(btrim(o.species), ''),
            nullif(btrim(o.scientific_name), '')
          )
        )
      )::integer as species_count
    from observations as o
    group by o.user_id
  )
  select
    m.friend_user_id as user_id,
    coalesce(p.display_name, 'Friend ' || left(replace(m.friend_user_id::text, '-', ''), 8)) as display_name,
    p.profile_photo_url,
    p.home_zip_code,
    p.facebook_url,
    coalesce(p.is_public, false) as is_public,
    (p.user_id is null) as is_placeholder,
    coalesce(p.created_at, now()) as created_at,
    coalesce(p.updated_at, now()) as updated_at,
    coalesce(os.observation_count, 0)::integer as observation_count,
    coalesce(os.species_count, 0)::integer as species_count
  from mutual_friend_ids as m
  left join profiles as p
    on p.user_id = m.friend_user_id
  left join observation_stats as os
    on os.user_id = m.friend_user_id
  order by
    coalesce(os.species_count, 0) desc,
    coalesce(os.observation_count, 0) desc,
    lower(coalesce(p.display_name, 'Friend ' || left(replace(m.friend_user_id::text, '-', ''), 8)))
$$;

revoke all on function public.get_mutual_friend_stats() from public;
grant execute on function public.get_mutual_friend_stats() to authenticated, service_role;

alter table observations enable row level security;
alter table profiles enable row level security;
alter table friendships enable row level security;

create policy "Users can view own observations"
  on observations for select using (auth.uid() = user_id);
create policy "Users can insert own observations"
  on observations for insert with check (auth.uid() = user_id);
create policy "Users can delete own observations"
  on observations for delete using (auth.uid() = user_id);
create policy "Users can update own observations"
  on observations for update using (auth.uid() = user_id);

create policy "Users can view own profile"
  on profiles for select using (auth.uid() = user_id);
create policy "Anyone can view public profiles"
  on profiles for select using (is_public = true);
create policy "Users can view mutual friend profiles"
  on profiles for select using (
    exists (
      select 1
      from friendships as sent
      join friendships as received
        on sent.friend_user_id = received.user_id
       and sent.user_id = received.friend_user_id
      where sent.user_id = auth.uid()
        and sent.friend_user_id = profiles.user_id
    )
  );
create policy "Users can insert own profile"
  on profiles for insert with check (auth.uid() = user_id);
create policy "Users can update own profile"
  on profiles for update using (auth.uid() = user_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base_display_name text := coalesce(
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'PlantDex user'
  );
  next_display_name text := base_display_name;
begin
  if exists (
    select 1
    from profiles
    where lower(display_name) = lower(base_display_name)
  ) then
    next_display_name := base_display_name || '-' || left(replace(new.id::text, '-', ''), 6);
  end if;

  insert into profiles (user_id, display_name)
  values (new.id, next_display_name)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create policy "Users can view own friendship edges"
  on friendships for select using (auth.uid() = user_id or auth.uid() = friend_user_id);
create policy "Users can insert own friendship edges"
  on friendships for insert with check (auth.uid() = user_id);
create policy "Users can delete own friendship edges"
  on friendships for delete using (auth.uid() = user_id);

create or replace function public.reject_friend_request(requester_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from friendships
  where user_id = requester_user_id
    and friend_user_id = auth.uid();
end;
$$;

revoke all on function public.reject_friend_request(uuid) from public;
grant execute on function public.reject_friend_request(uuid) to authenticated, service_role;

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
