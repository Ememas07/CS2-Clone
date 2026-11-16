import type { MapBox, MapDefinition, MapMaterialKind, MapRamp, MapTheme, SpawnAnchor, WaypointNode } from './mapData';
import type {
  CustomMapJson,
  CustomMapRampInput,
  CustomMaterialInput,
  CustomSkyTheme,
  RampDirection,
} from './types';

export type CustomMapValidationResult =
  | { ok: true; data: CustomMapJson }
  | { ok: false; error: string };

const SKY_THEMES: Record<CustomSkyTheme, MapTheme> = {
  desert: {
    floorTint: 0xffffff,
    outerFloorColor: 0xcab490,
    mesaColor: 0xb59870,
    fogColor: 0xdfd3bf,
    skyColor: 0xd5e6f5,
  },
  twilight: {
    floorTint: 0xd8dee9,
    outerFloorColor: 0x3b4252,
    mesaColor: 0x2e3440,
    fogColor: 0x434c5e,
    skyColor: 0x263145,
  },
  urban: {
    floorTint: 0xe6ecf0,
    outerFloorColor: 0x9aa3ab,
    mesaColor: 0x79848f,
    fogColor: 0xd6dfe6,
    skyColor: 0xdce8f4,
  },
  arctic: {
    floorTint: 0xf4f8fc,
    outerFloorColor: 0xdbe6f0,
    mesaColor: 0xaec4d8,
    fogColor: 0xe6f0fa,
    skyColor: 0xcce2f5,
  },
  sunset: {
    floorTint: 0xf6e2cf,
    outerFloorColor: 0xb6866a,
    mesaColor: 0x8f5b48,
    fogColor: 0xe8bfa2,
    skyColor: 0xf0b28a,
  },
};

function mapMaterialToEngine(mat: CustomMaterialInput): MapMaterialKind {
  switch (mat) {
    case 'sandstone':
      return 'sandstone';
    case 'concrete':
      return 'concrete';
    case 'wood':
    case 'crate':
      return 'wood';
    case 'metal':
      return 'metal_slate';
  }
}

function isTuple3(val: unknown): val is [number, number, number] {
  return (
    Array.isArray(val) &&
    val.length === 3 &&
    val.every((n) => typeof n === 'number' && Number.isFinite(n))
  );
}

function isTuple2(val: unknown): val is [number, number] {
  return (
    Array.isArray(val) &&
    val.length === 2 &&
    val.every((n) => typeof n === 'number' && Number.isFinite(n))
  );
}

const VALID_THEMES = new Set<CustomSkyTheme>(['desert', 'twilight', 'urban', 'arctic', 'sunset']);
const VALID_MATS = new Set<CustomMaterialInput>(['sandstone', 'concrete', 'wood', 'metal', 'crate']);
const VALID_RAMP_DIRS = new Set<RampDirection>(['n', 's', 'e', 'w']);

