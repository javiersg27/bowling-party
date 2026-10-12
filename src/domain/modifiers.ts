import type { ActiveEffect, InventoryItem, ModifierSettings, Rarity, TargetKind } from "./types";
import { lastCompletedFrameIsStrike, scoreGame } from "./bowling";

export interface ModifierDef {
  id: string;
  name: string;
  icon: string;
  description: string;
  rarity: Rarity;
  weight: number;
  targets: TargetKind;
  durationFrames: number;
  physical: boolean;
  negative: boolean;
  selfOk: boolean;
}

export const MODIFIER_CATALOG: ModifierDef[] = [
  { id: "gold_coins", name: "Monedas doradas", icon: "🪙", description: "+5 puntos de bonificación.", rarity: "common", weight: 10, targets: "self", durationFrames: 0, physical: false, negative: false, selfOk: true },
  { id: "turbo", name: "Turbo", icon: "🚀", description: "+10 puntos de bonificación.", rarity: "common", weight: 9, targets: "self", durationFrames: 0, physical: false, negative: false, selfOk: true },
  { id: "shield", name: "Escudo", icon: "🛡️", description: "Bloquea el siguiente modificador negativo recibido.", rarity: "common", weight: 8, targets: "self", durationFrames: 10, physical: false, negative: false, selfOk: true },
  { id: "borrowed_ball", name: "Bola prestada", icon: "🎱", description: "Eliges qué bola física debe usar otro jugador en su próximo lanzamiento (con consentimiento).", rarity: "common", weight: 7, targets: "other_lane", durationFrames: 1, physical: true, negative: true, selfOk: false },
  { id: "ball_swap", name: "Intercambio de bolas", icon: "🔄", description: "Dos jugadores intercambian bolas en el próximo lanzamiento si ambos aceptan y la bolera lo permite.", rarity: "common", weight: 6, targets: "other_lane", durationFrames: 1, physical: true, negative: false, selfOk: false },
  { id: "prediction", name: "Predicción", icon: "🔮", description: "Apuestas cuántos bolos derribará tu próximo lanzamiento. Si aciertas, recibes una bonificación igual a esos puntos.", rarity: "common", weight: 7, targets: "self", durationFrames: 1, physical: false, negative: false, selfOk: true },
  { id: "gold_aim", name: "Puntería de oro", icon: "🎯", description: "+5 si consigues un strike en tu próximo frame.", rarity: "common", weight: 8, targets: "self", durationFrames: 1, physical: false, negative: false, selfOk: true },
  { id: "coin_steal", name: "Robamonedas", icon: "🦝", description: "Robas hasta 5 puntos de bonificación a otro jugador de tu pista.", rarity: "common", weight: 7, targets: "other_lane", durationFrames: 0, physical: false, negative: true, selfOk: false },
  { id: "lucky_retry", name: "Repetición de suerte", icon: "🍀", description: "Permite volver a girar una ruleta de modificadores una vez.", rarity: "common", weight: 6, targets: "self", durationFrames: 4, physical: false, negative: false, selfOk: true },
  { id: "point_magnet", name: "Imán de puntos", icon: "🧲", description: "+3 puntos por cada bolo derribado en el siguiente lanzamiento, con máximo de +15.", rarity: "common", weight: 7, targets: "self", durationFrames: 1, physical: false, negative: false, selfOk: true },
  { id: "blind_throw", name: "Tiro a ciegas", icon: "🙈", description: "Obliga a otro jugador a un lanzamiento con antifaz, solo con consentimiento y supervisión. Si no es seguro, se sustituye por un reto virtual.", rarity: "uncommon", weight: 5, targets: "other_lane", durationFrames: 1, physical: true, negative: true, selfOk: false },
  { id: "mystery_ball", name: "Bola misteriosa", icon: "🎁", description: "Eliges una bola de peso y tamaño adecuados para el próximo turno de otro jugador, con consentimiento.", rarity: "uncommon", weight: 5, targets: "other_lane", durationFrames: 1, physical: true, negative: true, selfOk: false },
  { id: "freeze", name: "Congelación", icon: "❄️", description: "El jugador objetivo no puede utilizar modificadores durante un frame.", rarity: "uncommon", weight: 6, targets: "other_lane", durationFrames: 1, physical: false, negative: true, selfOk: false },
  { id: "point_thief", name: "Ladrón de puntos", icon: "🕵️", description: "Transfiere hasta 10 puntos de bonificación del objetivo a tu marcador.", rarity: "uncommon", weight: 6, targets: "other_lane", durationFrames: 0, physical: false, negative: true, selfOk: false },
  { id: "double_or_nothing", name: "Doble o nada", icon: "⚖️", description: "En tu próximo lanzamiento, si cumples el objetivo declarado duplicas sus puntos como bonificación; si fallas, pierdes hasta 5 de bonificación.", rarity: "uncommon", weight: 5, targets: "self", durationFrames: 1, physical: false, negative: false, selfOk: true },
  { id: "prize_strike", name: "Strike premiado", icon: "🏆", description: "+15 puntos de bonificación si consigues un strike en el siguiente frame.", rarity: "uncommon", weight: 6, targets: "self", durationFrames: 1, physical: false, negative: false, selfOk: true },
  { id: "fate_swap", name: "Cambio de destino", icon: "🔀", description: "Intercambia un modificador del inventario con otro jugador, cuando ambos inventarios lo permitan.", rarity: "uncommon", weight: 5, targets: "other_lane", durationFrames: 0, physical: false, negative: false, selfOk: false },
  { id: "vengeance", name: "Venganza", icon: "⚡", description: "Si alguien te aplica un modificador negativo, devuelves el 50% de su penalización.", rarity: "uncommon", weight: 5, targets: "self", durationFrames: 10, physical: false, negative: false, selfOk: true },
  { id: "hex", name: "Maleficio", icon: "😈", description: "Aplica −10 puntos de bonificación a un rival.", rarity: "uncommon", weight: 6, targets: "other_lane", durationFrames: 0, physical: false, negative: true, selfOk: false },
  { id: "shared_luck", name: "Suerte compartida", icon: "🤝", description: "Concede +10 a un compañero de equipo.", rarity: "uncommon", weight: 6, targets: "teammate", durationFrames: 0, physical: false, negative: false, selfOk: false },
  { id: "superstrike", name: "Superstrike", icon: "💥", description: "Duplica como bonificación los puntos base del siguiente lanzamiento.", rarity: "epic", weight: 4, targets: "self", durationFrames: 1, physical: false, negative: false, selfOk: true },
  { id: "master_steal", name: "Robo maestro", icon: "👑", description: "Transfiere hasta 20 puntos de bonificación de otro jugador.", rarity: "epic", weight: 3, targets: "other_lane", durationFrames: 0, physical: false, negative: true, selfOk: false },
  { id: "pin_storm", name: "Tormenta de bolos", icon: "🌪️", description: "+20 puntos de bonificación para tu equipo, asignados al jugador que activa el objeto.", rarity: "epic", weight: 3, targets: "self", durationFrames: 0, physical: false, negative: false, selfOk: true },
  { id: "chasing_shell", name: "Caparazón perseguidor", icon: "🐢", description: "Aplica −15 puntos de bonificación al jugador que lidera tu pista.", rarity: "epic", weight: 4, targets: "lane_leader", durationFrames: 0, physical: false, negative: true, selfOk: false },
  { id: "invincible_star", name: "Estrella invencible", icon: "⭐", description: "Inmunidad frente a objetos negativos durante dos frames.", rarity: "epic", weight: 3, targets: "self", durationFrames: 2, physical: false, negative: false, selfOk: true },
  { id: "chaos_mode", name: "Modo caos", icon: "🎲", description: "Todos los jugadores de tu pista reciben un modificador aleatorio (sin encadenar otro Modo caos).", rarity: "epic", weight: 2, targets: "none", durationFrames: 0, physical: false, negative: false, selfOk: true },
  { id: "score_swap", name: "Intercambio de puntuación", icon: "♻️", description: "Intercambia únicamente los saldos de bonificación de dos jugadores, no sus puntos oficiales.", rarity: "epic", weight: 3, targets: "other_lane", durationFrames: 0, physical: false, negative: false, selfOk: false },
  { id: "x3", name: "Multiplicador x3", icon: "✖️", description: "Triplica como bonificación los puntos base de un lanzamiento, con límite configurable.", rarity: "epic", weight: 3, targets: "self", durationFrames: 1, physical: false, negative: false, selfOk: true },
  { id: "legendary_roulette", name: "Ruleta legendaria", icon: "🎰", description: "Concede tres objetos aleatorios; el jugador elige uno.", rarity: "epic", weight: 2, targets: "self", durationFrames: 0, physical: false, negative: false, selfOk: true },
  { id: "impossible_comeback", name: "Remontada imposible", icon: "🌈", description: "Si eres el último de tu pista, recibes +25 puntos de bonificación.", rarity: "epic", weight: 3, targets: "self", durationFrames: 0, physical: false, negative: false, selfOk: true },
];

