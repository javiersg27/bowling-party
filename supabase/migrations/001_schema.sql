-- Bowling Party · esquema PostgreSQL
create extension if not exists "pgcrypto";

do $$ begin
  create type public.tournament_status as enum (
    'draft','registration','ready','round_1','round_2','round_3','finished','archived','paused','cancelled'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.member_role as enum ('player','admin','lane_marshal');
exception when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Jugador',
  avatar text not null default '🎳',
  is_platform_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  date date,
  access_code text not null unique,
  status public.tournament_status not null default 'draft',
  paused_from public.tournament_status,
  created_by uuid not null references public.profiles(id),
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tournament_members (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.member_role not null default 'player',
  created_at timestamptz not null default now(),
  unique (tournament_id, user_id)
);

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  name text not null,
  color text not null,
  accent text not null default '#fff',
  sort_order int not null default 0,
  unique (tournament_id, name)
);

create table if not exists public.lanes (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  name text not null,
  number int not null,
  marshal_id uuid references public.profiles(id),
  unique (tournament_id, number)
);

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  team_id uuid not null references public.teams(id),
  display_name text not null,
  avatar text not null,
  banned boolean not null default false,
  created_at timestamptz not null default now(),
  unique (tournament_id, user_id),
  unique (tournament_id, display_name)
);

create table if not exists public.rounds (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  kind smallint not null check (kind between 1 and 3),
  status text not null default 'pending' check (status in ('pending','live','completed')),
  modifiers_frozen jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  unique (tournament_id, kind)
);

create table if not exists public.round_lane_assignments (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.rounds(id) on delete cascade,
  lane_id uuid not null references public.lanes(id),
  player_id uuid not null references public.players(id),
  sort_order int not null default 0,
  unique (round_id, player_id)
);

create table if not exists public.player_games (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.rounds(id) on delete cascade,
  player_id uuid not null references public.players(id),
  lane_id uuid not null references public.lanes(id),
  rolls int[] not null default '{}',
  official int not null default 0,
  bonus int not null default 0,
  total int not null default 0,
  current_frame int not null default 1,
  complete boolean not null default false,
  score_status text not null default 'pending' check (score_status in ('pending','confirmed','corrected')),
  version int not null default 0,
  unique (round_id, player_id)
);

create table if not exists public.rolls (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.player_games(id) on delete cascade,
  seq int not null,
  pins int not null check (pins between 0 and 10),
  actor_id uuid not null references public.profiles(id),
  idempotency_key text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.modifier_definitions (
  id text primary key,
  name text not null,
  rarity text not null,
  payload jsonb not null default '{}'::jsonb
);

create table if not exists public.tournament_modifiers (
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  modifier_id text not null references public.modifier_definitions(id),
  enabled boolean not null default true,
  primary key (tournament_id, modifier_id)
);

create table if not exists public.player_inventory (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  round_id uuid not null references public.rounds(id) on delete cascade,
  modifier_id text not null references public.modifier_definitions(id),
  status text not null default 'held' check (status in ('held','activated','discarded','expired','waiting_choice')),
  granted_frame int not null,
  granted_at timestamptz not null default now(),
  choice_ids text[]
);

create table if not exists public.modifier_activations (
  id uuid primary key default gen_random_uuid(),
  inventory_id uuid not null references public.player_inventory(id),
  modifier_id text not null,
  actor_id uuid not null references public.players(id),
  target_id uuid references public.players(id),
  round_id uuid not null references public.rounds(id),
  frame int not null,
  payload jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  status text not null,
  idempotency_key text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.score_adjustments (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.player_games(id) on delete cascade,
  delta int not null,
  reason text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.active_effects (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  round_id uuid not null references public.rounds(id) on delete cascade,
  kind text not null,
  remaining_frames int not null,
  data jsonb not null default '{}'::jsonb
);

create table if not exists public.final_groups (
  tournament_id uuid primary key references public.tournaments(id) on delete cascade,
  upper uuid[] not null default '{}',
  lower uuid[] not null default '{}',
  note text not null default ''
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  actor_id uuid,
  action text not null,
  detail text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.game_events (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  type text not null,
  message text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_players_tournament on public.players(tournament_id);
create index if not exists idx_games_round on public.player_games(round_id);
create index if not exists idx_events_tournament on public.game_events(tournament_id, created_at desc);
create index if not exists idx_assignments_round on public.round_lane_assignments(round_id);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists trg_tournaments_updated on public.tournaments;
create trigger trg_tournaments_updated before update on public.tournaments
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name','Jugador'))
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();
