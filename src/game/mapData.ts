import type { MapId, RampDirection, Team } from './types';

export type MapMaterialKind =
  | 'sandstone'
  | 'terracotta'
  | 'concrete'
  | 'wood'
  | 'metal_olive'
  | 'metal_slate'
  | 'metal_ochre'
  | 'dark_trim';

export interface MapBox {
  id: string;
  x: number; // center X
  y: number; // bottom Y (pivot grounded on floor)
  z: number; // center Z
  w: number; // width X
  h: number; // height Y
  d: number; // depth Z
  material: MapMaterialKind;
  wallbangable: boolean;
  penetrationFactor: number; // 0..1 multiplier when shot through
  castShadow?: boolean;
  hiddenVisual?: boolean;
}

export interface MapRamp {
  id: string;
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  direction: RampDirection;
  material: MapMaterialKind;
}

export interface SiteZone {
  site: 'A' | 'B';
  x: number;
  z: number;
  radius: number;
}

export interface SpawnAnchor {
  x: number;
  y: number;
  z: number;
  yaw: number; // facing direction in radians (0 = -Z, Math.PI = +Z)
}

export interface WaypointNode {
  id: string;
  x: number;
  z: number;
  callout: string;
  neighbors: string[];
}

export interface MapTheme {
  floorTint: number;
  outerFloorColor: number;
  mesaColor: number;
  fogColor: number;
  skyColor: number;
}

export interface MapDefinition {
  id: MapId;
  name: string;
  subtitle: string;
  theme: MapTheme;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  siteZones: SiteZone[];
  buyZones: Record<Team, { x: number; z: number; radius: number }>;
  spawnPoints: Record<Team, SpawnAnchor[]>;
  ffaSpawns?: SpawnAnchor[];
  boxes: MapBox[];
  ramps?: MapRamp[];
  archLintels: Array<[number, number, number, number, number, number, MapMaterialKind?]>;
  waypoints: WaypointNode[];
}

const DEFAULT_BOUNDS = {
  minX: -48,
  maxX: 48,
  minZ: -54,
  maxZ: 54,
};

function makePerimeterWalls(mat: MapMaterialKind): MapBox[] {
  return [
    { id: 'wall_n', x: 0, y: 0, z: -53, w: 96, h: 5.8, d: 2, material: mat, wallbangable: false, penetrationFactor: 0 },
    { id: 'wall_s', x: 0, y: 0, z: 53, w: 96, h: 5.8, d: 2, material: mat, wallbangable: false, penetrationFactor: 0 },
    { id: 'wall_w', x: -47, y: 0, z: 0, w: 2, h: 5.8, d: 108, material: mat, wallbangable: false, penetrationFactor: 0 },
    { id: 'wall_e', x: 47, y: 0, z: 0, w: 2, h: 5.8, d: 108, material: mat, wallbangable: false, penetrationFactor: 0 },
  ];
}

