import type {
  ActorState,
  ArmorType,
  HitboxZone,
  Team,
  WeaponId,
} from './types';
import { WEAPONS } from './weapons';

export const ECONOMY_CONSTANTS = {
  STARTING_CASH: 800,
  MAX_CASH: 16000,
  WIN_ELIMINATION_BONUS: 3250,
  WIN_OBJECTIVE_BONUS: 3500, // C4 detonation or defusal
  LOSS_BASE_BONUS: 1400,
  LOSS_STREAK_STEP: 500,
  LOSS_MAX_BONUS: 3400,
  KEVLAR_PRICE: 650,
  KEVLAR_HELMET_PRICE: 1000,
  HELMET_UPGRADE_PRICE: 350,
  DEFUSE_KIT_PRICE: 400,
  BOMB_PLANT_REWARD: 300,
};

export const ROUND_CONSTANTS = {
  BUY_PHASE_SECONDS: 15,
  LIVE_ROUND_SECONDS: 120, // 2:00 round timer
  C4_DETONATION_SECONDS: 40,
  C4_PLANT_SECONDS: 3.2,
  C4_DEFUSE_SECONDS: 10.0,
  C4_DEFUSE_KIT_SECONDS: 5.0,
  ROUND_END_DELAY_SECONDS: 4.0,
  DEFAULT_MAX_ROUNDS: 12, // MR6 competitive (6 rounds per half, first to 7)
};

export function clampCash(cash: number): number {
  return Math.max(0, Math.min(ECONOMY_CONSTANTS.MAX_CASH, Math.round(cash)));
}

export function computeLossBonus(consecutiveLosses: number): number {
  const streak = Math.max(1, consecutiveLosses);
  const bonus =
    ECONOMY_CONSTANTS.LOSS_BASE_BONUS +
    (streak - 1) * ECONOMY_CONSTANTS.LOSS_STREAK_STEP;
  return Math.min(ECONOMY_CONSTANTS.LOSS_MAX_BONUS, bonus);
}

export function computeRoundEndCash(params: {
  currentCash: number;
  won: boolean;
  viaBombObjective: boolean;
  consecutiveLosses: number;
}): number {
  const { currentCash, won, viaBombObjective, consecutiveLosses } = params;
  if (won) {
    const bonus = viaBombObjective
      ? ECONOMY_CONSTANTS.WIN_OBJECTIVE_BONUS
      : ECONOMY_CONSTANTS.WIN_ELIMINATION_BONUS;
    return clampCash(currentCash + bonus);
  }
  return clampCash(currentCash + computeLossBonus(consecutiveLosses));
}

export function getKillReward(weaponId: WeaponId): number {
  return WEAPONS[weaponId]?.killReward ?? 300;
}

export interface DamageCalculationInput {
  weaponId: WeaponId;
  zone: HitboxZone;
  distanceMeters: number;
  targetArmor: number;
  targetHasHelmet: boolean;
  wallbangMultiplier?: number; // 1.0 = direct hit, < 1.0 = penetrated cover
}

export interface DamageCalculationResult {
  hpDamage: number;
  armorDamage: number;
  aimpunch: number;
}

export function calculateBulletDamage(
  input: DamageCalculationInput
): DamageCalculationResult {
  const spec = WEAPONS[input.weaponId];
  const wallFactor = input.wallbangMultiplier ?? 1.0;

  let base = spec.damage;
  // Range falloff
  const falloffSteps = Math.max(0, input.distanceMeters / 10);
  const rangeFactor = Math.max(0.35, 1 - spec.rangeFalloffPer10m * falloffSteps);
  base *= rangeFactor * wallFactor;

  if (input.zone === 'head') {
    base *= spec.headMultiplier;
  } else if (input.zone === 'limb') {
    base *= spec.limbMultiplier;
  }

  let hpDamage = base;
  let armorDamage = 0;

  const armoredZone =
    (input.zone === 'chest' && input.targetArmor > 0) ||
    (input.zone === 'head' && input.targetArmor > 0 && input.targetHasHelmet);

  if (armoredZone) {
    const penetrated = base * spec.armorPen;
    const absorbed = base - penetrated;
    armorDamage = Math.min(input.targetArmor, Math.max(1, Math.round(absorbed * 0.65)));
    hpDamage = penetrated;
  }

  // Ensure starter pistols & SMGs do NOT one-shot kill when target wears a helmet (unless close-range deagle/ak47/awp)
  if (
    input.zone === 'head' &&
    input.targetHasHelmet &&
    input.targetArmor > 0 &&
    (input.weaponId === 'usps' ||
      input.weaponId === 'glock18' ||
      input.weaponId === 'mac10' ||
      input.weaponId === 'mp7')
  ) {
    hpDamage = Math.min(hpDamage, 94);
  }

  // AK-47, Deagle, AWP headshot guarantees 1-tap at standard combat range when not heavily wallbanged
  if (
    input.zone === 'head' &&
    wallFactor >= 0.85 &&
    (input.weaponId === 'ak47' || input.weaponId === 'deagle' || input.weaponId === 'awp') &&
    input.distanceMeters <= 75
  ) {
    hpDamage = Math.max(hpDamage, 105);
  }

  // AWP chest/stomach 1-shot kill when not wallbanged
  if (
    input.weaponId === 'awp' &&
    (input.zone === 'chest' || input.zone === 'head') &&
    wallFactor >= 0.85
  ) {
    hpDamage = Math.max(hpDamage, 108);
  }

  const finalHpDamage = Math.max(1, Math.round(hpDamage));
  // Kevlar eliminates aimpunch flinch
  const aimpunch =
    input.targetArmor > 0 && (input.zone === 'chest' || input.targetHasHelmet)
      ? 0
      : Math.min(0.14, finalHpDamage * 0.0022);

  return {
    hpDamage: finalHpDamage,
    armorDamage,
    aimpunch,
  };
}

