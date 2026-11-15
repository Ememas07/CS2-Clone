import {
  findNearestWaypoint,
  findWaypointPath,
  getPlantSiteAt,
  hasLineOfSight,
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
  strafeDir: number;
  strafeTimer: number;
  nadeCooldown: number;
  lastGoalId: string;
  lastX: number;
  lastZ: number;
  stuckTimer: number;
  unstuckTimer: number;
  unstuckDir: number;
  holdTimer: number;
}

export interface BotActionCommand {
  moveX: number; // world X velocity desired
  moveZ: number; // world Z velocity desired
  targetYaw: number;
  targetPitch: number;
  wantFire: boolean;
  wantReload: boolean;
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
): { reaction: number; aimJitter: number; fireIntervalMul: number; aggroRange: number } {
  const level = normalizeBotDifficulty(difficulty);
  const t = (level - 1) / 99;
  return {
    reaction: 0.95 - t * (0.95 - 0.2),
    aimJitter: 0.16 - t * (0.16 - 0.036),
    fireIntervalMul: 2.8 - t * (2.8 - 1.15),
    aggroRange: 26 + t * (48 - 26),
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
    strafeDir: index % 2 === 0 ? 1 : -1,
    strafeTimer: 1.0,
    nadeCooldown: 4 + (index % 3) * 2,
    lastGoalId: '',
    lastX: 0,
    lastZ: 0,
    stuckTimer: 0,
    unstuckTimer: 0,
    unstuckDir: index % 2 === 0 ? 1 : -1,
    holdTimer: 0,
  };
}

