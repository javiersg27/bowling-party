import type { SupabaseClient } from "@supabase/supabase-js";
import type { Team, Tournament } from "../domain/types";
import type { EngineState } from "./engine";
import { teamFromRow, tournamentFromRow } from "./live";

/**
 * Hidratación inicial desde Supabase (fase 6.B).
 *
 * El motor vive en `localStorage` (local-first). Para que un dispositivo ajeno
 * pueda UNIRSE a un torneo creado en otro, necesita descargarlo por su código.
 * Aquí vive la capa de "pull": descubrir por código + fusionar en el estado.
 */

/** Datos mínimos para que un dispositivo ajeno pueda unirse e inscribirse. */
export interface JoinBundle {
  tournament: Tournament;
  teams: Team[];
}

type RpcBundle = { tournament?: Record<string, unknown>; teams?: Record<string, unknown>[] } | null;

/**
 * Descubre un torneo por su código mediante la RPC segura `lookup_join_bundle`
 * (SECURITY DEFINER). Devuelve `null` si el código no existe. A diferencia de una
 * consulta REST normal, funciona sin ser aún miembro: RLS no permite leer `teams`
 * sin membresía y esta función sí lo hace, acotada al torneo consultado.
 */
export async function fetchJoinBundle(sb: SupabaseClient, code: string): Promise<JoinBundle | null> {
  const { data, error } = await sb.rpc("lookup_join_bundle", { code: code.toUpperCase() });
  if (error) throw error;
  const bundle = data as RpcBundle;
  if (!bundle?.tournament) return null;
  return {
    tournament: tournamentFromRow(bundle.tournament),
    teams: (bundle.teams ?? []).map((t) => teamFromRow(t)),
  };
}

/** Upsert por `id`: en conflicto gana el elemento remoto (fuente de verdad). */
function upsertById<T extends { id: string }>(list: T[], items: T[]): T[] {
  if (items.length === 0) return list;
  const map = new Map(list.map((e) => [e.id, e]));
  for (const it of items) map.set(it.id, it);
  return Array.from(map.values());
}

/**
 * Fusiona un bundle remoto en el estado local SIN tocar el resto. **Pura** (sin
 * I/O) y por tanto testeable. Solo añade/actualiza el torneo y sus equipos; las
 * demás colecciones quedan intactas y lo local que no colisiona por id se
 * conserva (merge no destructivo).
 */
export function mergeBundle(state: EngineState, bundle: JoinBundle): EngineState {
  return {
    ...state,
    tournaments: upsertById(state.tournaments, [bundle.tournament]),
    teams: upsertById(state.teams, bundle.teams),
  };
}