// 1. SANDLINE (Original Symmetric 3-Lane Arena)
const SANDLINE_MAP: MapDefinition = {
  id: 'sandline',
  name: 'Sandline',
  subtitle: 'Balanced 3-lane sandstone arena',
  theme: {
    floorTint: 0xffffff,
    outerFloorColor: 0xcab490,
    mesaColor: 0xb59870,
    fogColor: 0xdfd3bf,
    skyColor: 0xd5e6f5,
  },
  bounds: { ...DEFAULT_BOUNDS },
  siteZones: [
    { site: 'A', x: -28, z: 0, radius: 6.5 },
    { site: 'B', x: 28, z: 0, radius: 6.5 },
  ],
  buyZones: {
    attackers: { x: 0, z: 44, radius: 10 },
    defenders: { x: 0, z: -44, radius: 10 },
  },
  spawnPoints: {
    attackers: [
      { x: 0, y: 0, z: 44, yaw: 0 },
      { x: -3.5, y: 0, z: 44.5, yaw: 0 },
      { x: 3.5, y: 0, z: 44.5, yaw: 0 },
      { x: -6.5, y: 0, z: 46, yaw: 0 },
      { x: 6.5, y: 0, z: 46, yaw: 0 },
    ],
    defenders: [
      { x: 0, y: 0, z: -44, yaw: Math.PI },
      { x: -3.5, y: 0, z: -44.5, yaw: Math.PI },
      { x: 3.5, y: 0, z: -44.5, yaw: Math.PI },
      { x: -6.5, y: 0, z: -46, yaw: Math.PI },
      { x: 6.5, y: 0, z: -46, yaw: Math.PI },
    ],
  },
  boxes: [
    ...makePerimeterWalls('sandstone'),
    { id: 'spawn_screen_atk', x: 0, y: 0, z: 33, w: 9, h: 4.2, d: 1.8, material: 'sandstone', wallbangable: false, penetrationFactor: 0 },
    { id: 'spawn_screen_def', x: 0, y: 0, z: -33, w: 9, h: 4.2, d: 1.8, material: 'sandstone', wallbangable: false, penetrationFactor: 0 },
    { id: 'div_w_n', x: -14, y: 0, z: -26, w: 2, h: 4.8, d: 24, material: 'sandstone', wallbangable: false, penetrationFactor: 0 },
    { id: 'div_w_m', x: -14, y: 0, z: 0, w: 2, h: 4.8, d: 12, material: 'sandstone', wallbangable: false, penetrationFactor: 0 },
    { id: 'div_w_s', x: -14, y: 0, z: 26, w: 2, h: 4.8, d: 24, material: 'sandstone', wallbangable: false, penetrationFactor: 0 },
    { id: 'div_e_n', x: 14, y: 0, z: -26, w: 2, h: 4.8, d: 24, material: 'sandstone', wallbangable: false, penetrationFactor: 0 },
    { id: 'div_e_m', x: 14, y: 0, z: 0, w: 2, h: 4.8, d: 12, material: 'sandstone', wallbangable: false, penetrationFactor: 0 },
    { id: 'div_e_s', x: 14, y: 0, z: 26, w: 2, h: 4.8, d: 24, material: 'sandstone', wallbangable: false, penetrationFactor: 0 },
    { id: 'mid_door_l', x: -6.5, y: 0, z: -13, w: 7, h: 4.6, d: 1.6, material: 'sandstone', wallbangable: false, penetrationFactor: 0 },
    { id: 'mid_door_r', x: 6.5, y: 0, z: 13, w: 7, h: 4.6, d: 1.6, material: 'sandstone', wallbangable: false, penetrationFactor: 0 },
    { id: 'mid_wood_door_l', x: -2.4, y: 0, z: -13, w: 1.2, h: 3.6, d: 0.45, material: 'wood', wallbangable: true, penetrationFactor: 0.55 },
    { id: 'mid_wood_door_r', x: 2.4, y: 0, z: 13, w: 1.2, h: 3.6, d: 0.45, material: 'wood', wallbangable: true, penetrationFactor: 0.55 },
    { id: 'mid_box_center', x: 0, y: 0, z: 0, w: 2.4, h: 1.45, d: 2.4, material: 'wood', wallbangable: true, penetrationFactor: 0.52 },
    { id: 'mid_crate_w', x: -6.5, y: 0, z: 5, w: 1.8, h: 1.35, d: 1.8, material: 'wood', wallbangable: true, penetrationFactor: 0.55 },
    { id: 'mid_crate_e', x: 6.5, y: 0, z: -5, w: 1.8, h: 1.35, d: 1.8, material: 'wood', wallbangable: true, penetrationFactor: 0.55 },
    { id: 'mid_perch_def', x: 5.5, y: 0, z: -24, w: 5.5, h: 1.5, d: 4, material: 'concrete', wallbangable: false, penetrationFactor: 0 },
    { id: 'mid_perch_def_step', x: 9.2, y: 0, z: -24, w: 2.2, h: 0.75, d: 3.2, material: 'concrete', wallbangable: false, penetrationFactor: 0 },
    { id: 'mid_perch_atk', x: -5.5, y: 0, z: 24, w: 5.5, h: 1.5, d: 4, material: 'concrete', wallbangable: false, penetrationFactor: 0 },
    { id: 'mid_perch_atk_step', x: -9.2, y: 0, z: 24, w: 2.2, h: 0.75, d: 3.2, material: 'concrete', wallbangable: false, penetrationFactor: 0 },
    { id: 'a_triple_1', x: -28, y: 0, z: 0, w: 2.0, h: 1.5, d: 2.0, material: 'wood', wallbangable: true, penetrationFactor: 0.52 },
    { id: 'a_triple_2', x: -28, y: 1.5, z: 0, w: 1.8, h: 1.3, d: 1.8, material: 'wood', wallbangable: true, penetrationFactor: 0.52 },
    { id: 'a_crate_sw', x: -34, y: 0, z: 5.5, w: 2.2, h: 1.35, d: 1.8, material: 'wood', wallbangable: true, penetrationFactor: 0.55 },
    { id: 'a_crate_nw', x: -34, y: 0, z: -5.5, w: 2.2, h: 1.35, d: 1.8, material: 'wood', wallbangable: true, penetrationFactor: 0.55 },
    { id: 'a_pillar_s', x: -23, y: 0, z: 12, w: 3.5, h: 4.4, d: 2.2, material: 'sandstone', wallbangable: false, penetrationFactor: 0 },
    { id: 'a_pillar_n', x: -23, y: 0, z: -12, w: 3.5, h: 4.4, d: 2.2, material: 'sandstone', wallbangable: false, penetrationFactor: 0 },
    { id: 'a_balcony_plat', x: -41, y: 0, z: 0, w: 5.5, h: 1.5, d: 8.5, material: 'concrete', wallbangable: false, penetrationFactor: 0 },
    { id: 'a_balcony_step_n', x: -41, y: 0, z: -5.2, w: 4.0, h: 0.75, d: 2.2, material: 'concrete', wallbangable: false, penetrationFactor: 0 },
    { id: 'a_balcony_step_s', x: -41, y: 0, z: 5.2, w: 4.0, h: 0.75, d: 2.2, material: 'concrete', wallbangable: false, penetrationFactor: 0 },
    { id: 'a_ramp_cover_n', x: -34, y: 0, z: -22, w: 3.5, h: 1.35, d: 2.0, material: 'concrete', wallbangable: false, penetrationFactor: 0 },
    { id: 'a_ramp_cover_s', x: -34, y: 0, z: 22, w: 3.5, h: 1.35, d: 2.0, material: 'concrete', wallbangable: false, penetrationFactor: 0 },
    { id: 'b_container_center', x: 28, y: 0, z: 0, w: 2.5, h: 2.7, d: 5.6, material: 'metal_olive', wallbangable: false, penetrationFactor: 0 },
    { id: 'b_crate_se', x: 34.5, y: 0, z: 5.5, w: 2.0, h: 1.35, d: 2.0, material: 'wood', wallbangable: true, penetrationFactor: 0.55 },
    { id: 'b_crate_ne', x: 34.5, y: 0, z: -5.5, w: 2.0, h: 1.35, d: 2.0, material: 'wood', wallbangable: true, penetrationFactor: 0.55 },
    { id: 'b_pillar_s', x: 23, y: 0, z: 12, w: 3.5, h: 4.4, d: 2.2, material: 'sandstone', wallbangable: false, penetrationFactor: 0 },
    { id: 'b_pillar_n', x: 23, y: 0, z: -12, w: 3.5, h: 4.4, d: 2.2, material: 'sandstone', wallbangable: false, penetrationFactor: 0 },
    { id: 'b_container_perch', x: 40.5, y: 0, z: 0, w: 5.0, h: 1.5, d: 8.0, material: 'metal_slate', wallbangable: false, penetrationFactor: 0 },
    { id: 'b_step_n', x: 40.5, y: 0, z: -5.0, w: 3.8, h: 0.75, d: 2.2, material: 'concrete', wallbangable: false, penetrationFactor: 0 },
    { id: 'b_step_s', x: 40.5, y: 0, z: 5.0, w: 3.8, h: 0.75, d: 2.2, material: 'concrete', wallbangable: false, penetrationFactor: 0 },
    { id: 'b_lane_box_n', x: 34, y: 0, z: -22, w: 3.5, h: 1.35, d: 2.0, material: 'metal_ochre', wallbangable: false, penetrationFactor: 0 },
    { id: 'b_lane_box_s', x: 34, y: 0, z: 22, w: 3.5, h: 1.35, d: 2.0, material: 'metal_ochre', wallbangable: false, penetrationFactor: 0 },
  ],
  archLintels: [
    [-14, 3.8, -10, 2.1, 1.4, 8.2],
    [-14, 3.8, 10, 2.1, 1.4, 8.2],
    [14, 3.8, -10, 2.1, 1.4, 8.2],
    [14, 3.8, 10, 2.1, 1.4, 8.2],
    [0, 4.1, -13, 6.2, 1.1, 1.7],
    [0, 4.1, 13, 6.2, 1.1, 1.7],
  ],
  waypoints: [
    { id: 'atk_spawn', x: 0, z: 42, callout: 'Attacker Spawn', neighbors: ['atk_a_lobby', 'atk_mid_gate', 'atk_b_lobby'] },
    { id: 'def_spawn', x: 0, z: -42, callout: 'Defender Spawn', neighbors: ['def_a_lobby', 'def_mid_gate', 'def_b_lobby'] },
    { id: 'atk_a_lobby', x: -24, z: 36, callout: 'A Lobby', neighbors: ['atk_spawn', 'a_main_s'] },
    { id: 'a_main_s', x: -29, z: 18, callout: 'A Main South', neighbors: ['atk_a_lobby', 'a_site_s', 'a_conn_s'] },
    { id: 'a_site_s', x: -28, z: 6, callout: 'A Site South', neighbors: ['a_main_s', 'a_site', 'a_balcony'] },
    { id: 'a_site', x: -31.5, z: 0, callout: 'Site A', neighbors: ['a_site_s', 'a_site_n', 'a_balcony'] },
    { id: 'a_site_n', x: -28, z: -6, callout: 'A Site North', neighbors: ['a_site', 'a_main_n', 'a_conn_n'] },
    { id: 'a_balcony', x: -36, z: 0, callout: 'A Balcony', neighbors: ['a_site', 'a_site_s', 'a_site_n'] },
    { id: 'a_main_n', x: -29, z: -18, callout: 'A Main North', neighbors: ['a_site_n', 'def_a_lobby'] },
    { id: 'def_a_lobby', x: -24, z: -36, callout: 'A Defender Hall', neighbors: ['def_spawn', 'a_main_n'] },
    { id: 'atk_mid_gate', x: -8, z: 33, callout: 'Mid South Gate', neighbors: ['atk_spawn', 'atk_mid_entry'] },
    { id: 'atk_mid_entry', x: 0, z: 24, callout: 'Mid South', neighbors: ['atk_mid_gate', 'mid_s', 'a_conn_s'] },
    { id: 'mid_s', x: -4.5, z: 10, callout: 'Mid Courtyard S', neighbors: ['atk_mid_entry', 'mid_center', 'a_conn_s', 'b_conn_s'] },
    { id: 'mid_center', x: 4.5, z: 0, callout: 'Mid Doors', neighbors: ['mid_s', 'mid_n', 'b_conn_n'] },
    { id: 'mid_n', x: 4.5, z: -10, callout: 'Mid Courtyard N', neighbors: ['mid_center', 'def_mid_entry', 'b_conn_n', 'a_conn_n'] },
    { id: 'def_mid_entry', x: 0, z: -24, callout: 'Mid North', neighbors: ['def_mid_gate', 'mid_n', 'b_conn_n'] },
    { id: 'def_mid_gate', x: 8, z: -33, callout: 'Mid North Gate', neighbors: ['def_spawn', 'def_mid_entry'] },
    { id: 'a_conn_s', x: -14, z: 10, callout: 'A Connector S', neighbors: ['mid_s', 'a_main_s', 'atk_mid_entry'] },
    { id: 'a_conn_n', x: -14, z: -10, callout: 'A Connector N', neighbors: ['mid_n', 'a_site_n'] },
    { id: 'b_conn_s', x: 14, z: 10, callout: 'B Connector S', neighbors: ['mid_s', 'b_site_s'] },
    { id: 'b_conn_n', x: 14, z: -10, callout: 'B Connector N', neighbors: ['mid_n', 'b_main_n', 'mid_center', 'def_mid_entry'] },
    { id: 'atk_b_lobby', x: 24, z: 36, callout: 'B Lobby', neighbors: ['atk_spawn', 'b_main_s'] },
    { id: 'b_main_s', x: 29, z: 18, callout: 'B Main South', neighbors: ['atk_b_lobby', 'b_site_s', 'b_conn_s'] },
    { id: 'b_site_s', x: 28, z: 6, callout: 'B Site South', neighbors: ['b_main_s', 'b_site', 'b_conn_s'] },
    { id: 'b_site', x: 32, z: 0, callout: 'Site B', neighbors: ['b_site_s', 'b_site_n'] },
    { id: 'b_site_n', x: 28, z: -6, callout: 'B Site North', neighbors: ['b_site', 'b_main_n', 'b_conn_n'] },
    { id: 'b_main_n', x: 29, z: -18, callout: 'B Main North', neighbors: ['b_site_n', 'def_b_lobby'] },
    { id: 'def_b_lobby', x: 24, z: -36, callout: 'B Defender Hall', neighbors: ['def_spawn', 'b_main_n'] },
  ],
};

