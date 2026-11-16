import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBulletDamage,
  calculateC4DetonationDamage,
  calculateHeExplosionDamage,
  canBuyWeapon,
  canPickUpGrenade,
  canPlantBombNow,
  checkMatchWinner,
  computeLossBonus,
  computeRoundEndCash,
  computeWeaponSpread,
  ECONOMY_CONSTANTS,
  getArmorPurchaseCost,
  getDefuseDurationSeconds,
  getKillReward,
  isHalftimeRound,
  selectDeathDrops,
  selectFarthestFfaSpawn,
} from './rules';
import { getBotDifficultyTuning } from './botAI';
import { parseCrosshairJson, DEFAULT_CROSSHAIR } from './crosshair';
import {
  createCustomMapTemplate,
  customMapToDefinition,
  validateCustomMapJson,
} from './customMaps';
import {
  BHOP_MAX_MULT,
  createKrunkerMoveState,
  stepKrunkerMovement,
} from './movement';
import {
  findWaypointPath,
  getSpawnAnchor,
  hasLineOfSight,
  isInBuyZone,
  MAP_LIST,
  MAPS,
  setActiveMap,
  SITE_ZONES,
} from './mapData';

test('economy: starting cash, win bonuses, and loss streak scaling', () => {
  assert.equal(ECONOMY_CONSTANTS.STARTING_CASH, 800);
  assert.equal(computeLossBonus(1), 1400);
  assert.equal(computeLossBonus(2), 1900);
  assert.equal(computeLossBonus(3), 2400);
  assert.equal(computeLossBonus(4), 2900);
  assert.equal(computeLossBonus(5), 3400);
  assert.equal(computeLossBonus(9), 3400); // capped at $3,400

  assert.equal(
    computeRoundEndCash({
      currentCash: 800,
      won: true,
      viaBombObjective: false,
      consecutiveLosses: 0,
    }),
    4050
  );
  assert.equal(
    computeRoundEndCash({
      currentCash: 800,
      won: true,
      viaBombObjective: true,
      consecutiveLosses: 0,
    }),
    4300
  );
  assert.equal(
    computeRoundEndCash({
      currentCash: 15000,
      won: true,
      viaBombObjective: true,
      consecutiveLosses: 0,
    }),
    16000 // capped at MAX_CASH
  );
});

test('economy: weapon kill rewards', () => {
  assert.equal(getKillReward('ak47'), 300);
  assert.equal(getKillReward('m4a1s'), 300);
  assert.equal(getKillReward('mac10'), 600);
  assert.equal(getKillReward('mp7'), 600);
  assert.equal(getKillReward('awp'), 100);
  assert.equal(getKillReward('bayonet'), 1500);
  assert.equal(getKillReward('karambit'), 1500);
  assert.equal(getKillReward('butterfly'), 1500);
});

test('combat: helmet prevents 1-tap from starter pistols/SMGs, while AK47/Deagle/AWP 1-tap', () => {
  const uspsVsHelmet = calculateBulletDamage({
    weaponId: 'usps',
    zone: 'head',
    distanceMeters: 15,
    targetArmor: 100,
    targetHasHelmet: true,
  });
  assert.ok(uspsVsHelmet.hpDamage < 100, 'USP-S should not 1-tap helmet');

  const uspsNoHelmet = calculateBulletDamage({
    weaponId: 'usps',
    zone: 'head',
    distanceMeters: 15,
    targetArmor: 100,
    targetHasHelmet: false,
  });
  assert.ok(uspsNoHelmet.hpDamage >= 100, 'USP-S should 1-tap unhelmeted head');

  const akVsHelmet = calculateBulletDamage({
    weaponId: 'ak47',
    zone: 'head',
    distanceMeters: 25,
    targetArmor: 100,
    targetHasHelmet: true,
  });
  assert.ok(akVsHelmet.hpDamage >= 100, 'AK-47 should 1-tap through helmet');

  const awpChest = calculateBulletDamage({
    weaponId: 'awp',
    zone: 'chest',
    distanceMeters: 40,
    targetArmor: 100,
    targetHasHelmet: true,
  });
  assert.ok(awpChest.hpDamage >= 100, 'AWP should 1-shot chest');
});

