export type Team = 'attackers' | 'defenders';
export type GameMode = 'bots' | 'pvp' | 'mixed' | 'spectate' | 'awp' | 'ffa';
export type BotDifficulty = number; // 1..100 scale (100 = max lethal bots)
export type MapId =
  | 'sandline'
  | 'dust2'
  | 'mirage'
  | 'inferno'
  | 'overpass'
  | 'awp_arena'
  | 'custom';
export type AppScreen = 'title' | 'playing' | 'paused' | 'gameover';

export type WeaponSlot = 1 | 2 | 3 | 4 | 5; // 1=Primary, 2=Secondary, 3=Knife, 4=Grenades, 5=C4

export type PrimaryWeaponId = 'mac10' | 'mp7' | 'm4a1s' | 'ak47' | 'awp';
export type SecondaryWeaponId = 'usps' | 'fiveseven' | 'glock18' | 'tec9' | 'deagle';
export type KnifeId = 'bayonet' | 'karambit' | 'butterfly';
export type GrenadeId = 'flashbang' | 'he' | 'smoke' | 'molotov' | 'incendiary';
export type WeaponId = PrimaryWeaponId | SecondaryWeaponId | KnifeId | GrenadeId | 'c4';
export type ArmorType = 'none' | 'kevlar' | 'kevlar_helmet';
export type BuyableGearId = WeaponId | ArmorType | 'defuse_kit';
export type HitboxZone = 'head' | 'chest' | 'limb';

export type RoundPhase = 'buy' | 'live' | 'planted' | 'round_end' | 'match_end';

export type CrosshairShape = 'classic' | 't_shape' | 'circle' | 'dot';

export interface CrosshairConfig {
  shape: CrosshairShape;
  size: number; // 2..24 px
  thickness: number; // 1..6 px
  gap: number; // 0..18 px
  outline: number; // 0..3 px
  opacity: number; // 0.2..1.0
  color: string; // hex e.g. #6ee7b7
  dynamic: boolean;
}

export type CustomSkyTheme = 'desert' | 'twilight' | 'urban' | 'arctic' | 'sunset';
export type CustomMaterialInput = 'sandstone' | 'concrete' | 'wood' | 'metal' | 'crate';
export type RampDirection = 'n' | 's' | 'e' | 'w';

export interface CustomMapBlockInput {
  id?: string;
  position: [number, number, number];
  size: [number, number, number];
  material: CustomMaterialInput;
  wallbangable?: boolean;
}

export interface CustomMapRampInput {
  id?: string;
  position: [number, number, number];
  size: [number, number, number];
  direction: RampDirection;
  material?: CustomMaterialInput;
}

export interface CustomMapSpawnInput {
  position: [number, number, number];
  yaw?: number;
}

export interface CustomMapWaypointInput {
  id: string;
  position: [number, number];
  callout?: string;
  neighbors: string[];
}

export interface CustomMapJson {
  mapName: string;
  skyTheme: CustomSkyTheme;
  blocks: CustomMapBlockInput[];
  ramps?: CustomMapRampInput[];
  attackerSpawns: CustomMapSpawnInput[];
  defenderSpawns: CustomMapSpawnInput[];
  ffaSpawns?: CustomMapSpawnInput[];
  bombSites: {
    A: { position: [number, number]; radius?: number };
    B: { position: [number, number]; radius?: number };
  };
  botWaypoints?: CustomMapWaypointInput[];
}

export interface LoadoutSnapshot {
  primaryId: PrimaryWeaponId | null;
  secondaryId: SecondaryWeaponId | null;
  armor: ArmorType;
  hasDefuseKit: boolean;
  grenades: GrenadeId[];
}

export interface WeaponSpec {
  id: WeaponId;
  name: string;
  slot: WeaponSlot;
  category: 'smg' | 'rifle' | 'sniper' | 'pistol' | 'knife' | 'grenade' | 'c4';
  price: number;
  team: Team | 'both';
  damage: number;
  armorPen: number; // 0..1 fraction of damage ignoring armor on chest
  headMultiplier: number;
  limbMultiplier: number;
  fireRateRpm: number; // rounds per minute
  automatic: boolean;
  magSize: number;
  reserveAmmo: number;
  reloadTime: number; // seconds
  moveSpeed: number; // m/s
  baseSpread: number; // radians
  moveSpread: number; // extra radians at full run speed
  recoilKick: number; // pitch kick per shot
  recoilSpread: number; // bloom per shot
  killReward: number;
  hasSilencer?: boolean;
  hasBurst?: boolean;
  hasScope?: boolean;
  rangeFalloffPer10m: number; // e.g., 0.04 = 4% per 10m
  description: string;
}

export interface WeaponInstance {
  id: WeaponId;
  mag: number;
  reserve: number;
  silenced?: boolean;
  burstMode?: boolean;
}

