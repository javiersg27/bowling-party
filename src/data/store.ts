import { buildDemoState } from "./demoSeed";
import { mergeBundle, type JoinBundle } from "./hydrate";
import { cloneState, diffStates, isEmptyDiff, type StateDiff } from "./sync";
import {
  activateModifier,
  applyPreset,
  chooseLegendary,
  completeRound,
  createTournament,
  currentTeamRanking,
  distributeLanes,
  emptyState,
  exportCsv,
  joinTournament,
  kickPlayer,
  moveAssignment,
  recordRoll,
  setStatus,
  startRound,
  type EngineState,
} from "./engine";
import type { TournamentSettings } from "../domain/types";

const KEY = "bowling-party-engine-v1";
const MODE_KEY = "bowling-party-mode";

type Tail<T extends readonly unknown[]> = T extends readonly [unknown, ...infer Rest] ? Rest : never;

export type AppMode = "demo" | "live";

export function getMode(): AppMode {
  const saved = localStorage.getItem(MODE_KEY) as AppMode | null;
  if (saved) return saved;
  const has = Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
  return has ? "live" : "demo";
}

export function setMode(mode: AppMode) {
  localStorage.setItem(MODE_KEY, mode);
}

function load(): EngineState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as EngineState;
  } catch {
    /* ignore */
  }
  const demo = buildDemoState();
  save(demo);
  return demo;
}

function save(state: EngineState) {
  localStorage.setItem(KEY, JSON.stringify(state));
}

/**
 * Sumidero de sincronización: recibe el diff tras cada commit. En modo demo es
 * un no-op; en modo live empuja a Supabase. Debe ser tolerante a fallos (nunca
 * debe romper el commit local).
 */
export type SyncSink = (diff: StateDiff) => void | Promise<void>;

export class PartyStore {
  state: EngineState;
  listeners = new Set<() => void>();
  /** Último estado ya commiteado, para calcular diffs en el siguiente commit. */
  private lastCommitted: EngineState;
  /** Sumidero de sincronización (Supabase). Null en modo demo. */
  private syncSink: SyncSink | null = null;
  /** Errores de la última sincronización, para depuración/UI. */
  lastSyncError: string | null = null;

  constructor() {
    this.state = typeof localStorage === "undefined" ? emptyState() : load();
    this.lastCommitted = cloneState(this.state);
  }

  /**
   * Empuja el estado COMPLETO a la nube como una operación idempotente.
   *
   * El push normal es incremental (diff contra `lastCommitted`), así que un torneo
   * creado mientras no había sink —o mientras faltaba la política RLS— nunca se
   * sube: su diff ya se consumió y nadie lo reintenta. Este método lo resuelve
   * re-enviando todo como upsert (seguro de repetir). Los borrados se OMITEN a
   * propósito: no conocemos el contenido real de la nube y borrar a ciegas sería
   * destructivo.
   */
  syncFullState() {
    if (!this.syncSink) return;
    const diff = diffStates(emptyState(), this.state);
    if (isEmptyDiff(diff)) return;
    Promise.resolve()
      .then(() => this.syncSink!(diff))
      .catch((e) => {
        this.lastSyncError = e instanceof Error ? e.message : "Error de sincronización";
      });
  }

  /** Conecta (o desconecta con null) el empuje a Supabase. */
  setSyncSink(sink: SyncSink | null) {
    this.syncSink = sink;
    // Al (re)conectar, resincronizamos la base para no perder el punto de partida.
    this.lastCommitted = cloneState(this.state);
    // Recuperamos de inmediato lo que pudo quedar sin subir (p. ej. un torneo
    // creado antes de tener sink o con la política RLS ausente). El upsert lo hace
    // inocuo: repetirlo no duplica filas.
    if (sink) this.syncFullState();
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private commit() {
    save(this.state);
    this.listeners.forEach((fn) => fn());
    // Empuje a la nube SIN bloquear la UI. Si falla, se registra pero no se
    // revierte el estado local (el juego sigue).
    const diff = diffStates(this.lastCommitted, this.state);
    this.lastCommitted = cloneState(this.state);
    if (this.syncSink && !isEmptyDiff(diff)) {
      Promise.resolve()
        .then(() => this.syncSink!(diff))
        .catch((e) => {
          this.lastSyncError = e instanceof Error ? e.message : "Error de sincronización";
        });
    }
  }

  resetDemo() {
    this.state = buildDemoState();
    this.commit();
  }

  /**
   * Hidrata el estado local con datos descargados de la nube (6.B). Fusiona sin
   * destruir lo local y, a diferencia de las mutaciones, NO dispara un empuje:
   * lo recién bajado se marca como ya sincronizado para que el siguiente commit
   * solo suba los cambios locales futuros (p. ej. el jugador que se inscribe).
   */
  hydrate(bundle: JoinBundle) {
    this.state = mergeBundle(this.state, bundle);
    this.lastCommitted = cloneState(this.state);
    save(this.state);
    this.listeners.forEach((fn) => fn());
  }

  createTournament(args: Parameters<typeof createTournament>[1]) {
    const t = createTournament(this.state, args);
    this.commit();
    return t;
  }

  setStatus(...args: Tail<Parameters<typeof setStatus>>) {
    setStatus(this.state, ...args);
    this.commit();
  }

  join(...args: Tail<Parameters<typeof joinTournament>>) {
    const p = joinTournament(this.state, ...args);
    this.commit();
    return p;
  }

  kick(...args: Tail<Parameters<typeof kickPlayer>>) {
    kickPlayer(this.state, ...args);
    this.commit();
  }

  startRound(...args: Tail<Parameters<typeof startRound>>) {
    startRound(this.state, ...args);
    this.commit();
  }

  completeRound(...args: Tail<Parameters<typeof completeRound>>) {
    completeRound(this.state, ...args);
    this.commit();
  }

  distribute(...args: Tail<Parameters<typeof distributeLanes>>) {
    const r = distributeLanes(this.state, ...args);
    this.commit();
    return r;
  }

  recordRoll(...args: Tail<Parameters<typeof recordRoll>>) {
    recordRoll(this.state, ...args);
    this.commit();
  }

  activate(...args: Tail<Parameters<typeof activateModifier>>) {
    const r = activateModifier(this.state, ...args);
    this.commit();
    return r;
  }

  chooseLegendary(...args: Tail<Parameters<typeof chooseLegendary>>) {
    chooseLegendary(this.state, ...args);
    this.commit();
  }

  moveAssignment(...args: Tail<Parameters<typeof moveAssignment>>) {
    moveAssignment(this.state, ...args);
    this.commit();
  }

  applyPreset(...args: Tail<Parameters<typeof applyPreset>>) {
    applyPreset(this.state, ...args);
    this.commit();
  }

  updateTournament(id: string, patch: Partial<{ name: string; description: string; date: string; settings: TournamentSettings }>) {
    const t = this.state.tournaments.find((x) => x.id === id);
    if (!t) throw new Error("Torneo no encontrado.");
    Object.assign(t, patch, { updatedAt: new Date().toISOString() });
    this.commit();
  }

  ranking(tournamentId: string) {
    return currentTeamRanking(this.state, tournamentId);
  }

  csv(tournamentId: string) {
    return exportCsv(this.state, tournamentId);
  }
}

export const partyStore = new PartyStore();
