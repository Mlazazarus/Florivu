create extension if not exists "pgcrypto";

drop trigger if exists discussion_reply_touch_thread on discussion_replies;
drop function if exists public.touch_discussion_thread_on_reply();
drop table if exists discussion_replies;
drop table if exists discussion_threads;
drop table if exists discussion_boards;

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
  catalog_plant_id text,
  care_profile_id  text,
  created_at      timestamptz not null default now()
);

create table if not exists profiles (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  display_name       text not null,
  account_tier       text not null default 'free' constraint profiles_account_tier_check check (account_tier in ('free', 'plus')),
  profile_photo_url  text,
  home_zip_code      text,
  marketplace_zip_code text,
  facebook_url       text,
  facebook_user_id   text,
  facebook_name      text,
  facebook_connected_at timestamptz,
  earned_achievement_ids text[] not null default '{}',
  referred_by_user_id uuid references auth.users(id) on delete set null,
  selected_avatar_border_id text,
  selected_profile_title_id text,
  featured_house_plant_observation_id uuid references observations(id) on delete set null,
  featured_non_house_plant_observation_id uuid references observations(id) on delete set null,
  care_alerts_enabled boolean not null default false,
  care_alert_email text,
  care_alert_timezone text,
  care_alert_last_sent_at timestamptz,
  is_public          boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table if not exists care_task_schedules (
  id                uuid primary key default gen_random_uuid(),
  observation_id    uuid references observations(id) on delete cascade not null,
  user_id           uuid references auth.users(id) on delete cascade not null,
  task_key          text not null,
  title             text not null,
  instructions      text not null,
  cadence_days      integer not null check (cadence_days > 0),
  sort_order        integer not null default 0,
  source            text not null default 'bundled',
  last_completed_at timestamptz,
  next_due_at       timestamptz not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (observation_id, task_key)
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
alter table observations add column if not exists catalog_plant_id text;
alter table observations add column if not exists care_profile_id text;
alter table profiles add column if not exists profile_photo_url text;
alter table profiles add column if not exists account_tier text;
alter table profiles add column if not exists home_zip_code text;
alter table profiles add column if not exists marketplace_zip_code text;
alter table profiles add column if not exists facebook_url text;
alter table profiles add column if not exists facebook_user_id text;
alter table profiles add column if not exists facebook_name text;
alter table profiles add column if not exists facebook_connected_at timestamptz;
alter table profiles add column if not exists earned_achievement_ids text[] not null default '{}';
alter table profiles add column if not exists referred_by_user_id uuid references auth.users(id) on delete set null;
alter table profiles add column if not exists selected_avatar_border_id text;
alter table profiles add column if not exists selected_profile_title_id text;
alter table profiles add column if not exists featured_house_plant_observation_id uuid references observations(id) on delete set null;
alter table profiles add column if not exists featured_non_house_plant_observation_id uuid references observations(id) on delete set null;
alter table profiles add column if not exists care_alerts_enabled boolean not null default false;
alter table profiles add column if not exists care_alert_email text;
alter table profiles add column if not exists care_alert_timezone text;
alter table profiles add column if not exists care_alert_last_sent_at timestamptz;
alter table profiles add column if not exists is_public boolean not null default false;
alter table profiles add column if not exists updated_at timestamptz not null default now();
alter table profiles alter column account_tier set default 'free';
alter table care_task_schedules add column if not exists sort_order integer not null default 0;
alter table care_task_schedules add column if not exists source text not null default 'bundled';
alter table care_task_schedules add column if not exists last_completed_at timestamptz;
alter table care_task_schedules add column if not exists updated_at timestamptz not null default now();

create unique index if not exists profiles_display_name_lower_unique_idx
  on profiles (lower(display_name));
create index if not exists care_task_schedules_user_due_idx
  on care_task_schedules (user_id, next_due_at asc);

update profiles
set updated_at = now()
where updated_at is null;

update profiles
set account_tier = 'free'
where account_tier is null or account_tier not in ('free', 'plus');

update profiles
set care_alerts_enabled = false
where care_alerts_enabled is null;

update profiles
set care_alert_email = nullif(care_alert_email, '')
where care_alert_email = '';

update profiles
set care_alert_timezone = 'UTC'
where care_alert_timezone is null;

alter table profiles alter column account_tier set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_account_tier_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table profiles
      add constraint profiles_account_tier_check
      check (account_tier in ('free', 'plus'));
  end if;
end;
$$;

update care_task_schedules
set updated_at = coalesce(updated_at, created_at, now())
where updated_at is null;

delete from care_task_schedules
where task_key = 'rotate';

create or replace function public.find_profile_by_display_name(target_display_name text)
returns table (
  user_id uuid,
  display_name text,
  account_tier text,
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
    p.account_tier,
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
  account_tier text,
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
    p.account_tier,
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
  account_tier text,
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
    coalesce(p.account_tier, 'free') as account_tier,
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

create or replace function public.get_completed_friend_referral_count()
returns integer
language sql
security definer
set search_path = public
as $$
  select count(*)::integer
  from profiles as p
  where auth.uid() is not null
    and p.referred_by_user_id = auth.uid()
    and exists (
      select 1
      from friendships as sent
      where sent.user_id = auth.uid()
        and sent.friend_user_id = p.user_id
    )
    and exists (
      select 1
      from friendships as received
      where received.user_id = p.user_id
        and received.friend_user_id = auth.uid()
    )
$$;

revoke all on function public.get_completed_friend_referral_count() from public;
grant execute on function public.get_completed_friend_referral_count() to authenticated, service_role;

create or replace function public.handle_referred_profile_friend_invite()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.referred_by_user_id is not null and new.referred_by_user_id <> new.user_id then
    insert into friendships (user_id, friend_user_id)
    values (new.referred_by_user_id, new.user_id)
    on conflict (user_id, friend_user_id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists on_profile_referral_saved on profiles;
create trigger on_profile_referral_saved
after insert or update of referred_by_user_id on profiles
for each row execute function public.handle_referred_profile_friend_invite();

create or replace function public.enforce_daily_discovery_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  next_account_tier text := 'free';
  discovery_day date := timezone('utc', coalesce(new.created_at, new.date_found, now()))::date;
  discovery_count integer := 0;
begin
  select coalesce(p.account_tier, 'free')
    into next_account_tier
  from profiles as p
  where p.user_id = new.user_id;

  if next_account_tier = 'plus' then
    return new;
  end if;

  select count(*)::integer
    into discovery_count
  from observations as o
  where o.user_id = new.user_id
    and timezone('utc', coalesce(o.created_at, o.date_found, now()))::date = discovery_day;

  if discovery_count >= 10 then
    raise exception 'Free accounts can save up to 10 plant discoveries per day. Upgrade to Plus for unlimited discoveries.';
  end if;

  return new;
end;
$$;

drop trigger if exists on_observation_before_insert_enforce_daily_discovery_limit on observations;
create trigger on_observation_before_insert_enforce_daily_discovery_limit
before insert on observations
for each row execute function public.enforce_daily_discovery_limit();

alter table observations enable row level security;
alter table profiles enable row level security;
alter table friendships enable row level security;
alter table care_task_schedules enable row level security;

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

create policy "Users can view own care tasks"
  on care_task_schedules for select using (auth.uid() = user_id);
create policy "Users can insert own care tasks"
  on care_task_schedules for insert with check (auth.uid() = user_id);
create policy "Users can update own care tasks"
  on care_task_schedules for update using (auth.uid() = user_id);
create policy "Users can delete own care tasks"
  on care_task_schedules for delete using (auth.uid() = user_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base_display_name text := coalesce(
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Florivu user'
  );
  next_display_name text := base_display_name;
  raw_referred_by_user_id text := nullif(
    btrim(coalesce(new.raw_user_meta_data ->> 'referred_by_user_id', '')),
    ''
  );
  next_referred_by_user_id uuid := case
    when raw_referred_by_user_id is not null
      and raw_referred_by_user_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      and raw_referred_by_user_id <> new.id::text
    then raw_referred_by_user_id::uuid
    else null
  end;
begin
  if exists (
    select 1
    from profiles
    where lower(display_name) = lower(base_display_name)
  ) then
    next_display_name := base_display_name || '-' || left(replace(new.id::text, '-', ''), 6);
  end if;

  insert into profiles (user_id, display_name, referred_by_user_id, account_tier)
  values (new.id, next_display_name, next_referred_by_user_id, 'free')
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
