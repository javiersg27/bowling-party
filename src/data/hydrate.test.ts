import { describe, expect, it } from "vitest";
import { mergeBundle, type JoinBundle } from "./hydrate";
import { emptyState } from "./engine";
import type { Team, Tournament } from "../domain/types";

function tournament(id: string, accessCode: string, name = id): Tournament {
  return {
    id,
    name,
    description: "",
    date: "2026-01-01",
    accessCode,
    status: "registration",
    createdBy: "u1",
    settings: {} as Tournament["settings"],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function team(id: string, tournamentId: string, name = id): Team {
  return { id, tournamentId, name, color: "#000", accent: "#fff", sortOrder: 0 };
}

describe("mergeBundle (hidratación 6.B)", () => {
  it("añade un torneo y sus equipos sin tocar el resto", () => {
    const state = emptyState();
    const bundle: JoinBundle = {
      tournament: tournament("tR", "CODE12"),
      teams: [team("aR", "tR"), team("bR", "tR")],
    };
    const merged = mergeBundle(state, bundle);
    expect(merged.tournaments.map((t) => t.id)).toEqual(["tR"]);
    expect(merged.teams.map((t) => t.id).sort()).toEqual(["aR", "bR"]);
    expect(merged.players).toEqual([]);
    expect(merged.rounds).toEqual([]);
  });

  it("es no destructivo: conserva lo local y añade lo remoto", () => {
    const state = emptyState();
    state.tournaments.push(tournament("local1", "LOCAL1"));
    const merged = mergeBundle(state, { tournament: tournament("tR", "CODE12"), teams: [] });
    expect(merged.tournaments.map((t) => t.id).sort()).toEqual(["local1", "tR"]);
    // el estado original no se muta (merge puro)
    expect(state.tournaments.map((t) => t.id)).toEqual(["local1"]);
  });

  it("en conflicto de id gana el remoto", () => {
    const state = emptyState();
    state.tournaments.push(tournament("t1", "OLD111", "Nombre local"));
    const merged = mergeBundle(state, {
      tournament: tournament("t1", "NEW111", "Nombre nube"),
      teams: [],
    });
    const t = merged.tournaments.find((x) => x.id === "t1")!;
    expect(t.accessCode).toBe("NEW111");
    expect(t.name).toBe("Nombre nube");
  });

  it("los equipos se fusionan por id (remoto gana, nuevos se añaden)", () => {
    const state = emptyState();
    state.teams.push(team("x", "tR", "Local"));
    const merged = mergeBundle(state, {
      tournament: tournament("tR", "CODE12"),
      teams: [team("x", "tR", "Nube"), team("y", "tR")],
    });
    expect(merged.teams.find((t) => t.id === "x")!.name).toBe("Nube");
    expect(merged.teams.map((t) => t.id).sort()).toEqual(["x", "y"]);
  });

  it("bundle vacío de equipos no altera los equipos existentes", () => {
    const state = emptyState();
    state.teams.push(team("x", "tR", "Local"));
    const merged = mergeBundle(state, { tournament: tournament("tR", "CODE12"), teams: [] });
    expect(merged.teams.map((t) => t.id)).toEqual(["x"]);
  });
});