export const PRESETS: Record<Exclude<ModifierSettings["preset"], "custom">, Partial<ModifierSettings>> = {
  fun: {
    preset: "fun",
    enabledIds: MODIFIER_CATALOG.map((m) => m.id),
    checkpointFrames: [2, 4, 6, 8],
    inventoryLimit: 2,
    weightsByPlace: {
      first: { common: 60, uncommon: 30, epic: 10 },
      middle: { common: 30, uncommon: 45, epic: 25 },
      last: { common: 10, uncommon: 40, epic: 50 },
    },
  },
  competitive: {
    preset: "competitive",
    enabledIds: ["gold_coins", "turbo", "shield", "gold_aim", "point_magnet", "prize_strike", "shared_luck", "freeze", "hex"],
    checkpointFrames: [4, 8],
    inventoryLimit: 1,
    weightsByPlace: {
      first: { common: 80, uncommon: 18, epic: 2 },
      middle: { common: 55, uncommon: 40, epic: 5 },
      last: { common: 35, uncommon: 50, epic: 15 },
    },
  },
  chaos: {
    preset: "chaos",
    enabledIds: MODIFIER_CATALOG.map((m) => m.id),
    checkpointFrames: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    inventoryLimit: 2,
    weightsByPlace: {
      first: { common: 25, uncommon: 35, epic: 40 },
      middle: { common: 15, uncommon: 35, epic: 50 },
      last: { common: 5, uncommon: 25, epic: 70 },
    },
  },
};