export function validateCustomMapJson(raw: unknown): CustomMapValidationResult {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: 'Custom map JSON must be a JSON object.' };
  }
  const obj = raw as Record<string, unknown>;

  if (typeof obj.mapName !== 'string' || obj.mapName.trim().length < 2 || obj.mapName.trim().length > 48) {
    return { ok: false, error: 'mapName must be a string between 2 and 48 characters.' };
  }

  const skyTheme = (typeof obj.skyTheme === 'string' ? obj.skyTheme : 'desert') as CustomSkyTheme;
  if (!VALID_THEMES.has(skyTheme)) {
    return { ok: false, error: 'skyTheme must be one of: desert, twilight, urban, arctic, sunset.' };
  }

  if (!Array.isArray(obj.blocks) || obj.blocks.length === 0 || obj.blocks.length > 260) {
    return { ok: false, error: 'blocks must be a non-empty array (max 260 blocks).' };
  }

  const cleanBlocks: CustomMapJson['blocks'] = [];
  for (let i = 0; i < obj.blocks.length; i++) {
    const b = obj.blocks[i] as Record<string, unknown> | null;
    if (!b || !isTuple3(b.position) || !isTuple3(b.size)) {
      return { ok: false, error: `Block #${i + 1} must have numeric [x, y, z] position and [w, h, d] size.` };
    }
    if (b.size[0] <= 0.1 || b.size[1] <= 0.05 || b.size[2] <= 0.1) {
      return { ok: false, error: `Block #${i + 1} dimensions must be positive.` };
    }
    const mat = (typeof b.material === 'string' ? b.material : 'concrete') as CustomMaterialInput;
    if (!VALID_MATS.has(mat)) {
      return { ok: false, error: `Block #${i + 1} has invalid material "${String(b.material)}".` };
    }
    cleanBlocks.push({
      id: typeof b.id === 'string' ? b.id : `blk_${i}`,
      position: [b.position[0], b.position[1], b.position[2]],
      size: [b.size[0], b.size[1], b.size[2]],
      material: mat,
      wallbangable: typeof b.wallbangable === 'boolean' ? b.wallbangable : mat === 'wood' || mat === 'crate',
    });
  }

  const cleanRamps: CustomMapRampInput[] = [];
  if (obj.ramps !== undefined) {
    if (!Array.isArray(obj.ramps) || obj.ramps.length > 64) {
      return { ok: false, error: 'ramps must be an array (max 64).' };
    }
    for (let i = 0; i < obj.ramps.length; i++) {
      const r = obj.ramps[i] as Record<string, unknown> | null;
      if (!r || !isTuple3(r.position) || !isTuple3(r.size) || !VALID_RAMP_DIRS.has(r.direction as RampDirection)) {
        return { ok: false, error: `Ramp #${i + 1} must have position, size, and direction (n|s|e|w).` };
      }
      if (r.size[0] <= 0.2 || r.size[1] <= 0.1 || r.size[2] <= 0.2) {
        return { ok: false, error: `Ramp #${i + 1} dimensions must be positive.` };
      }
      const rMat = (typeof r.material === 'string' ? r.material : 'concrete') as CustomMaterialInput;
      cleanRamps.push({
        id: typeof r.id === 'string' ? r.id : `ramp_${i}`,
        position: [r.position[0], r.position[1], r.position[2]],
        size: [r.size[0], r.size[1], r.size[2]],
        direction: r.direction as RampDirection,
        material: VALID_MATS.has(rMat) ? rMat : 'concrete',
      });
    }
  }

  const validateSpawns = (arr: unknown, label: string) => {
    if (!Array.isArray(arr) || arr.length === 0 || arr.length > 24) {
      return { ok: false as const, error: `${label} must have at least 1 spawn point.` };
    }
    const out: CustomMapJson['attackerSpawns'] = [];
    for (let i = 0; i < arr.length; i++) {
      const s = arr[i] as Record<string, unknown> | null;
      if (!s || !isTuple3(s.position)) {
        return { ok: false as const, error: `${label}[${i}] must have numeric [x, y, z] position.` };
      }
      out.push({
        position: [s.position[0], s.position[1], s.position[2]],
        yaw: typeof s.yaw === 'number' && Number.isFinite(s.yaw) ? s.yaw : 0,
      });
    }
    return { ok: true as const, data: out };
  };

  const atkRes = validateSpawns(obj.attackerSpawns, 'attackerSpawns');
  if (!atkRes.ok) return atkRes;
  const defRes = validateSpawns(obj.defenderSpawns, 'defenderSpawns');
  if (!defRes.ok) return defRes;

  let cleanFfa: CustomMapJson['ffaSpawns'] | undefined;
  if (obj.ffaSpawns !== undefined) {
    const ffaRes = validateSpawns(obj.ffaSpawns, 'ffaSpawns');
    if (!ffaRes.ok) return ffaRes;
    cleanFfa = ffaRes.data;
  }

  const sitesObj = obj.bombSites as Record<string, unknown> | undefined;
  const siteA = sitesObj?.A as Record<string, unknown> | undefined;
  const siteB = sitesObj?.B as Record<string, unknown> | undefined;
  if (!siteA || !isTuple2(siteA.position) || !siteB || !isTuple2(siteB.position)) {
    return { ok: false, error: 'bombSites must include A and B with numeric [x, z] positions.' };
  }

  let cleanWaypoints: CustomMapJson['botWaypoints'] | undefined;
  if (obj.botWaypoints !== undefined) {
    if (!Array.isArray(obj.botWaypoints) || obj.botWaypoints.length > 120) {
      return { ok: false, error: 'botWaypoints must be an array (max 120).' };
    }
    cleanWaypoints = [];
    for (let i = 0; i < obj.botWaypoints.length; i++) {
      const wp = obj.botWaypoints[i] as Record<string, unknown> | null;
      if (!wp || typeof wp.id !== 'string' || !isTuple2(wp.position) || !Array.isArray(wp.neighbors)) {
        return { ok: false, error: `botWaypoints[${i}] must have id, [x, z] position, and neighbors array.` };
      }
      cleanWaypoints.push({
        id: wp.id,
        position: [wp.position[0], wp.position[1]],
        callout: typeof wp.callout === 'string' ? wp.callout : wp.id,
        neighbors: wp.neighbors.filter((n): n is string => typeof n === 'string'),
      });
    }
  }

  return {
    ok: true,
    data: {
      mapName: obj.mapName.trim(),
      skyTheme,
      blocks: cleanBlocks,
      ramps: cleanRamps,
      attackerSpawns: atkRes.data,
      defenderSpawns: defRes.data,
      ffaSpawns: cleanFfa,
      bombSites: {
        A: {
          position: [siteA.position[0], siteA.position[1]],
          radius: typeof siteA.radius === 'number' && siteA.radius > 1 ? siteA.radius : 6.5,
        },
        B: {
          position: [siteB.position[0], siteB.position[1]],
          radius: typeof siteB.radius === 'number' && siteB.radius > 1 ? siteB.radius : 6.5,
        },
      },
      botWaypoints: cleanWaypoints,
    },
  };
}

