import { describe, expect, it } from "vitest";
import { diffCollection, diffStates, isEmptyDiff, stableStringify } from "./sync";
import { emptyState, type EngineState } from "./engine";
import type { Team, Tournament } from "../domain/types";

describe("diff de colecciones", () => {
  it("detecta altas, bajas y modificaciones", () => {
    const prev = [
      { id: "a", v: 1 },
      { id: "b", v: 2 },
    ];
    const next = [
      { id: "a", v: 1 }, // sin cambios
      { id: "b", v: 99 }, // modificado
      { id: "c", v: 3 }, // nuevo
    ];
    const d = diffCollection(prev, next);
    expect(d.upserted.map((e) => e.id).sort()).toEqual(["b", "c"]);
    expect(d.deleted).toEqual([]);
  });

  it("detecta eliminaciones", () => {
    const d = diffCollection([{ id: "x" }, { id: "y" }], [{ id: "x" }]);
    expect(d.upserted).toEqual([]);
    expect(d.deleted).toEqual(["y"]);
  });

  it("no marca cambios por orden de claves (stringify estable)", () => {
    const prev = [{ id: "a", p: 1, q: 2 }];
    const next = [{ id: "a", q: 2, p: 1 }];
    const d = diffCollection(prev, next);
    expect(d.upserted).toEqual([]);
  });

  it("stableStringify ordena claves", () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });
});

describe("diff de estado completo", () => {
  function seed(): EngineState {
    const s = emptyState();
    const t: Tournament = {
      id: "t1",
      name: "T",
      description: "",
      date: "2026-01-01",
      accessCode: "AAA",
      status: "draft",
      createdBy: "u",
      settings: {} as Tournament["settings"],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    s.tournaments.push(t);
    const team: Team = { id: "team1", tournamentId: "t1", name: "E1", color: "#000", accent: "#fff", sortOrder: 0 };
    s.teams.push(team);
    return s;
  }

  it("diff vacío entre clones iguales", () => {
    const a = seed();
    const b = JSON.parse(JSON.stringify(a)) as EngineState;
    expect(isEmptyDiff(diffStates(a, b))).toBe(true);
  });

  it("detecta torneo modificado y equipo nuevo", () => {
    const a = seed();
    const b = JSON.parse(JSON.stringify(a)) as EngineState;
    b.tournaments[0].status = "registration";
    b.teams.push({ id: "team2", tournamentId: "t1", name: "E2", color: "#111", accent: "#fff", sortOrder: 1 });
    const d = diffStates(a, b);
    expect(d.tournaments.upserted.map((x) => x.id)).toEqual(["t1"]);
    expect(d.teams.upserted.map((x) => x.id)).toEqual(["team2"]);
    expect(isEmptyDiff(d)).toBe(false);
  });
});
