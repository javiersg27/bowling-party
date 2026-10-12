import { describe, expect, it } from "vitest";
import {
  assignmentFromRow,
  assignmentToRow,
  gameFromRow,
  gameToRow,
  inventoryFromRow,
  inventoryToRow,
  playerFromRow,
  playerToRow,
  roundFromRow,
  roundToRow,
  tournamentFromRow,
  tournamentToRow,
} from "./live";
import type { InventoryItem, LaneAssignment, Player, PlayerGame, Round, Tournament } from "../domain/types";

const tournament: Tournament = {
  id: "t1",
  name: "Torneo",
  description: "d",
  date: "2026-01-01",
  accessCode: "ABC123",
  status: "registration",
  createdBy: "u1",
  settings: {} as Tournament["settings"],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const round: Round = {
  id: "r1",
  tournamentId: "t1",
  kind: 1,
  status: "live",
  modifiersFrozen: null,
  startedAt: "2026-01-01T00:00:00.000Z",
};

const game: PlayerGame = {
  playerId: "p1",
  roundId: "r1",
  laneId: "l1",
  rolls: [10, 7, 3],
  official: 20,
  bonus: 5,
  total: 25,
  currentFrame: 2,
  complete: false,
  scoreStatus: "confirmed",
  version: 3,
};

const assignment: LaneAssignment = {
  id: "a1",
  roundId: "r1",
  laneId: "l1",
  playerId: "p1",
  order: 2,
};

const inventory: InventoryItem = {
  id: "i1",
  playerId: "p1",
  roundId: "r1",
  modifierId: "gold_coins",
  status: "held",
  grantedAt: "2026-01-01T00:00:00.000Z",
  grantedFrame: 4,
};

const player: Player = {
  id: "p1",
  tournamentId: "t1",
  userId: "u1",
  displayName: "Ada",
  avatar: "🐯",
  teamId: "team1",
  uniqueKey: "secret-local",
  banned: false,
};

describe("mapeo motor (camelCase) ↔ Supabase (snake_case)", () => {
  it("tournament renombra access_code / created_by / timestamps", () => {
    const row = tournamentToRow(tournament);
    expect(row.access_code).toBe("ABC123");
    expect(row.created_by).toBe("u1");
    expect(row.created_at).toBe(tournament.createdAt);
    expect(row.accessCode).toBeUndefined();
    expect(tournamentFromRow(row)).toEqual(tournament);
  });

  it("round renombra modifiers_frozen y started_at", () => {
    const row = roundToRow(round);
    expect(row.modifiers_frozen).toBeNull();
    expect(row.started_at).toBe(round.startedAt);
    expect(roundFromRow(row)).toEqual(round);
  });

  it("game renombra current_frame y score_status", () => {
    const row = gameToRow(game);
    expect(row.current_frame).toBe(2);
    expect(row.score_status).toBe("confirmed");
    expect(gameFromRow(row)).toEqual(game);
  });

  it("assignment renombra order → sort_order", () => {
    const row = assignmentToRow(assignment);
    expect(row.sort_order).toBe(2);
    expect(row.order).toBeUndefined();
    expect(assignmentFromRow(row)).toEqual(assignment);
  });

  it("inventory renombra granted_frame y choice_ids", () => {
    const row = inventoryToRow(inventory);
    expect(row.granted_frame).toBe(4);
    expect(row.granted_at).toBe(inventory.grantedAt);
    expect(inventoryFromRow(row)).toEqual(inventory);
  });

  it("player descarta uniqueKey al subir y lo deriva de user_id al bajar", () => {
    const row = playerToRow(player);
    expect(row.uniqueKey).toBeUndefined();
    expect(row.user_id).toBe("u1");
    const back = playerFromRow(row);
    expect(back.userId).toBe("u1");
    expect(back.uniqueKey).toBe("u1");
  });
});