test('combat: kevlar eliminates chest aimpunch and mitigates HE damage', () => {
  const kevlarHit = calculateBulletDamage({
    weaponId: 'mp7',
    zone: 'chest',
    distanceMeters: 15,
    targetArmor: 100,
    targetHasHelmet: false,
  });
  assert.equal(kevlarHit.aimpunch, 0);

  const unarmoredHit = calculateBulletDamage({
    weaponId: 'mp7',
    zone: 'chest',
    distanceMeters: 15,
    targetArmor: 0,
    targetHasHelmet: false,
  });
  assert.ok(unarmoredHit.aimpunch > 0);

  const heArmored = calculateHeExplosionDamage(1.5, 100);
  const heUnarmored = calculateHeExplosionDamage(1.5, 0);
  assert.ok(heArmored.hpDamage < heUnarmored.hpDamage);
});

test('buy validation: team exclusives, free knives, and armor upgrades', () => {
  const atkActor = {
    team: 'attackers' as const,
    cash: 3000,
    alive: true,
    inBuyZone: true,
    grenades: [],
    primary: null,
    secondary: { id: 'glock18' as const, mag: 20, reserve: 120 },
    knife: 'bayonet' as const,
  };

  assert.equal(canBuyWeapon(atkActor, 'ak47', true).ok, true);
  assert.equal(canBuyWeapon(atkActor, 'm4a1s', true).ok, false);
  assert.deepEqual(canBuyWeapon(atkActor, 'karambit', true), { ok: true, cost: 0 });
  assert.deepEqual(canBuyWeapon(atkActor, 'butterfly', true), { ok: true, cost: 0 });
  assert.equal(canBuyWeapon(atkActor, 'ak47', false).ok, false);

  assert.equal(getArmorPurchaseCost({ armor: 0, hasHelmet: false }, 'kevlar'), 650);
  assert.equal(getArmorPurchaseCost({ armor: 100, hasHelmet: false }, 'kevlar_helmet'), 350);
  assert.equal(getArmorPurchaseCost({ armor: 100, hasHelmet: true }, 'kevlar_helmet'), null);
});

test('all 5 maps: blocked spawn sightlines, buy zones, and valid waypoint paths', () => {
  assert.equal(MAP_LIST.length, 5);
  for (const mapDef of MAP_LIST) {
    setActiveMap(mapDef.id);
    const atkSpawn = getSpawnAnchor('attackers', 0);
    const defSpawn = getSpawnAnchor('defenders', 0);

    assert.equal(isInBuyZone('attackers', atkSpawn.x, atkSpawn.z), true, `${mapDef.id} atk buy zone`);
    assert.equal(isInBuyZone('defenders', defSpawn.x, defSpawn.z), true, `${mapDef.id} def buy zone`);

    assert.equal(
      hasLineOfSight(atkSpawn.x, 1.65, atkSpawn.z, defSpawn.x, 1.65, defSpawn.z),
      false,
      `${mapDef.id} spawns must block direct sniping LOS`
    );

    const pathAtkA = findWaypointPath('atk_spawn', 'a_site');
    const pathAtkB = findWaypointPath('atk_spawn', 'b_site');
    const pathDefA = findWaypointPath('def_spawn', 'a_site');
    const pathDefB = findWaypointPath('def_spawn', 'b_site');
    const pathMid = findWaypointPath('atk_spawn', 'mid_center');

    assert.ok(pathAtkA.length >= 2 && pathAtkA[pathAtkA.length - 1] === 'a_site', `${mapDef.id} atk->A`);
    assert.ok(pathAtkB.length >= 2 && pathAtkB[pathAtkB.length - 1] === 'b_site', `${mapDef.id} atk->B`);
    assert.ok(pathDefA.length >= 2 && pathDefA[pathDefA.length - 1] === 'a_site', `${mapDef.id} def->A`);
    assert.ok(pathDefB.length >= 2 && pathDefB[pathDefB.length - 1] === 'b_site', `${mapDef.id} def->B`);
    assert.ok(pathMid.length >= 2 && pathMid[pathMid.length - 1] === 'mid_center', `${mapDef.id} atk->Mid`);

    const fullMap = MAPS[mapDef.id];
    const wpById = new Map(fullMap.waypoints.map((w) => [w.id, w]));
    for (const w of fullMap.waypoints) {
      for (const nid of w.neighbors) {
        const nb = wpById.get(nid);
        assert.ok(nb, `${mapDef.id} missing neighbor ${nid}`);
        assert.equal(
          hasLineOfSight(w.x, 1.0, w.z, nb.x, 1.0, nb.z),
          true,
          `${mapDef.id} edge ${w.id} -> ${nid} crosses a wall`
        );
      }
    }
  }

  setActiveMap('sandline');
  const atkSpawn = getSpawnAnchor('attackers', 0);
  const defSpawn = getSpawnAnchor('defenders', 0);
  const siteA = SITE_ZONES.find((s) => s.site === 'A')!;
  const siteB = SITE_ZONES.find((s) => s.site === 'B')!;
  assert.ok(Math.abs(Math.hypot(siteA.x - atkSpawn.x, siteA.z - atkSpawn.z) - Math.hypot(siteA.x - defSpawn.x, siteA.z - defSpawn.z)) < 0.01);
  assert.ok(Math.abs(Math.hypot(siteB.x - atkSpawn.x, siteB.z - atkSpawn.z) - Math.hypot(siteB.x - defSpawn.x, siteB.z - defSpawn.z)) < 0.01);
});

