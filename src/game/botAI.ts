import {
  findNearestWaypoint,
  findWaypointPath,
  getPlantSiteAt,
  hasLineOfSight,
  raycastMapBoxes,
  SITE_ZONES,
  WAYPOINT_MAP,
  WAYPOINTS,
} from './mapData';
import {
  canBuyWeapon,
  ECONOMY_CONSTANTS,
  getArmorPurchaseCost,
} from './rules';
import type {
  ActorState,
  BombState,
  BotDifficulty,
  PrimaryWeaponId,
  SecondaryWeaponId,
  WeaponId,
} from './types';
import { createWeaponInstance, WEAPONS } from './weapons';

export interface BotBrainState {
  actorId: string;
  targetSite: 'A' | 'B';
  lane: 'a' | 'mid' | 'b';
  path: string[];
  pathIndex: number;
  reactionCooldown: number;
  fireCooldown: number;
  reloadTimer: number;
  reloadingSlot: 1 | 2 | null;
  strafeDir: number;
  strafeTimer: number;
  nadeCooldown: number;
  lastGoalId: string;
  lastX: number;
  lastZ: number;
  stuckTimer: number;
  stuckSkipCount: number;
  unstuckTimer: number;
  unstuckDir: number;
  holdTimer: number;
  // Advanced vision & threat memory
  lastSeenEnemyId: string | null;
  lastSeenX: number;
  lastSeenY: number;
  lastSeenZ: number;
  memoryTimer: number;
  alertX: number;
  alertZ: number;
  alertTimer: number;
  alertUrgency: number;
}

export interface BotActionCommand {
  moveX: number; // world X velocity desired
  moveZ: number; // world Z velocity desired
  targetYaw: number;
  targetPitch: number;
  wantFire: boolean;
  startedReload: boolean;
  completedReload: boolean;
  wantPlant: boolean;
  wantDefuse: boolean;
  throwGrenade: 'smoke' | 'flashbang' | 'he' | null;
}

export function normalizeBotDifficulty(
  difficulty: BotDifficulty | 'easy' | 'medium' | 'hard'
): number {
  if (difficulty === 'easy') return 25;
  if (difficulty === 'medium') return 55;
  if (difficulty === 'hard') return 100;
  const n = Number(difficulty);
  if (!Number.isFinite(n)) return 55;
  return Math.max(1, Math.min(100, Math.round(n)));
}

// Slider 100 (Max) matches the original lethal bot tuning; lower values give approachable reaction/spread/cadence.
export function getBotDifficultyTuning(
  difficulty: BotDifficulty | 'easy' | 'medium' | 'hard'
): {
  reaction: number;
  aimJitter: number;
  fireIntervalMul: number;
  aggroRange: number;
  fovHalfCos: number;
  turnSpeed: number;
} {
  const level = normalizeBotDifficulty(difficulty);
  const t = (level - 1) / 99;
  return {
    reaction: 0.95 - t * (0.95 - 0.2),
    aimJitter: 0.16 - t * (0.16 - 0.036),
    fireIntervalMul: 2.8 - t * (2.8 - 1.15),
    aggroRange: 26 + t * (48 - 26),
    // ~105 deg at low difficulty up to ~128 deg at max difficulty
    fovHalfCos: Math.cos((52 + t * 12) * (Math.PI / 180)),
    turnSpeed: 5.5 + t * 5.5,
  };
}

export function createBotBrain(actorId: string, index: number): BotBrainState {
  const lanes: Array<'a' | 'mid' | 'b'> = ['a', 'b', 'mid', 'a', 'b'];
  const lane = lanes[index % lanes.length];
  return {
    actorId,
    targetSite: lane === 'b' ? 'B' : 'A',
    lane,
    path: [],
    pathIndex: 0,
    reactionCooldown: 0.2,
    fireCooldown: 0,
    reloadTimer: 0,
    reloadingSlot: null,
    strafeDir: index % 2 === 0 ? 1 : -1,
    strafeTimer: 1.0,
    nadeCooldown: 4 + (index % 3) * 2,
    lastGoalId: '',
    lastX: 0,
    lastZ: 0,
    stuckTimer: 0,
    stuckSkipCount: 0,
    unstuckTimer: 0,
    unstuckDir: index % 2 === 0 ? 1 : -1,
    holdTimer: 0,
    lastSeenEnemyId: null,
    lastSeenX: 0,
    lastSeenY: 0,
    lastSeenZ: 0,
    memoryTimer: 0,
    alertX: 0,
    alertZ: 0,
    alertTimer: 0,
    alertUrgency: 0,
  };
}