export function modifierById(id: string): ModifierDef {
  const found = MODIFIER_CATALOG.find((m) => m.id === id);
  if (!found) throw new Error(`Modificador desconocido: ${id}`);
  return found;
}

export interface PlayerSnapshot {
  id: string;
  teamId: string;
  laneId: string;
  official: number;
  bonus: number;
  total: number;
  rolls: number[];
  inventory: InventoryItem[];
  effects: ActiveEffect[];
  placeInLane: number;
  lastInLane: boolean;
  leaderInLane: boolean;
}

export interface ActivationInput {
  actor: PlayerSnapshot;
  target?: PlayerSnapshot;
  modifierId: string;
  inventoryId: string;
  roundKind: 1 | 2 | 3;
  modifiersEnabled: boolean;
  settings: ModifierSettings;
  frame: number;
  now: string;
  idempotencyKey: string;
  seenKeys: Set<string>;
  payload?: Record<string, unknown>;
  rng: () => number;
  lanePlayers: PlayerSnapshot[];
}

export interface BonusPatch {
  playerId: string;
  delta: number;
  reason: string;
}

export interface ActivationOutcome {
  ok: boolean;
  error?: string;
  status: "applied" | "blocked" | "waiting_consent" | "cancelled" | "converted";
  patches: BonusPatch[];
  newEffects: ActiveEffect[];
  removeEffectIds: string[];
  consumeInventory: boolean;
  extraGrants: { playerId: string; modifierId: string }[];
  swapInventory?: { a: string; b: string };
  message: string;
  animation: string;
}

export function clampBonus(value: number, settings: ModifierSettings): number {
  return Math.min(settings.bonusMax, Math.max(settings.bonusMin, value));
}

export function totalScore(official: number, bonus: number): number {
  return Math.max(0, official + bonus);
}

export function placeWeights(place: number, fieldSize: number, settings: ModifierSettings) {
  if (place <= 1) return settings.weightsByPlace.first;
  if (place >= fieldSize) return settings.weightsByPlace.last;
  return settings.weightsByPlace.middle;
}