test('bot difficulty slider: 1..100 scales smoothly with 100 matching max original bots', () => {
  const chill = getBotDifficultyTuning(1);
  const mid = getBotDifficultyTuning(55);
  const max = getBotDifficultyTuning(100);

  assert.ok(chill.reaction > mid.reaction && mid.reaction > max.reaction);
  assert.ok(chill.aimJitter > mid.aimJitter && mid.aimJitter > max.aimJitter);
  assert.ok(chill.fireIntervalMul > mid.fireIntervalMul && mid.fireIntervalMul > max.fireIntervalMul);
  assert.ok(chill.aggroRange < mid.aggroRange && mid.aggroRange < max.aggroRange);
  assert.ok(Math.abs(max.reaction - 0.2) < 1e-6);
  assert.ok(Math.abs(max.aimJitter - 0.036) < 1e-6);
});

test('match progression: halftime and winner resolution', () => {
  assert.equal(isHalftimeRound(7, 12), true);
  assert.equal(isHalftimeRound(6, 12), false);
  assert.equal(checkMatchWinner(6, 5, 12), null);
  assert.equal(checkMatchWinner(7, 5, 12), 'attackers');
  assert.equal(checkMatchWinner(6, 6, 12), 'draw');
});

test('ballistics & movement: stationary accuracy is 0, slow walk < running, SMG running < rifle running', () => {
  const awpScopedStill = computeWeaponSpread({
    weaponId: 'awp',
    horizontalSpeed: 0,
    isCrouching: false,
    isAirborne: false,
    recoilBloom: 0,
    scopeZoom: 1,
  });
  assert.equal(awpScopedStill, 0);

  const awpUnscopedStill = computeWeaponSpread({
    weaponId: 'awp',
    horizontalSpeed: 0,
    isCrouching: false,
    isAirborne: false,
    recoilBloom: 0,
    scopeZoom: 0,
  });
  assert.ok(awpUnscopedStill > 0.03, 'unscoped AWP should not be pinpoint accurate');

  const akStill = computeWeaponSpread({
    weaponId: 'ak47',
    horizontalSpeed: 0,
    isCrouching: false,
    isAirborne: false,
    recoilBloom: 0,
    scopeZoom: 0,
  });
  assert.equal(akStill, 0);

  const akWalk = computeWeaponSpread({
    weaponId: 'ak47',
    horizontalSpeed: 3.4,
    isCrouching: false,
    isAirborne: false,
    recoilBloom: 0,
    scopeZoom: 0,
  });
  const akRun = computeWeaponSpread({
    weaponId: 'ak47',
    horizontalSpeed: 6.45,
    isCrouching: false,
    isAirborne: false,
    recoilBloom: 0,
    scopeZoom: 0,
  });
  const mp7Run = computeWeaponSpread({
    weaponId: 'mp7',
    horizontalSpeed: 7.1,
    isCrouching: false,
    isAirborne: false,
    recoilBloom: 0,
    scopeZoom: 0,
  });

  assert.ok(akWalk > 0 && akWalk < 0.03, 'slow walk should be mildly inaccurate');
  assert.ok(akRun > akWalk * 3, 'running rifle should be far less accurate than slow walk');
  assert.ok(mp7Run < akRun * 0.4, 'running SMG should be much more accurate than running rifle');
});

