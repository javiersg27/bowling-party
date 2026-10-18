import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ActiveEffect,
  GameEvent,
  InventoryItem,
  Lane,
  LaneAssignment,
  ModifierActivation,
  Player,
  PlayerGame,
  Round,
  Team,
  Tournament,
} from "../domain/types";
import type { EngineState } from "./engine";
import {
  assignmentFromRow,
  effectFromRow,
  eventFromRow,
  gameFromRow,
  inventoryFromRow,
  laneFromRow,
  activationFromRow,
  playerFromRow,
  roundFromRow,
  teamFromRow,
  tournamentFromRow,
} from "./live";

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

// ---------------------------------------------------------------------------
// Pull completo del torneo (host/espectadores)
// ---------------------------------------------------------------------------

/**
 * Instantánea remota de UN torneo, ya mapeada al modelo del motor (camelCase).
 * Solo contiene lo necesario para reflejar el torneo en cualquier dispositivo:
 * entidades propias + las que cuelgan de sus rondas.
 */
export interface RemoteState {
  tournament: Tournament | null;
  teams: Team[];
  lanes: Lane[];
  players: Player[];
  rounds: Round[];
  assignments: LaneAssignment[];
  games: PlayerGame[];
  inventory: InventoryItem[];
  activations: ModifierActivation[];
  effects: ActiveEffect[];
  events: GameEvent[];
}

/**
 * Descarga el estado completo de un torneo desde Supabase. Pensado para el
 * host (PC) y espectadores: reemplaza el "solo re-render" de Realtime por un
 * volcado real de la nube, de modo que los jugadores creados en OTROS
 * dispositivos aparecen en el panel de dirección.
 *
 * Requiere ser miembro del torneo (RLS `*_select_member`). Las tablas que
 * cuelgan de `round_id` se filtran por las rondas ya conocidas del torneo para
 * no traer filas de otros torneos (RLS las dejaría pasar por pertenencia).
 */
export async function pullTournament(sb: SupabaseClient, tournamentId: string): Promise<RemoteState> {
  const { data: tRow, error: tErr } = await sb
    .from("tournaments")
    .select("*")
    .eq("id", tournamentId)
    .maybeSingle();
  if (tErr) throw tErr;

  const { data: teamRows, error: teamErr } = await sb.from("teams").select("*").eq("tournament_id", tournamentId);
  if (teamErr) throw teamErr;
  const { data: laneRows, error: laneErr } = await sb.from("lanes").select("*").eq("tournament_id", tournamentId);
  if (laneErr) throw laneErr;
  const { data: playerRows, error: playerErr } = await sb.from("players").select("*").eq("tournament_id", tournamentId);
  if (playerErr) throw playerErr;
  const { data: roundRows, error: roundErr } = await sb.from("rounds").select("*").eq("tournament_id", tournamentId);
  if (roundErr) throw roundErr;
  const { data: eventRows, error: eventErr } = await sb
    .from("game_events")
    .select("*")
    .eq("tournament_id", tournamentId);
  if (eventErr) throw eventErr;

  const rounds = (roundRows ?? []).map((r) => roundFromRow(r));
  const roundIds = rounds.map((r) => r.id);

  // Colecciones que cuelgan de round_id (sin tournament_id): se acotan por las
  // rondas del torneo. Si aún no hay rondas, se evita el `.in([])`.
  let assignments: LaneAssignment[] = [];
  let games: PlayerGame[] = [];
  let inventory: InventoryItem[] = [];
  let activations: ModifierActivation[] = [];
  let effects: ActiveEffect[] = [];
  if (roundIds.length > 0) {
    const [aRes, gRes, iRes, actRes, eRes] = await Promise.all([
      sb.from("round_lane_assignments").select("*").in("round_id", roundIds),
      sb.from("player_games").select("*").in("round_id", roundIds),
      sb.from("player_inventory").select("*").in("round_id", roundIds),
      sb.from("modifier_activations").select("*").in("round_id", roundIds),
      sb.from("active_effects").select("*").in("round_id", roundIds),
    ]);
    if (aRes.error) throw aRes.error;
    if (gRes.error) throw gRes.error;
    if (iRes.error) throw iRes.error;
    if (actRes.error) throw actRes.error;
    if (eRes.error) throw eRes.error;
    assignments = (aRes.data ?? []).map((r) => assignmentFromRow(r));
    games = (gRes.data ?? []).map((r) => gameFromRow(r));
    inventory = (iRes.data ?? []).map((r) => inventoryFromRow(r));
    activations = (actRes.data ?? []).map((r) => activationFromRow(r));
    effects = (eRes.data ?? []).map((r) => effectFromRow(r));
  }

  return {
    tournament: tRow ? tournamentFromRow(tRow) : null,
    teams: (teamRows ?? []).map((r) => teamFromRow(r)),
    lanes: (laneRows ?? []).map((r) => laneFromRow(r)),
    players: (playerRows ?? []).map((r) => playerFromRow(r)),
    rounds,
    assignments,
    games,
    inventory,
    activations,
    effects,
    events: (eventRows ?? []).map((r) => eventFromRow(r)),
  };
}