export function rollModifier(
  enabled: ModifierDef[],
  rarityWeights: { common: number; uncommon: number; epic: number },
  rng: () => number,
  excludeIds: string[] = [],
): ModifierDef | null {
  const pool = enabled.filter((m) => !excludeIds.includes(m.id));
  if (!pool.length) return null;
  const r = rng() * (rarityWeights.common + rarityWeights.uncommon + rarityWeights.epic);
  let rarity: Rarity = "common";
  if (r < rarityWeights.epic) rarity = "epic";
  else if (r < rarityWeights.epic + rarityWeights.uncommon) rarity = "uncommon";
  const byRarity = pool.filter((m) => m.rarity === rarity);
  const use = byRarity.length ? byRarity : pool;
  const total = use.reduce((s, m) => s + m.weight, 0);
  let tick = rng() * total;
  for (const m of use) {
    tick -= m.weight;
    if (tick <= 0) return m;
  }
  return use[use.length - 1] ?? null;
}

function hasStar(p: PlayerSnapshot) {
  return p.effects.some((e) => e.kind === "star" && e.remainingFrames > 0);
}
function hasShield(p: PlayerSnapshot) {
  return p.effects.some((e) => e.kind === "shield" && e.remainingFrames > 0);
}
function hasFreeze(p: PlayerSnapshot) {
  return p.effects.some((e) => e.kind === "freeze" && e.remainingFrames > 0);
}

function steal(fromBonus: number, amount: number) {
  const taken = Math.max(0, Math.min(amount, fromBonus));
  return taken;
}

function applyNegative(
  target: PlayerSnapshot,
  actor: PlayerSnapshot,
  amount: number,
  reason: string,
): { patches: BonusPatch[]; removeEffectIds: string[]; extra: BonusPatch[]; blocked: boolean; converted?: string } {
  if (hasStar(target)) {
    return { patches: [], removeEffectIds: [], extra: [], blocked: true, converted: "star" };
  }
  const shield = target.effects.find((e) => e.kind === "shield");
  if (shield || hasShield(target)) {
    return {
      patches: [],
      removeEffectIds: shield ? [shield.id] : target.effects.filter((e) => e.kind === "shield").map((e) => e.id),
      extra: [],
      blocked: true,
      converted: "shield",
    };
  }
  const patches: BonusPatch[] = [{ playerId: target.id, delta: amount, reason }];
  const extra: BonusPatch[] = [];
  const vengeance = target.effects.find((e) => e.kind === "vengeance");
  if (vengeance && amount < 0) {
    extra.push({ playerId: actor.id, delta: Math.floor(amount / 2), reason: "Venganza (50%)" });
  }
  return { patches, removeEffectIds: [], extra, blocked: false };
}

