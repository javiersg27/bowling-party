import { describe, expect, it } from "vitest";
import { currentTurnPlayerId } from "./turn";
import type { LaneAssignment, PlayerGame } from "./types";

const laneId = "l1";
const roundId = "r1";

function game(playerId: string, rolls: number[], complete = false): PlayerGame {
  return {
    playerId,
    roundId,
    laneId,
    rolls,
    official: 0,
    bonus: 0,
    total: 0,
    currentFrame: 1,
    complete,
    scoreStatus: "pending",
    version: 0,
  };
}

function assignment(playerId: string, order: number): LaneAssignment {
  return { id: `as-${playerId}`, roundId, laneId, playerId, order };
}

describe("currentTurnPlayerId", () => {
  it("devuelve el primer jugador en orden cuando todos están en el frame 1", () => {
    const games = [game("a", []), game("b", [])];
    const asgs = [assignment("b", 1), assignment("a", 0)];
    expect(currentTurnPlayerId(games, asgs, laneId, roundId)).toBe("a");
  });

  it("pasa al siguiente jugador cuando el primero completa el frame 1 (spare)", () => {
    const games = [game("a", [3, 7]), game("b", [])]; // a: frame 1 completo (currentFrame 2); b: frame 1
    const asgs = [assignment("a", 0), assignment("b", 1)];
    expect(currentTurnPlayerId(games, asgs, laneId, roundId)).toBe("b");
  });

  it("pasa al siguiente jugador inmediatamente tras un strike", () => {
    const games = [game("a", [10]), game("b", [])]; // a: strike, frame completo (currentFrame 2)
    const asgs = [assignment("a", 0), assignment("b", 1)];
    expect(currentTurnPlayerId(games, asgs, laneId, roundId)).toBe("b");
  });

  it("respeta el order dentro del mismo frame mínimo", () => {
    const games = [game("a", []), game("b", [])];
    const asgs = [assignment("b", 2), assignment("a", 1)];
    expect(currentTurnPlayerId(games, asgs, laneId, roundId)).toBe("a");
  });

  it("devuelve null cuando todos completaron la partida", () => {
    const games = [game("a", [], true), game("b", [], true)];
    const asgs = [assignment("a", 0), assignment("b", 1)];
    expect(currentTurnPlayerId(games, asgs, laneId, roundId)).toBeNull();
  });

  it("devuelve null si no hay juegos de la pista/ronda", () => {
    const games: PlayerGame[] = [];
    const asgs: LaneAssignment[] = [];
    expect(currentTurnPlayerId(games, asgs, laneId, roundId)).toBeNull();
  });

  it("bloquea el frame avanzado hasta que el rezagado termine el frame mínimo", () => {
    const games = [
      game("a", [10, 10, 10]), // a ya avanzó varios frames (currentFrame > 1)
      game("b", []), // b todavía en frame 1
    ];
    const asgs = [assignment("a", 0), assignment("b", 1)];
    expect(currentTurnPlayerId(games, asgs, laneId, roundId)).toBe("b");
  });
});