export function notifyBotThreat(
  brain: BotBrainState,
  threatX: number,
  threatZ: number,
  urgency = 1.0
): void {
  if (brain.alertTimer <= 0 || urgency >= brain.alertUrgency) {
    brain.alertX = threatX;
    brain.alertZ = threatZ;
    brain.alertUrgency = urgency;
  }
  brain.alertTimer = Math.max(brain.alertTimer, urgency > 1.2 ? 2.6 : 1.7);
}

export interface VisionScanResult {
  enemy: ActorState;
  dist: number;
  aimY: number;
  alignmentCos: number; // dot product between bot look dir and dir to enemy
  headVisible: boolean;
  chestVisible: boolean;
}

export function evaluateBotVision(params: {
  bot: Pick<ActorState, 'id' | 'x' | 'y' | 'z' | 'yaw' | 'crouching' | 'team' | 'blindTimer'> | Pick<ActorState, 'x' | 'y' | 'z' | 'yaw' | 'crouching' | 'team' | 'blindTimer'>;
  allActors: ReadonlyArray<ActorState>;
  smokes: Array<{ x: number; y: number; z: number; radius: number }>;
  aggroRange: number;
  fovHalfCos: number;
  isFfa?: boolean;
}): VisionScanResult | null {
  const { bot, allActors, smokes, aggroRange, fovHalfCos, isFfa = false } = params;
  if (bot.blindTimer > 0.2) return null;

  const botId = 'id' in bot ? bot.id : '';
  const eyeY = bot.y + (bot.crouching ? 1.08 : 1.55);
  const lookX = -Math.sin(bot.yaw);
  const lookZ = -Math.cos(bot.yaw);

  let best: VisionScanResult | null = null;
  let bestScore = Infinity;

  for (const other of allActors) {
    if (!other.alive) continue;
    if (isFfa ? (botId ? other.id === botId : other === bot) : other.team === bot.team) continue;
    const dx = other.x - bot.x;
    const dz = other.z - bot.z;
    const dist = Math.hypot(dx, dz);
    if (dist > aggroRange) continue;

    const invD = dist > 0.01 ? 1 / dist : 1;
    const cosAng = dist < 0.2 ? 1 : (dx * lookX + dz * lookZ) * invD;

    // Close-quarters peripheral awareness within 5.5m (~165 deg cone), otherwise realistic FOV cone
    const effectiveMinCos = dist < 5.5 ? -0.15 : fovHalfCos;
    if (cosAng < effectiveMinCos) continue;

    const headY = other.y + (other.crouching ? 1.08 : 1.62);
    const chestY = other.y + (other.crouching ? 0.72 : 1.15);

    const headVisible = hasLineOfSight(bot.x, eyeY, bot.z, other.x, headY, other.z, smokes);
    const chestVisible = hasLineOfSight(bot.x, eyeY, bot.z, other.x, chestY, other.z, smokes);
    if (!headVisible && !chestVisible) continue;

    // Prioritize close + centered + torso-exposed targets
    const aimY = chestVisible ? (headVisible ? chestY + (headY - chestY) * 0.45 : chestY) : headY;
    const score = dist * (1.25 - Math.max(0, cosAng) * 0.35);
    if (score < bestScore) {
      bestScore = score;
      best = {
        enemy: other,
        dist,
        aimY,
        alignmentCos: cosAng,
        headVisible,
        chestVisible,
      };
    }
  }

  return best;
}

function stepYawTowards(currentYaw: number, targetYaw: number, maxStep: number): number {
  let diff = Math.atan2(Math.sin(targetYaw - currentYaw), Math.cos(targetYaw - currentYaw));
  if (Math.abs(diff) <= maxStep) return targetYaw;
  return Math.atan2(
    Math.sin(currentYaw + Math.sign(diff) * maxStep),
    Math.cos(currentYaw + Math.sign(diff) * maxStep)
  );
}