test('bomb planting: requires standing still on ground', () => {
  assert.equal(
    canPlantBombNow({ isGrounded: true, wishFwd: 0, wishStrafe: 0, horizontalSpeed: 0 }),
    true
  );
  assert.equal(
    canPlantBombNow({ isGrounded: true, wishFwd: 1, wishStrafe: 0, horizontalSpeed: 0 }),
    false
  );
  assert.equal(
    canPlantBombNow({ isGrounded: true, wishFwd: 0, wishStrafe: 0, horizontalSpeed: 1.5 }),
    false
  );
  assert.equal(
    canPlantBombNow({ isGrounded: false, wishFwd: 0, wishStrafe: 0, horizontalSpeed: 0 }),
    false
  );
});

test('death drops: drops most expensive weapon, c4, all util, and defuse kit', () => {
  const fullLoadoutDrop = selectDeathDrops({
    primary: { id: 'awp', mag: 4, reserve: 20 },
    secondary: { id: 'deagle', mag: 7, reserve: 35 },
    grenades: ['smoke', 'flashbang', 'flashbang', 'he'],
    hasC4: true,
    hasDefuseKit: true,
  });
  assert.deepEqual(fullLoadoutDrop.weapon, { slot: 1, id: 'awp', mag: 4, reserve: 20 });
  assert.deepEqual(fullLoadoutDrop.grenades, ['smoke', 'flashbang', 'flashbang', 'he']);
  assert.equal(fullLoadoutDrop.c4, true);
  assert.equal(fullLoadoutDrop.defuseKit, true);

  const pistolOnlyDrop = selectDeathDrops({
    primary: null,
    secondary: { id: 'deagle', mag: 5, reserve: 28 },
    grenades: ['incendiary'],
    hasC4: false,
    hasDefuseKit: true,
  });
  assert.deepEqual(pistolOnlyDrop.weapon, { slot: 2, id: 'deagle', mag: 5, reserve: 28 });
  assert.deepEqual(pistolOnlyDrop.grenades, ['incendiary']);
  assert.equal(pistolOnlyDrop.c4, false);
  assert.equal(pistolOnlyDrop.defuseKit, true);
});

test('utility pickups & defuse kit timing', () => {
  assert.equal(canPickUpGrenade([], 'flashbang'), true);
  assert.equal(canPickUpGrenade(['flashbang'], 'flashbang'), true);
  assert.equal(canPickUpGrenade(['flashbang', 'flashbang'], 'flashbang'), false);
  assert.equal(canPickUpGrenade(['smoke'], 'smoke'), false);
  assert.equal(canPickUpGrenade(['molotov'], 'incendiary'), false);
  assert.equal(canPickUpGrenade(['smoke', 'he', 'flashbang', 'flashbang'], 'molotov'), false);

  assert.equal(getDefuseDurationSeconds(false), 10);
  assert.equal(getDefuseDurationSeconds(true), 5);
});

import { createBotBrain, evaluateBotVision, stepBotBrain } from './botAI';
import type { ActorState, BombState } from './types';