export function resolveActivation(input: ActivationInput): ActivationOutcome {
  const def = modifierById(input.modifierId);
  if (input.seenKeys.has(input.idempotencyKey)) {
    return fail("Esta activación ya se procesó (idempotencia).", "blocked");
  }
  if (!input.modifiersEnabled) {
    return fail("Los modificadores no están habilitados en esta ronda.", "blocked");
  }
  if (!input.settings.enabledIds.includes(def.id)) {
    return fail("Este modificador está desactivado en el torneo.", "blocked");
  }
  const item = input.actor.inventory.find((i) => i.id === input.inventoryId);
  if (!item || item.status !== "held") {
    return fail("No tienes ese objeto disponible.", "blocked");
  }
  if (item.modifierId !== def.id) {
    return fail("El objeto no coincide con el inventario.", "blocked");
  }
  if (hasFreeze(input.actor) && def.id !== "invincible_star") {
    return fail("Estás congelado y no puedes usar modificadores este frame.", "blocked");
  }
  if (def.targets !== "self" && def.targets !== "none" && def.targets !== "lane_leader" && !input.target) {
    return fail("Debes elegir un objetivo válido.", "blocked");
  }
  if (input.target && input.settings.laneRestrictions && input.target.laneId !== input.actor.laneId && def.targets !== "teammate") {
    return fail("El objetivo debe estar en tu misma pista.", "blocked");
  }
  if (def.targets === "other_lane" && input.target?.id === input.actor.id) {
    return fail("No puedes usarlo sobre ti mismo.", "blocked");
  }
  if (def.targets === "teammate") {
    if (!input.target || input.target.teamId !== input.actor.teamId || input.target.id === input.actor.id) {
      return fail("Debes elegir un compañero de equipo.", "blocked");
    }
  }

  let target = input.target;
  if (def.targets === "lane_leader") {
    target = input.lanePlayers.find((p) => p.leaderInLane) ?? input.lanePlayers[0];
    if (!target) return fail("No hay líder de pista.", "blocked");
    if (target.id === input.actor.id) {
      return fail("No puedes lanzar el caparazón contra ti mismo: ya lideras la pista.", "blocked");
    }
  }

  const base: ActivationOutcome = {
    ok: true,
    status: "applied",
    patches: [],
    newEffects: [],
    removeEffectIds: [],
    consumeInventory: true,
    extraGrants: [],
    message: `${def.name} activado.`,
    animation: def.id,
  };

  const addEffect = (kind: ActiveEffect["kind"], playerId: string, frames: number, data: Record<string, unknown> = {}) => {
    base.newEffects.push({
      id: `${kind}-${playerId}-${input.now}`,
      playerId,
      roundId: "",
      kind,
      remainingFrames: frames,
      data,
    });
  };

  switch (def.id) {
    case "gold_coins":
      base.patches.push({ playerId: input.actor.id, delta: 5, reason: def.name });
      break;
    case "turbo":
      base.patches.push({ playerId: input.actor.id, delta: 10, reason: def.name });
      break;
    case "shield":
      addEffect("shield", input.actor.id, 10);
      break;
    case "borrowed_ball":
    case "ball_swap":
    case "blind_throw":
    case "mystery_ball":
      if (!input.settings.physicalEffectsEnabled) {
        base.status = "converted";
        if (target) {
          const n = applyNegative(target, input.actor, input.settings.virtualFallbackPenalty, "Reto virtual (efecto físico no viable)");
          base.patches.push(...n.patches, ...n.extra);
          base.removeEffectIds.push(...n.removeEffectIds);
        }
        base.message = "El efecto físico no está habilitado: se aplica la penalización virtual configurada.";
        break;
      }
      if (input.payload?.consent !== true) {
        base.status = "waiting_consent";
        base.consumeInventory = false;
        base.message = "Esperando consentimiento del objetivo (y del responsable si procede). No se interfiere con una bola en movimiento.";
        break;
      }
      addEffect(def.id as ActiveEffect["kind"], target!.id, 1, { from: input.actor.id });
      if (def.id === "ball_swap") addEffect("ball_swap", input.actor.id, 1, { with: target!.id });
      break;
    case "prediction": {
      const guess = Number(input.payload?.pins);
      if (!Number.isInteger(guess) || guess < 0 || guess > 10) {
        return fail("Declara cuántos bolos apostar (0-10).", "blocked");
      }
      addEffect("prediction", input.actor.id, 1, { guess });
      break;
    }
    case "gold_aim":
      addEffect("gold_aim", input.actor.id, 1);
      break;
    case "coin_steal": {
      if (!target) return fail("Objetivo inválido.", "blocked");
      const n = applyNegative(target, input.actor, 0, def.name);
      if (n.blocked) {
        base.status = "blocked";
        base.removeEffectIds.push(...n.removeEffectIds);
        base.message = n.converted === "star" ? "La estrella invencible absorbe el robo." : "El escudo bloquea Robamonedas.";
        break;
      }
      const taken = steal(target.bonus, 5);
      base.patches.push({ playerId: target.id, delta: -taken, reason: def.name });
      base.patches.push({ playerId: input.actor.id, delta: taken, reason: def.name });
      base.patches.push(...n.extra);
      break;
    }
    case "lucky_retry":
      addEffect("retry", input.actor.id, 4);
      break;
    case "point_magnet":
      addEffect("magnet", input.actor.id, 1);
      break;
    case "freeze":
      if (!target) return fail("Objetivo inválido.", "blocked");
      {
        const n = applyNegative(target, input.actor, 0, def.name);
        if (n.blocked) {
          base.status = "blocked";
          base.removeEffectIds.push(...n.removeEffectIds);
          base.message = "El objetivo está protegido.";
          break;
        }
        addEffect("freeze", target.id, 1);
      }
      break;
    case "point_thief": {
      if (!target) return fail("Objetivo inválido.", "blocked");
      const n = applyNegative(target, input.actor, 0, def.name);
      if (n.blocked) {
        base.status = "blocked";
        base.removeEffectIds.push(...n.removeEffectIds);
        base.message = "Protección activa: el robo falla.";
        break;
      }
      const taken = steal(target.bonus, 10);
      base.patches.push({ playerId: target.id, delta: -taken, reason: def.name });
      base.patches.push({ playerId: input.actor.id, delta: taken, reason: def.name });
      break;
    }
    case "double_or_nothing": {
      const goal = Number(input.payload?.pins ?? 10);
      addEffect("double_or_nothing", input.actor.id, 1, { goal });
      break;
    }
    case "prize_strike":
      addEffect("strike_bonus", input.actor.id, 1, { amount: 15 });
      break;
    case "fate_swap": {
      if (!target) return fail("Objetivo inválido.", "blocked");
      const otherItem = target.inventory.find((i) => i.status === "held" && i.id !== input.inventoryId);
      if (!otherItem) return fail("El rival no tiene un objeto intercambiable.", "blocked");
      base.swapInventory = { a: input.inventoryId, b: otherItem.id };
      break;
    }
    case "vengeance":
      addEffect("vengeance", input.actor.id, 10);
      break;
    case "hex": {
      if (!target) return fail("Objetivo inválido.", "blocked");
      const n = applyNegative(target, input.actor, -10, def.name);
      base.patches.push(...n.patches, ...n.extra);
      base.removeEffectIds.push(...n.removeEffectIds);
      if (n.blocked) {
        base.status = "blocked";
        base.message = "El maleficio ha sido absorbido.";
      }
      break;
    }
    case "shared_luck":
      if (!target) return fail("Objetivo inválido.", "blocked");
      base.patches.push({ playerId: target.id, delta: 10, reason: def.name });
      break;
    case "superstrike":
      addEffect("superstrike", input.actor.id, 1);
      break;
    case "master_steal": {
      if (!target) return fail("Objetivo inválido.", "blocked");
      const n = applyNegative(target, input.actor, 0, def.name);
      if (n.blocked) {
        base.status = "blocked";
        base.removeEffectIds.push(...n.removeEffectIds);
        base.message = "El robo maestro rebota en la protección.";
        break;
      }
      const taken = steal(target.bonus, 20);
      base.patches.push({ playerId: target.id, delta: -taken, reason: def.name });
      base.patches.push({ playerId: input.actor.id, delta: taken, reason: def.name });
      break;
    }
    case "pin_storm":
      base.patches.push({ playerId: input.actor.id, delta: 20, reason: def.name });
      break;
    case "chasing_shell": {
      if (!target) return fail("No hay líder.", "blocked");
      const n = applyNegative(target, input.actor, -15, def.name);
      base.patches.push(...n.patches, ...n.extra);
      base.removeEffectIds.push(...n.removeEffectIds);
      if (n.blocked) {
        base.status = "blocked";
        base.message = "El líder estaba protegido.";
      }
      break;
    }
    case "invincible_star":
      addEffect("star", input.actor.id, 2);
      break;
    case "chaos_mode": {
      const enabled = MODIFIER_CATALOG.filter((m) => input.settings.enabledIds.includes(m.id) && m.id !== "chaos_mode");
      for (const p of input.lanePlayers) {
        const picked = rollModifier(enabled, input.settings.weightsByPlace.middle, input.rng, ["chaos_mode"]);
        if (picked) base.extraGrants.push({ playerId: p.id, modifierId: picked.id });
      }
      base.message = "¡Modo caos! Toda la pista recibe un objeto.";
      break;
    }
    case "score_swap": {
      if (!target) return fail("Objetivo inválido.", "blocked");
      base.patches.push({ playerId: input.actor.id, delta: target.bonus - input.actor.bonus, reason: def.name });
      base.patches.push({ playerId: target.id, delta: input.actor.bonus - target.bonus, reason: def.name });
      break;
    }
    case "x3":
      addEffect("x3", input.actor.id, 1, { cap: input.settings.x3Cap });
      break;
    case "legendary_roulette": {
      const enabled = MODIFIER_CATALOG.filter((m) => input.settings.enabledIds.includes(m.id) && m.id !== "legendary_roulette");
      const picks: string[] = [];
      for (let k = 0; k < 3; k++) {
        const m = rollModifier(enabled, { common: 20, uncommon: 30, epic: 50 }, input.rng, picks);
        if (m) picks.push(m.id);
      }
      base.consumeInventory = true;
      base.message = "Elige uno de los tres objetos legendarios.";
      (base as ActivationOutcome & { choiceIds?: string[] }).choiceIds = picks;
      break;
    }
    case "impossible_comeback":
      if (!input.actor.lastInLane) {
        return fail("Solo el último de la pista puede usar Remontada imposible.", "blocked");
      }
      base.patches.push({ playerId: input.actor.id, delta: 25, reason: def.name });
      break;
    default:
      return fail("Modificador no implementado.", "blocked");
  }

  return base;
}