export function performBotBuyPhase(actor: ActorState, index: number, isAwpOnly = false): void {
  if (!actor.alive || !actor.isBot) return;
  if (isAwpOnly) {
    actor.primary = createWeaponInstance('awp');
    actor.secondary = null;
    actor.armor = 100;
    actor.hasHelmet = true;
    actor.activeSlot = 1;
    return;
  }

  if (actor.cash >= 2200) {
    const helmetCost = getArmorPurchaseCost(actor, 'kevlar_helmet');
    if (helmetCost !== null && actor.cash >= helmetCost) {
      actor.cash -= helmetCost;
      actor.armor = 100;
      actor.hasHelmet = true;
    }
  } else if (actor.cash >= 1000) {
    const kevlarCost = getArmorPurchaseCost(actor, 'kevlar');
    if (kevlarCost !== null && actor.cash >= kevlarCost) {
      actor.cash -= kevlarCost;
      actor.armor = 100;
    }
  }

  if (!actor.primary) {
    const rifle: PrimaryWeaponId = actor.team === 'attackers' ? 'ak47' : 'm4a1s';
    const riflePrice = WEAPONS[rifle].price;

    if (index % 5 === 4 && actor.cash >= WEAPONS.awp.price + 650) {
      if (canBuyWeapon(actor, 'awp', true).ok) {
        actor.cash -= WEAPONS.awp.price;
        actor.primary = createWeaponInstance('awp');
      }
    } else if (actor.cash >= riflePrice) {
      if (canBuyWeapon(actor, rifle, true).ok) {
        actor.cash -= riflePrice;
        actor.primary = createWeaponInstance(rifle);
      }
    } else if (actor.cash >= WEAPONS.mp7.price) {
      if (canBuyWeapon(actor, 'mp7', true).ok) {
        actor.cash -= WEAPONS.mp7.price;
        actor.primary = createWeaponInstance('mp7');
      }
    } else if (actor.cash >= WEAPONS.mac10.price) {
      if (canBuyWeapon(actor, 'mac10', true).ok) {
        actor.cash -= WEAPONS.mac10.price;
        actor.primary = createWeaponInstance('mac10');
      }
    }
  }

  if (
    actor.team === 'defenders' &&
    !actor.hasDefuseKit &&
    actor.cash >= ECONOMY_CONSTANTS.DEFUSE_KIT_PRICE &&
    (index % 2 === 0 || actor.primary !== null)
  ) {
    actor.cash -= ECONOMY_CONSTANTS.DEFUSE_KIT_PRICE;
    actor.hasDefuseKit = true;
  }

  if (!actor.primary && actor.cash >= 700) {
    const sec: SecondaryWeaponId =
      actor.cash >= 900 ? 'deagle' : actor.team === 'attackers' ? 'tec9' : 'fiveseven';
    const check = canBuyWeapon(actor, sec, true);
    if (check.ok) {
      actor.cash -= check.cost;
      actor.secondary = createWeaponInstance(sec);
    }
  }

  const desiredNades: WeaponId[] = ['smoke', 'flashbang', 'he'];
  for (const nade of desiredNades) {
    if (actor.cash >= ECONOMY_CONSTANTS.KEVLAR_PRICE) {
      const check = canBuyWeapon(actor, nade, true);
      if (check.ok) {
        actor.cash -= check.cost;
        actor.grenades.push(nade as 'smoke' | 'flashbang' | 'he');
      }
    }
  }

  actor.activeSlot = actor.primary ? 1 : 2;
}

function hasBotClearance(x1: number, z1: number, x2: number, z2: number): boolean {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.25) return true;
  if (!hasLineOfSight(x1, 0.9, z1, x2, 0.9, z2, [])) return false;
  const px = (-dz / dist) * 0.42;
  const pz = (dx / dist) * 0.42;
  return (
    hasLineOfSight(x1 + px, 0.9, z1 + pz, x2 + px, 0.9, z2 + pz, []) &&
    hasLineOfSight(x1 - px, 0.9, z1 - pz, x2 - px, 0.9, z2 - pz, [])
  );
}