// 2. DUSTLINE II (Dust 2-inspired: Long A, Catwalk/Short, Mid Double Doors + Xbox, B Tunnels)
const DUST2_MAP: MapDefinition = {
  id: 'dust2',
  name: 'Dustline II',
  subtitle: 'Dust 2-inspired · Long A, Catwalk & Mid Double Doors',
  theme: {
    floorTint: 0xf6ead6,
    outerFloorColor: 0xd4bb92,
    mesaColor: 0xc29f6d,
    fogColor: 0xe9dbc4,
    skyColor: 0xdfebf7,
  },
  bounds: { ...DEFAULT_BOUNDS },
  siteZones: [
    { site: 'A', x: -30, z: -8, radius: 6.8 },
    { site: 'B', x: 30, z: -6, radius: 6.8 },
  ],
  buyZones: {
    attackers: { x: 0, z: 44, radius: 10 },
    defenders: { x: 0, z: -42, radius: 10 },
  },
  spawnPoints: {
    attackers: [
      { x: -2, y: 0, z: 45, yaw: 0 },
      { x: -5, y: 0, z: 45.5, yaw: 0 },
      { x: 2, y: 0, z: 45.5, yaw: 0 },
      { x: 5, y: 0, z: 46, yaw: 0 },
      { x: -8, y: 0, z: 46, yaw: 0 },
    ],
    defenders: [
      { x: -2, y: 0, z: -43, yaw: Math.PI },
      { x: -6, y: 0, z: -43.5, yaw: Math.PI },
      { x: 2, y: 0, z: -43.5, yaw: Math.PI },
      { x: 6, y: 0, z: -44, yaw: Math.PI },
      { x: -10, y: 0, z: -44, yaw: Math.PI },
    ],
  },
  boxes: [
    ...makePerimeterWalls('sandstone'),
    // T-Spawn ledge / Suicide block & CT Mid screen
    { id: 'd2_t_ledge', x: 0, y: 0, z: 36, w: 10, h: 2.2, d: 2.2, material: 'sandstone', wallbangable: false, penetrationFactor: 0 },
    // Long A buildings & Blue/Long Doors divider
    { id: 'd2_long_house_w', x: -36, y: 0, z: 22, w: 12, h: 4.8, d: 3.0, material: 'sandstone', wallbangable: false, penetrationFactor: 0 },
    { id: 'd2_long_divider', x: -20, y: 0, z: 16, w: 3.0, h: 5.0, d: 28, material: 'sandstone', wallbangable: false, penetrationFactor: 0 },
    { id: 'd2_long_corner', x: -39, y: 0, z: 6, w: 3.5, h: 1.45, d: 2.6, material: 'metal_ochre', wallbangable: false, penetrationFactor: 0 },
    { id: 'd2_long_pit_box', x: -41, y: 0, z: 14, w: 2.2, h: 1.3, d: 2.2, material: 'wood', wallbangable: true, penetrationFactor: 0.55 },
    // A Site elevated platform + ramp steps + Goose / Triple crates
    { id: 'd2_a_plat', x: -33, y: 0, z: -12, w: 14, h: 1.35, d: 8, material: 'concrete', wallbangable: false, penetrationFactor: 0 },
    { id: 'd2_a_ramp_s', x: -33, y: 0, z: -6.8, w: 10, h: 0.68, d: 2.5, material: 'concrete', wallbangable: false, penetrationFactor: 0 },
    { id: 'd2_a_crate_1', x: -30, y: 1.35, z: -11, w: 2.0, h: 1.4, d: 2.0, material: 'wood', wallbangable: true, penetrationFactor: 0.52 },
    { id: 'd2_a_crate_2', x: -35, y: 1.35, z: -14, w: 2.2, h: 1.4, d: 2.2, material: 'wood', wallbangable: true, penetrationFactor: 0.52 },
    { id: 'd2_a_car', x: -40, y: 0, z: -20, w: 3.2, h: 1.4, d: 4.8, material: 'metal_slate', wallbangable: false, penetrationFactor: 0 },
    { id: 'd2_ct_a_wall', x: -20, y: 0, z: -26, w: 3.0, h: 4.8, d: 18, material: 'sandstone', wallbangable: false, penetrationFactor: 0 },
    // Catwalk / A Short elevated bridge
    { id: 'd2_catwalk', x: -13, y: 0, z: -4, w: 6.5, h: 1.35, d: 16, material: 'concrete', wallbangable: false, penetrationFactor: 0 },
    { id: 'd2_cat_step', x: -13, y: 0, z: 5.5, w: 5.0, h: 0.68, d: 3.0, material: 'concrete', wallbangable: false, penetrationFactor: 0 },
    { id: 'd2_cat_crate', x: -15, y: 1.35, z: -10, w: 1.8, h: 1.3, d: 1.8, material: 'wood', wallbangable: true, penetrationFactor: 0.55 },
    // Mid Double Doors (wallbangable wood leaves!) + Xbox
    { id: 'd2_mid_xbox', x: 0, y: 0, z: 4, w: 2.4, h: 1.45, d: 2.4, material: 'wood', wallbangable: true, penetrationFactor: 0.5 },
    { id: 'd2_mid_wall_w', x: -7.5, y: 0, z: -14, w: 9, h: 5.0, d: 2.2, material: 'sandstone', wallbangable: false, penetrationFactor: 0 },
    { id: 'd2_mid_wall_e', x: 7.5, y: 0, z: -14, w: 9, h: 5.0, d: 2.2, material: 'sandstone', wallbangable: false, penetrationFactor: 0 },
    { id: 'd2_mid_door_l', x: -2.0, y: 0, z: -14, w: 1.5, h: 3.8, d: 0.45, material: 'wood', wallbangable: true, penetrationFactor: 0.55 },
    { id: 'd2_mid_door_r', x: 2.0, y: 0, z: -14, w: 1.5, h: 3.8, d: 0.45, material: 'wood', wallbangable: true, penetrationFactor: 0.55 },
    { id: 'd2_mid_palm', x: -4.5, y: 0, z: 16, w: 2.2, h: 1.4, d: 2.2, material: 'wood', wallbangable: true, penetrationFactor: 0.55 },
    // B Tunnels & Divider + B Site crates/container
    { id: 'd2_b_div_s', x: 16, y: 0, z: 22, w: 2.6, h: 5.0, d: 24, material: 'sandstone', wallbangable: false, penetrationFactor: 0 },
    { id: 'd2_b_div_n', x: 16, y: 0, z: -18, w: 2.6, h: 5.0, d: 22, material: 'sandstone', wallbangable: false, penetrationFactor: 0 },
    { id: 'd2_b_tunnel_wall', x: 34, y: 0, z: 14, w: 18, h: 5.0, d: 2.6, material: 'sandstone', wallbangable: false, penetrationFactor: 0 },
    { id: 'd2_b_crate_c', x: 30, y: 0, z: -6, w: 2.4, h: 1.55, d: 2.4, material: 'wood', wallbangable: true, penetrationFactor: 0.52 },
    { id: 'd2_b_crate_top', x: 30, y: 1.55, z: -6, w: 1.7, h: 1.25, d: 1.7, material: 'wood', wallbangable: true, penetrationFactor: 0.52 },
    { id: 'd2_b_container', x: 38, y: 0, z: -12, w: 2.6, h: 2.6, d: 5.8, material: 'metal_olive', wallbangable: false, penetrationFactor: 0 },
    { id: 'd2_b_car', x: 24, y: 0, z: 2, w: 3.2, h: 1.35, d: 2.0, material: 'metal_ochre', wallbangable: false, penetrationFactor: 0 },
    { id: 'd2_b_door_w', x: 21, y: 0, z: -18, w: 5.5, h: 4.8, d: 1.8, material: 'sandstone', wallbangable: false, penetrationFactor: 0 },
    { id: 'd2_b_door_wood', x: 24.4, y: 0, z: -18, w: 1.2, h: 3.6, d: 0.45, material: 'wood', wallbangable: true, penetrationFactor: 0.55 },
  ],
  archLintels: [
    [-20, 4.0, -3, 3.2, 1.4, 10],
    [16, 4.0, 2, 2.8, 1.4, 16],
    [0, 4.2, -14, 6.2, 1.4, 2.4],
  ],
  waypoints: [
    { id: 'atk_spawn', x: 0, z: 43, callout: 'T Spawn', neighbors: ['atk_a_lobby', 'atk_mid_gate', 'atk_b_lobby'] },
    { id: 'def_spawn', x: -2, z: -41, callout: 'CT Spawn', neighbors: ['def_a_lobby', 'def_mid_entry', 'def_b_lobby'] },
    { id: 'atk_a_lobby', x: -25.5, z: 32, callout: 'Long Doors', neighbors: ['atk_spawn', 'a_main_s'] },
    { id: 'a_main_s', x: -26, z: 12, callout: 'Long A', neighbors: ['atk_a_lobby', 'a_site_s'] },
    { id: 'a_site_s', x: -29, z: -1, callout: 'A Ramp', neighbors: ['a_main_s', 'a_site'] },
    { id: 'a_site', x: -24, z: -8, callout: 'A Site', neighbors: ['a_site_s', 'a_site_n', 'catwalk'] },
    { id: 'a_site_n', x: -24, z: -22, callout: 'CT Ramp A', neighbors: ['a_site', 'def_a_lobby'] },
    { id: 'def_a_lobby', x: -28, z: -36, callout: 'A CT', neighbors: ['def_spawn', 'a_site_n'] },
    { id: 'atk_mid_gate', x: -8, z: 35, callout: 'Mid Ramp', neighbors: ['atk_spawn', 'atk_mid_entry'] },
    { id: 'atk_mid_entry', x: 0, z: 24, callout: 'Top Mid', neighbors: ['atk_mid_gate', 'mid_e', 'cat_s'] },
    { id: 'mid_e', x: 4, z: 4, callout: 'Mid Xbox Side', neighbors: ['atk_mid_entry', 'mid_center', 'b_conn'] },
    { id: 'cat_s', x: -10, z: 12, callout: 'Mid West', neighbors: ['atk_mid_entry', 'cat_step'] },
    { id: 'cat_step', x: -17.4, z: 6, callout: 'Short Approach', neighbors: ['cat_s', 'catwalk'] },
    { id: 'catwalk', x: -17.4, z: -4, callout: 'A Short', neighbors: ['cat_step', 'a_site'] },
    { id: 'mid_center', x: 0, z: -4, callout: 'Mid', neighbors: ['mid_e', 'def_mid_entry', 'b_conn'] },
    { id: 'def_mid_entry', x: 0, z: -24, callout: 'Mid Doors CT', neighbors: ['mid_center', 'def_spawn'] },
    { id: 'b_conn', x: 16, z: 4, callout: 'Mid to B', neighbors: ['mid_center', 'mid_e', 'b_site_s'] },
    { id: 'atk_b_lobby', x: 24, z: 38, callout: 'Upper Tunnels', neighbors: ['atk_spawn', 'b_tunnel_entry'] },
    { id: 'b_tunnel_entry', x: 22, z: 8, callout: 'B Tunnel Exit', neighbors: ['atk_b_lobby', 'b_site_s'] },
    { id: 'b_site_s', x: 27, z: 4, callout: 'B Site South', neighbors: ['b_tunnel_entry', 'b_site', 'b_conn'] },
    { id: 'b_site', x: 34, z: -5, callout: 'B Site', neighbors: ['b_site_s', 'b_site_n'] },
    { id: 'b_site_n', x: 30, z: -24, callout: 'B Window / Door', neighbors: ['b_site', 'def_b_lobby'] },
    { id: 'def_b_lobby', x: 24, z: -36, callout: 'CT B', neighbors: ['def_spawn', 'b_site_n'] },
  ],
};