function makeTestActor(overrides: Partial<ActorState>): ActorState {
  return {
    id: 'a1',
    name: 'TestBot',
    team: 'attackers',
    isBot: true,
    isLocal: false,
    alive: true,
    hp: 100,
    armor: 100,
    hasHelmet: true,
    cash: 800,
    kills: 0,
    deaths: 0,
    headshots: 0,
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    yaw: 0,
    pitch: 0,
    crouching: false,
    grounded: true,
    activeSlot: 1,
    primary: { id: 'ak47', mag: 30, reserve: 90 },
    secondary: { id: 'glock18', mag: 20, reserve: 120 },
    knife: 'bayonet',
    grenades: [],
    hasC4: false,
    hasDefuseKit: false,
    blindTimer: 0,
    inBuyZone: false,
    hurtFlash: 0,
    ...overrides,
  };
}

const TEST_BOMB: BombState = {
  status: 'carried',
  carrierId: null,
  site: null,
  x: 0,
  y: 0,
  z: 0,
  timerRemaining: 40,
  plantProgress: 0,
  defuseProgress: 0,
  defuserId: null,
};

test('bots: reload uses weapon reload duration instead of finishing instantaneously', () => {
  setActiveMap('sandline');
  const bot = makeTestActor({
    id: 'bot1',
    x: 0,
    z: 20,
    yaw: 0,
    primary: { id: 'ak47', mag: 0, reserve: 90 },
  });
  const brain = createBotBrain('bot1', 0);

  const step1 = stepBotBrain({
    bot,
    brain,
    allActors: [bot],
    bomb: TEST_BOMB,
    smokes: [],
    difficulty: 55,
    isBuyPhase: false,
    dt: 0.05,
  });
  assert.equal(step1.startedReload, true);
  assert.equal(step1.completedReload, false);
  assert.equal(step1.wantFire, false);
  assert.ok(brain.reloadTimer > 2.0);

  const stepMid = stepBotBrain({
    bot,
    brain,
    allActors: [bot],
    bomb: TEST_BOMB,
    smokes: [],
    difficulty: 55,
    isBuyPhase: false,
    dt: 1.0,
  });
  assert.equal(stepMid.completedReload, false);
  assert.equal(stepMid.wantFire, false);

  const stepDone = stepBotBrain({
    bot,
    brain,
    allActors: [bot],
    bomb: TEST_BOMB,
    smokes: [],
    difficulty: 55,
    isBuyPhase: false,
    dt: 2.0,
  });
  assert.equal(stepDone.completedReload, true);
  assert.equal(brain.reloadTimer, 0);
});

test('bots: tactical FOV vision rejects enemies behind bot while legacyVision preserves 360-deg vision', () => {
  setActiveMap('dust2');
  // At mid (x = 0, z = 4 facing -Z yaw=0): enemy in front at z=-10 is visible, behind at z=+16 is outside FOV
  const bot = makeTestActor({ id: 'atk1', team: 'attackers', x: 0, z: 4, yaw: 0 });
  const enemyBehind = makeTestActor({ id: 'def1', team: 'defenders', x: 0, z: 16, yaw: Math.PI });
  const enemyFront = makeTestActor({ id: 'def2', team: 'defenders', x: 0, z: -8, yaw: Math.PI });

  const behindOnly = evaluateBotVision({
    bot,
    allActors: [bot, enemyBehind],
    smokes: [],
    aggroRange: 40,
    fovHalfCos: Math.cos(58 * (Math.PI / 180)),
  });
  assert.equal(behindOnly, null, 'enemy directly behind at 12m must not be spotted in FOV mode');

  const frontScan = evaluateBotVision({
    bot,
    allActors: [bot, enemyBehind, enemyFront],
    smokes: [],
    aggroRange: 40,
    fovHalfCos: Math.cos(58 * (Math.PI / 180)),
  });
  assert.ok(frontScan && frontScan.enemy.id === 'def2');

  const legacyBrain = createBotBrain('atk1', 0);
  legacyBrain.reactionCooldown = 0;
  const legacyCmd = stepBotBrain({
    bot,
    brain: legacyBrain,
    allActors: [bot, enemyBehind],
    bomb: TEST_BOMB,
    smokes: [],
    difficulty: 100,
    isBuyPhase: false,
    dt: 0.05,
    legacyVision: true,
  });
  assert.equal(legacyCmd.wantFire, true, 'Legacy bots keep 360-deg instant detection');
});