function pickStartWaypointId(x: number, z: number): string {
  let bestVisId: string | null = null;
  let bestVisDist = Infinity;
  let fallbackVisId: string | null = null;
  let fallbackDist = Infinity;

  for (const w of WAYPOINTS) {
    const d2 = (w.x - x) * (w.x - x) + (w.z - z) * (w.z - z);
    if (d2 < bestVisDist && hasBotClearance(x, z, w.x, w.z)) {
      bestVisDist = d2;
      bestVisId = w.id;
    } else if (d2 < fallbackDist && hasLineOfSight(x, 0.9, z, w.x, 0.9, w.z, [])) {
      fallbackDist = d2;
      fallbackVisId = w.id;
    }
  }
  return bestVisId ?? fallbackVisId ?? findNearestWaypoint(x, z).id;
}

function pickBestUnstuckDir(botX: number, botZ: number, moveDx: number, moveDz: number, fallback: number): number {
  const len = Math.hypot(moveDx, moveDz) || 1;
  const fx = moveDx / len;
  const fz = moveDz / len;
  const lx = -fz;
  const lz = fx;

  const probe = (sx: number, sz: number): number => {
    const dLen = Math.hypot(sx, sz) || 1;
    const hit = raycastMapBoxes(botX, 0.85, botZ, sx / dLen, 0, sz / dLen, 3.2);
    return hit ? hit.distance : 3.2;
  };

  const leftSpace = probe(fx * 0.4 + lx * 0.9, fz * 0.4 + lz * 0.9);
  const rightSpace = probe(fx * 0.4 - lx * 0.9, fz * 0.4 - lz * 0.9);
  if (Math.abs(leftSpace - rightSpace) > 0.35) {
    return leftSpace > rightSpace ? 1 : -1;
  }
  return fallback;
}