// 3. MIRAJ (Mirage-inspired: A Ramp, Palace, Triple Box, Ticket, Mid Window, B Apps & Market)
const MIRAGE_MAP: MapDefinition = {
  id: 'mirage',
  name: 'Miraj',
  subtitle: 'Mirage-inspired · Palace, Mid Window & B Apartments',
  theme: {
    floorTint: 0xf4e8d8,
    outerFloorColor: 0xc9a37d,
    mesaColor: 0xb68863,
    fogColor: 0xe6d6c3,
    skyColor: 0xe2ecf6,
  },
  bounds: { ...DEFAULT_BOUNDS },
  siteZones: [
    { site: 'A', x: -30, z: -6, radius: 6.8 },
    { site: 'B', x: 30, z: -6, radius: 6.8 },
  ],
  buyZones: {
    attackers: { x: 0, z: 44, radius: 10 },
    defenders: { x: 0, z: -43, radius: 10 },
  },
  spawnPoints: {
    attackers: [
      { x: 0, y: 0, z: 44, yaw: 0 },
      { x: -4, y: 0, z: 44.5, yaw: 0 },
      { x: 4, y: 0, z: 44.5, yaw: 0 },
      { x: -7, y: 0, z: 46, yaw: 0 },
      { x: 7, y: 0, z: 46, yaw: 0 },
    ],
    defenders: [
      { x: 0, y: 0, z: -43, yaw: Math.PI },
      { x: -4, y: 0, z: -43.5, yaw: Math.PI },
      { x: 4, y: 0, z: -43.5, yaw: Math.PI },
      { x: -7, y: 0, z: -45, yaw: Math.PI },
      { x: 7, y: 0, z: -45, yaw: Math.PI },
    ],
  },
  boxes: [
    ...makePerimeterWalls('terracotta'),
    // Spawn screens (block direct spawn-to-spawn sniping) & Top Mid Boxes
    { id: 'm_t_screen', x: 0, y: 0, z: 34, w: 9.0, h: 4.5, d: 2.0, material: 'terracotta', wallbangable: false, penetrationFactor: 0 },
    { id: 'm_ct_screen', x: 0, y: 0, z: -34, w: 10.0, h: 4.5, d: 2.0, material: 'terracotta', wallbangable: false, penetrationFactor: 0 },
    { id: 'm_top_mid_box', x: 2, y: 0, z: 18, w: 3.4, h: 2.15, d: 2.2, material: 'wood', wallbangable: true, penetrationFactor: 0.52 },
    { id: 'm_mid_cart', x: -3.5, y: 0, z: 6, w: 2.4, h: 1.35, d: 2.4, material: 'wood', wallbangable: true, penetrationFactor: 0.55 },
    // Sniper's Nest (CT Window) elevated perch + steps
    { id: 'm_window_plat', x: 0, y: 0, z: -24, w: 9, h: 1.45, d: 4.5, material: 'terracotta', wallbangable: false, penetrationFactor: 0 },
    { id: 'm_window_step', x: 6, y: 0, z: -24, w: 3.0, h: 0.72, d: 3.5, material: 'concrete', wallbangable: false, penetrationFactor: 0 },
    { id: 'm_window_wall_w', x: -7.5, y: 0, z: -24, w: 6, h: 4.8, d: 2.4, material: 'terracotta', wallbangable: false, penetrationFactor: 0 },
    { id: 'm_window_wall_e', x: 7.5, y: 0, z: -24, w: 6, h: 4.8, d: 2.4, material: 'terracotta', wallbangable: false, penetrationFactor: 0 },
    // Mid Dividers (Connector & Catwalk)
    { id: 'm_div_w_s', x: -16, y: 0, z: 22, w: 2.4, h: 5.0, d: 22, material: 'terracotta', wallbangable: false, penetrationFactor: 0 },
    { id: 'm_div_w_n', x: -16, y: 0, z: -24, w: 2.4, h: 5.0, d: 20, material: 'terracotta', wallbangable: false, penetrationFactor: 0 },
    { id: 'm_div_e_s', x: 16, y: 0, z: 22, w: 2.4, h: 5.0, d: 22, material: 'terracotta', wallbangable: false, penetrationFactor: 0 },
    { id: 'm_div_e_n', x: 16, y: 0, z: -24, w: 2.4, h: 5.0, d: 20, material: 'terracotta', wallbangable: false, penetrationFactor: 0 },
    // A Site: Palace Balcony, Triple Box, Tetris, Ticket Booth
    { id: 'm_a_palace_wall', x: -38, y: 0, z: 12, w: 12, h: 4.8, d: 2.4, material: 'terracotta', wallbangable: false, penetrationFactor: 0 },
    { id: 'm_a_palace_balc', x: -41, y: 0, z: -4, w: 6, h: 1.5, d: 10, material: 'concrete', wallbangable: false, penetrationFactor: 0 },
    { id: 'm_a_palace_step', x: -41, y: 0, z: 2.5, w: 4, h: 0.75, d: 3.0, material: 'concrete', wallbangable: false, penetrationFactor: 0 },
    { id: 'm_a_triple_1', x: -29, y: 0, z: -6, w: 2.2, h: 1.5, d: 2.2, material: 'wood', wallbangable: true, penetrationFactor: 0.52 },
    { id: 'm_a_triple_2', x: -29, y: 1.5, z: -6, w: 1.8, h: 1.25, d: 1.8, material: 'wood', wallbangable: true, penetrationFactor: 0.52 },
    { id: 'm_a_tetris', x: -25, y: 0, z: 3, w: 2.4, h: 1.35, d: 2.4, material: 'sandstone', wallbangable: false, penetrationFactor: 0 },
    { id: 'm_a_ticket', x: -24, y: 0, z: -21, w: 3.8, h: 2.6, d: 3.4, material: 'metal_slate', wallbangable: false, penetrationFactor: 0 },
    // B Site: B Apps divider, Van, Pillar, Market wall
    { id: 'm_b_apps_wall', x: 34, y: 0, z: 14, w: 18, h: 4.8, d: 2.4, material: 'terracotta', wallbangable: false, penetrationFactor: 0 },
    { id: 'm_b_van', x: 39, y: 0, z: 2, w: 3.0, h: 1.65, d: 5.2, material: 'metal_olive', wallbangable: false, penetrationFactor: 0 },
    { id: 'm_b_site_box1', x: 30, y: 0, z: -6, w: 2.2, h: 1.45, d: 2.2, material: 'wood', wallbangable: true, penetrationFactor: 0.52 },
    { id: 'm_b_site_box2', x: 25, y: 0, z: -11, w: 2.0, h: 1.35, d: 2.0, material: 'wood', wallbangable: true, penetrationFactor: 0.55 },
    { id: 'm_b_market', x: 26, y: 0, z: -22, w: 10, h: 4.8, d: 2.2, material: 'terracotta', wallbangable: false, penetrationFactor: 0 },
  ],
  archLintels: [
    [-16, 4.0, -2, 2.6, 1.4, 24, 'terracotta'],
    [16, 4.0, -2, 2.6, 1.4, 24, 'terracotta'],
  ],
  waypoints: [
    { id: 'atk_spawn', x: 0, z: 42, callout: 'T Spawn', neighbors: ['atk_a_lobby', 'atk_mid_entry', 'atk_b_lobby'] },
    { id: 'def_spawn', x: 0, z: -41, callout: 'CT Spawn', neighbors: ['def_a_lobby', 'def_mid_gate', 'def_b_lobby'] },
    { id: 'atk_a_lobby', x: -28, z: 32, callout: 'A Ramp Lobby', neighbors: ['atk_spawn', 'a_main_s'] },
    { id: 'a_main_s', x: -30, z: 14, callout: 'A Ramp', neighbors: ['atk_a_lobby', 'a_site_s'] },
    { id: 'a_site_s', x: -30, z: 2, callout: 'Tetris / Ramp', neighbors: ['a_main_s', 'a_site', 'a_conn'] },
    { id: 'a_site', x: -33, z: -6, callout: 'A Site', neighbors: ['a_site_s', 'a_site_n'] },
    { id: 'a_site_n', x: -30, z: -20, callout: 'CT Ticket', neighbors: ['a_site', 'def_a_lobby', 'a_conn'] },
    { id: 'def_a_lobby', x: -24, z: -36, callout: 'CT A', neighbors: ['def_spawn', 'a_site_n'] },
    { id: 'atk_mid_entry', x: -11, z: 26, callout: 'Top Mid', neighbors: ['atk_spawn', 'mid_w'] },
    { id: 'mid_w', x: -8, z: 8, callout: 'Mid Boxes', neighbors: ['atk_mid_entry', 'mid_center', 'a_conn'] },
    { id: 'mid_center', x: 0, z: 0, callout: 'Mid', neighbors: ['mid_w', 'a_conn', 'b_short'] },
    { id: 'a_conn', x: -16, z: -4, callout: 'A Connector', neighbors: ['mid_center', 'mid_w', 'a_site_s', 'a_site_n', 'def_mid_entry'] },
    { id: 'b_short', x: 16, z: -4, callout: 'B Short', neighbors: ['mid_center', 'b_site_s'] },
    { id: 'def_mid_entry', x: -12.5, z: -24, callout: 'Jungle / Window', neighbors: ['a_conn', 'def_mid_gate'] },
    { id: 'def_mid_gate', x: -12.5, z: -36, callout: 'CT Window Exit', neighbors: ['def_spawn', 'def_mid_entry', 'def_a_lobby'] },
    { id: 'atk_b_lobby', x: 26, z: 30, callout: 'B Apartments Entry', neighbors: ['atk_spawn', 'b_apps'] },
    { id: 'b_apps', x: 23, z: 10, callout: 'B Apartments', neighbors: ['atk_b_lobby', 'b_site_s'] },
    { id: 'b_site_s', x: 28, z: 2, callout: 'B Van', neighbors: ['b_apps', 'b_site', 'b_short'] },
    { id: 'b_site', x: 34, z: -6, callout: 'B Site', neighbors: ['b_site_s', 'b_site_n'] },
    { id: 'b_site_n', x: 35, z: -24, callout: 'Market Door', neighbors: ['b_site', 'def_b_lobby'] },
    { id: 'def_b_lobby', x: 24, z: -36, callout: 'Market CT', neighbors: ['def_spawn', 'b_site_n'] },
  ],
};

