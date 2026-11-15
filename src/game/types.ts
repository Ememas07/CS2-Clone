export type Team = 'attackers' | 'defenders';
export type GameMode = 'bots' | 'pvp' | 'mixed';
export type BotDifficulty = number; // 1..100 scale (100 = max lethal bots)
export type MapId = 'sandline' | 'dust2' | 'mirage' | 'inferno' | 'overpass';
export type AppScreen = 'title' | 'playing' | 'paused' | 'gameover';

export type WeaponSlot = 1 | 2 | 3 | 4 | 5; // 1=Primary, 2=Secondary, 3=Knife, 4=Grenades, 5=C4

export type PrimaryWeaponId = 'mac10' | 'mp7' | 'm4a1s' | 'ak47' | 'awp';
export type SecondaryWeaponId = 'usps' | 'fiveseven' | 'glock18' | 'tec9' | 'deagle';
export type KnifeId = 'bayonet' | 'karambit' | 'butterfly';
export type GrenadeId = 'flashbang' | 'he' | 'smoke' | 'molotov' | 'incendiary';
export type WeaponId = PrimaryWeaponId | SecondaryWeaponId | KnifeId | GrenadeId | 'c4';
export type ArmorType = 'none' | 'kevlar' | 'kevlar_helmet';
export type HitboxZone = 'head' | 'chest' | 'limb';

export type RoundPhase = 'buy' | 'live' | 'planted' | 'round_end' | 'match_end';

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
  activeSlot: WeaponSlot;
  primary: WeaponInstance | null;
  secondary: WeaponInstance | null;
  knife: KnifeId;
  grenades: GrenadeId[];
  hasC4: boolean;
  blindTimer: number; // seconds remaining of flashbang blindness
  inBuyZone: boolean;
  hurtFlash: number;
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

export interface HudSnapshot {
  screen: AppScreen;
  mode: GameMode;
  mapId: MapId;
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
  bomb: BombState;
  crosshairSpread: number; // pixels radius
  blindAlpha: number; // 0..1
  damageFlash: number; // 0..1
  hitmarker: 'none' | 'body' | 'head';
  interactPrompt: string | null;
  killFeed: KillFeedEntry[];
  radarBlips: RadarBlip[];
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
}

export interface RoomInfo {
  id: string;
  hostId: string;
  mode: 'pvp' | 'mixed';
  mapId: MapId;
  botDifficulty: BotDifficulty;
  started: boolean;
  players: RoomPlayerInfo[];
}