export function calculateHeExplosionDamage(
  distanceMeters: number,
  targetArmor: number
): { hpDamage: number; armorDamage: number } {
  const maxRadius = 7.5;
  if (distanceMeters >= maxRadius) return { hpDamage: 0, armorDamage: 0 };
  const falloff = 1 - distanceMeters / maxRadius;
  const raw = 98 * falloff * falloff;
  if (targetArmor > 0) {
    const hpDamage = Math.round(raw * 0.56);
    const armorDamage = Math.min(targetArmor, Math.round(raw * 0.35));
    return { hpDamage, armorDamage };
  }
  return { hpDamage: Math.round(raw), armorDamage: 0 };
}

export function computeWeaponSpread(params: {
  weaponId: WeaponId;
  horizontalSpeed: number;
  isCrouching: boolean;
  isAirborne: boolean;
  recoilBloom: number;
  scopeZoom: 0 | 1 | 2;
}): number {
  const spec = WEAPONS[params.weaponId];
  let spread = 0;

  if (!params.isAirborne && params.horizontalSpeed <= 0.25) {
    // Standing still: 0 movement inaccuracy (pinpoint first shot; spray bloom still applies during burst/spray)
    spread = 0;
  } else {
    spread = spec.baseSpread;
    const speedRatio = Math.min(
      1,
      Math.max(0, (params.horizontalSpeed - 0.25) / Math.max(1, spec.moveSpeed - 0.25))
    );
    // Slow walking (~<=0.60 max speed) gets mild controlled spread; running (>0.60) ramps sharply to full moveSpread
    const moveFactor =
      speedRatio <= 0.6
        ? (speedRatio / 0.6) * 0.18
        : 0.18 + Math.pow((speedRatio - 0.6) / 0.4, 1.35) * 0.82;
    spread += spec.moveSpread * moveFactor;
  }

  // Unscoped sniper rifles (e.g. AWP hipfire) remain inaccurate even when standing still
  if (spec.hasScope && params.scopeZoom === 0) {
    spread += 0.055;
  }

  if (params.isCrouching) {
    spread *= 0.72;
  }
  if (params.isAirborne) {
    spread += 0.11;
  }
  if (!(spec.hasScope && params.scopeZoom > 0)) {
    spread += params.recoilBloom;
  }
  return spread;
}

export function canPlantBombNow(params: {
  isGrounded: boolean;
  wishFwd: number;
  wishStrafe: number;
  horizontalSpeed: number;
}): boolean {
  return (
    params.isGrounded &&
    params.wishFwd === 0 &&
    params.wishStrafe === 0 &&
    params.horizontalSpeed <= 0.35
  );
}

export type BuyValidationResult =
  | { ok: true; cost: number }
  | { ok: false; reason: string };

