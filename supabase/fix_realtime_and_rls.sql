-- ============================================================================
-- Bowling Party · Corrección para sincronización PC ↔ móvil (Supabase)
-- Ejecutar en el SQL Editor del Dashboard de Supabase.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Aplicar Row Level Security (RLS) si aún no está aplicado
-- ----------------------------------------------------------------------------
\ir supabase/migrations/002_rls.sql

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

-- Si alguna tabla ya estaba en la publicación, el ADD TABLE lanza aviso pero no falla.

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