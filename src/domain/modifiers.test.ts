import { describe, expect, it } from "vitest";
import {
  clampBonus,
  resolveActivation,
  resolveThrowEffects,
  totalScore,
  type ActivationInput,
  type PlayerSnapshot,
} from "./modifiers";
import { DEFAULT_MODIFIER_SETTINGS } from "./types";

const settings = {
  ...DEFAULT_MODIFIER_SETTINGS,
  enabledIds: [
    "gold_coins",
    "hex",
    "shield",
    "coin_steal",
    "x3",
    "superstrike",
    "chasing_shell",
    "impossible_comeback",
    "shared_luck",
  ],
};

function player(over: Partial<PlayerSnapshot> & { id: string }): PlayerSnapshot {
  return {
    teamId: "t1",
    laneId: "l1",
    official: 40,
    bonus: 10,
    total: 50,
    rolls: [],
    inventory: [],
    effects: [],
    placeInLane: 2,
    lastInLane: false,
    leaderInLane: false,
    ...over,
  };
}

function base(over: Partial<ActivationInput>): ActivationInput {
  const actor = over.actor!;
  return {
    actor,
    modifierId: "gold_coins",
    inventoryId: "inv1",
    roundKind: 1,
    modifiersEnabled: true,
    settings,
    frame: 2,
    now: "now",
    idempotencyKey: "k1",
    seenKeys: new Set(),
    rng: () => 0.5,
    lanePlayers: [actor],
    ...over,
  };
}

describe("modificadores", () => {
  it("bonificación positiva", () => {
    const actor = player({
      id: "a",
      inventory: [{ id: "inv1", playerId: "a", roundId: "r", modifierId: "gold_coins", status: "held", grantedAt: "", grantedFrame: 2 }],
    });
    const out = resolveActivation(base({ actor, modifierId: "gold_coins" }));
    expect(out.ok).toBe(true);
    expect(out.patches[0].delta).toBe(5);
  });

  it("maleficio penaliza", () => {
    const actor = player({
      id: "a",
      inventory: [{ id: "inv1", playerId: "a", roundId: "r", modifierId: "hex", status: "held", grantedAt: "", grantedFrame: 2 }],
    });
    const target = player({ id: "b", bonus: 12 });
    const out = resolveActivation(base({ actor, target, modifierId: "hex", lanePlayers: [actor, target] }));
    expect(out.patches.find((p) => p.playerId === "b")?.delta).toBe(-10);
  });

  it("el escudo bloquea un negativo", () => {
    const actor = player({
      id: "a",
      inventory: [{ id: "inv1", playerId: "a", roundId: "r", modifierId: "hex", status: "held", grantedAt: "", grantedFrame: 2 }],
    });
    const target = player({
      id: "b",
      effects: [{ id: "sh", playerId: "b", roundId: "r", kind: "shield", remainingFrames: 2, data: {} }],
    });
    const out = resolveActivation(base({ actor, target, modifierId: "hex", lanePlayers: [actor, target] }));
    expect(out.status).toBe("blocked");
    expect(out.removeEffectIds).toContain("sh");
  });

  it("no transfiere más bonus del que hay", () => {
    const actor = player({
      id: "a",
      bonus: 0,
      inventory: [{ id: "inv1", playerId: "a", roundId: "r", modifierId: "coin_steal", status: "held", grantedAt: "", grantedFrame: 2 }],
    });
    const target = player({ id: "b", bonus: 3 });
    const out = resolveActivation(base({ actor, target, modifierId: "coin_steal", lanePlayers: [actor, target] }));
    expect(out.patches.find((p) => p.playerId === "a")?.delta).toBe(3);
    expect(out.patches.find((p) => p.playerId === "b")?.delta).toBe(-3);
  });

  it("objetivo inválido: uno mismo", () => {
    const actor = player({
      id: "a",
      inventory: [{ id: "inv1", playerId: "a", roundId: "r", modifierId: "hex", status: "held", grantedAt: "", grantedFrame: 2 }],
    });
    const out = resolveActivation(base({ actor, target: actor, modifierId: "hex" }));
    expect(out.ok).toBe(false);
  });

  it("objeto caducado no se activa", () => {
    const actor = player({
      id: "a",
      inventory: [{ id: "inv1", playerId: "a", roundId: "r", modifierId: "gold_coins", status: "expired", grantedAt: "", grantedFrame: 2 }],
    });
    const out = resolveActivation(base({ actor }));
    expect(out.ok).toBe(false);
  });

  it("idempotencia", () => {
    const actor = player({
      id: "a",
      inventory: [{ id: "inv1", playerId: "a", roundId: "r", modifierId: "gold_coins", status: "held", grantedAt: "", grantedFrame: 2 }],
    });
    const out = resolveActivation(base({ actor, seenKeys: new Set(["k1"]) }));
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/idempotencia/);
  });

  it("fuera de ronda válida", () => {
    const actor = player({
      id: "a",
      inventory: [{ id: "inv1", playerId: "a", roundId: "r", modifierId: "gold_coins", status: "held", grantedAt: "", grantedFrame: 2 }],
    });
    const out = resolveActivation(base({ actor, modifiersEnabled: false }));
    expect(out.ok).toBe(false);
  });

  it("multiplicador x3 con tope", () => {
    const actor = player({
      id: "a",
      effects: [{ id: "x", playerId: "a", roundId: "r", kind: "x3", remainingFrames: 1, data: { cap: 30 } }],
      rolls: [4],
    });
    const out = resolveThrowEffects({ player: actor, pins: 4, settings });
    expect(out.patches[0].delta).toBe(12);
  });

  it("superstrike duplica bolos del lanzamiento", () => {
    const actor = player({
      id: "a",
      effects: [{ id: "s", playerId: "a", roundId: "r", kind: "superstrike", remainingFrames: 1, data: {} }],
      rolls: [10],
    });
    expect(resolveThrowEffects({ player: actor, pins: 10, settings }).patches[0].delta).toBe(20);
  });

  it("remontada solo último", () => {
    const actor = player({
      id: "a",
      lastInLane: false,
      inventory: [{ id: "inv1", playerId: "a", roundId: "r", modifierId: "impossible_comeback", status: "held", grantedAt: "", grantedFrame: 2 }],
    });
    expect(resolveActivation(base({ actor, modifierId: "impossible_comeback" })).ok).toBe(false);
  });

  it("suerte compartida exige compañero", () => {
    const actor = player({
      id: "a",
      teamId: "red",
      inventory: [{ id: "inv1", playerId: "a", roundId: "r", modifierId: "shared_luck", status: "held", grantedAt: "", grantedFrame: 2 }],
    });
    const other = player({ id: "b", teamId: "blue" });
    expect(resolveActivation(base({ actor, target: other, modifierId: "shared_luck" })).ok).toBe(false);
  });

  it("total nunca negativo y bonus acotado", () => {
    expect(totalScore(10, -50)).toBe(0);
    expect(clampBonus(999, settings)).toBe(settings.bonusMax);
  });
});