export interface ActorState {
  id: string;
  name: string;
  team: Team;
  isBot: boolean;
  isLocal: boolean;
  alive: boolean;
  hp: number;
  armor: number;
  hasHelmet: boolean;
  cash: number;
  kills: number;
  deaths: number;
  headshots: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  pitch: number;
  crouching: boolean;
  grounded: boolean;
  activeSlot: WeaponSlot;
  primary: WeaponInstance | null;
  secondary: WeaponInstance | null;
  knife: KnifeId;
  grenades: GrenadeId[];
  hasC4: boolean;
  hasDefuseKit: boolean;
  blindTimer: number; // seconds remaining of flashbang blindness
  inBuyZone: boolean;
  hurtFlash: number;
  respawnTimer?: number;
  spawnProtectionTimer?: number;
}

export interface BombState {
  status: 'carried' | 'dropped' | 'planting' | 'planted' | 'defusing' | 'defused' | 'detonated';
  carrierId: string | null;
  site: 'A' | 'B' | null;
  x: number;
  y: number;
  z: number;
  timerRemaining: number; // 40s countdown once planted
  plantProgress: number; // 0..1 (3.2s to plant)
  defuseProgress: number; // 0..1 (5s to defuse)
  defuserId: string | null;
}

export interface KillFeedEntry {
  id: number;
  killerName: string;
  killerTeam: Team | 'environment';
  victimName: string;
  victimTeam: Team;
  weaponName: string;
  weaponId?: WeaponId;
  headshot: boolean;
  wallbang: boolean;
  timestamp: number;
}

export interface RadarBlip {
  id: string;
  x: number;
  z: number;
  team: Team;
  isLocal: boolean;
  hasC4: boolean;
  spotted: boolean;
  alive: boolean;
}

export interface TeammateOverlay {
  id: string;
  name: string;
  team: Team;
  hp: number;
  armor: number;
  primaryName: string | null;
  secondaryName: string | null;
  activeWeaponName: string;
  hasC4: boolean;
  hasDefuseKit: boolean;
  grenadeCount: number;
  isReloading: boolean;
  xPct: number;
  yPct: number;
  dist: number;
}

export interface HudSnapshot {
  screen: AppScreen;
  mode: GameMode;
  mapId: MapId;
  customMapName?: string | null;
  roundNumber: number;
  maxRounds: number;
  halftimeRound: number;
  phase: RoundPhase;
  phaseTimeRemaining: number;
  attackerScore: number;
  defenderScore: number;
  roundBanner: string | null;
  localTeam: Team;
  localAlive: boolean;
  spectatingName: string | null;
  spectatingTeam: Team | null;
  spectatingCanControl: boolean;
  controllingBotName: string | null;
  hp: number;
  armor: number;
  hasHelmet: boolean;
  cash: number;
  inBuyZone: boolean;
  canBuy: boolean;
  activeSlot: WeaponSlot;
  activeWeaponId: WeaponId;
  activeWeaponName: string;
  mag: number;
  reserve: number;
  silenced: boolean;
  burstMode: boolean;
  scopeZoom: 0 | 1 | 2; // 0=hip, 1=2x, 2=4x
  isReloading: boolean;
  primaryId: PrimaryWeaponId | null;
  secondaryId: SecondaryWeaponId | null;
  knifeId: KnifeId;
  grenades: GrenadeId[];
  hasC4: boolean;
  hasDefuseKit: boolean;
  bomb: BombState;
  crosshairSpread: number; // pixels radius
  bhopStreak: number;
  speedUnits: number;
  spawnProtectionRemaining: number;
  respawnTimerRemaining: number;
  ffaTargetKills: number;
  hasPreviousLoadout: boolean;
  blindAlpha: number; // 0..1
  damageFlash: number; // 0..1
  hitmarker: 'none' | 'body' | 'head';
  killConfirm: {
    id: number;
    victimName: string;
    weaponName: string;
    headshot: boolean;
    reward: number;
  } | null;
  deathInfo?: {
    killerName: string;
    weaponName: string;
    headshot: boolean;
  } | null;
  pingMs?: number;
  interactPrompt: string | null;
  killFeed: KillFeedEntry[];
  radarBlips: RadarBlip[];
  teammateOverlays: TeammateOverlay[];
  xrayEnabled: boolean;
  localYaw: number;
  localX: number;
  localZ: number;
  attackersAlive: number;
  defendersAlive: number;
  scoreboard: Array<{
    id: string;
    name: string;
    team: Team;
    isBot: boolean;
    isLocal: boolean;
    alive: boolean;
    kills: number;
    deaths: number;
    headshots: number;
    cash: number;
  }>;
  pointerLocked: boolean;
  muted: boolean;
}

export interface RoomPlayerInfo {
  id: string;
  name: string;
  team: Team;
  isHost: boolean;
  connected?: boolean;
}

export interface RoomInfo {
  id: string;
  hostId: string;
  mode: 'pvp' | 'mixed' | 'awp' | 'ffa';
  mapId: MapId;
  customMapData?: CustomMapJson | null;
  botDifficulty: BotDifficulty;
  started: boolean;
  players: RoomPlayerInfo[];
}
