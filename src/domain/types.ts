export type TournamentStatus =
  | "draft"
  | "registration"
  | "ready"
  | "round_1"
  | "round_2"
  | "round_3"
  | "finished"
  | "archived"
  | "paused"
  | "cancelled";

export type RoundKind = 1 | 2 | 3;
export type Rarity = "common" | "uncommon" | "epic";
export type MemberRole = "player" | "admin" | "lane_marshal";
export type ScoreStatus = "pending" | "confirmed" | "corrected";
export type InventoryStatus = "held" | "activated" | "discarded" | "expired" | "waiting_choice";
export type TargetKind = "self" | "other_lane" | "teammate" | "any_lane" | "lane_leader" | "none";

export type TieBreakRule = "previous_points" | "official_then_bonus" | "head_to_head" | "manual";
export type TeamAssignMode = "player_choice" | "random" | "admin";
export type LaneAssignMode = "auto_spread" | "manual" | "random";

export interface RarityWeights {
  common: number;
  uncommon: number;
  epic: number;
}

export interface ModifierSettings {
  enabledIds: string[];
  checkpointFrames: number[];
  inventoryLimit: number;
  bonusMin: number;
  bonusMax: number;
  physicalEffectsEnabled: boolean;
  laneRestrictions: boolean;
  teamRestrictions: boolean;
  frequencyLabel: string;
  weightsByPlace: {
    first: RarityWeights;
    middle: RarityWeights;
    last: RarityWeights;
  };
  virtualFallbackPenalty: number;
  x3Cap: number;
  preset: "fun" | "competitive" | "chaos" | "custom";
  snapshotAt?: string;
}

export interface ScoringSettings {
  countWarmupRound: boolean;
  round1UsesBonus: boolean;
  round2UsesBonus: boolean;
  round3UsesBonus: boolean;
  round3ModifiersEnabled: boolean;
  upperGroupSize: number | null;
  tieBreak: TieBreakRule;
  finalPositionsByRound3: boolean;
}

export interface TournamentSettings {
  maxPlayersPerTeam: number;
  playersPerLane: number;
  laneCount: number;
  teamCount: number;
  teamAssignMode: TeamAssignMode;
  laneAssignMode: LaneAssignMode;
  modifiers: ModifierSettings;
  scoring: ScoringSettings;
}

export interface Tournament {
  id: string;
  name: string;
  description: string;
  date: string;
  accessCode: string;
  status: TournamentStatus;
  pausedFrom?: TournamentStatus;
  createdBy: string;
  settings: TournamentSettings;
  createdAt: string;
  updatedAt: string;
}

export interface Team {
  id: string;
  tournamentId: string;
  name: string;
  color: string;
  accent: string;
  sortOrder: number;
}

export interface Lane {
  id: string;
  tournamentId: string;
  name: string;
  number: number;
  marshalId?: string;
}

export interface Player {
  id: string;
  tournamentId: string;
  userId: string;
  displayName: string;
  avatar: string;
  teamId: string;
  uniqueKey: string;
  banned: boolean;
}

export interface Round {
  id: string;
  tournamentId: string;
  kind: RoundKind;
  status: "pending" | "live" | "completed";
  modifiersFrozen: ModifierSettings | null;
  startedAt?: string;
  completedAt?: string;
}

export interface LaneAssignment {
  id: string;
  roundId: string;
  laneId: string;
  playerId: string;
  order: number;
}

export interface FrameRolls {
  frame: number;
  rolls: number[];
}

export interface PlayerGame {
  playerId: string;
  roundId: string;
  laneId: string;
  rolls: number[];
  official: number;
  bonus: number;
  total: number;
  currentFrame: number;
  complete: boolean;
  scoreStatus: ScoreStatus;
  version: number;
}

export interface InventoryItem {
  id: string;
  playerId: string;
  roundId: string;
  modifierId: string;
  status: InventoryStatus;
  grantedAt: string;
  grantedFrame: number;
  choiceIds?: string[];
}

export interface ModifierActivation {
  id: string;
  inventoryId: string;
  modifierId: string;
  actorId: string;
  targetId?: string;
  roundId: string;
  frame: number;
  payload: Record<string, unknown>;
  result: Record<string, unknown>;
  status: "applied" | "blocked" | "waiting_consent" | "cancelled" | "converted";
  createdAt: string;
}

export interface GameEvent {
  id: string;
  tournamentId: string;
  type: string;
  message: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  tournamentId: string;
  actorId: string;
  action: string;
  detail: string;
  createdAt: string;
}

export interface ActiveEffect {
  id: string;
  playerId: string;
  roundId: string;
  kind:
    | "shield"
    | "star"
    | "freeze"
    | "vengeance"
    | "gold_aim"
    | "strike_bonus"
    | "magnet"
    | "prediction"
    | "double_or_nothing"
    | "superstrike"
    | "x3"
    | "borrowed_ball"
    | "ball_swap"
    | "mystery_ball"
    | "blind_throw"
    | "retry";
  remainingFrames: number;
  data: Record<string, unknown>;
}

export interface FinalGroup {
  id: "upper" | "lower";
  teamIds: string[];
  laneIds: string[];
}

export const DEFAULT_MODIFIER_SETTINGS: ModifierSettings = {
  enabledIds: [],
  checkpointFrames: [2, 4, 6, 8],
  inventoryLimit: 2,
  bonusMin: -80,
  bonusMax: 200,
  physicalEffectsEnabled: true,
  laneRestrictions: true,
  teamRestrictions: false,
  frequencyLabel: "estándar",
  weightsByPlace: {
    first: { common: 70, uncommon: 25, epic: 5 },
    middle: { common: 35, uncommon: 45, epic: 20 },
    last: { common: 15, uncommon: 40, epic: 45 },
  },
  virtualFallbackPenalty: -8,
  x3Cap: 30,
  preset: "fun",
};

export const DEFAULT_SCORING: ScoringSettings = {
  countWarmupRound: true,
  round1UsesBonus: true,
  round2UsesBonus: false,
  round3UsesBonus: false,
  round3ModifiersEnabled: false,
  upperGroupSize: null,
  tieBreak: "previous_points",
  finalPositionsByRound3: true,
};

export const TEAM_PALETTE = [
  { name: "Rojo Fuego", color: "#ef4444", accent: "#fecaca" },
  { name: "Azul Relámpago", color: "#2563eb", accent: "#bfdbfe" },
  { name: "Verde Turbo", color: "#16a34a", accent: "#bbf7d0" },
  { name: "Amarillo Rayo", color: "#eab308", accent: "#fef08a" },
  { name: "Violeta Nova", color: "#7c3aed", accent: "#ddd6fe" },
  { name: "Naranja Cometa", color: "#f97316", accent: "#fed7aa" },
  { name: "Cian Glitch", color: "#06b6d4", accent: "#a5f3fc" },
  { name: "Rosa Party", color: "#db2777", accent: "#fbcfe8" },
];

export const AVATARS = [
  "🎳",
  "🐯",
  "🦊",
  "🐼",
  "🐸",
  "🐧",
  "🐙",
  "🦄",
  "🐺",
  "🐲",
  "🐱",
  "🐵",
  "🐰",
  "🦉",
  "🦁",
  "🐨",
];