// 4. INFERNA (Inferno-inspired: Banana/Car/B Fountain, Mid/Arch/Boiler/Balcony A Site)
const INFERNO_MAP: MapDefinition = {
  id: 'inferno',
  name: 'Inferna',
  subtitle: 'Inferno-inspired · Banana, Arch & A Balcony Courtyard',
  theme: {
    floorTint: 0xeee4d6,
    outerFloorColor: 0xb68e6c,
    mesaColor: 0x9c6e54,
    fogColor: 0xe2d5c4,
    skyColor: 0xdde8f2,
  },
  bounds: { ...DEFAULT_BOUNDS },
  siteZones: [
    { site: 'A', x: -28, z: -6, radius: 6.5 },
    { site: 'B', x: 28, z: -8, radius: 6.5 },
  ],
  buyZones: {
    attackers: { x: 0, z: 44, radius: 10 },
    defenders: { x: 0, z: -43, radius: 10 },
  },
  spawnPoints: {
    attackers: [
      { x: 0, y: 0, z: 44, yaw: 0 },
      { x: -3.5, y: 0, z: 44.5, yaw: 0 },
      { x: 3.5, y: 0, z: 44.5, yaw: 0 },
      { x: -6.5, y: 0, z: 46, yaw: 0 },
      { x: 6.5, y: 0, z: 46, yaw: 0 },
    ],
    defenders: [
      { x: 0, y: 0, z: -43, yaw: Math.PI },
      { x: -3.5, y: 0, z: -43.5, yaw: Math.PI },
      { x: 3.5, y: 0, z: -43.5, yaw: Math.PI },
      { x: -6.5, y: 0, z: -45, yaw: Math.PI },
      { x: 6.5, y: 0, z: -45, yaw: Math.PI },
    ],
  },
  boxes: [
    ...makePerimeterWalls('terracotta'),
    // Spawn bridge & Mid Arch divider
    { id: 'inf_t_wall', x: 0, y: 0, z: 33, w: 12, h: 4.5, d: 2.0, material: 'terracotta', wallbangable: false, penetrationFactor: 0 },
    { id: 'inf_ct_wall', x: 0, y: 0, z: -32, w: 12, h: 4.5, d: 2.0, material: 'terracotta', wallbangable: false, penetrationFactor: 0 },
    // Banana Corridor Walls (East lane leading to B)
    { id: 'inf_banana_w', x: 18, y: 0, z: 18, w: 2.6, h: 5.0, d: 32, material: 'terracotta', wallbangable: false, penetrationFactor: 0 },
    { id: 'inf_banana_e', x: 38, y: 0, z: 18, w: 2.6, h: 5.0, d: 22, material: 'terracotta', wallbangable: false, penetrationFactor: 0 },
    { id: 'inf_banana_car', x: 25, y: 0, z: 12, w: 3.0, h: 1.45, d: 4.2, material: 'metal_ochre', wallbangable: false, penetrationFactor: 0 },
    { id: 'inf_banana_halfwall', x: 31, y: 0, z: 4, w: 4.5, h: 1.35, d: 1.6, material: 'concrete', wallbangable: false, penetrationFactor: 0 },
    // B Site Fountain & First/Second Oranges + Coffins
    { id: 'inf_b_fountain', x: 28, y: 0, z: -8, w: 3.2, h: 1.15, d: 3.2, material: 'concrete', wallbangable: false, penetrationFactor: 0 },
    { id: 'inf_b_oranges', x: 35, y: 0, z: -10, w: 2.0, h: 1.5, d: 2.4, material: 'wood', wallbangable: true, penetrationFactor: 0.52 },
    { id: 'inf_b_coffins', x: 22, y: 0, z: -22, w: 2.6, h: 1.45, d: 2.4, material: 'wood', wallbangable: true, penetrationFactor: 0.52 },
    { id: 'inf_b_arch_n', x: 16, y: 0, z: -18, w: 2.6, h: 4.8, d: 18, material: 'terracotta', wallbangable: false, penetrationFactor: 0 },
    // Mid / Second Mid / Arch / Boiler -> A Site
    { id: 'inf_mid_boiler_w', x: -15, y: 0, z: 16, w: 2.6, h: 5.0, d: 26, material: 'terracotta', wallbangable: false, penetrationFactor: 0 },
    { id: 'inf_mid_arch_w', x: -15, y: 0, z: -18, w: 2.6, h: 5.0, d: 20, material: 'terracotta', wallbangable: false, penetrationFactor: 0 },
    { id: 'inf_mid_hay', x: -3, y: 0, z: 10, w: 2.2, h: 1.4, d: 2.2, material: 'wood', wallbangable: true, penetrationFactor: 0.55 },
    { id: 'inf_mid_arch_pillar', x: -3, y: 0, z: -12, w: 3.0, h: 4.6, d: 2.6, material: 'terracotta', wallbangable: false, penetrationFactor: 0 },
    // A Site: Truck, Pit/Library, Balcony
    { id: 'inf_a_truck', x: -27, y: 0, z: -5, w: 2.8, h: 1.7, d: 5.2, material: 'metal_olive', wallbangable: false, penetrationFactor: 0 },
    { id: 'inf_a_crate', x: -34, y: 0, z: -11, w: 2.0, h: 1.35, d: 2.0, material: 'wood', wallbangable: true, penetrationFactor: 0.55 },
    { id: 'inf_a_balc', x: -40, y: 0, z: 0, w: 5.0, h: 1.45, d: 9.0, material: 'concrete', wallbangable: false, penetrationFactor: 0 },
    { id: 'inf_a_balc_step', x: -40, y: 0, z: 5.8, w: 3.6, h: 0.72, d: 2.5, material: 'concrete', wallbangable: false, penetrationFactor: 0 },
    { id: 'inf_a_apps_wall', x: -31, y: 0, z: 18, w: 12, h: 4.8, d: 2.4, material: 'terracotta', wallbangable: false, penetrationFactor: 0 },
  ],
  archLintels: [
    [-15, 4.0, -3, 2.8, 1.4, 12, 'terracotta'],
    [16, 4.0, -3, 2.8, 1.4, 12, 'terracotta'],
    [-9, 4.0, -12, 9.0, 1.4, 2.6, 'terracotta'],
  ],
  waypoints: [
    { id: 'atk_spawn', x: 0, z: 42, callout: 'T Spawn', neighbors: ['atk_a_lobby', 'atk_mid_gate', 'atk_b_lobby'] },
    { id: 'def_spawn', x: 0, z: -41, callout: 'CT Spawn', neighbors: ['def_a_lobby', 'def_b_lobby'] },
    { id: 'atk_a_lobby', x: -24, z: 32, callout: 'Second Mid', neighbors: ['atk_spawn', 'a_apps_door', 'atk_mid_gate'] },
    { id: 'a_apps_door', x: -21, z: 20, callout: 'Apps Entry', neighbors: ['atk_a_lobby', 'a_main_s'] },
    { id: 'a_main_s', x: -21, z: 12, callout: 'Apartments / Boiler', neighbors: ['a_apps_door', 'a_site_s'] },
    { id: 'a_site_s', x: -32, z: 2, callout: 'A Lane', neighbors: ['a_main_s', 'a_site', 'a_arch'] },
    { id: 'a_arch', x: -15, z: -3, callout: 'Boiler Arch', neighbors: ['a_site_s', 'mid_center'] },
    { id: 'a_site', x: -32, z: -6, callout: 'A Site', neighbors: ['a_site_s', 'a_site_n'] },
    { id: 'a_site_n', x: -28, z: -20, callout: 'Library / Arch', neighbors: ['a_site', 'def_a_lobby'] },
    { id: 'def_a_lobby', x: -24, z: -36, callout: 'Arch CT', neighbors: ['def_spawn', 'a_site_n', 'def_mid_entry'] },
    { id: 'atk_mid_gate', x: -9, z: 33, callout: 'Mid West Gate', neighbors: ['atk_spawn', 'atk_a_lobby', 'atk_mid_entry'] },
    { id: 'atk_mid_entry', x: -9, z: 24, callout: 'T Ramp Mid', neighbors: ['atk_mid_gate', 'mid_s'] },
    { id: 'mid_s', x: 2, z: 12, callout: 'Mid Haystack', neighbors: ['atk_mid_entry', 'mid_center'] },
    { id: 'mid_center', x: 2, z: -2, callout: 'Mid', neighbors: ['mid_s', 'a_arch', 'b_site_s', 'def_mid_entry'] },
    { id: 'def_mid_entry', x: 6, z: -20, callout: 'Arch / Speed', neighbors: ['mid_center', 'def_a_lobby', 'def_b_lobby'] },
    { id: 'atk_b_lobby', x: 28, z: 32, callout: 'Bottom Banana', neighbors: ['atk_spawn', 'banana_mid'] },
    { id: 'banana_mid', x: 29, z: 12, callout: 'Banana Car', neighbors: ['atk_b_lobby', 'b_site_s'] },
    { id: 'b_site_s', x: 26, z: -1, callout: 'Top Banana', neighbors: ['banana_mid', 'b_site', 'mid_center'] },
    { id: 'b_site', x: 33, z: -8, callout: 'B Site', neighbors: ['b_site_s', 'b_site_n'] },
    { id: 'b_site_n', x: 27, z: -24, callout: 'CT Coffins', neighbors: ['b_site', 'def_b_lobby'] },
    { id: 'def_b_lobby', x: 24, z: -36, callout: 'CT B', neighbors: ['def_spawn', 'b_site_n', 'def_mid_entry'] },
  ],
};

