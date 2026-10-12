-- Bowling Party · Row Level Security (RLS)
-- Migración 002. NO edita el esquema de 001; solo añade políticas de seguridad.
--
-- Modelo de permisos (con la clave ANON/pública en el cliente):
--  * profiles: cada usuario gestiona solo su perfil.
--  * tournaments: lectura para miembros; el resto puede "descubrir" por access_code
--    mediante la función segura lookup_tournament_by_code (evita enumerar la tabla).
--  * tournament_members: fuente de roles (player/admin/lane_marshal).
--  * equipos, pistas, jugadores, rondas, asignaciones, juegos, inventario,
--    activaciones, efectos, eventos, auditoría: gobernados por pertenencia al torneo
--    y, para escritura, por rol admin/lane_marshal.
--  * score_adjustments y final_groups: solo dirección (admin).
--
-- Todas las comprobaciones usan funciones SECURITY DEFINER para evitar la recursión
-- infinita de RLS sobre tournament_members.

-- ---------------------------------------------------------------------------
-- 1. Funciones helper de pertenencia (security definer → sin recursión de RLS)
-- ---------------------------------------------------------------------------

create or replace function public.is_tournament_member(tid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.tournament_members m
    where m.tournament_id = tid and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_tournament_admin(tid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.tournament_members m
    where m.tournament_id = tid
      and m.user_id = auth.uid()
      and m.role in ('admin', 'lane_marshal')
  );
$$;

-- Descubrir un torneo por su código sin exponer el listado completo.
create or replace function public.lookup_tournament_by_code(code text)
returns setof public.tournaments
language sql
security definer
set search_path = public
stable
as $$
  select * from public.tournaments where access_code = upper(code);
$$;

-- Devuelve el torneo y sus equipos para poder UNIRSE sin ser aún miembro.
-- RLS impide leer `teams` sin membresía (y `joinTournament` necesita los equipos
-- localmente), así que esta función SECURITY DEFINER los entrega de forma segura,
-- acotada exactamente al torneo cuyo código se consulta. Sin coincidencia → null.
create or replace function public.lookup_join_bundle(code text)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'tournament', to_jsonb(t),
    'teams', coalesce(
      (select jsonb_agg(to_jsonb(tm) order by tm.sort_order, tm.name)
         from public.teams tm
        where tm.tournament_id = t.id),
      '[]'::jsonb)
  )
  from public.tournaments t
  where t.access_code = upper(code)
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- 2. Habilitar RLS en todas las tablas
-- ---------------------------------------------------------------------------

alter table public.profiles             enable row level security;
alter table public.tournaments          enable row level security;
alter table public.tournament_members   enable row level security;
alter table public.teams                enable row level security;
alter table public.lanes                enable row level security;
alter table public.players              enable row level security;
alter table public.rounds               enable row level security;
alter table public.round_lane_assignments enable row level security;
alter table public.player_games         enable row level security;
alter table public.player_inventory     enable row level security;
alter table public.modifier_activations enable row level security;
alter table public.score_adjustments    enable row level security;
alter table public.active_effects       enable row level security;
alter table public.final_groups         enable row level security;
alter table public.audit_logs           enable row level security;
alter table public.game_events          enable row level security;


-- ---------------------------------------------------------------------------
-- 3. Políticas: profiles
--    Cada usuario ve/edita su perfil; lectura pública mínima para listar jugadores.
-- ---------------------------------------------------------------------------
drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self on public.profiles
  for select using (id = auth.uid());

drop policy if exists profiles_select_public on public.profiles;
create policy profiles_select_public on public.profiles
  for select using (true);

drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles
  for insert with check (id = auth.uid());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- ---------------------------------------------------------------------------
-- 4. Políticas: tournaments
--    Sin "listar todo": se entra por código (RPC lookup_tournament_by_code) o
--    por membresía. Bootstrapping: el creador puede insertar su torneo y,
--    acto seguido, añadirse a tournament_members como admin (members_insert_self).
-- ---------------------------------------------------------------------------
drop policy if exists tournaments_insert_creator on public.tournaments;
create policy tournaments_insert_creator on public.tournaments
  for insert with check (created_by = auth.uid());