export function performBotBuyPhase(actor: ActorState, index: number): void {
  if (!actor.alive || !actor.isBot) return;

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

function pickStartWaypointId(x: number, z: number): string {
  // Prefer the closest waypoint with clear line of sight so bots never try to walk through a divider wall
  let bestVisId: string | null = null;
  let bestVisDist = Infinity;
  for (const w of WAYPOINTS) {
    const d2 = (w.x - x) * (w.x - x) + (w.z - z) * (w.z - z);
    if (d2 < bestVisDist && hasLineOfSight(x, 0.9, z, w.x, 0.9, w.z, [])) {
      bestVisDist = d2;
      bestVisId = w.id;
    }
  }
  return bestVisId ?? findNearestWaypoint(x, z).id;
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
}): BotActionCommand {
  const { bot, brain, allActors, bomb, smokes, difficulty, isBuyPhase, dt } = params;
  const tuning = getBotDifficultyTuning(difficulty);

  brain.fireCooldown = Math.max(0, brain.fireCooldown - dt);
  brain.nadeCooldown = Math.max(0, brain.nadeCooldown - dt);
  brain.unstuckTimer = Math.max(0, brain.unstuckTimer - dt);
  brain.strafeTimer -= dt;
  if (brain.strafeTimer <= 0) {
    brain.strafeTimer = 0.7 + Math.random() * 0.9;
    brain.strafeDir = Math.random() > 0.5 ? 1 : -1;
  }

  if (isBuyPhase) {
    brain.lastX = bot.x;
    brain.lastZ = bot.z;
    brain.stuckTimer = 0;
    brain.holdTimer = 0;
    return {
      moveX: 0,
      moveZ: 0,
      targetYaw: bot.yaw,
      targetPitch: 0,
      wantFire: false,
      wantReload: false,
      wantPlant: false,
      wantDefuse: false,
      throwGrenade: null,
    };
  }

  const activeWeapon =
    bot.activeSlot === 1 ? bot.primary : bot.activeSlot === 2 ? bot.secondary : null;
  if (activeWeapon && activeWeapon.mag <= 0) {
    if (activeWeapon.reserve > 0) {
      return {
        moveX: 0,
        moveZ: 0,
        targetYaw: bot.yaw,
        targetPitch: 0,
        wantFire: false,
        wantReload: true,
        wantPlant: false,
        wantDefuse: false,
        throwGrenade: null,
      };
    } else if (bot.activeSlot === 1 && bot.secondary) {
      bot.activeSlot = 2;
    }
  }

  if (bot.blindTimer > 0.2) {
    const wanderYaw = bot.yaw + Math.sin(performance.now() * 0.01) * 1.4;
    return {
      moveX: Math.sin(wanderYaw) * -3.5,
      moveZ: Math.cos(wanderYaw) * -3.5,
      targetYaw: wanderYaw,
      targetPitch: 0.1,
      wantFire: brain.fireCooldown <= 0 && Math.random() < 0.25,
      wantReload: false,
      wantPlant: false,
      wantDefuse: false,
      throwGrenade: null,
    };
  }

  // 1. Scan for visible enemies
  let visibleEnemy: ActorState | null = null;
  let visibleDist = Infinity;
  for (const other of allActors) {
    if (!other.alive || other.team === bot.team) continue;
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
      )
    ) {
      if (dist < visibleDist) {
        visibleDist = dist;
        visibleEnemy = other;
      }
    }
  }

  // 2. Determine tactical objective goal waypoint
  let goalId = brain.targetSite === 'A' ? 'a_site' : 'b_site';
  let wantPlant = false;
  let wantDefuse = false;

  if (bot.team === 'attackers') {
    if (bomb.status === 'planted' && bomb.site) {
      goalId = bomb.site === 'A' ? 'a_site' : 'b_site';
    } else if (bomb.status === 'dropped' && !bot.hasC4) {
      goalId = pickStartWaypointId(bomb.x, bomb.z);
    } else if (bot.hasC4) {
      const onSite = getPlantSiteAt(bot.x, bot.z);
      if (onSite && !visibleEnemy) {
        wantPlant = true;
      }
      goalId = brain.targetSite === 'A' ? 'a_site' : 'b_site';
    } else {
      goalId =
        brain.lane === 'mid'
          ? 'mid_center'
          : brain.targetSite === 'A'
            ? 'a_site_s'
            : 'b_site_s';
    }
  } else {
    if ((bomb.status === 'planted' || bomb.status === 'defusing') && bomb.site) {
      goalId = bomb.site === 'A' ? 'a_site' : 'b_site';
      const distToBomb = Math.hypot(bomb.x - bot.x, bomb.z - bot.z);
      if (distToBomb < 2.6 && !visibleEnemy) {
        wantDefuse = true;
      }
    } else {
      goalId =
        brain.lane === 'mid'
          ? 'def_mid_entry'
          : brain.targetSite === 'A'
            ? 'a_site_n'
            : 'b_site_n';
    }
  }

  // Recompute path when goal changes or path is empty
  if (goalId !== brain.lastGoalId || brain.path.length === 0) {
    const startId = pickStartWaypointId(bot.x, bot.z);
    brain.path = findWaypointPath(startId, goalId);
    brain.pathIndex = 0;
    brain.lastGoalId = goalId;
    brain.holdTimer = 0;
  }

  // Combat engagement overrides movement
  if (visibleEnemy) {
    brain.stuckTimer = 0;
    brain.holdTimer = 0;
    brain.lastX = bot.x;
    brain.lastZ = bot.z;

    const dx = visibleEnemy.x - bot.x;
    const dz = visibleEnemy.z - bot.z;
    const dy = visibleEnemy.y + 1.48 - (bot.y + 1.55);
    const horizDist = Math.max(0.1, Math.hypot(dx, dz));

    const idealYaw = Math.atan2(-dx, -dz);
    const idealPitch = Math.atan2(dy, horizDist);

    const weaponId: WeaponId =
      bot.activeSlot === 1 && bot.primary
        ? bot.primary.id
        : bot.secondary?.id ?? 'glock18';
    const spec = WEAPONS[weaponId];
    const interval = (60 / Math.max(40, spec.fireRateRpm)) * tuning.fireIntervalMul;

    brain.reactionCooldown = Math.max(0, brain.reactionCooldown - dt);
    const canShoot = brain.reactionCooldown <= 0 && brain.fireCooldown <= 0;
    if (canShoot) {
      brain.fireCooldown = interval * (0.9 + Math.random() * 0.35);
    }

    const perpX = dz / horizDist;
    const perpZ = -dx / horizDist;
    const strafeSpeed = visibleDist < 10 ? 3.2 : 2.1;

    return {
      moveX: perpX * brain.strafeDir * strafeSpeed,
      moveZ: perpZ * brain.strafeDir * strafeSpeed,
      targetYaw: idealYaw + (Math.random() - 0.5) * tuning.aimJitter,
      targetPitch: idealPitch + (Math.random() - 0.5) * tuning.aimJitter * 0.6,
      wantFire: canShoot,
      wantReload: false,
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
      targetYaw: lookYaw,
      targetPitch: -0.3,
      wantFire: false,
      wantReload: false,
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
    !wantDefuse &&
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

  // If bot reached its hold point, rotate tactically after a short hold so bots never stall permanently
  if (moveDist < 0.9) {
    brain.stuckTimer = 0;
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

    const holdYaw = bot.team === 'attackers' ? 0 : Math.PI;
    return {
      moveX: 0,
      moveZ: 0,
      targetYaw: holdYaw + Math.sin(performance.now() * 0.001 + bot.x) * 0.45,
      targetPitch: 0,
      wantFire: false,
      wantReload: false,
      wantPlant: false,
      wantDefuse: false,
      throwGrenade: null,
    };
  }

  // Stuck detection: if bot wants to move but made < 0.08m progress over 0.7s, sidestep & re-path
  const moved = Math.hypot(bot.x - brain.lastX, bot.z - brain.lastZ);
  brain.lastX = bot.x;
  brain.lastZ = bot.z;
  if (moved < 1.2 * dt) {
    brain.stuckTimer += dt;
    if (brain.stuckTimer > 0.65) {
      brain.stuckTimer = 0;
      brain.unstuckTimer = 0.65;
      brain.unstuckDir *= -1;
      const startId = pickStartWaypointId(bot.x, bot.z);
      brain.path = findWaypointPath(startId, goalId);
      brain.pathIndex = brain.path.length > 1 ? 1 : 0;
    }
  } else {
    brain.stuckTimer = Math.max(0, brain.stuckTimer - dt * 2);
  }

  const speed = 5.8;
  let vx = (moveDx / moveDist) * speed;
  let vz = (moveDz / moveDist) * speed;

  if (brain.unstuckTimer > 0) {
    // Blend perpendicular strafe to slide cleanly around box corners
    const px = -moveDz / moveDist;
    const pz = moveDx / moveDist;
    vx = vx * 0.45 + px * brain.unstuckDir * speed * 0.85;
    vz = vz * 0.45 + pz * brain.unstuckDir * speed * 0.85;
  }

  const moveYaw = Math.atan2(-vx, -vz);

  return {
    moveX: vx,
    moveZ: vz,
    targetYaw: moveYaw,
    targetPitch: 0,
    wantFire: false,
    wantReload: false,
    wantPlant: false,
    wantDefuse: false,
    throwGrenade,
  };
}