// 5. OVERPASS (Overpass-inspired: Park/Bathrooms/Bank A Site, Connector/Water/Monster B Site)
const OVERPASS_MAP: MapDefinition = {
  id: 'overpass',
  name: 'Overpass',
  subtitle: 'Overpass-inspired · Bathrooms, Monster Tunnel & Heaven',
  theme: {
    floorTint: 0xe6ecf0,
    outerFloorColor: 0x9aa3ab,
    mesaColor: 0x79848f,
    fogColor: 0xd6dfe6,
    skyColor: 0xdce8f4,
  },
  bounds: { ...DEFAULT_BOUNDS },
  siteZones: [
    { site: 'A', x: -28, z: -10, radius: 6.8 },
    { site: 'B', x: 28, z: -4, radius: 6.8 },
  ],
  buyZones: {
    attackers: { x: 0, z: 44, radius: 10 },
    defenders: { x: 0, z: -43, radius: 10 },
  },
  spawnPoints: {
    attackers: [
      { x: 0, y: 0, z: 44, yaw: 0 },
      { x: -3.5, y: 0, z: 44.5, yaw: 0 },
      { x: 3.5, y: 0, z: 44.5, yaw: 0 },
      { x: -6.5, y: 0, z: 46, yaw: 0 },
      { x: 6.5, y: 0, z: 46, yaw: 0 },
    ],
    defenders: [
      { x: 0, y: 0, z: -43, yaw: Math.PI },
      { x: -3.5, y: 0, z: -43.5, yaw: Math.PI },
      { x: 3.5, y: 0, z: -43.5, yaw: Math.PI },
      { x: -6.5, y: 0, z: -45, yaw: Math.PI },
      { x: 6.5, y: 0, z: -45, yaw: Math.PI },
    ],
  },
  boxes: [
    ...makePerimeterWalls('concrete'),
    // Fountain & Park center divider
    { id: 'ov_fountain', x: -8, y: 0, z: 24, w: 5.5, h: 1.25, d: 5.5, material: 'concrete', wallbangable: false, penetrationFactor: 0 },
    { id: 'ov_ct_screen', x: 0, y: 0, z: -33, w: 11, h: 4.5, d: 2.0, material: 'concrete', wallbangable: false, penetrationFactor: 0 },
    // Bathrooms & Long A
    { id: 'ov_bath_w', x: -31, y: 0, z: 12, w: 2.4, h: 4.8, d: 20, material: 'concrete', wallbangable: false, penetrationFactor: 0 },
    { id: 'ov_bath_e', x: -14, y: 0, z: 14, w: 2.6, h: 5.0, d: 24, material: 'concrete', wallbangable: false, penetrationFactor: 0 },
    { id: 'ov_bath_n', x: -14, y: 0, z: -20, w: 2.6, h: 5.0, d: 22, material: 'concrete', wallbangable: false, penetrationFactor: 0 },
    // A Site: Truck, Dice, Bank
    { id: 'ov_a_truck', x: -28, y: 0, z: -10, w: 3.0, h: 1.7, d: 5.2, material: 'metal_slate', wallbangable: false, penetrationFactor: 0 },
    { id: 'ov_a_dice', x: -35, y: 0, z: -6, w: 2.0, h: 1.4, d: 2.0, material: 'wood', wallbangable: true, penetrationFactor: 0.55 },
    { id: 'ov_a_bank', x: -25, y: 0, z: -25, w: 7.5, h: 4.2, d: 3.2, material: 'concrete', wallbangable: false, penetrationFactor: 0 },
    // Connector / Canal / Short B
    { id: 'ov_conn_wall', x: 0, y: 0, z: 2, w: 3.2, h: 4.6, d: 14, material: 'concrete', wallbangable: false, penetrationFactor: 0 },
    { id: 'ov_water_box', x: 8, y: 0, z: 10, w: 2.2, h: 1.35, d: 2.2, material: 'wood', wallbangable: true, penetrationFactor: 0.55 },
    { id: 'ov_e_div_s', x: 16, y: 0, z: 24, w: 2.6, h: 5.0, d: 20, material: 'concrete', wallbangable: false, penetrationFactor: 0 },
    { id: 'ov_e_div_n', x: 16, y: 0, z: -20, w: 2.6, h: 5.0, d: 20, material: 'concrete', wallbangable: false, penetrationFactor: 0 },
    // Monster Tunnel & B Site Pillar + Heaven
    { id: 'ov_monster_wall', x: 34, y: 0, z: 14, w: 18, h: 5.0, d: 2.6, material: 'concrete', wallbangable: false, penetrationFactor: 0 },
    { id: 'ov_b_pillar', x: 28, y: 0, z: -4, w: 3.2, h: 4.8, d: 3.2, material: 'concrete', wallbangable: false, penetrationFactor: 0 },
    { id: 'ov_b_barrels', x: 35, y: 0, z: -10, w: 2.2, h: 1.4, d: 2.2, material: 'metal_olive', wallbangable: false, penetrationFactor: 0 },
    { id: 'ov_b_crate', x: 24, y: 0, z: 2, w: 2.0, h: 1.35, d: 2.0, material: 'wood', wallbangable: true, penetrationFactor: 0.55 },
    { id: 'ov_b_heaven', x: 36, y: 0, z: -22, w: 10, h: 1.5, d: 5.0, material: 'metal_slate', wallbangable: false, penetrationFactor: 0 },
    { id: 'ov_b_heaven_step', x: 29, y: 0, z: -22, w: 3.2, h: 0.75, d: 3.6, material: 'concrete', wallbangable: false, penetrationFactor: 0 },
  ],
  archLintels: [
    [-14, 4.0, -3, 2.8, 1.4, 12, 'concrete'],
    [16, 4.0, 2, 2.8, 1.4, 24, 'concrete'],
  ],
  waypoints: [
    { id: 'atk_spawn', x: 0, z: 42, callout: 'T Spawn', neighbors: ['atk_a_lobby', 'atk_bath_south', 'atk_b_lobby'] },
    { id: 'def_spawn', x: 0, z: -41, callout: 'CT Spawn', neighbors: ['def_a_lobby', 'def_b_lobby'] },
    { id: 'atk_a_lobby', x: -24, z: 32, callout: 'Fountain / Park', neighbors: ['atk_spawn', 'a_long_entry', 'atk_bath_south'] },
    { id: 'a_long_entry', x: -38, z: 28, callout: 'Long Park', neighbors: ['atk_a_lobby', 'a_main_s'] },
    { id: 'a_main_s', x: -39, z: 12, callout: 'Long A', neighbors: ['a_long_entry', 'a_site_s'] },
    { id: 'a_site_s', x: -34, z: -2, callout: 'A Toilets / Long', neighbors: ['a_main_s', 'a_site', 'mid_center'] },
    { id: 'a_site', x: -31.5, z: -11, callout: 'A Site', neighbors: ['a_site_s', 'a_site_n'] },
    { id: 'a_site_n', x: -34, z: -24, callout: 'Bank / Dumpster', neighbors: ['a_site', 'def_a_lobby'] },
    { id: 'def_a_lobby', x: -22, z: -36, callout: 'A Stairs CT', neighbors: ['def_spawn', 'a_site_n'] },
    { id: 'atk_bath_south', x: -3, z: 28, callout: 'Park East', neighbors: ['atk_spawn', 'atk_a_lobby', 'atk_mid_entry'] },
    { id: 'atk_mid_entry', x: -6, z: 16, callout: 'Playground / Toilets', neighbors: ['atk_bath_south', 'mid_center'] },
    { id: 'mid_center', x: -6, z: -7, callout: 'Connector', neighbors: ['atk_mid_entry', 'a_site_s', 'b_water', 'def_mid_entry'] },
    { id: 'b_water', x: 10, z: -7, callout: 'Canal / Water', neighbors: ['mid_center', 'b_site_s', 'def_mid_entry'] },
    { id: 'def_mid_entry', x: 8, z: -22, callout: 'Bridge / CT Connector', neighbors: ['mid_center', 'b_water', 'def_conn_n'] },
    { id: 'def_conn_n', x: 10, z: -34, callout: 'CT Tunnel', neighbors: ['def_mid_entry', 'def_b_lobby'] },
    { id: 'atk_b_lobby', x: 26, z: 30, callout: 'Canal T', neighbors: ['atk_spawn', 'b_monster'] },
    { id: 'b_monster', x: 22, z: 10, callout: 'Monster Exit', neighbors: ['atk_b_lobby', 'b_site_s'] },
    { id: 'b_site_s', x: 28, z: 2, callout: 'B Short / Monster', neighbors: ['b_monster', 'b_site', 'b_water'] },
    { id: 'b_site', x: 23, z: -4, callout: 'B Site', neighbors: ['b_site_s', 'b_site_n'] },
    { id: 'b_site_n', x: 24, z: -22, callout: 'Heaven / CT B', neighbors: ['b_site', 'def_b_lobby'] },
    { id: 'def_b_lobby', x: 24, z: -36, callout: 'CT Construction', neighbors: ['def_spawn', 'b_site_n', 'def_conn_n'] },
  ],
};

function buildRampStepColliders(ramps: MapRamp[]): MapBox[] {
  const out: MapBox[] = [];
  for (const r of ramps) {
    const steps = Math.max(4, Math.min(14, Math.ceil(r.h / 0.25)));
    for (let s = 0; s < steps; s++) {
      const frac = (s + 1) / steps;
      const sliceH = r.h * frac;
      let sx = r.x;
      let sz = r.z;
      let sw = r.w;
      let sd = r.d;
      if (r.direction === 'n' || r.direction === 's') {
        const segD = r.d / steps;
        const offsetIdx = r.direction === 'n' ? steps - 1 - s : s;
        sz = r.z - r.d * 0.5 + segD * (offsetIdx + 0.5);
        sd = segD + 0.04;
      } else {
        const segW = r.w / steps;
        const offsetIdx = r.direction === 'w' ? steps - 1 - s : s;
        sx = r.x - r.w * 0.5 + segW * (offsetIdx + 0.5);
        sw = segW + 0.04;
      }
      out.push({
        id: `${r.id}_step_${s}`,
        x: sx,
        y: r.y,
        z: sz,
        w: sw,
        h: sliceH,
        d: sd,
        material: r.material,
        wallbangable: false,
        penetrationFactor: 0,
        hiddenVisual: true,
      });
    }
  }
  return out;
}

