-- ============================================================================
-- Bowling Party · Corrección para sincronización PC ↔ móvil (Supabase)
-- Ejecutar en el SQL Editor del Dashboard de Supabase.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Aplicar Row Level Security (RLS) si aún no está aplicado
-- ----------------------------------------------------------------------------
\ir supabase/migrations/002_rls.sql
\ir supabase/migrations/003_player_game_rls.sql

-- ----------------------------------------------------------------------------
-- 2. Habilitar Realtime en las tablas del torneo
--    (sin esto, los eventos postgres_changes no se disparan y el PC no ve
--     al jugador que se inscribe desde el móvil)
-- ----------------------------------------------------------------------------

-- Añadir tablas con columna tournament_id a la publicación supabase_realtime
alter publication supabase_realtime add table public.tournaments;
alter publication supabase_realtime add table public.teams;
alter publication supabase_realtime add table public.lanes;
alter publication supabase_realtime add table public.players;
alter publication supabase_realtime add table public.rounds;
alter publication supabase_realtime add table public.game_events;

-- Las tablas que cuelgan de round_id se escuchan sin filtro en el código,
-- pero también conviene añadirlas para que Realtime las entregue:
alter publication supabase_realtime add table public.round_lane_assignments;
alter publication supabase_realtime add table public.player_games;
alter publication supabase_realtime add table public.player_inventory;
alter publication supabase_realtime add table public.modifier_activations;
alter publication supabase_realtime add table public.active_effects;

-- ----------------------------------------------------------------------------
-- 2.B. Políticas de auto-registro de tiradas (Self-roll para jugadores móviles)
-- ----------------------------------------------------------------------------
create or replace function public.is_player_owner(pid uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from public.players p
    where p.id = pid and p.user_id = auth.uid()
  );
$$;

drop policy if exists games_update_own on public.player_games;
create policy games_update_own on public.player_games
  for update
  using (
    public.round_belongs_to_member(round_id)
    and public.is_player_owner(player_id)
  )
  with check (
    public.round_belongs_to_member(round_id)
    and public.is_player_owner(player_id)
  );

drop policy if exists games_insert_own on public.player_games;
create policy games_insert_own on public.player_games
  for insert
  with check (
    public.round_belongs_to_member(round_id)
    and public.is_player_owner(player_id)
  );

drop policy if exists inventory_update_own on public.player_inventory;
create policy inventory_update_own on public.player_inventory
  for update
  using (
    public.round_belongs_to_member(round_id)
    and public.is_player_owner(player_id)
  )
  with check (
    public.round_belongs_to_member(round_id)
    and public.is_player_owner(player_id)
  );

drop policy if exists inventory_insert_own on public.player_inventory;
create policy inventory_insert_own on public.player_inventory
  for insert
  with check (
    public.round_belongs_to_member(round_id)
    and public.is_player_owner(player_id)
  );

drop policy if exists activations_insert_own on public.modifier_activations;
create policy activations_insert_own on public.modifier_activations
  for insert
  with check (
    public.round_belongs_to_member(round_id)
    and (actor_id is null or public.is_player_owner(actor_id))
  );

drop policy if exists effects_write_own on public.active_effects;
create policy effects_write_own on public.active_effects
  for all
  using (
    public.round_belongs_to_member(round_id)
    and public.is_player_owner(player_id)
  )
  with check (
    public.round_belongs_to_member(round_id)
    and public.is_player_owner(player_id)
  );

-- ----------------------------------------------------------------------------
-- 3. Verificar que las políticas de lectura permiten al creador leer su torneo
-- ----------------------------------------------------------------------------
-- (ya definidas en 002_rls.sql; esta consulta solo confirma el estado)
select schemaname, tablename, rowsecurity, forcerowlevelsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('tournaments','teams','lanes','players','rounds',
                    'round_lane_assignments','player_games','game_events',
                    'player_inventory','modifier_activations','active_effects');

-- ----------------------------------------------------------------------------
-- 4. Nota importante sobre Variables de Entorno en Vercel
-- ----------------------------------------------------------------------------
-- Asegúrate de definir en Vercel (Settings → Environment Variables):
--   VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co
--   VITE_SUPABASE_ANON_KEY=sb_publishable_...
-- Tanto en el despliegue del PC como en el del móvil. Sin ellas, la app
-- arranca en modo demo (localStorage aislado) y nunca se sincronizan.
-- ============================================================================