drop policy if exists tournaments_select_member on public.tournaments;
create policy tournaments_select_member on public.tournaments
  for select using (public.is_tournament_member(id));

drop policy if exists tournaments_update_admin on public.tournaments;
create policy tournaments_update_admin on public.tournaments
  for update using (public.is_tournament_admin(id)) with check (public.is_tournament_admin(id));


-- ---------------------------------------------------------------------------
-- 6. Políticas: teams y lanes (lectura por membresía, escritura por admin)
-- ---------------------------------------------------------------------------
drop policy if exists teams_select_member on public.teams;
create policy teams_select_member on public.teams
  for select using (public.is_tournament_member(tournament_id));
drop policy if exists teams_write_admin on public.teams;
create policy teams_write_admin on public.teams
  for all using (public.is_tournament_admin(tournament_id)) with check (public.is_tournament_admin(tournament_id));

drop policy if exists lanes_select_member on public.lanes;
create policy lanes_select_member on public.lanes
  for select using (public.is_tournament_member(tournament_id));
drop policy if exists lanes_write_admin on public.lanes;
create policy lanes_write_admin on public.lanes
  for all using (public.is_tournament_admin(tournament_id)) with check (public.is_tournament_admin(tournament_id));

-- ---------------------------------------------------------------------------
-- 7. Políticas: players
--    Lectura por membresía; un jugador edita su ficha; admin edita todas.
-- ---------------------------------------------------------------------------
drop policy if exists players_select_member on public.players;
create policy players_select_member on public.players
  for select using (public.is_tournament_member(tournament_id));

drop policy if exists players_insert_self on public.players;
create policy players_insert_self on public.players
  for insert with check (user_id = auth.uid() or public.is_tournament_admin(tournament_id));

-- ---------------------------------------------------------------------------
-- 8. Políticas: rounds y round_lane_assignments
-- ---------------------------------------------------------------------------
drop policy if exists rounds_select_member on public.rounds;
create policy rounds_select_member on public.rounds
  for select using (public.is_tournament_member(tournament_id));
drop policy if exists rounds_write_admin on public.rounds;
create policy rounds_write_admin on public.rounds
  for all using (public.is_tournament_admin(tournament_id)) with check (public.is_tournament_admin(tournament_id));

-- Las asignaciones cuelgan de un round; se comprueba pertenencia vía subconsulta.
create or replace function public.round_belongs_to_member(rid uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from public.rounds r
    where r.id = rid and public.is_tournament_member(r.tournament_id)
  );
$$;
create or replace function public.round_belongs_to_admin(rid uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from public.rounds r
    where r.id = rid and public.is_tournament_admin(r.tournament_id)
  );
$$;

drop policy if exists assignments_select_member on public.round_lane_assignments;
create policy assignments_select_member on public.round_lane_assignments
  for select using (public.round_belongs_to_member(round_id));
drop policy if exists assignments_write_admin on public.round_lane_assignments;
create policy assignments_write_admin on public.round_lane_assignments
  for all using (public.round_belongs_to_admin(round_id)) with check (public.round_belongs_to_admin(round_id));

-- ---------------------------------------------------------------------------
-- 9. Políticas: player_games, inventory, activaciones, efectos
--    Escritura de juego: admin/lane_marshal (el responsable introduce bolos).
-- ---------------------------------------------------------------------------
drop policy if exists games_select_member on public.player_games;
create policy games_select_member on public.player_games
  for select using (public.round_belongs_to_member(round_id));
drop policy if exists games_write_admin on public.player_games;
create policy games_write_admin on public.player_games
  for all using (public.round_belongs_to_admin(round_id)) with check (public.round_belongs_to_admin(round_id));