export function customMapToDefinition(json: CustomMapJson): MapDefinition {
  const theme = SKY_THEMES[json.skyTheme] ?? SKY_THEMES.desert;
  const boxes: MapBox[] = [];
  const ramps: MapRamp[] = [];

  let minX = -46;
  let maxX = 46;
  let minZ = -52;
  let maxZ = 52;

  for (let i = 0; i < json.blocks.length; i++) {
    const b = json.blocks[i];
    const mat = mapMaterialToEngine(b.material);
    const wallbang = b.wallbangable ?? (b.material === 'wood' || b.material === 'crate');
    boxes.push({
      id: b.id || `c_blk_${i}`,
      x: b.position[0],
      y: b.position[1],
      z: b.position[2],
      w: b.size[0],
      h: b.size[1],
      d: b.size[2],
      material: mat,
      wallbangable: wallbang,
      penetrationFactor: wallbang ? 0.54 : 0,
    });
    minX = Math.min(minX, b.position[0] - b.size[0] * 0.5 - 2);
    maxX = Math.max(maxX, b.position[0] + b.size[0] * 0.5 + 2);
    minZ = Math.min(minZ, b.position[2] - b.size[2] * 0.5 - 2);
    maxZ = Math.max(maxZ, b.position[2] + b.size[2] * 0.5 + 2);
  }

  for (let i = 0; i < (json.ramps?.length ?? 0); i++) {
    const r = json.ramps![i];
    const mat = mapMaterialToEngine(r.material ?? 'concrete');
    ramps.push({
      id: r.id || `c_ramp_${i}`,
      x: r.position[0],
      y: r.position[1],
      z: r.position[2],
      w: r.size[0],
      h: r.size[1],
      d: r.size[2],
      direction: r.direction,
      material: mat,
    });

    // Subdivide ramp into walkable invisible step colliders (step height <= 0.28m)
    const steps = Math.max(4, Math.min(16, Math.ceil(r.size[1] / 0.25)));
    for (let s = 0; s < steps; s++) {
      const frac = (s + 1) / steps;
      const sliceH = r.size[1] * frac;
      let sx = r.position[0];
      let sz = r.position[2];
      let sw = r.size[0];
      let sd = r.size[2];
      if (r.direction === 'n' || r.direction === 's') {
        const segD = r.size[2] / steps;
        const offsetIdx = r.direction === 'n' ? steps - 1 - s : s;
        sz = r.position[2] - r.size[2] * 0.5 + segD * (offsetIdx + 0.5);
        sd = segD + 0.04;
      } else {
        const segW = r.size[0] / steps;
        const offsetIdx = r.direction === 'w' ? steps - 1 - s : s;
        sx = r.position[0] - r.size[0] * 0.5 + segW * (offsetIdx + 0.5);
        sw = segW + 0.04;
      }
      boxes.push({
        id: `${r.id || `c_ramp_${i}`}_step_${s}`,
        x: sx,
        y: r.position[1],
        z: sz,
        w: sw,
        h: sliceH,
        d: sd,
        material: mat,
        wallbangable: false,
        penetrationFactor: 0,
        hiddenVisual: true,
      });
    }
  }

  const bounds = {
    minX: Math.max(-96, Math.floor(minX)),
    maxX: Math.min(96, Math.ceil(maxX)),
    minZ: Math.max(-96, Math.floor(minZ)),
    maxZ: Math.min(96, Math.ceil(maxZ)),
  };

  // Ensure outer perimeter walls enclose the custom arena if not explicitly built
  const perimeterCheck = boxes.some((b) => b.id === 'wall_n' || b.w >= 80);
  if (!perimeterCheck) {
    const bw = bounds.maxX - bounds.minX;
    const bd = bounds.maxZ - bounds.minZ;
    const cx = (bounds.minX + bounds.maxX) * 0.5;
    const cz = (bounds.minZ + bounds.maxZ) * 0.5;
    const wallMat = mapMaterialToEngine(json.skyTheme === 'urban' || json.skyTheme === 'arctic' ? 'concrete' : 'sandstone');
    boxes.push(
      { id: 'c_wall_n', x: cx, y: 0, z: bounds.minZ + 1, w: bw, h: 5.5, d: 2, material: wallMat, wallbangable: false, penetrationFactor: 0 },
      { id: 'c_wall_s', x: cx, y: 0, z: bounds.maxZ - 1, w: bw, h: 5.5, d: 2, material: wallMat, wallbangable: false, penetrationFactor: 0 },
      { id: 'c_wall_w', x: bounds.minX + 1, y: 0, z: cz, w: 2, h: 5.5, d: bd, material: wallMat, wallbangable: false, penetrationFactor: 0 },
      { id: 'c_wall_e', x: bounds.maxX - 1, y: 0, z: cz, w: 2, h: 5.5, d: bd, material: wallMat, wallbangable: false, penetrationFactor: 0 }
    );
  }

  const atkSpawns: SpawnAnchor[] = json.attackerSpawns.map((s) => ({
    x: s.position[0],
    y: s.position[1],
    z: s.position[2],
    yaw: s.yaw ?? 0,
  }));
  const defSpawns: SpawnAnchor[] = json.defenderSpawns.map((s) => ({
    x: s.position[0],
    y: s.position[1],
    z: s.position[2],
    yaw: s.yaw ?? Math.PI,
  }));
  const ffaSpawns: SpawnAnchor[] =
    json.ffaSpawns && json.ffaSpawns.length > 0
      ? json.ffaSpawns.map((s) => ({
          x: s.position[0],
          y: s.position[1],
          z: s.position[2],
          yaw: s.yaw ?? 0,
        }))
      : [
          ...atkSpawns,
          ...defSpawns,
          { x: json.bombSites.A.position[0], y: 0, z: json.bombSites.A.position[1], yaw: 0 },
          { x: json.bombSites.B.position[0], y: 0, z: json.bombSites.B.position[1], yaw: Math.PI },
        ];

  const atkCenter = atkSpawns[0];
  const defCenter = defSpawns[0];

  const waypoints: WaypointNode[] =
    json.botWaypoints && json.botWaypoints.length > 0
      ? json.botWaypoints.map((w) => ({
          id: w.id,
          x: w.position[0],
          z: w.position[1],
          callout: w.callout ?? w.id,
          neighbors: [...w.neighbors],
        }))
      : [
          { id: 'atk_spawn', x: atkCenter.x, z: atkCenter.z, callout: 'Attacker Spawn', neighbors: ['mid_center', 'a_site', 'b_site'] },
          { id: 'def_spawn', x: defCenter.x, z: defCenter.z, callout: 'Defender Spawn', neighbors: ['mid_center', 'a_site', 'b_site'] },
          { id: 'mid_center', x: 0, z: 0, callout: 'Mid', neighbors: ['atk_spawn', 'def_spawn', 'a_site', 'b_site'] },
          { id: 'a_site', x: json.bombSites.A.position[0], z: json.bombSites.A.position[1], callout: 'Site A', neighbors: ['mid_center', 'atk_spawn', 'def_spawn'] },
          { id: 'b_site', x: json.bombSites.B.position[0], z: json.bombSites.B.position[1], callout: 'Site B', neighbors: ['mid_center', 'atk_spawn', 'def_spawn'] },
        ];

  return {
    id: 'custom',
    name: json.mapName,
    subtitle: `Custom Map · ${json.skyTheme}`,
    theme,
    bounds,
    siteZones: [
      { site: 'A', x: json.bombSites.A.position[0], z: json.bombSites.A.position[1], radius: json.bombSites.A.radius ?? 6.5 },
      { site: 'B', x: json.bombSites.B.position[0], z: json.bombSites.B.position[1], radius: json.bombSites.B.radius ?? 6.5 },
    ],
    buyZones: {
      attackers: { x: atkCenter.x, z: atkCenter.z, radius: 11 },
      defenders: { x: defCenter.x, z: defCenter.z, radius: 11 },
    },
    spawnPoints: {
      attackers: atkSpawns,
      defenders: defSpawns,
    },
    ffaSpawns,
    boxes,
    ramps,
    archLintels: [],
    waypoints,
  };
}