function fail(error: string, status: ActivationOutcome["status"]): ActivationOutcome {
  return {
    ok: false,
    error,
    status,
    patches: [],
    newEffects: [],
    removeEffectIds: [],
    consumeInventory: false,
    extraGrants: [],
    message: error,
    animation: "fail",
  };
}

export function resolveThrowEffects(args: {
  player: PlayerSnapshot;
  pins: number;
  settings: ModifierSettings;
}): { patches: BonusPatch[]; consumeEffectIds: string[] } {
  const patches: BonusPatch[] = [];
  const consumeEffectIds: string[] = [];
  const g = scoreGame(args.player.rolls);
  const strikeNow = lastCompletedFrameIsStrike(args.player.rolls);

  for (const effect of args.player.effects) {
    switch (effect.kind) {
      case "magnet":
        patches.push({ playerId: args.player.id, delta: Math.min(15, args.pins * 3), reason: "Imán de puntos" });
        consumeEffectIds.push(effect.id);
        break;
      case "prediction":
        if (Number(effect.data.guess) === args.pins) {
          patches.push({ playerId: args.player.id, delta: args.pins, reason: "Predicción acertada" });
        }
        consumeEffectIds.push(effect.id);
        break;
      case "double_or_nothing":
        if (args.pins === Number(effect.data.goal)) {
          patches.push({ playerId: args.player.id, delta: args.pins * 2, reason: "Doble o nada" });
        } else {
          patches.push({ playerId: args.player.id, delta: -Math.min(5, args.player.bonus), reason: "Doble o nada (fallo)" });
        }
        consumeEffectIds.push(effect.id);
        break;
      case "superstrike":
        patches.push({ playerId: args.player.id, delta: args.pins * 2, reason: "Superstrike" });
        consumeEffectIds.push(effect.id);
        break;
      case "x3":
        patches.push({
          playerId: args.player.id,
          delta: Math.min(Number(effect.data.cap ?? args.settings.x3Cap), args.pins * 3),
          reason: "Multiplicador x3",
        });
        consumeEffectIds.push(effect.id);
        break;
      case "gold_aim":
        if (strikeNow) patches.push({ playerId: args.player.id, delta: 5, reason: "Puntería de oro" });
        if (g.frames.find((f) => f.index === g.currentFrame)?.isComplete || strikeNow) consumeEffectIds.push(effect.id);
        break;
      case "strike_bonus":
        if (strikeNow) patches.push({ playerId: args.player.id, delta: Number(effect.data.amount ?? 15), reason: "Strike premiado" });
        if (strikeNow || lastFrameClosed(args.player.rolls)) consumeEffectIds.push(effect.id);
        break;
      default:
        break;
    }
  }
  return { patches, consumeEffectIds };
}

function lastFrameClosed(rolls: number[]) {
  const g = scoreGame(rolls);
  const last = [...g.frames].reverse().find((f) => f.rolls.length);
  return Boolean(last?.isComplete);
}

export function tickEffectsAfterFrame(effects: ActiveEffect[], completedFrame: number): ActiveEffect[] {
  return effects
    .map((e) => ({ ...e, remainingFrames: e.remainingFrames - 1, data: { ...e.data, lastFrame: completedFrame } }))
    .filter((e) => e.remainingFrames > 0);
}

export type ActivationOutcomeExtra = ActivationOutcome & { choiceIds?: string[] };