const AWP_RAMPS: MapRamp[] = [
  { id: 'awp_ramp_atk_w', x: -8.5, y: 0, z: 22, w: 5.0, h: 1.65, d: 4.6, direction: 'e', material: 'concrete' },
  { id: 'awp_ramp_atk_e', x: 8.5, y: 0, z: 22, w: 5.0, h: 1.65, d: 4.6, direction: 'w', material: 'concrete' },
  { id: 'awp_ramp_def_w', x: -8.5, y: 0, z: -22, w: 5.0, h: 1.65, d: 4.6, direction: 'e', material: 'concrete' },
  { id: 'awp_ramp_def_e', x: 8.5, y: 0, z: -22, w: 5.0, h: 1.65, d: 4.6, direction: 'w', material: 'concrete' },
];

// 6. SNIPER PEAKS (Dedicated Symmetrical AWP-Only Arena)
const AWP_ARENA_MAP: MapDefinition = {
  id: 'awp_arena',
  name: 'Sniper Peaks',
  subtitle: 'Symmetrical AWP arena · Elevated sniper towers & long sightlines',
  theme: {
    floorTint: 0xe9eef2,
    outerFloorColor: 0x909aa3,
    mesaColor: 0x6f7b87,
    fogColor: 0xd9e3ec,
    skyColor: 0xcbe0f5,
  },
  bounds: { ...DEFAULT_BOUNDS },
  siteZones: [
    { site: 'A', x: -24, z: 0, radius: 6.5 },
    { site: 'B', x: 24, z: 0, radius: 6.5 },
  ],
  buyZones: {
    attackers: { x: 0, z: 44, radius: 11 },
    defenders: { x: 0, z: -44, radius: 11 },
  },
  spawnPoints: {
    attackers: [
      { x: 0, y: 0, z: 45, yaw: 0 },
      { x: -6, y: 0, z: 45.5, yaw: 0 },
      { x: 6, y: 0, z: 45.5, yaw: 0 },
      { x: -12, y: 0, z: 46, yaw: 0 },
      { x: 12, y: 0, z: 46, yaw: 0 },
    ],
    defenders: [
      { x: 0, y: 0, z: -45, yaw: Math.PI },
      { x: -6, y: 0, z: -45.5, yaw: Math.PI },
      { x: 6, y: 0, z: -45.5, yaw: Math.PI },
      { x: -12, y: 0, z: -46, yaw: Math.PI },
      { x: 12, y: 0, z: -46, yaw: Math.PI },
    ],
  },
  ffaSpawns: [
    { x: 0, y: 0, z: 42, yaw: 0 },
    { x: 0, y: 0, z: -42, yaw: Math.PI },
    { x: -34, y: 0, z: 24, yaw: -0.5 },
    { x: 34, y: 0, z: 24, yaw: 0.5 },
    { x: -34, y: 0, z: -24, yaw: -2.6 },
    { x: 34, y: 0, z: -24, yaw: 2.6 },
    { x: -30, y: 0, z: 0, yaw: -Math.PI / 2 },
    { x: 30, y: 0, z: 0, yaw: Math.PI / 2 },
  ],
  ramps: AWP_RAMPS,
  boxes: [
    ...makePerimeterWalls('concrete'),
    ...buildRampStepColliders(AWP_RAMPS),
    // Spawn protection screens (prevents instant frame-0 headshots; peek left/right immediately)
    { id: 'awp_screen_atk', x: 0, y: 0, z: 36, w: 12, h: 3.6, d: 1.8, material: 'concrete', wallbangable: false, penetrationFactor: 0 },
    { id: 'awp_screen_def', x: 0, y: 0, z: -36, w: 12, h: 3.6, d: 1.8, material: 'concrete', wallbangable: false, penetrationFactor: 0 },
    // Elevated sniper towers (N & S)
    { id: 'awp_tower_atk', x: 0, y: 0, z: 22, w: 12, h: 1.65, d: 5.0, material: 'concrete', wallbangable: false, penetrationFactor: 0 },
    { id: 'awp_tower_atk_lip', x: 0, y: 1.65, z: 19.8, w: 4.5, h: 0.65, d: 0.6, material: 'metal_slate', wallbangable: false, penetrationFactor: 0 },
    { id: 'awp_tower_def', x: 0, y: 0, z: -22, w: 12, h: 1.65, d: 5.0, material: 'concrete', wallbangable: false, penetrationFactor: 0 },
    { id: 'awp_tower_def_lip', x: 0, y: 1.65, z: -19.8, w: 4.5, h: 0.65, d: 0.6, material: 'metal_slate', wallbangable: false, penetrationFactor: 0 },
    // Mid sniper pillars & wood peek crates
    { id: 'awp_mid_pillar_w', x: -11, y: 0, z: 0, w: 2.8, h: 4.6, d: 2.8, material: 'sandstone', wallbangable: false, penetrationFactor: 0 },
    { id: 'awp_mid_pillar_e', x: 11, y: 0, z: 0, w: 2.8, h: 4.6, d: 2.8, material: 'sandstone', wallbangable: false, penetrationFactor: 0 },
    { id: 'awp_mid_box_c', x: 0, y: 0, z: 0, w: 2.2, h: 1.4, d: 2.2, material: 'wood', wallbangable: true, penetrationFactor: 0.6 },
    // Flank sniper covers (West & East catwalks/bunkers)
    { id: 'awp_flank_w_s', x: -29, y: 0, z: 14, w: 3.4, h: 2.6, d: 2.4, material: 'metal_slate', wallbangable: false, penetrationFactor: 0 },
    { id: 'awp_flank_w_n', x: -29, y: 0, z: -14, w: 3.4, h: 2.6, d: 2.4, material: 'metal_slate', wallbangable: false, penetrationFactor: 0 },
    { id: 'awp_flank_e_s', x: 29, y: 0, z: 14, w: 3.4, h: 2.6, d: 2.4, material: 'metal_slate', wallbangable: false, penetrationFactor: 0 },
    { id: 'awp_flank_e_n', x: 29, y: 0, z: -14, w: 3.4, h: 2.6, d: 2.4, material: 'metal_slate', wallbangable: false, penetrationFactor: 0 },
    { id: 'awp_wallbang_w', x: -22, y: 0, z: 0, w: 1.8, h: 2.4, d: 3.2, material: 'wood', wallbangable: true, penetrationFactor: 0.58 },
    { id: 'awp_wallbang_e', x: 22, y: 0, z: 0, w: 1.8, h: 2.4, d: 3.2, material: 'wood', wallbangable: true, penetrationFactor: 0.58 },
  ],
  archLintels: [],
  waypoints: [
    { id: 'atk_spawn', x: 0, z: 42, callout: 'Attacker Base', neighbors: ['atk_w_exit', 'atk_e_exit'] },
    { id: 'def_spawn', x: 0, z: -42, callout: 'Defender Base', neighbors: ['def_w_exit', 'def_e_exit'] },
    { id: 'atk_w_exit', x: -16, z: 30, callout: 'West Peek S', neighbors: ['atk_spawn', 'a_site', 'mid_s'] },
    { id: 'atk_e_exit', x: 16, z: 30, callout: 'East Peek S', neighbors: ['atk_spawn', 'b_site', 'mid_s'] },
    { id: 'def_w_exit', x: -16, z: -30, callout: 'West Peek N', neighbors: ['def_spawn', 'a_site', 'mid_n'] },
    { id: 'def_e_exit', x: 16, z: -30, callout: 'East Peek N', neighbors: ['def_spawn', 'b_site', 'mid_n'] },
    { id: 'mid_s', x: -5, z: 12, callout: 'Mid South', neighbors: ['atk_w_exit', 'atk_e_exit', 'mid_center'] },
    { id: 'mid_center', x: -5, z: 0, callout: 'Center Gap', neighbors: ['mid_s', 'mid_n', 'a_site', 'b_site'] },
    { id: 'mid_n', x: -5, z: -12, callout: 'Mid North', neighbors: ['def_w_exit', 'def_e_exit', 'mid_center'] },
    { id: 'a_site', x: -17, z: 0, callout: 'West Wing', neighbors: ['atk_w_exit', 'def_w_exit', 'mid_center'] },
    { id: 'b_site', x: 17, z: 0, callout: 'East Wing', neighbors: ['atk_e_exit', 'def_e_exit', 'mid_center'] },
  ],
};

let customMapOverride: MapDefinition | null = null;

export const MAPS: Record<MapId, MapDefinition> = {
  sandline: SANDLINE_MAP,
  dust2: DUST2_MAP,
  mirage: MIRAGE_MAP,
  inferno: INFERNO_MAP,
  overpass: OVERPASS_MAP,
  awp_arena: AWP_ARENA_MAP,
  custom: SANDLINE_MAP,
};

export const MAP_LIST: Array<{ id: MapId; name: string; subtitle: string }> = [
  { id: 'sandline', name: SANDLINE_MAP.name, subtitle: SANDLINE_MAP.subtitle },
  { id: 'dust2', name: DUST2_MAP.name, subtitle: DUST2_MAP.subtitle },
  { id: 'mirage', name: MIRAGE_MAP.name, subtitle: MIRAGE_MAP.subtitle },
  { id: 'inferno', name: INFERNO_MAP.name, subtitle: INFERNO_MAP.subtitle },
  { id: 'overpass', name: OVERPASS_MAP.name, subtitle: OVERPASS_MAP.subtitle },
];

