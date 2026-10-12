import { describe, expect, it } from "vitest";
import {
  activateModifier,
  createTournament,
  emptyState,
  joinTournament,
  recordRoll,
  setStatus,
  startRound,
} from "./engine";
import { MODIFIER_CATALOG } from "../domain/modifiers";

describe("motor concurrente y permisos de dominio", () => {
  function setup() {
    const state = emptyState();
    const t = createTournament(state, {
      name: "Test",
      description: "",
      date: "2026-01-01",
      createdBy: "admin",
      settings: {
        laneCount: 2,
        teamCount: 2,
        playersPerLane: 2,
        maxPlayersPerTeam: 2,
        modifiers: { enabledIds: MODIFIER_CATALOG.map((m) => m.id) } as never,
      },
    });
    setStatus(state, t.id, "registration", "admin");
    const teams = state.teams.filter((x) => x.tournamentId === t.id);
    const a = joinTournament(state, { code: t.accessCode, userId: "u1", displayName: "Ada", avatar: "🐯", teamId: teams[0].id });
    const b = joinTournament(state, { code: t.accessCode, userId: "u2", displayName: "Bea", avatar: "🦊", teamId: teams[1].id });
    setStatus(state, t.id, "ready", "admin");
    startRound(state, t.id, "admin");
    return { state, t, a, b };
  }

  it("rechaza el mismo lanzamiento con versión vieja", () => {
    const { state, a } = setup();
    const g = state.games.find((x) => x.playerId === a.id)!;
    recordRoll(state, {
      playerId: a.id,
      roundId: g.roundId,
      pins: 4,
      actorId: "admin",
      expectedVersion: g.version,
      idempotencyKey: "r1",
    });
    expect(() =>
      recordRoll(state, {
        playerId: a.id,
        roundId: g.roundId,
        pins: 3,
        actorId: "admin",
        expectedVersion: 0,
        idempotencyKey: "r2",
      }),
    ).toThrow(/concurrencia/);
  });

  it("idempotencia del mismo roll key", () => {
    const { state, a } = setup();
    const g = state.games.find((x) => x.playerId === a.id)!;
    const args = {
      playerId: a.id,
      roundId: g.roundId,
      pins: 4,
      actorId: "admin",
      expectedVersion: g.version,
      idempotencyKey: "same",
    };
    recordRoll(state, args);
    const after = state.games.find((x) => x.playerId === a.id)!;
    recordRoll(state, { ...args, expectedVersion: after.version });
    expect(state.games.find((x) => x.playerId === a.id)!.rolls).toEqual([4]);
  });

  it("no deja activar dos veces el mismo objeto", () => {
    const { state, a } = setup();
    const round = state.rounds.find((r) => r.kind === 1)!;
    state.inventory.push({
      id: "inv",
      playerId: a.id,
      roundId: round.id,
      modifierId: "gold_coins",
      status: "held",
      grantedAt: "",
      grantedFrame: 2,
    });
    activateModifier(state, {
      inventoryId: "inv",
      actorPlayerId: a.id,
      idempotencyKey: "act1",
    });
    expect(() =>
      activateModifier(state, {
        inventoryId: "inv",
        actorPlayerId: a.id,
        idempotencyKey: "act2",
      }),
    ).toThrow();
  });

  it("nombres duplicados", () => {
    const state = emptyState();
    const t = createTournament(state, {
      name: "Test",
      description: "",
      date: "2026-01-01",
      createdBy: "admin",
      settings: { laneCount: 1, teamCount: 1, playersPerLane: 4, maxPlayersPerTeam: 4 },
    });
    setStatus(state, t.id, "registration", "admin");
    const team = state.teams[0];
    joinTournament(state, { code: t.accessCode, userId: "u1", displayName: "Ada", avatar: "🐯", teamId: team.id });
    expect(() =>
      joinTournament(state, { code: t.accessCode, userId: "u9", displayName: "Ada", avatar: "🐼", teamId: team.id }),
    ).toThrow(/nombre/);
  });
});