export function stepBotBrain(params: {
  bot: ActorState;
  brain: BotBrainState;
  allActors: ActorState[];
  bomb: BombState;
  smokes: Array<{ x: number; y: number; z: number; radius: number }>;
  difficulty: BotDifficulty;
  isBuyPhase: boolean;
  dt: number;
  legacyVision?: boolean;
  isFfa?: boolean;
  isAwpOnly?: boolean;
}): BotActionCommand {
  const {
    bot,
    brain,
    allActors,
    bomb,
    smokes,
    difficulty,
    isBuyPhase,
    dt,
    legacyVision = false,
    isFfa = false,
    isAwpOnly = false,
  } = params;
  const tuning = getBotDifficultyTuning(difficulty);

  brain.fireCooldown = Math.max(0, brain.fireCooldown - dt);
  brain.nadeCooldown = Math.max(0, brain.nadeCooldown - dt);
  brain.unstuckTimer = Math.max(0, brain.unstuckTimer - dt);
  brain.memoryTimer = Math.max(0, brain.memoryTimer - dt);
  brain.alertTimer = Math.max(0, brain.alertTimer - dt);
  brain.strafeTimer -= dt;
  if (brain.strafeTimer <= 0) {
    brain.strafeTimer = 0.7 + Math.random() * 0.9;
    brain.strafeDir = Math.random() > 0.5 ? 1 : -1;
  }

  let completedReload = false;
  let startedReload = false;
  if (brain.reloadTimer > 0) {
    brain.reloadTimer = Math.max(0, brain.reloadTimer - dt);
    if (brain.reloadTimer <= 0) {
      completedReload = true;
    }
  }

  if (isBuyPhase) {
    brain.lastX = bot.x;
    brain.lastZ = bot.z;
    brain.stuckTimer = 0;
    brain.stuckSkipCount = 0;
    brain.holdTimer = 0;
    brain.reloadTimer = 0;
    brain.reloadingSlot = null;
    brain.memoryTimer = 0;
    brain.alertTimer = 0;
    return {
      moveX: 0,
      moveZ: 0,
      targetYaw: bot.yaw,
      targetPitch: 0,
      wantFire: false,
      startedReload: false,
      completedReload: false,
      wantPlant: false,
      wantDefuse: false,
      throwGrenade: null,
    };
  }

  const activeSlotNum: 1 | 2 | null =
    bot.activeSlot === 1 ? 1 : bot.activeSlot === 2 ? 2 : null;
  const activeWeapon =
    activeSlotNum === 1 ? bot.primary : activeSlotNum === 2 ? bot.secondary : null;

  if (activeWeapon && activeWeapon.mag <= 0 && activeWeapon.reserve <= 0) {
    if (!isAwpOnly && bot.activeSlot === 1 && bot.secondary && bot.secondary.mag > 0) {
      bot.activeSlot = 2;
      brain.reloadTimer = 0;
      brain.reloadingSlot = null;
    }
  } else if (
    activeWeapon &&
    activeSlotNum !== null &&
    activeWeapon.mag <= 0 &&
    activeWeapon.reserve > 0 &&
    brain.reloadTimer <= 0 &&
    !completedReload
  ) {
    const spec = WEAPONS[activeWeapon.id];
    brain.reloadTimer = spec.reloadTime;
    brain.reloadingSlot = activeSlotNum;
    startedReload = true;
  }

  if (bot.blindTimer > 0.2) {
    const wanderYaw = bot.yaw + Math.sin(performance.now() * 0.01) * 1.4;
    return {
      moveX: Math.sin(wanderYaw) * -3.5,
      moveZ: Math.cos(wanderYaw) * -3.5,
      targetYaw: wanderYaw,
      targetPitch: 0.1,
      wantFire: brain.reloadTimer <= 0 && brain.fireCooldown <= 0 && Math.random() < 0.22,
      startedReload,
      completedReload,
      wantPlant: false,
      wantDefuse: false,
      throwGrenade: null,
    };
  }

  // 1. Vision Scan: Legacy (360-deg single ray) vs Tactical (FOV cone + head/chest LOS + memory/audio)
  let visionHit: VisionScanResult | null = null;
  if (legacyVision) {
    let bestLegacyDist = Infinity;
    for (const other of allActors) {
      if (!other.alive) continue;
      if (isFfa ? other.id === bot.id : other.team === bot.team) continue;
      const dist = Math.hypot(other.x - bot.x, other.z - bot.z);
      if (dist > tuning.aggroRange) continue;
      if (
        hasLineOfSight(
          bot.x,
          bot.y + 1.55,
          bot.z,
          other.x,
          other.y + 1.45,
          other.z,
          smokes
        ) &&
        dist < bestLegacyDist
      ) {
        bestLegacyDist = dist;
        visionHit = {
          enemy: other,
          dist,
          aimY: other.y + 1.48,
          alignmentCos: 1,
          headVisible: true,
          chestVisible: true,
        };
      }
    }
    brain.memoryTimer = 0;
    brain.alertTimer = 0;
  } else {
    visionHit = evaluateBotVision({
      bot,
      allActors,
      smokes,
      aggroRange: tuning.aggroRange,
      fovHalfCos: tuning.fovHalfCos,
      isFfa,
    });

    if (visionHit) {
      brain.lastSeenEnemyId = visionHit.enemy.id;
      brain.lastSeenX = visionHit.enemy.x;
      brain.lastSeenY = visionHit.aimY;
      brain.lastSeenZ = visionHit.enemy.z;
      brain.memoryTimer = 2.4;
      brain.alertTimer = 0;
    } else if (brain.lastSeenEnemyId) {
      const prevTarget = allActors.find((a) => a.id === brain.lastSeenEnemyId);
      if (!prevTarget || !prevTarget.alive) {
        brain.memoryTimer = 0;
        brain.lastSeenEnemyId = null;
      }
    }
  }

  // Tactical reload when magazine is low and no immediate visual enemy or threat
  if (
    !visionHit &&
    brain.reloadTimer <= 0 &&
    !completedReload &&
    activeWeapon &&
    activeSlotNum !== null &&
    activeWeapon.reserve > 0 &&
    activeWeapon.mag > 0
  ) {
    const spec = WEAPONS[activeWeapon.id];
    if (activeWeapon.mag <= Math.max(2, Math.floor(spec.magSize * 0.22)) && brain.memoryTimer <= 0.4) {
      brain.reloadTimer = spec.reloadTime;
      brain.reloadingSlot = activeSlotNum;
      startedReload = true;
    }
  }

  // 2. Determine tactical objective goal waypoint
  let goalId = brain.targetSite === 'A' ? 'a_site' : 'b_site';
  let wantPlant = false;
  let wantDefuse = false;

  if (isFfa || isAwpOnly) {
    // Roam toward nearest living opponent (or fallback waypoint)
    let nearestEnemy: ActorState | null = null;
    let nearestD2 = Infinity;
    for (const other of allActors) {
      if (!other.alive) continue;
      if (isFfa ? other.id === bot.id : other.team === bot.team) continue;
      const d2 = (other.x - bot.x) ** 2 + (other.z - bot.z) ** 2;
      if (d2 < nearestD2) {
        nearestD2 = d2;
        nearestEnemy = other;
      }
    }
    if (nearestEnemy) {
      goalId = pickStartWaypointId(nearestEnemy.x, nearestEnemy.z);
    } else {
      goalId = 'mid_center';
    }
  } else if (bot.team === 'attackers') {
    if (bomb.status === 'planted' && bomb.site) {
      goalId = bomb.site === 'A' ? 'a_site' : 'b_site';
    } else if (bomb.status === 'dropped' && !bot.hasC4) {
      goalId = pickStartWaypointId(bomb.x, bomb.z);
    } else if (bot.hasC4) {
      const onSite = getPlantSiteAt(bot.x, bot.z);
      if (onSite && !visionHit && brain.reloadTimer <= 0) {
        wantPlant = true;
      }
      goalId = brain.targetSite === 'A' ? 'a_site' : 'b_site';
    } else {
      const preferred =
        brain.lane === 'mid'
          ? 'mid_center'
          : brain.targetSite === 'A'
            ? 'a_site_s'
            : 'b_site_s';
      goalId = WAYPOINT_MAP.has(preferred) ? preferred : (brain.targetSite === 'A' ? 'a_site' : 'b_site');
    }
  } else {
    if ((bomb.status === 'planted' || bomb.status === 'defusing') && bomb.site) {
      goalId = bomb.site === 'A' ? 'a_site' : 'b_site';
      const distToBomb = Math.hypot(bomb.x - bot.x, bomb.z - bot.z);
      if (distToBomb < 2.35 && !visionHit && brain.reloadTimer <= 0) {
        wantDefuse = true;
      }
    } else {
      const preferred =
        brain.lane === 'mid'
          ? 'def_mid_entry'
          : brain.targetSite === 'A'
            ? 'a_site_n'
            : 'b_site_n';
      goalId = WAYPOINT_MAP.has(preferred) ? preferred : (brain.targetSite === 'A' ? 'a_site' : 'b_site');
    }
  }

  if (goalId !== brain.lastGoalId || brain.path.length === 0) {
    const startId = pickStartWaypointId(bot.x, bot.z);
    brain.path = findWaypointPath(startId, goalId);
    brain.pathIndex = 0;
    brain.lastGoalId = goalId;
    brain.holdTimer = 0;
    brain.stuckSkipCount = 0;
  }

  // Combat engagement when an enemy is in FOV + LOS
  if (visionHit) {
    const visibleEnemy = visionHit.enemy;
    brain.stuckTimer = 0;
    brain.holdTimer = 0;
    brain.lastX = bot.x;
    brain.lastZ = bot.z;

    const dx = visibleEnemy.x - bot.x;
    const dz = visibleEnemy.z - bot.z;
    const eyeY = bot.y + (bot.crouching ? 1.08 : 1.55);
    const dy = visionHit.aimY - eyeY;
    const horizDist = Math.max(0.1, Math.hypot(dx, dz));

    const idealYaw = Math.atan2(-dx, -dz);
    const idealPitch = Math.atan2(dy, horizDist);

    const weaponId: WeaponId =
      bot.activeSlot === 1 && bot.primary
        ? bot.primary.id
        : bot.secondary?.id ?? 'glock18';
    const spec = WEAPONS[weaponId];
    const interval = (60 / Math.max(40, spec.fireRateRpm)) * tuning.fireIntervalMul;

    // Central alignment reacts faster than outer peripheral detection
    const reactionRate =
      visionHit.alignmentCos >= 0.9 ? 1.1 : visionHit.alignmentCos >= 0.72 ? 0.85 : 0.6;
    brain.reactionCooldown = Math.max(0, brain.reactionCooldown - dt * reactionRate);

    const canShoot =
      brain.reloadTimer <= 0 &&
      activeWeapon !== null &&
      activeWeapon.mag > 0 &&
      brain.reactionCooldown <= 0 &&
      brain.fireCooldown <= 0;
    if (canShoot) {
      brain.fireCooldown = interval * (0.9 + Math.random() * 0.35);
    }

    const perpX = dz / horizDist;
    const perpZ = -dx / horizDist;
    const strafeSpeed = brain.reloadTimer > 0 ? 4.2 : visionHit.dist < 10 ? 3.2 : 2.1;
    // While reloading under fire, back away slightly while strafing instead of freezing
    const backX = brain.reloadTimer > 0 ? -(dx / horizDist) * 2.2 : 0;
    const backZ = brain.reloadTimer > 0 ? -(dz / horizDist) * 2.2 : 0;

    const smoothedYaw = legacyVision
      ? idealYaw
      : stepYawTowards(bot.yaw, idealYaw, tuning.turnSpeed * 1.45 * dt);

    return {
      moveX: perpX * brain.strafeDir * strafeSpeed + backX,
      moveZ: perpZ * brain.strafeDir * strafeSpeed + backZ,
      targetYaw: smoothedYaw + (canShoot ? (Math.random() - 0.5) * tuning.aimJitter : 0),
      targetPitch: idealPitch + (canShoot ? (Math.random() - 0.5) * tuning.aimJitter * 0.6 : 0),
      wantFire: canShoot,
      startedReload,
      completedReload,
      wantPlant: false,
      wantDefuse: false,
      throwGrenade: null,
    };
  }

  brain.reactionCooldown = tuning.reaction;

  if (wantPlant || wantDefuse) {
    const site = SITE_ZONES.find((s) => s.site === (bomb.site ?? brain.targetSite)) ?? SITE_ZONES[0];
    const lookYaw = Math.atan2(-(site.x - bot.x), -(site.z - bot.z));
    brain.lastX = bot.x;
    brain.lastZ = bot.z;
    return {
      moveX: 0,
      moveZ: 0,
      targetYaw: stepYawTowards(bot.yaw, lookYaw, tuning.turnSpeed * dt),
      targetPitch: -0.3,
      wantFire: false,
      startedReload,
      completedReload,
      wantPlant,
      wantDefuse,
      throwGrenade: null,
    };
  }

  let throwGrenade: 'smoke' | 'flashbang' | 'he' | null = null;
  if (brain.nadeCooldown <= 0 && bot.grenades.length > 0 && Math.abs(bot.z) < 25) {
    const n = bot.grenades[0];
    if (n === 'smoke' || n === 'flashbang' || n === 'he') {
      throwGrenade = n;
      brain.nadeCooldown = 14;
    }
  }

  // Navigate current waypoint
  let targetX = bot.x;
  let targetZ = bot.z;

  if (
    (bomb.status === 'planted' || bomb.status === 'defusing') &&
    bot.team === 'defenders'
  ) {
    const distBomb = Math.hypot(bomb.x - bot.x, bomb.z - bot.z);
    if (distBomb < 6.5 && hasLineOfSight(bot.x, 0.9, bot.z, bomb.x, 0.5, bomb.z, [])) {
      targetX = bomb.x;
      targetZ = bomb.z;
    }
  }

  if (targetX === bot.x && targetZ === bot.z && brain.path.length > 0) {
    const wpId = brain.path[Math.min(brain.pathIndex, brain.path.length - 1)];
    const wp = WAYPOINT_MAP.get(wpId);
    if (wp) {
      targetX = wp.x;
      targetZ = wp.z;
      const dist = Math.hypot(targetX - bot.x, targetZ - bot.z);
      if (dist < 1.9 && brain.pathIndex < brain.path.length - 1) {
        brain.pathIndex++;
        const nextWp = WAYPOINT_MAP.get(brain.path[brain.pathIndex]);
        if (nextWp) {
          targetX = nextWp.x;
          targetZ = nextWp.z;
        }
      }
    }
  }

  const moveDx = targetX - bot.x;
  const moveDz = targetZ - bot.z;
  const moveDist = Math.hypot(moveDx, moveDz);

  // Determine desired gaze yaw: remembered LKP > gunfire/hit threat > movement direction
  let desiredLookYaw = moveDist > 0.2 ? Math.atan2(-moveDx, -moveDz) : bot.yaw;
  if (brain.memoryTimer > 0) {
    desiredLookYaw = Math.atan2(-(brain.lastSeenX - bot.x), -(brain.lastSeenZ - bot.z));
  } else if (brain.alertTimer > 0) {
    desiredLookYaw = Math.atan2(-(brain.alertX - bot.x), -(brain.alertZ - bot.z));
  }

  if (moveDist < 0.9) {
    brain.stuckTimer = 0;
    brain.stuckSkipCount = 0;
    brain.holdTimer += dt;
    brain.lastX = bot.x;
    brain.lastZ = bot.z;

    if (brain.holdTimer > 3.8) {
      brain.holdTimer = 0;
      const curWp = WAYPOINT_MAP.get(brain.path[Math.min(brain.pathIndex, brain.path.length - 1)]);
      if (curWp && curWp.neighbors.length > 0) {
        const nextChoice = curWp.neighbors[Math.floor(Math.random() * curWp.neighbors.length)];
        brain.path = [nextChoice];
        brain.pathIndex = 0;
      } else {
        brain.targetSite = brain.targetSite === 'A' ? 'B' : 'A';
        brain.lastGoalId = '';
      }
    }

    const baseHoldYaw =
      brain.memoryTimer > 0 || brain.alertTimer > 0
        ? desiredLookYaw
        : bot.team === 'attackers'
          ? 0
          : Math.PI;
    const scanSweep =
      brain.memoryTimer > 0 || brain.alertTimer > 0
        ? 0
        : Math.sin(performance.now() * 0.0012 + bot.x) * 0.45;
    return {
      moveX: 0,
      moveZ: 0,
      targetYaw: stepYawTowards(bot.yaw, baseHoldYaw + scanSweep, tuning.turnSpeed * dt),
      targetPitch: 0,
      wantFire: false,
      startedReload,
      completedReload,
      wantPlant: false,
      wantDefuse: false,
      throwGrenade: null,
    };
  }

  // Stuck detection: steer cleanly toward clearer side; escalate by advancing/switching route
  const moved = Math.hypot(bot.x - brain.lastX, bot.z - brain.lastZ);
  brain.lastX = bot.x;
  brain.lastZ = bot.z;
  if (moved < 1.2 * dt) {
    brain.stuckTimer += dt;
    if (brain.stuckTimer > 0.6) {
      brain.stuckTimer = 0;
      brain.stuckSkipCount++;
      brain.unstuckTimer = 0.85;
      brain.unstuckDir = pickBestUnstuckDir(bot.x, bot.z, moveDx, moveDz, brain.unstuckDir);

      if (brain.stuckSkipCount >= 2 && brain.pathIndex < brain.path.length - 1) {
        brain.pathIndex++;
        brain.stuckSkipCount = 0;
      } else {
        const startId = pickStartWaypointId(bot.x, bot.z);
        brain.path = findWaypointPath(startId, goalId);
        const firstWp = WAYPOINT_MAP.get(brain.path[0]);
        brain.pathIndex =
          brain.path.length > 1 && firstWp && Math.hypot(firstWp.x - bot.x, firstWp.z - bot.z) < 2.2
            ? 1
            : 0;
      }
    }
  } else {
    brain.stuckTimer = Math.max(0, brain.stuckTimer - dt * 2);
    if (moved > 3.0 * dt) {
      brain.stuckSkipCount = 0;
    }
  }

  const speed = 5.8;
  let vx = (moveDx / moveDist) * speed;
  let vz = (moveDz / moveDist) * speed;

  if (brain.unstuckTimer > 0) {
    const px = -moveDz / moveDist;
    const pz = moveDx / moveDist;
    vx = vx * 0.45 + px * brain.unstuckDir * speed * 0.85;
    vz = vz * 0.45 + pz * brain.unstuckDir * speed * 0.85;
  }

  const lookTargetYaw =
    brain.memoryTimer > 0 || brain.alertTimer > 0
      ? desiredLookYaw
      : Math.atan2(-vx, -vz);

  return {
    moveX: vx,
    moveZ: vz,
    targetYaw: stepYawTowards(bot.yaw, lookTargetYaw, tuning.turnSpeed * dt),
    targetPitch: 0,
    wantFire: false,
    startedReload,
    completedReload,
    wantPlant: false,
    wantDefuse: false,
    throwGrenade,
  };
}