export function registerCustomMap(def: MapDefinition): void {
  customMapOverride = def;
  MAPS.custom = def;
}

export function clearCustomMap(): void {
  customMapOverride = null;
  MAPS.custom = SANDLINE_MAP;
}

export function getCustomMapDefinition(): MapDefinition | null {
  return customMapOverride;
}

// Active map mutable bindings (updated atomically via setActiveMap)
export let ACTIVE_MAP: MapDefinition = SANDLINE_MAP;
export let MAP_BOUNDS = ACTIVE_MAP.bounds;
export let SITE_ZONES = ACTIVE_MAP.siteZones;
export let BUY_ZONES = ACTIVE_MAP.buyZones;
export let SPAWN_POINTS = ACTIVE_MAP.spawnPoints;
export let FFA_SPAWNS: SpawnAnchor[] = [];
export let MAP_BOXES = ACTIVE_MAP.boxes;
export let WAYPOINTS = ACTIVE_MAP.waypoints;
export let WAYPOINT_MAP = new Map<string, WaypointNode>(
  WAYPOINTS.map((w) => [w.id, w])
);

function buildDefaultFfaSpawns(def: MapDefinition): SpawnAnchor[] {
  if (def.ffaSpawns && def.ffaSpawns.length > 0) return def.ffaSpawns;
  const list: SpawnAnchor[] = [
    ...def.spawnPoints.attackers.slice(0, 3),
    ...def.spawnPoints.defenders.slice(0, 3),
  ];
  for (const sz of def.siteZones) {
    list.push({ x: sz.x, y: 0, z: sz.z, yaw: sz.x < 0 ? -Math.PI / 2 : Math.PI / 2 });
  }
  return list;
}

export function setActiveMap(mapId: MapId): MapDefinition {
  const next = mapId === 'custom' && customMapOverride ? customMapOverride : (MAPS[mapId] ?? SANDLINE_MAP);
  ACTIVE_MAP = next;
  MAP_BOUNDS = next.bounds;
  SITE_ZONES = next.siteZones;
  BUY_ZONES = next.buyZones;
  SPAWN_POINTS = next.spawnPoints;
  FFA_SPAWNS = buildDefaultFfaSpawns(next);
  MAP_BOXES = next.boxes;
  WAYPOINTS = next.waypoints;
  WAYPOINT_MAP = new Map<string, WaypointNode>(WAYPOINTS.map((w) => [w.id, w]));
  return next;
}

export function getSpawnAnchor(team: Team, slotIndex: number): SpawnAnchor {
  const list = SPAWN_POINTS[team];
  return list[slotIndex % list.length];
}

export function isInBuyZone(team: Team, x: number, z: number): boolean {
  const zone = BUY_ZONES[team];
  const dx = x - zone.x;
  const dz = z - zone.z;
  return dx * dx + dz * dz <= zone.radius * zone.radius;
}

export function getPlantSiteAt(x: number, z: number): 'A' | 'B' | null {
  for (const s of SITE_ZONES) {
    const dx = x - s.x;
    const dz = z - s.z;
    if (dx * dx + dz * dz <= s.radius * s.radius) {
      return s.site;
    }
  }
  return null;
}

export interface AabbCollisionResult {
  x: number;
  y: number;
  z: number;
  grounded: boolean;
  groundY: number;
}

export function resolvePlayerMovement(
  x: number,
  y: number,
  z: number,
  vy: number,
  radius: number,
  height: number,
  boxes: MapBox[] = MAP_BOXES
): AabbCollisionResult {
  let nx = Math.max(MAP_BOUNDS.minX + radius + 1, Math.min(MAP_BOUNDS.maxX - radius - 1, x));
  let nz = Math.max(MAP_BOUNDS.minZ + radius + 1, Math.min(MAP_BOUNDS.maxZ - radius - 1, z));
  let ny = y;
  let groundY = 0;
  let grounded = false;

  const stepHeight = 0.85;

  for (const b of boxes) {
    const minX = b.x - b.w * 0.5 - radius;
    const maxX = b.x + b.w * 0.5 + radius;
    const minZ = b.z - b.d * 0.5 - radius;
    const maxZ = b.z + b.d * 0.5 + radius;
    const topY = b.y + b.h;
    const botY = b.y;

    if (nx > minX && nx < maxX && nz > minZ && nz < maxZ) {
      if (ny + height > botY && ny < topY) {
        if (ny >= topY - stepHeight && vy <= 0.5) {
          if (topY > groundY) {
            groundY = topY;
          }
          continue;
        }
        const penLeft = nx - minX;
        const penRight = maxX - nx;
        const penBack = nz - minZ;
        const penFront = maxZ - nz;
        const minPen = Math.min(penLeft, penRight, penBack, penFront);
        if (minPen === penLeft) nx = minX;
        else if (minPen === penRight) nx = maxX;
        else if (minPen === penBack) nz = minZ;
        else nz = maxZ;
      }
    }
  }

  if (ny <= groundY + 0.001 && vy <= 0) {
    ny = groundY;
    grounded = true;
  }

  return { x: nx, y: ny, z: nz, grounded, groundY };
}

export interface RayBoxHit {
  box: MapBox;
  distance: number;
  hx: number;
  hy: number;
  hz: number;
  nx: number;
  ny: number;
  nz: number;
}

export function raycastMapBoxes(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  maxDist: number,
  boxes: MapBox[] = MAP_BOXES
): RayBoxHit | null {
  let best: RayBoxHit | null = null;
  let bestT = maxDist;

  for (const b of boxes) {
    const minX = b.x - b.w * 0.5;
    const maxX = b.x + b.w * 0.5;
    const minY = b.y;
    const maxY = b.y + b.h;
    const minZ = b.z - b.d * 0.5;
    const maxZ = b.z + b.d * 0.5;

    let tmin = 0;
    let tmax = bestT;
    let hitNormalX = 0;
    let hitNormalY = 0;
    let hitNormalZ = 0;

    if (Math.abs(dx) < 1e-8) {
      if (ox < minX || ox > maxX) continue;
    } else {
      const inv = 1 / dx;
      let t1 = (minX - ox) * inv;
      let t2 = (maxX - ox) * inv;
      let n = -1;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
        n = 1;
      }
      if (t1 > tmin) {
        tmin = t1;
        hitNormalX = n;
        hitNormalY = 0;
        hitNormalZ = 0;
      }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) continue;
    }

    if (Math.abs(dy) < 1e-8) {
      if (oy < minY || oy > maxY) continue;
    } else {
      const inv = 1 / dy;
      let t1 = (minY - oy) * inv;
      let t2 = (maxY - oy) * inv;
      let n = -1;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
        n = 1;
      }
      if (t1 > tmin) {
        tmin = t1;
        hitNormalX = 0;
        hitNormalY = n;
        hitNormalZ = 0;
      }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) continue;
    }

    if (Math.abs(dz) < 1e-8) {
      if (oz < minZ || oz > maxZ) continue;
    } else {
      const inv = 1 / dz;
      let t1 = (minZ - oz) * inv;
      let t2 = (maxZ - oz) * inv;
      let n = -1;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
        n = 1;
      }
      if (t1 > tmin) {
        tmin = t1;
        hitNormalX = 0;
        hitNormalY = 0;
        hitNormalZ = n;
      }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) continue;
    }

    if (tmin > 0.001 && tmin < bestT) {
      bestT = tmin;
      best = {
        box: b,
        distance: tmin,
        hx: ox + dx * tmin,
        hy: oy + dy * tmin,
        hz: oz + dz * tmin,
        nx: hitNormalX,
        ny: hitNormalY,
        nz: hitNormalZ,
      };
    }
  }

  return best;
}

export function hasLineOfSight(
  x1: number,
  y1: number,
  z1: number,
  x2: number,
  y2: number,
  z2: number,
  smokes: Array<{ x: number; y: number; z: number; radius: number }> = []
): boolean {
  const vx = x2 - x1;
  const vy = y2 - y1;
  const vz = z2 - z1;
  const dist = Math.hypot(vx, vy, vz);
  if (dist < 0.05) return true;
  const dx = vx / dist;
  const dy = vy / dist;
  const dz = vz / dist;

  const hit = raycastMapBoxes(x1, y1, z1, dx, dy, dz, dist - 0.1);
  if (hit) return false;

  for (const s of smokes) {
    const sx = s.x - x1;
    const sy = s.y - y1;
    const sz = s.z - z1;
    const proj = sx * dx + sy * dy + sz * dz;
    if (proj < 0 || proj > dist) continue;
    const cx = x1 + dx * proj - s.x;
    const cy = y1 + dy * proj - s.y;
    const cz = z1 + dz * proj - s.z;
    if (cx * cx + cy * cy + cz * cz <= s.radius * s.radius) {
      return false;
    }
  }

  return true;
}

export function findWaypointPath(startId: string, goalId: string): string[] {
  if (startId === goalId) return [startId];
  const queue: Array<{ id: string; path: string[] }> = [{ id: startId, path: [startId] }];
  const visited = new Set<string>([startId]);

  while (queue.length > 0) {
    const cur = queue.shift()!;
    const node = WAYPOINT_MAP.get(cur.id);
    if (!node) continue;
    for (const nextId of node.neighbors) {
      if (visited.has(nextId)) continue;
      const nextPath = [...cur.path, nextId];
      if (nextId === goalId) return nextPath;
      visited.add(nextId);
      queue.push({ id: nextId, path: nextPath });
    }
  }
  return [goalId];
}

export function findNearestWaypoint(x: number, z: number): WaypointNode {
  let best = WAYPOINTS[0];
  let bestDist = Infinity;
  for (const w of WAYPOINTS) {
    const d = (w.x - x) * (w.x - x) + (w.z - z) * (w.z - z);
    if (d < bestDist) {
      bestDist = d;
      best = w;
    }
  }
  return best;
}
