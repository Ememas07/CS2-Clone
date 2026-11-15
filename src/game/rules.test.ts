import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBulletDamage,
  calculateHeExplosionDamage,
  canBuyWeapon,
  checkMatchWinner,
  computeLossBonus,
  computeRoundEndCash,
  ECONOMY_CONSTANTS,
  getArmorPurchaseCost,
  getKillReward,
  isHalftimeRound,
} from './rules';
import { getBotDifficultyTuning } from './botAI';
import {
  findWaypointPath,
  getSpawnAnchor,
  hasLineOfSight,
  isInBuyZone,
  MAP_LIST,
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