test('movement: chained bhop preserves momentum within 150ms grace and caps at 2.2x, mid-air crouch fast-falls', () => {
  const flatGroundCollider = (x: number, y: number, z: number, _vy: number) => ({
    x,
    y: y <= 0 ? 0 : y,
    z,
    grounded: y <= 0.001,
    groundY: 0,
  });

  const baseSpeed = 6.5;
  const state = createKrunkerMoveState(0, 0, 0);

  // Build initial running speed on ground
  for (let i = 0; i < 15; i++) {
    stepKrunkerMovement(
      state,
      {
        yaw: 0,
        wishFwd: 1,
        wishStrafe: 0,
        jumpHeld: false,
        crouchHeld: false,
        walkHeld: false,
        baseRunSpeed: baseSpeed,
        scopeZoom: 0,
        isFrozen: false,
        radius: 0.42,
      },
      flatGroundCollider,
      0.016
    );
  }

  // Chain several bhops by re-pressing jump inside 150ms grace upon landing
  let maxMultSeen = 1;
  for (let chain = 0; chain < 10; chain++) {
    // Trigger jump edge
    const jEv = stepKrunkerMovement(
      state,
      {
        yaw: 0,
        wishFwd: 1,
        wishStrafe: 0,
        jumpHeld: true,
        crouchHeld: false,
        walkHeld: false,
        baseRunSpeed: baseSpeed,
        scopeZoom: 0,
        isFrozen: false,
        radius: 0.42,
      },
      flatGroundCollider,
      0.016
    );
    assert.equal(jEv.jumped, true);

    // Release jump in air and simulate until landing
    let landed = false;
    for (let t = 0; t < 100; t++) {
      const ev = stepKrunkerMovement(
        state,
        {
          yaw: 0,
          wishFwd: 1,
          wishStrafe: 0,
          jumpHeld: false,
          crouchHeld: false,
          walkHeld: false,
          baseRunSpeed: baseSpeed,
          scopeZoom: 0,
          isFrozen: false,
          radius: 0.42,
        },
        flatGroundCollider,
        0.016
      );
      maxMultSeen = Math.max(maxMultSeen, ev.speedMult);
      if (ev.landed) {
        landed = true;
        break;
      }
    }
    assert.equal(landed, true, `chain ${chain} must land`);
    assert.ok(state.landingGraceTimer > 0.1, 'landing sets 150ms grace window');
  }

  assert.ok(state.bhopStreak >= 5, `expected chained bhop streak >= 5, got ${state.bhopStreak}`);
  assert.ok(maxMultSeen > 1.35 && maxMultSeen <= BHOP_MAX_MULT + 1e-6, `speed multiplier ${maxMultSeen} within cap`);

  // Waiting past 150ms resets bhop streak
  for (let w = 0; w < 15; w++) {
    stepKrunkerMovement(
      state,
      {
        yaw: 0,
        wishFwd: 1,
        wishStrafe: 0,
        jumpHeld: false,
        crouchHeld: false,
        walkHeld: false,
        baseRunSpeed: baseSpeed,
        scopeZoom: 0,
        isFrozen: false,
        radius: 0.42,
      },
      flatGroundCollider,
      0.02
    );
  }
  assert.equal(state.bhopStreak, 0, 'waiting >150ms clears bhop streak');

  // Mid-air crouch fast-fall descends faster than uncrouched fall
  const normalAir = createKrunkerMoveState(0, 5, 0);
  normalAir.grounded = false;
  const crouchAir = createKrunkerMoveState(0, 5, 0);
  crouchAir.grounded = false;
  for (let i = 0; i < 10; i++) {
    stepKrunkerMovement(
      normalAir,
      { yaw: 0, wishFwd: 0, wishStrafe: 0, jumpHeld: false, crouchHeld: false, walkHeld: false, baseRunSpeed: 6.5, scopeZoom: 0, isFrozen: false, radius: 0.42 },
      flatGroundCollider,
      0.016
    );
    stepKrunkerMovement(
      crouchAir,
      { yaw: 0, wishFwd: 0, wishStrafe: 0, jumpHeld: false, crouchHeld: true, walkHeld: false, baseRunSpeed: 6.5, scopeZoom: 0, isFrozen: false, radius: 0.42 },
      flatGroundCollider,
      0.016
    );
  }
  assert.ok(crouchAir.y < normalAir.y && crouchAir.vy < normalAir.vy, 'mid-air crouch accelerates fast-fall');
});