export function canBuyWeapon(
  actor: Pick<
    ActorState,
    'team' | 'cash' | 'alive' | 'inBuyZone' | 'grenades' | 'primary' | 'secondary' | 'knife'
  >,
  weaponId: WeaponId,
  isBuyPhase: boolean
): BuyValidationResult {
  if (!actor.alive) return { ok: false, reason: 'Cannot buy while eliminated' };
  if (!isBuyPhase) return { ok: false, reason: 'Buy phase has ended' };
  if (!actor.inBuyZone) return { ok: false, reason: 'Leave spawn buy zone' };

  const spec = WEAPONS[weaponId];
  if (!spec || spec.category === 'c4') {
    return { ok: false, reason: 'Item unavailable' };
  }
  if (spec.team !== 'both' && spec.team !== actor.team) {
    return { ok: false, reason: `Restricted to ${spec.team}` };
  }

  if (spec.category === 'knife') {
    return { ok: true, cost: 0 };
  }

  if (spec.category === 'grenade') {
    if (actor.grenades.length >= 4) {
      return { ok: false, reason: 'Max 4 grenades carried' };
    }
    const sameCount = actor.grenades.filter((g) => g === weaponId).length;
    if (weaponId === 'flashbang' && sameCount >= 2) {
      return { ok: false, reason: 'Max 2 Flashbangs' };
    }
    if (weaponId !== 'flashbang' && sameCount >= 1) {
      return { ok: false, reason: `Already carrying ${spec.name}` };
    }
  }

  if (spec.slot === 1 && actor.primary?.id === weaponId) {
    return { ok: false, reason: `Already equipped ${spec.name}` };
  }
  if (spec.slot === 2 && actor.secondary?.id === weaponId) {
    return { ok: false, reason: `Already equipped ${spec.name}` };
  }

  if (actor.cash < spec.price) {
    return { ok: false, reason: 'Insufficient funds' };
  }

  return { ok: true, cost: spec.price };
}

export function getArmorPurchaseCost(
  actor: Pick<ActorState, 'armor' | 'hasHelmet'>,
  desired: Exclude<ArmorType, 'none'>
): number | null {
  if (desired === 'kevlar') {
    if (actor.armor >= 100) return null;
    return ECONOMY_CONSTANTS.KEVLAR_PRICE;
  }
  // kevlar_helmet
  if (actor.armor >= 100 && actor.hasHelmet) return null;
  if (actor.armor >= 100 && !actor.hasHelmet) {
    return ECONOMY_CONSTANTS.HELMET_UPGRADE_PRICE;
  }
  return ECONOMY_CONSTANTS.KEVLAR_HELMET_PRICE;
}

export function isHalftimeRound(roundNumber: number, maxRounds: number): boolean {
  const half = Math.floor(maxRounds / 2);
  return roundNumber === half + 1;
}

export function checkMatchWinner(
  attackerScore: number,
  defenderScore: number,
  maxRounds: number
): Team | 'draw' | null {
  const winThreshold = Math.floor(maxRounds / 2) + 1;
  if (attackerScore >= winThreshold) return 'attackers';
  if (defenderScore >= winThreshold) return 'defenders';
  if (attackerScore + defenderScore >= maxRounds) {
    if (attackerScore > defenderScore) return 'attackers';
    if (defenderScore > attackerScore) return 'defenders';
    return 'draw';
  }
  return null;
}

export function getDefuseDurationSeconds(hasDefuseKit: boolean): number {
  return hasDefuseKit
    ? ROUND_CONSTANTS.C4_DEFUSE_KIT_SECONDS
    : ROUND_CONSTANTS.C4_DEFUSE_SECONDS;
}

export function canPickUpGrenade(
  currentGrenades: ReadonlyArray<ActorState['grenades'][number]>,
  candidate: ActorState['grenades'][number]
): boolean {
  if (currentGrenades.length >= 4) return false;
  const sameCount = currentGrenades.filter((g) => g === candidate).length;
  if (candidate === 'flashbang') return sameCount < 2;
  if (candidate === 'molotov' || candidate === 'incendiary') {
    return !currentGrenades.some((g) => g === 'molotov' || g === 'incendiary');
  }
  return sameCount < 1;
}

export interface DeathDropPlan {
  weapon: {
    slot: 1 | 2;
    id: NonNullable<ActorState['primary']>['id'];
    mag: number;
    reserve: number;
  } | null;
  grenades: ActorState['grenades'];
  c4: boolean;
  defuseKit: boolean;
}

export function selectDeathDrops(
  actor: Pick<ActorState, 'primary' | 'secondary' | 'grenades' | 'hasC4' | 'hasDefuseKit'>
): DeathDropPlan {
  const primaryPrice = actor.primary ? (WEAPONS[actor.primary.id]?.price ?? 0) : -1;
  const secondaryPrice = actor.secondary ? (WEAPONS[actor.secondary.id]?.price ?? 0) : -1;

  let weapon: DeathDropPlan['weapon'] = null;
  if (actor.primary && primaryPrice >= secondaryPrice) {
    weapon = {
      slot: 1,
      id: actor.primary.id,
      mag: actor.primary.mag,
      reserve: actor.primary.reserve,
    };
  } else if (actor.secondary) {
    weapon = {
      slot: 2,
      id: actor.secondary.id,
      mag: actor.secondary.mag,
      reserve: actor.secondary.reserve,
    };
  }

  return {
    weapon,
    grenades: [...actor.grenades],
    c4: actor.hasC4,
    defuseKit: actor.hasDefuseKit,
  };
}