export function createCustomMapTemplate(): CustomMapJson {
  return {
    mapName: 'Citadel Courtyard',
    skyTheme: 'sunset',
    blocks: [
      { id: 'atk_screen', position: [0, 0, 28], size: [10, 4.2, 2], material: 'sandstone', wallbangable: false },
      { id: 'def_screen', position: [0, 0, -28], size: [10, 4.2, 2], material: 'sandstone', wallbangable: false },
      { id: 'mid_pillar_w', position: [-13, 0, 0], size: [2.4, 4.6, 22], material: 'concrete', wallbangable: false },
      { id: 'mid_pillar_e', position: [13, 0, 0], size: [2.4, 4.6, 22], material: 'concrete', wallbangable: false },
      { id: 'mid_center_crate', position: [0, 0, 0], size: [2.6, 1.5, 2.6], material: 'crate', wallbangable: true },
      { id: 'mid_deck', position: [0, 0, -14], size: [8, 1.6, 4.5], material: 'concrete', wallbangable: false },
      { id: 'a_plat', position: [-28, 0, -2], size: [8, 1.4, 10], material: 'concrete', wallbangable: false },
      { id: 'a_cover_wood', position: [-26, 1.4, -2], size: [2.0, 1.35, 2.0], material: 'wood', wallbangable: true },
      { id: 'a_crate_s', position: [-32, 0, 12], size: [2.4, 1.4, 2.4], material: 'crate', wallbangable: true },
      { id: 'b_container', position: [28, 0, 0], size: [2.6, 2.6, 6.0], material: 'metal', wallbangable: false },
      { id: 'b_crate_n', position: [33, 0, -8], size: [2.2, 1.4, 2.2], material: 'crate', wallbangable: true },
      { id: 'b_crate_s', position: [23, 0, 9], size: [2.2, 1.4, 2.2], material: 'wood', wallbangable: true },
    ],
    ramps: [
      { id: 'mid_deck_ramp_w', position: [-6.5, 0, -14], size: [5.0, 1.6, 4.2], direction: 'e', material: 'concrete' },
      { id: 'a_plat_ramp_s', position: [-28, 0, 5.5], size: [5.0, 1.4, 5.0], direction: 'n', material: 'concrete' },
    ],
    attackerSpawns: [
      { position: [0, 0, 38], yaw: 0 },
      { position: [-4, 0, 39], yaw: 0 },
      { position: [4, 0, 39], yaw: 0 },
      { position: [-7, 0, 40], yaw: 0 },
      { position: [7, 0, 40], yaw: 0 },
    ],
    defenderSpawns: [
      { position: [0, 0, -38], yaw: 3.14159 },
      { position: [-4, 0, -39], yaw: 3.14159 },
      { position: [4, 0, -39], yaw: 3.14159 },
      { position: [-7, 0, -40], yaw: 3.14159 },
      { position: [7, 0, -40], yaw: 3.14159 },
    ],
    ffaSpawns: [
      { position: [0, 0, 36], yaw: 0 },
      { position: [0, 0, -36], yaw: 3.14159 },
      { position: [-34, 0, 20], yaw: -0.6 },
      { position: [34, 0, 20], yaw: 0.6 },
      { position: [-34, 0, -20], yaw: -2.5 },
      { position: [34, 0, -20], yaw: 2.5 },
      { position: [-8, 0, 6], yaw: 0 },
      { position: [8, 0, -6], yaw: 3.14159 },
    ],
    bombSites: {
      A: { position: [-28, -2], radius: 6.5 },
      B: { position: [28, 0], radius: 6.5 },
    },
    botWaypoints: [
      { id: 'atk_spawn', position: [0, 36], callout: 'Attacker Spawn', neighbors: ['atk_a', 'atk_mid', 'atk_b'] },
      { id: 'def_spawn', position: [0, -36], callout: 'Defender Spawn', neighbors: ['def_a', 'def_mid', 'def_b'] },
      { id: 'atk_a', position: [-22, 26], callout: 'A Lobby', neighbors: ['atk_spawn', 'a_site_s'] },
      { id: 'a_site_s', position: [-24, 10], callout: 'A Approach', neighbors: ['atk_a', 'a_site', 'mid_center'] },
      { id: 'a_site', position: [-23, -2], callout: 'Site A', neighbors: ['a_site_s', 'a_site_n'] },
      { id: 'a_site_n', position: [-23, -18], callout: 'A North', neighbors: ['a_site', 'def_a'] },
      { id: 'def_a', position: [-22, -28], callout: 'CT A', neighbors: ['def_spawn', 'a_site_n'] },
      { id: 'atk_mid', position: [-7, 22], callout: 'Mid South', neighbors: ['atk_spawn', 'mid_center'] },
      { id: 'mid_center', position: [-6, 0], callout: 'Mid Courtyard', neighbors: ['atk_mid', 'a_site_s', 'b_site_s', 'def_mid'] },
      { id: 'def_mid', position: [7, -22], callout: 'Mid North', neighbors: ['def_spawn', 'mid_center', 'b_site_n'] },
      { id: 'atk_b', position: [22, 26], callout: 'B Lobby', neighbors: ['atk_spawn', 'b_site_s'] },
      { id: 'b_site_s', position: [24, 12], callout: 'B Approach', neighbors: ['atk_b', 'b_site', 'mid_center'] },
      { id: 'b_site', position: [23, 0], callout: 'Site B', neighbors: ['b_site_s', 'b_site_n'] },
      { id: 'b_site_n', position: [24, -18], callout: 'B North', neighbors: ['b_site', 'def_b', 'def_mid'] },
      { id: 'def_b', position: [22, -28], callout: 'CT B', neighbors: ['def_spawn', 'b_site_n'] },
    ],
  };
}
