import { describe, expect, it } from "vitest";
import {
  activateModifier,
  completeRound,
  createTournament,
  emptyState,
  joinTournament,
  recordRoll,
  setStatus,
  startRound,
} from "./engine";
import { MODIFIER_CATALOG, modifierById } from "../domain/modifiers";
import { DEFAULT_MODIFIER_SETTINGS } from "../domain/types";

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

describe("reparto de modificadores al finalizar ronda", () => {
  function setup() {
    const state = emptyState();
    const t = createTournament(state, {
      name: "Test",
      description: "",
      date: "2026-01-01",
      createdBy: "admin",
      settings: {
        laneCount: 2,
        teamCount: 1,
        playersPerLane: 1,
        maxPlayersPerTeam: 2,
        modifiers: {
          enabledIds: MODIFIER_CATALOG.map((m) => m.id),
          weightsByPlace: {
            first: { common: 100, uncommon: 0, epic: 0 },
            middle: { common: 0, uncommon: 100, epic: 0 },
            last: { common: 0, uncommon: 0, epic: 100 },
          },
        } as never,
      },
    });
    setStatus(state, t.id, "registration", "admin");
    const team = state.teams[0];
    const a = joinTournament(state, { code: t.accessCode, userId: "u1", displayName: "Ada", avatar: "🐯", teamId: team.id });
    const b = joinTournament(state, { code: t.accessCode, userId: "u2", displayName: "Bea", avatar: "🦊", teamId: team.id });
    setStatus(state, t.id, "ready", "admin");
    startRound(state, t.id, "admin");
    return { state, t, a, b };
  }

  it("otorga un modificador a cada jugador al finalizar la ronda", () => {
    const { state, t, a, b } = setup();
    const round = state.rounds.find((r) => r.kind === 1)!;

    const gameA = state.games.find((g) => g.playerId === a.id && g.roundId === round.id)!;
    recordRoll(state, {
      playerId: a.id,
      roundId: round.id,
      pins: 0,
      actorId: "admin",
      expectedVersion: gameA.version,
      idempotencyKey: "k1",
      exceptionalTotal: 100,
    });

    const gameB = state.games.find((g) => g.playerId === b.id && g.roundId === round.id)!;
    recordRoll(state, {
      playerId: b.id,
      roundId: round.id,
      pins: 0,
      actorId: "admin",
      expectedVersion: gameB.version,
      idempotencyKey: "k2",
      exceptionalTotal: 200,
    });

    completeRound(state, t.id, "admin");

    const invA = state.inventory.filter((i) => i.playerId === a.id && i.roundId === round.id);
    const invB = state.inventory.filter((i) => i.playerId === b.id && i.roundId === round.id);

    expect(invA.length).toBe(1);
    expect(invB.length).toBe(1);
    expect(invA[0].status).toBe("held");
    expect(invB[0].status).toBe("held");
    expect(invA[0].grantedFrame).toBe(10);
    expect(invB[0].grantedFrame).toBe(10);
  });

  it("da mejores modificadores al jugador con menos puntos", () => {
    const { state, t, a, b } = setup();
    const round = state.rounds.find((r) => r.kind === 1)!;

    const gameA = state.games.find((g) => g.playerId === a.id && g.roundId === round.id)!;
    recordRoll(state, {
      playerId: a.id,
      roundId: round.id,
      pins: 0,
      actorId: "admin",
      expectedVersion: gameA.version,
      idempotencyKey: "k1",
      exceptionalTotal: 100,
    });

    const gameB = state.games.find((g) => g.playerId === b.id && g.roundId === round.id)!;
    recordRoll(state, {
      playerId: b.id,
      roundId: round.id,
      pins: 0,
      actorId: "admin",
      expectedVersion: gameB.version,
      idempotencyKey: "k2",
      exceptionalTotal: 200,
    });

    completeRound(state, t.id, "admin");

    const invA = state.inventory.filter((i) => i.playerId === a.id && i.roundId === round.id);
    const invB = state.inventory.filter((i) => i.playerId === b.id && i.roundId === round.id);

    const modA = modifierById(invA[0].modifierId);
    const modB = modifierById(invB[0].modifierId);

    expect(modA.rarity).toBe("epic");
    expect(modB.rarity).toBe("common");
  });

  it("no otorga modificador si no hay ids habilitados", () => {
    const { state, t, a, b } = setup();
    const round = state.rounds.find((r) => r.kind === 1)!;
    round.modifiersFrozen = { ...DEFAULT_MODIFIER_SETTINGS };

    const gameA = state.games.find((g) => g.playerId === a.id && g.roundId === round.id)!;
    recordRoll(state, {
      playerId: a.id,
      roundId: round.id,
      pins: 0,
      actorId: "admin",
      expectedVersion: gameA.version,
      idempotencyKey: "k1",
      exceptionalTotal: 100,
    });

    const gameB = state.games.find((g) => g.playerId === b.id && g.roundId === round.id)!;
    recordRoll(state, {
      playerId: b.id,
      roundId: round.id,
      pins: 0,
      actorId: "admin",
      expectedVersion: gameB.version,
      idempotencyKey: "k2",
      exceptionalTotal: 200,
    });

    completeRound(state, t.id, "admin");

    const invA = state.inventory.filter((i) => i.playerId === a.id && i.roundId === round.id);
    const invB = state.inventory.filter((i) => i.playerId === b.id && i.roundId === round.id);

    expect(invA.length).toBe(0);
    expect(invB.length).toBe(0);
  });
});