test('custom maps: template validates cleanly, builds ramps & colliders, and rejects invalid schemas', () => {
  const tpl = createCustomMapTemplate();
  const valid = validateCustomMapJson(tpl);
  assert.equal(valid.ok, true);
  if (valid.ok) {
    const def = customMapToDefinition(valid.data);
    assert.equal(def.id, 'custom');
    assert.equal(def.name, tpl.mapName);
    assert.ok(def.boxes.some((b) => b.hiddenVisual === true), 'ramps subdivide into hiddenVisual walkable step colliders');
    assert.ok((def.ffaSpawns?.length ?? 0) >= 6);
    assert.ok(def.waypoints.length >= 5);
  }

  const invalidNoBlocks = validateCustomMapJson({ ...tpl, blocks: [] });
  assert.equal(invalidNoBlocks.ok, false);

  const invalidTheme = validateCustomMapJson({ ...tpl, skyTheme: 'lava_world' });
  assert.equal(invalidTheme.ok, false);

  const invalidBlockTuple = validateCustomMapJson({
    ...tpl,
    blocks: [{ position: [0, 0], size: [2, 2, 2], material: 'crate' }],
  });
  assert.equal(invalidBlockTuple.ok, false);
});

test('crosshair: clamps extreme parameters and falls back cleanly on corrupt JSON', () => {
  const parsed = parseCrosshairJson(
    JSON.stringify({
      shape: 't_shape',
      size: 999,
      thickness: -5,
      gap: 40,
      outline: 9,
      opacity: 0.01,
      color: '#22D3EE',
      dynamic: false,
    })
  );
  assert.equal(parsed.shape, 't_shape');
  assert.equal(parsed.size, 24);
  assert.equal(parsed.thickness, 1);
  assert.equal(parsed.gap, 18);
  assert.equal(parsed.outline, 3);
  assert.equal(parsed.opacity, 0.2);
  assert.equal(parsed.color, '#22d3ee');
  assert.equal(parsed.dynamic, false);

  const fallback = parseCrosshairJson('{bad json');
  assert.deepEqual(fallback, DEFAULT_CROSSHAIR);
});

test('c4 detonation & ffa spawn selection: blast falloff and farthest spawn safety', () => {
  const close = calculateC4DetonationDamage(4, 100);
  const mid = calculateC4DetonationDamage(24, 100);
  const far = calculateC4DetonationDamage(38, 100);

  assert.ok(close.hpDamage >= 120, 'inner C4 radius is lethal');
  assert.ok(mid.hpDamage > 0 && mid.hpDamage < close.hpDamage, 'mid C4 radius deals attenuated damage');
  assert.equal(far.hpDamage, 0, 'far radius is safe');

  const spawns = [
    { x: 0, y: 0, z: 0 },
    { x: 30, y: 0, z: 30 },
    { x: -30, y: 0, z: -30 },
  ];
  const chosen = selectFarthestFfaSpawn(spawns, [
    { x: 2, z: 2 },
    { x: 28, z: 25 },
  ]);
  assert.equal(chosen.x, -30);
  assert.equal(chosen.z, -30);
});