/**
 * Fusiona una instantánea remota en el estado local SIN destruir lo local y
 * siendo **pura** (no muta, testeable). Política de resolución:
 *   - torneo: gana el de `updatedAt` más reciente (el host puede haber hecho
 *     cambios locales aún no subidos; la nube no debe pisarlos con datos viejos).
 *   - resto de colecciones: `upsertById` (remoto gana en conflicto de id, las
 *     filas locales ajenas al torneo se conservan).
 *
 * `games` no tiene `id`: se reconcilia por su clave natural `playerId|roundId`.
 */
export function mergeRemoteState(state: EngineState, remote: RemoteState): EngineState {
  const merged: EngineState = {
    ...state,
    teams: upsertById(state.teams, remote.teams),
    lanes: upsertById(state.lanes, remote.lanes),
    players: upsertById(state.players, remote.players),
    rounds: upsertById(state.rounds, remote.rounds),
    assignments: upsertById(state.assignments, remote.assignments),
    games: mergeGames(state.games, remote.games),
    inventory: upsertById(state.inventory, remote.inventory),
    activations: upsertById(state.activations, remote.activations),
    effects: upsertById(state.effects, remote.effects),
    events: upsertById(state.events, remote.events),
  };
  if (remote.tournament) {
    const local = state.tournaments.find((t) => t.id === remote.tournament!.id);
    // En conflicto gana el más reciente; si no existe local, se añade.
    const remoteWins = !local || remote.tournament.updatedAt >= local.updatedAt;
    merged.tournaments = remoteWins
      ? upsertById(state.tournaments, [remote.tournament])
      : state.tournaments;
  }
  return merged;
}

/**
 * Reconcilia `games` por su clave natural (playerId, roundId).
 * En conflicto, gana el juego con mayor `version` (optimistic UI local-first).
 * Si las versiones son iguales, gana el que tenga más tiradas (`rolls.length`),
 * y en caso de empate total gana el remoto como fuente canónica de verdad.
 */
function mergeGames(local: PlayerGame[], remote: PlayerGame[]): PlayerGame[] {
  const key = (g: PlayerGame) => `${g.playerId}|${g.roundId}`;
  if (remote.length === 0) return local;
  const map = new Map(local.map((g) => [key(g), g]));
  for (const r of remote) {
    const k = key(r);
    const l = map.get(k);
    if (!l) {
      map.set(k, r);
      continue;
    }
    // Si la versión local es mayor, se conserva local (tirada optimista aún no reflejada en la nube)
    if (l.version > r.version) {
      continue;
    }
    // Si la versión remota es mayor, la nube está más actualizada
    if (r.version > l.version) {
      map.set(k, r);
      continue;
    }
    // Mismas versiones: si local tiene más tiradas registradas, conservamos local
    if (l.rolls.length > r.rolls.length) {
      continue;
    }
    map.set(k, r);
  }
  return Array.from(map.values());
}