drop policy if exists inventory_select_member on public.player_inventory;
create policy inventory_select_member on public.player_inventory
  for select using (public.round_belongs_to_member(round_id));
drop policy if exists inventory_write_admin on public.player_inventory;
create policy inventory_write_admin on public.player_inventory
  for all using (public.round_belongs_to_admin(round_id)) with check (public.round_belongs_to_admin(round_id));

drop policy if exists activations_select_member on public.modifier_activations;
create policy activations_select_member on public.modifier_activations
  for select using (public.round_belongs_to_member(round_id));
drop policy if exists activations_write_admin on public.modifier_activations;
create policy activations_write_admin on public.modifier_activations
  for all using (public.round_belongs_to_admin(round_id)) with check (public.round_belongs_to_admin(round_id));

drop policy if exists effects_select_member on public.active_effects;
create policy effects_select_member on public.active_effects
  for select using (public.round_belongs_to_member(round_id));
drop policy if exists effects_write_admin on public.active_effects;
create policy effects_write_admin on public.active_effects
  for all using (public.round_belongs_to_admin(round_id)) with check (public.round_belongs_to_admin(round_id));

-- ---------------------------------------------------------------------------
-- 10. Políticas: eventos, auditoría, ajustes de puntos y grupos finales
-- ---------------------------------------------------------------------------
drop policy if exists events_select_member on public.game_events;
create policy events_select_member on public.game_events
  for select using (public.is_tournament_member(tournament_id));
drop policy if exists events_insert_admin on public.game_events;
create policy events_insert_admin on public.game_events
  for insert with check (public.is_tournament_admin(tournament_id));

drop policy if exists audit_select_admin on public.audit_logs;
create policy audit_select_admin on public.audit_logs
  for select using (public.is_tournament_admin(tournament_id));
drop policy if exists audit_insert_admin on public.audit_logs;
create policy audit_insert_admin on public.audit_logs
  for insert with check (public.is_tournament_admin(tournament_id));

-- score_adjustments cuelga de un game.
create or replace function public.game_belongs_to_admin(gid uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from public.player_games g
    join public.rounds r on r.id = g.round_id
    where g.id = gid and public.is_tournament_admin(r.tournament_id)
  );
$$;
drop policy if exists adjustments_write_admin on public.score_adjustments;
create policy adjustments_write_admin on public.score_adjustments
  for all using (public.game_belongs_to_admin(game_id)) with check (public.game_belongs_to_admin(game_id));

drop policy if exists final_groups_admin on public.final_groups;
create policy final_groups_admin on public.final_groups
  for all using (public.is_tournament_admin(tournament_id)) with check (public.is_tournament_admin(tournament_id));
drop policy if exists final_groups_select_member on public.final_groups;
create policy final_groups_select_member on public.final_groups
  for select using (public.is_tournament_member(tournament_id));


drop policy if exists players_update_self_or_admin on public.players;
create policy players_update_self_or_admin on public.players
  for update using (user_id = auth.uid() or public.is_tournament_admin(tournament_id))
  with check (user_id = auth.uid() or public.is_tournament_admin(tournament_id));

-- ---------------------------------------------------------------------------
-- 5. Políticas: tournament_members (roles)
-- ---------------------------------------------------------------------------
drop policy if exists members_select_same on public.tournament_members;
create policy members_select_same on public.tournament_members
  for select using (user_id = auth.uid() or public.is_tournament_member(tournament_id));

drop policy if exists members_insert_self on public.tournament_members;
create policy members_insert_self on public.tournament_members
  for insert with check (user_id = auth.uid());

drop policy if exists members_update_admin on public.tournament_members;
create policy members_update_admin on public.tournament_members
  for update using (public.is_tournament_admin(tournament_id)) with check (public.is_tournament_admin(tournament_id));

drop policy if exists members_delete_admin on public.tournament_members;
create policy members_delete_admin on public.tournament_members
  for delete using (public.is_tournament_admin(tournament_id) or user_id = auth.uid());
