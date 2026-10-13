import { describe, expect, it } from "vitest";
import { buildDemoState } from "./demoSeed";
import { emptyState, createTournament } from "./engine";
import { makeLiveSink } from "./liveSink";
import { PartyStore } from "./store";

function freshStore(): PartyStore {
  const store = new PartyStore();
  store.state = emptyState();
  return store;
}

describe("syncFullState (recuperación al conectar)", () => {
  it("sube el estado local completo aunque su diff se haya consumido antes", async () => {
    const store = freshStore();
    // Torneo creado SIN sink conectado: su diff normal se perdería para siempre.
    createTournament(store.state, {
      name: "Torneo Rescatado",
      description: "",
      date: "2026-01-01",
      createdBy: "user-1",
      settings: { laneCount: 1, teamCount: 1, playersPerLane: 4, maxPlayersPerTeam: 4 },
    });

    const received: unknown[] = [];
    store.setSyncSink(async (diff) => {
      received.push(diff);
    });

    // setSyncSink dispara syncFullState de forma asíncrona.
    await new Promise((r) => setTimeout(r, 0));

    expect(received).toHaveLength(1);
    const diff = received[0] as { tournaments: { upserted: { name: string }[]; deleted: string[] } };
    expect(diff.tournaments.upserted.map((t) => t.name)).toContain("Torneo Rescatado");
    // Nunca borra en la nube a ciegas.
    expect(diff.tournaments.deleted).toEqual([]);
  });

  it("no empuja nada si no hay sink conectado", () => {
    const store = freshStore();
    // syncFullState sin sink no debe lanzar ni hacer nada.
    expect(() => store.syncFullState()).not.toThrow();
  });
});

describe("makeLiveSink tolerante a fallos parciales", () => {
  it("sigue subiendo el resto de entidades aunque una falle y relanza el primer error", async () => {
    const demo = buildDemoState();
    const pushedTournaments: string[] = [];
    const pushedTeams: string[] = [];

    const fakeSb = {
      from(table: string) {
        return {
          upsert: async (row: Record<string, unknown>) => {
            if (table === "tournaments") {
              // Simula RLS rechazando un torneo con created_by inválido.
              if (row.created_by === "demo-admin") {
                return { error: { message: "violates row-level security" } };
              }
              pushedTournaments.push(String(row.name));
              return { error: null };
            }
            if (table === "teams") {
              pushedTeams.push(String(row.name));
              return { error: null };
            }
            return { error: null };
          },
          insert: async (row: Record<string, unknown>) => {
            // pushTournament ahora hace INSERT puro (no upsert): simulamos aquí el
            // mismo rechazo RLS para un torneo con created_by inválido.
            if (table === "tournaments" && row.created_by === "demo-admin") {
              return { error: { message: "violates row-level security" } };
            }
            return { error: null };
          },
          delete: () => ({ eq: async () => ({ error: null }) }),
        };
      },
      channel: () => ({ on: () => ({ subscribe: () => {} }) }),
      removeChannel: async () => {},
    };

    const sink = makeLiveSink(fakeSb as never, "user-1", "admin");
    const tournament = demo.tournaments[0];
    const teams = demo.teams.filter((t) => t.tournamentId === tournament.id);

    await expect(
      sink({
        tournaments: { upserted: [{ ...tournament, createdBy: "demo-admin" }], deleted: [] },
        teams: { upserted: teams, deleted: [] },
        lanes: { upserted: [], deleted: [] },
        players: { upserted: [], deleted: [] },
        rounds: { upserted: [], deleted: [] },
        assignments: { upserted: [], deleted: [] },
        games: { upserted: [], deleted: [] },
        inventory: { upserted: [], deleted: [] },
        activations: { upserted: [], deleted: [] },
        effects: { upserted: [], deleted: [] },
        events: { upserted: [], deleted: [] },
      }),
    ).rejects.toThrow();

    // A pesar del fallo del torneo, los equipos sí se subieron.
    expect(pushedTeams.length).toBe(teams.length);
    expect(pushedTournaments).toEqual([]);
  });
});