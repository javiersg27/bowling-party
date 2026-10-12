import type { EngineState } from "./engine";

/**
 * Capa de sincronización (diff puro).
 *
 * Compara dos estados del motor y determina qué entidades hay que subir/borrar
 * en Supabase. Es pura (sin I/O) y por tanto testeable sin backend.
 */

export interface CollectionDiff<T> {
  upserted: T[];
  deleted: string[];
}

/**
 * Compara dos colecciones usando una función de clave primaria (por defecto `id`).
 * Detecta altas/modificaciones (upserted) y bajas (deleted) por igualdad estructural.
 */
export function diffCollection<T>(
  prev: T[],
  next: T[],
  keyOf: (e: T) => string = (e) => (e as { id: string }).id,
): CollectionDiff<T> {
  const prevMap = new Map(prev.map((e) => [keyOf(e), e]));
  const nextMap = new Map(next.map((e) => [keyOf(e), e]));
  const upserted: T[] = [];
  const deleted: string[] = [];

  for (const [key, entity] of nextMap) {
    const before = prevMap.get(key);
    if (!before || stableStringify(before) !== stableStringify(entity)) {
      upserted.push(entity);
    }
  }
  for (const key of prevMap.keys()) {
    if (!nextMap.has(key)) deleted.push(key);
  }
  return { upserted, deleted };
}

/** Serialización estable (claves ordenadas) para comparar por valor. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, val) =>
    val && typeof val === "object" && !Array.isArray(val)
      ? Object.keys(val as Record<string, unknown>)
          .sort()
          .reduce<Record<string, unknown>>((acc, k) => {
            acc[k] = (val as Record<string, unknown>)[k];
            return acc;
          }, {})
      : val,
  );
}

/** Clonado profundo del estado (JSON-serializable). */
export function cloneState(state: EngineState): EngineState {
  return JSON.parse(JSON.stringify(state)) as EngineState;
}

/**
 * Diff completo del estado. Solo cubre las colecciones persistidas en SQL.
 * `finalGroups` y `audit` tienen forma distinta y se tratan aparte si hace falta.
 */
export interface StateDiff {
  tournaments: CollectionDiff<EngineState["tournaments"][number]>;
  teams: CollectionDiff<EngineState["teams"][number]>;
  lanes: CollectionDiff<EngineState["lanes"][number]>;
  players: CollectionDiff<EngineState["players"][number]>;
  rounds: CollectionDiff<EngineState["rounds"][number]>;
  assignments: CollectionDiff<EngineState["assignments"][number]>;
  games: CollectionDiff<EngineState["games"][number]>;
  inventory: CollectionDiff<EngineState["inventory"][number]>;
  activations: CollectionDiff<EngineState["activations"][number]>;
  effects: CollectionDiff<EngineState["effects"][number]>;
  events: CollectionDiff<EngineState["events"][number]>;
}

export function diffStates(prev: EngineState, next: EngineState): StateDiff {
  return {
    tournaments: diffCollection(prev.tournaments, next.tournaments),
    teams: diffCollection(prev.teams, next.teams),
    lanes: diffCollection(prev.lanes, next.lanes),
    players: diffCollection(prev.players, next.players),
    rounds: diffCollection(prev.rounds, next.rounds),
    assignments: diffCollection(prev.assignments, next.assignments),
    // PlayerGame no tiene id: su clave natural es (playerId, roundId),
    // que coincide con el unique (round_id, player_id) de la tabla SQL.
    games: diffCollection(prev.games, next.games, (g) => `${g.playerId}|${g.roundId}`),
    inventory: diffCollection(prev.inventory, next.inventory),
    activations: diffCollection(prev.activations, next.activations),
    effects: diffCollection(prev.effects, next.effects),
    events: diffCollection(prev.events, next.events),
  };
}

/** ¿El diff está vacío (nada que subir/borrar)? */
export function isEmptyDiff(diff: StateDiff): boolean {
  return (
    Object.values(diff) as CollectionDiff<unknown>[]
  ).every((c) => c.upserted.length === 0 && c.deleted.length === 0);
}
