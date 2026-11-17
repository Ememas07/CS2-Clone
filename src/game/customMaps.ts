import * as THREE from 'three';
import type {
  MapBox,
  MapDefinition,
  MapMaterialKind,
  MapRamp,
  MapTheme,
  MapVisualBlock,
  SpawnAnchor,
  WaypointNode,
} from './mapData';
import type {
  CustomMapBlockInput,
  CustomMapJson,
  CustomMapRampInput,
  CustomMaterialInput,
  CustomSkyTheme,
  RampDirection,
} from './types';

export const CUSTOM_MAP_MAX_BYTES = 195_000;

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

export function normalizeCustomMaterial(mat: CustomMaterialInput): Exclude<CustomMaterialInput, 'sand'> {
  return mat === 'sand' ? 'sandstone' : mat;
}

export function mapMaterialToEngine(mat: CustomMaterialInput): MapMaterialKind {
  switch (mat) {
    case 'sandstone':
    case 'sand':
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

function isTuple6(val: unknown): val is [number, number, number, number, number, number] {
  return (
    Array.isArray(val) &&
    val.length === 6 &&
    val.every((n) => typeof n === 'number' && Number.isFinite(n))
  );
}

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const VALID_THEMES = new Set<CustomSkyTheme>(['desert', 'twilight', 'urban', 'arctic', 'sunset']);
const VALID_MATS = new Set<CustomMaterialInput>([
  'sandstone',
  'sand',
  'concrete',
  'wood',
  'metal',
  'crate',
]);
const VALID_RAMP_DIRS = new Set<RampDirection>(['n', 's', 'e', 'w']);

function q(n: number, decimals = 2): number {
  const f = 10 ** decimals;
  const r = Math.round(n * f) / f;
  return Object.is(r, -0) ? 0 : r;
}

function hasNonZeroRotation(rot?: [number, number, number]): boolean {
  if (!rot) return false;
  return Math.abs(rot[0]) > 0.002 || Math.abs(rot[1]) > 0.002 || Math.abs(rot[2]) > 0.002;
}

// 3D OBB vs AABB Separating Axis Theorem check (zero missed intersections on thin walls/planks)
function aabbIntersectsObb(
  aCenter: THREE.Vector3,
  aHalf: THREE.Vector3,
  bCenter: THREE.Vector3,
  bHalf: THREE.Vector3,
  bAxes: [THREE.Vector3, THREE.Vector3, THREE.Vector3]
): boolean {
  const t = new THREE.Vector3().subVectors(bCenter, aCenter);
  const ux = bAxes[0];
  const uy = bAxes[1];
  const uz = bAxes[2];

  // R[i][j] = dot(worldAxis_i, obbAxis_j)
  const r00 = ux.x, r01 = uy.x, r02 = uz.x;
  const r10 = ux.y, r11 = uy.y, r12 = uz.y;
  const r20 = ux.z, r21 = uy.z, r22 = uz.z;

  const eps = 1e-6;
  const ar00 = Math.abs(r00) + eps, ar01 = Math.abs(r01) + eps, ar02 = Math.abs(r02) + eps;
  const ar10 = Math.abs(r10) + eps, ar11 = Math.abs(r11) + eps, ar12 = Math.abs(r12) + eps;
  const ar20 = Math.abs(r20) + eps, ar21 = Math.abs(r21) + eps, ar22 = Math.abs(r22) + eps;

  // World axes L = X, Y, Z
  if (Math.abs(t.x) > aHalf.x + bHalf.x * ar00 + bHalf.y * ar01 + bHalf.z * ar02) return false;
  if (Math.abs(t.y) > aHalf.y + bHalf.x * ar10 + bHalf.y * ar11 + bHalf.z * ar12) return false;
  if (Math.abs(t.z) > aHalf.z + bHalf.x * ar20 + bHalf.y * ar21 + bHalf.z * ar22) return false;

  // OBB axes L = ux, uy, uz
  if (Math.abs(t.dot(ux)) > bHalf.x + aHalf.x * ar00 + aHalf.y * ar10 + aHalf.z * ar20) return false;
  if (Math.abs(t.dot(uy)) > bHalf.y + aHalf.x * ar01 + aHalf.y * ar11 + aHalf.z * ar21) return false;
  if (Math.abs(t.dot(uz)) > bHalf.z + aHalf.x * ar02 + aHalf.y * ar12 + aHalf.z * ar22) return false;

  // 9 cross products L = world_i x obb_j
  if (Math.abs(t.z * r10 - t.y * r20) > aHalf.y * ar20 + aHalf.z * ar10 + bHalf.y * ar02 + bHalf.z * ar01) return false;
  if (Math.abs(t.z * r11 - t.y * r21) > aHalf.y * ar21 + aHalf.z * ar11 + bHalf.x * ar02 + bHalf.z * ar00) return false;
  if (Math.abs(t.z * r12 - t.y * r22) > aHalf.y * ar22 + aHalf.z * ar12 + bHalf.x * ar01 + bHalf.y * ar00) return false;

  if (Math.abs(t.x * r20 - t.z * r00) > aHalf.x * ar20 + aHalf.z * ar00 + bHalf.y * ar12 + bHalf.z * ar11) return false;
  if (Math.abs(t.x * r21 - t.z * r01) > aHalf.x * ar21 + aHalf.z * ar01 + bHalf.x * ar12 + bHalf.z * ar10) return false;
  if (Math.abs(t.x * r22 - t.z * r02) > aHalf.x * ar22 + aHalf.z * ar02 + bHalf.x * ar11 + bHalf.y * ar10) return false;

  if (Math.abs(t.y * r00 - t.x * r10) > aHalf.x * ar10 + aHalf.y * ar00 + bHalf.y * ar22 + bHalf.z * ar21) return false;
  if (Math.abs(t.y * r01 - t.x * r11) > aHalf.x * ar11 + aHalf.y * ar01 + bHalf.x * ar22 + bHalf.z * ar20) return false;
  if (Math.abs(t.y * r02 - t.x * r12) > aHalf.x * ar12 + aHalf.y * ar02 + bHalf.x * ar21 + bHalf.y * ar20) return false;

  return true;
}

/**
 * Greedy 3D cuboid merging of a boolean occupancy grid into compact world-space AABB tuples:
 * `[centerX, bottomY, centerZ, width, height, depth]`.
 */
export function mergeVoxelGridToColliders(
  occupied: Uint8Array,
  nx: number,
  ny: number,
  nz: number,
  minX: number,
  minY: number,
  minZ: number,
  stepX: number,
  stepY: number,
  stepZ: number
): Array<[number, number, number, number, number, number]> {
  const used = new Uint8Array(occupied.length);
  const out: Array<[number, number, number, number, number, number]> = [];
  const idx = (x: number, y: number, z: number) => (y * nz + z) * nx + x;

  for (let y = 0; y < ny; y++) {
    for (let z = 0; z < nz; z++) {
      for (let x = 0; x < nx; x++) {
        const i0 = idx(x, y, z);
        if (!occupied[i0] || used[i0]) continue;

        let xEnd = x + 1;
        while (xEnd < nx) {
          const i = idx(xEnd, y, z);
          if (!occupied[i] || used[i]) break;
          xEnd++;
        }

        let zEnd = z + 1;
        outerZ: while (zEnd < nz) {
          for (let xi = x; xi < xEnd; xi++) {
            const i = idx(xi, y, zEnd);
            if (!occupied[i] || used[i]) break outerZ;
          }
          zEnd++;
        }

        let yEnd = y + 1;
        outerY: while (yEnd < ny) {
          for (let zi = z; zi < zEnd; zi++) {
            for (let xi = x; xi < xEnd; xi++) {
              const i = idx(xi, yEnd, zi);
              if (!occupied[i] || used[i]) break outerY;
            }
          }
          yEnd++;
        }

        for (let yi = y; yi < yEnd; yi++) {
          for (let zi = z; zi < zEnd; zi++) {
            for (let xi = x; xi < xEnd; xi++) {
              used[idx(xi, yi, zi)] = 1;
            }
          }
        }

        const bx0 = minX + x * stepX;
        const bx1 = minX + xEnd * stepX;
        const by0 = minY + y * stepY;
        const by1 = minY + yEnd * stepY;
        const bz0 = minZ + z * stepZ;
        const bz1 = minZ + zEnd * stepZ;

        out.push([
          q((bx0 + bx1) * 0.5, 2),
          q(by0, 2),
          q((bz0 + bz1) * 0.5, 2),
          q(Math.max(0.05, bx1 - bx0), 2),
          q(Math.max(0.05, by1 - by0), 2),
          q(Math.max(0.05, bz1 - bz0), 2),
        ]);
      }
    }
  }

  return out;
}

/**
 * Decomposes an oriented block into accurate axis-aligned collider boxes
 * (`[centerX, bottomY, centerZ, w, h, d]`) so diagonal/tilted blocks collide accurately
 * for player movement, bot navigation, and hitscan raycasts.
 */
export function decomposeRotatedBoxColliders(
  position: [number, number, number],
  size: [number, number, number],
  rotation?: [number, number, number]
): Array<[number, number, number, number, number, number]> {
  const [px, py, pz] = position;
  const [w, h, d] = size;

  if (!rotation || !hasNonZeroRotation(rotation)) {
    return [[q(px, 2), q(py, 2), q(pz, 2), q(w, 2), q(h, 2), q(d, 2)]];
  }

  const euler = new THREE.Euler(rotation[0], rotation[1], rotation[2], 'XYZ');
  const rotMat = new THREE.Matrix4().makeRotationFromEuler(euler);
  const center = new THREE.Vector3(px, py + h * 0.5, pz);
  const ux = new THREE.Vector3(1, 0, 0).applyMatrix4(rotMat).normalize();
  const uy = new THREE.Vector3(0, 1, 0).applyMatrix4(rotMat).normalize();
  const uz = new THREE.Vector3(0, 0, 1).applyMatrix4(rotMat).normalize();
  const obbHalf = new THREE.Vector3(w * 0.5, h * 0.5, d * 0.5);

  // Cardinal 90-deg rotation check: exact single world AABB
  const isCardinal = (v: THREE.Vector3) =>
    Math.max(Math.abs(v.x), Math.abs(v.y), Math.abs(v.z)) > 0.998;
  const extX = Math.abs(ux.x) * obbHalf.x + Math.abs(uy.x) * obbHalf.y + Math.abs(uz.x) * obbHalf.z;
  const extY = Math.abs(ux.y) * obbHalf.x + Math.abs(uy.y) * obbHalf.y + Math.abs(uz.y) * obbHalf.z;
  const extZ = Math.abs(ux.z) * obbHalf.x + Math.abs(uy.z) * obbHalf.y + Math.abs(uz.z) * obbHalf.z;

  if (isCardinal(ux) && isCardinal(uy) && isCardinal(uz)) {
    return [[
      q(center.x, 2),
      q(center.y - extY, 2),
      q(center.z, 2),
      q(extX * 2, 2),
      q(extY * 2, 2),
      q(extZ * 2, 2),
    ]];
  }

  const worldMinX = center.x - extX;
  const worldMaxX = center.x + extX;
  const worldMinY = center.y - extY;
  const worldMaxY = center.y + extY;
  const worldMinZ = center.z - extZ;
  const worldMaxZ = center.z + extZ;
  const spanX = Math.max(0.05, worldMaxX - worldMinX);
  const spanY = Math.max(0.05, worldMaxY - worldMinY);
  const spanZ = Math.max(0.05, worldMaxZ - worldMinZ);

  const pureYRot = Math.abs(rotation[0]) < 0.01 && Math.abs(rotation[2]) < 0.01;
  const cellTargetXZ = Math.max(0.42, Math.min(1.0, Math.min(w, d) * 0.72));
  const nx = Math.min(14, Math.max(2, Math.round(spanX / cellTargetXZ)));
  const nz = Math.min(14, Math.max(2, Math.round(spanZ / cellTargetXZ)));
  const ny = pureYRot
    ? 1
    : Math.min(12, Math.max(2, Math.ceil(spanY / Math.max(0.28, Math.min(0.6, spanY / 8)))));

  const stepX = spanX / nx;
  const stepY = spanY / ny;
  const stepZ = spanZ / nz;
  const cellHalf = new THREE.Vector3(stepX * 0.5, stepY * 0.5, stepZ * 0.5);
  const cellCenter = new THREE.Vector3();
  const occupied = new Uint8Array(nx * ny * nz);

  for (let iy = 0; iy < ny; iy++) {
    const cyCell = worldMinY + (iy + 0.5) * stepY;
    for (let iz = 0; iz < nz; iz++) {
      const czCell = worldMinZ + (iz + 0.5) * stepZ;
      for (let ix = 0; ix < nx; ix++) {
        cellCenter.set(worldMinX + (ix + 0.5) * stepX, cyCell, czCell);
        if (aabbIntersectsObb(cellCenter, cellHalf, center, obbHalf, [ux, uy, uz])) {
          occupied[(iy * nz + iz) * nx + ix] = 1;
        }
      }
    }
  }

  const merged = mergeVoxelGridToColliders(
    occupied,
    nx,
    ny,
    nz,
    worldMinX,
    worldMinY,
    worldMinZ,
    stepX,
    stepY,
    stepZ
  );
  return merged.length > 0
    ? merged
    : [[q(center.x, 2), q(worldMinY, 2), q(center.z, 2), q(spanX, 2), q(spanY, 2), q(spanZ, 2)]];
}

/**
 * Produces a compact, JSON-size-optimized CustomMapJson suitable for multiplayer room syncing
 * well within the 200,000-byte server cap.
 */
export function compactCustomMapJson(json: CustomMapJson): CustomMapJson {
  const blocks: CustomMapBlockInput[] = json.blocks.map((b, i) => {
    const normMat = normalizeCustomMaterial(b.material);
    const defaultWb = normMat === 'wood' || normMat === 'crate';
    const out: CustomMapBlockInput = {
      id: b.id || `b_${i}`,
      position: [q(b.position[0], 2), q(b.position[1], 2), q(b.position[2], 2)],
      size: [q(b.size[0], 2), q(b.size[1], 2), q(b.size[2], 2)],
      material: normMat,
    };
    if ((b.wallbangable ?? defaultWb) !== defaultWb) {
      out.wallbangable = Boolean(b.wallbangable);
    }
    if (b.rotation && hasNonZeroRotation(b.rotation)) {
      out.rotation = [q(b.rotation[0], 3), q(b.rotation[1], 3), q(b.rotation[2], 3)];
    }
    if (b.color && HEX_COLOR_RE.test(b.color)) {
      out.color = b.color.toLowerCase();
    }
    if (b.noCollision) {
      out.noCollision = true;
    } else if (b.colliders && b.colliders.length > 0) {
      out.colliders = b.colliders.map((c) => [
        q(c[0], 2),
        q(c[1], 2),
        q(c[2], 2),
        q(c[3], 2),
        q(c[4], 2),
        q(c[5], 2),
      ]);
    }
    if (b.mesh && b.mesh.positions.length >= 9) {
      out.mesh = {
        positions: b.mesh.positions.map((v) => q(v, 2)),
        ...(b.mesh.indices && b.mesh.indices.length >= 3 ? { indices: b.mesh.indices } : {}),
      };
    }
    return out;
  });

  const ramps: CustomMapRampInput[] | undefined =
    json.ramps && json.ramps.length > 0
      ? json.ramps.map((r, i) => ({
          id: r.id || `r_${i}`,
          position: [q(r.position[0], 2), q(r.position[1], 2), q(r.position[2], 2)],
          size: [q(r.size[0], 2), q(r.size[1], 2), q(r.size[2], 2)],
          direction: r.direction,
          ...(r.material ? { material: normalizeCustomMaterial(r.material) } : {}),
          ...(r.color && HEX_COLOR_RE.test(r.color) ? { color: r.color.toLowerCase() } : {}),
        }))
      : undefined;

  const out: CustomMapJson = {
    mapName: json.mapName.trim().slice(0, 48) || 'Custom Arena',
    skyTheme: json.skyTheme,
    blocks,
    ...(ramps ? { ramps } : {}),
    attackerSpawns: json.attackerSpawns.map((s) => ({
      position: [q(s.position[0], 2), q(s.position[1], 2), q(s.position[2], 2)],
      ...(s.yaw !== undefined && Math.abs(s.yaw) > 0.001 ? { yaw: q(s.yaw, 3) } : {}),
    })),
    defenderSpawns: json.defenderSpawns.map((s) => ({
      position: [q(s.position[0], 2), q(s.position[1], 2), q(s.position[2], 2)],
      ...(s.yaw !== undefined ? { yaw: q(s.yaw, 3) } : {}),
    })),
    ...(json.ffaSpawns && json.ffaSpawns.length > 0
      ? {
          ffaSpawns: json.ffaSpawns.map((s) => ({
            position: [q(s.position[0], 2), q(s.position[1], 2), q(s.position[2], 2)],
            ...(s.yaw !== undefined && Math.abs(s.yaw) > 0.001 ? { yaw: q(s.yaw, 3) } : {}),
          })),
        }
      : {}),
    bombSites: {
      A: {
        position: [q(json.bombSites.A.position[0], 2), q(json.bombSites.A.position[1], 2)],
        radius: q(json.bombSites.A.radius ?? 6.5, 2),
      },
      B: {
        position: [q(json.bombSites.B.position[0], 2), q(json.bombSites.B.position[1], 2)],
        radius: q(json.bombSites.B.radius ?? 6.5, 2),
      },
    },
    ...(json.buyZones && (json.buyZones.attackers || json.buyZones.defenders)
      ? {
          buyZones: {
            ...(json.buyZones.attackers
              ? {
                  attackers: {
                    position: [
                      q(json.buyZones.attackers.position[0], 2),
                      q(json.buyZones.attackers.position[1], 2),
                    ],
                    radius: q(json.buyZones.attackers.radius ?? 11, 2),
                  },
                }
              : {}),
            ...(json.buyZones.defenders
              ? {
                  defenders: {
                    position: [
                      q(json.buyZones.defenders.position[0], 2),
                      q(json.buyZones.defenders.position[1], 2),
                    ],
                    radius: q(json.buyZones.defenders.radius ?? 11, 2),
                  },
                }
              : {}),
          },
        }
      : {}),
    ...(json.botWaypoints && json.botWaypoints.length > 0
      ? {
          botWaypoints: json.botWaypoints.map((w) => ({
            id: w.id,
            position: [q(w.position[0], 2), q(w.position[1], 2)],
            callout: w.callout,
            neighbors: w.neighbors,
          })),
        }
      : {}),
  };

  return out;
}

export function getCustomMapByteSize(json: CustomMapJson): number {
  return JSON.stringify(json).length;
}

export function getCustomMapIssues(draft: {
  mapName?: string;
  blocks?: unknown[];
  attackerSpawns?: unknown[];
  defenderSpawns?: unknown[];
  bombSites?: { A?: { position: [number, number] } | null; B?: { position: [number, number] } | null };
}): string[] {
  const issues: string[] = [];
  if (!draft.mapName || draft.mapName.trim().length < 2) {
    issues.push('Map name must be at least 2 characters.');
  }
  if (!draft.blocks || draft.blocks.length === 0) {
    issues.push('Place at least 1 structural block or geometry piece.');
  }
  if (!draft.attackerSpawns || draft.attackerSpawns.length === 0) {
    issues.push('Missing Attacker Spawn (SPAWN_ATK).');
  }
  if (!draft.defenderSpawns || draft.defenderSpawns.length === 0) {
    issues.push('Missing Defender Spawn (SPAWN_DEF).');
  }
  if (!draft.bombSites?.A) {
    issues.push('Missing Bomb Site A (SITE_A).');
  }
  if (!draft.bombSites?.B) {
    issues.push('Missing Bomb Site B (SITE_B).');
  }
  return issues;
}

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

  if (!Array.isArray(obj.blocks) || obj.blocks.length === 0 || obj.blocks.length > 800) {
    return { ok: false, error: 'blocks must be a non-empty array (max 800 blocks).' };
  }

  const cleanBlocks: CustomMapJson['blocks'] = [];
  for (let i = 0; i < obj.blocks.length; i++) {
    const b = obj.blocks[i] as Record<string, unknown> | null;
    if (!b || !isTuple3(b.position) || !isTuple3(b.size)) {
      return { ok: false, error: `Block #${i + 1} must have numeric [x, y, z] position and [w, h, d] size.` };
    }
    if (b.size[0] <= 0.05 || b.size[1] <= 0.05 || b.size[2] <= 0.05) {
      return { ok: false, error: `Block #${i + 1} dimensions must be positive.` };
    }
    const matRaw = (typeof b.material === 'string' ? b.material : 'concrete') as CustomMaterialInput;
    if (!VALID_MATS.has(matRaw)) {
      return { ok: false, error: `Block #${i + 1} has invalid material "${String(b.material)}".` };
    }
    const mat = normalizeCustomMaterial(matRaw);

    let rotation: [number, number, number] | undefined;
    if (b.rotation !== undefined) {
      if (!isTuple3(b.rotation)) {
        return { ok: false, error: `Block #${i + 1} rotation must be a numeric [rx, ry, rz] tuple.` };
      }
      if (hasNonZeroRotation(b.rotation)) {
        rotation = [b.rotation[0], b.rotation[1], b.rotation[2]];
      }
    }

    let colliders: Array<[number, number, number, number, number, number]> | undefined;
    if (b.colliders !== undefined) {
      if (!Array.isArray(b.colliders) || b.colliders.length > 96) {
        return { ok: false, error: `Block #${i + 1} colliders must be an array (max 96).` };
      }
      colliders = [];
      for (const c of b.colliders) {
        if (!isTuple6(c) || c[3] <= 0.01 || c[4] <= 0.01 || c[5] <= 0.01) {
          return { ok: false, error: `Block #${i + 1} collider entries must be valid 6-tuples.` };
        }
        colliders.push([c[0], c[1], c[2], c[3], c[4], c[5]]);
      }
    }

    let mesh: CustomMapBlockInput['mesh'] | undefined;
    if (b.mesh !== undefined) {
      const m = b.mesh as Record<string, unknown> | null;
      if (
        !m ||
        !Array.isArray(m.positions) ||
        m.positions.length < 9 ||
        m.positions.length % 3 !== 0 ||
        !m.positions.every((n) => typeof n === 'number' && Number.isFinite(n))
      ) {
        return { ok: false, error: `Block #${i + 1} mesh.positions must be a finite XYZ float array.` };
      }
      let indices: number[] | undefined;
      if (m.indices !== undefined) {
        if (
          !Array.isArray(m.indices) ||
          m.indices.length < 3 ||
          m.indices.length % 3 !== 0 ||
          !m.indices.every((n) => typeof n === 'number' && Number.isInteger(n) && n >= 0)
        ) {
          return { ok: false, error: `Block #${i + 1} mesh.indices must be valid triangle indices.` };
        }
        indices = m.indices;
      }
      mesh = { positions: m.positions, ...(indices ? { indices } : {}) };
    }

    const blockOut: CustomMapBlockInput = {
      id: typeof b.id === 'string' ? b.id : `blk_${i}`,
      position: [b.position[0], b.position[1], b.position[2]],
      size: [b.size[0], b.size[1], b.size[2]],
      material: mat,
      wallbangable: typeof b.wallbangable === 'boolean' ? b.wallbangable : mat === 'wood' || mat === 'crate',
    };
    if (rotation) blockOut.rotation = rotation;
    if (typeof b.color === 'string' && HEX_COLOR_RE.test(b.color)) {
      blockOut.color = b.color.toLowerCase();
    }
    if (b.noCollision === true) blockOut.noCollision = true;
    if (colliders && colliders.length > 0) blockOut.colliders = colliders;
    if (mesh) blockOut.mesh = mesh;
    cleanBlocks.push(blockOut);
  }

  const cleanRamps: CustomMapRampInput[] = [];
  if (obj.ramps !== undefined) {
    if (!Array.isArray(obj.ramps) || obj.ramps.length > 120) {
      return { ok: false, error: 'ramps must be an array (max 120).' };
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
        material: VALID_MATS.has(rMat) ? normalizeCustomMaterial(rMat) : 'concrete',
        ...(typeof r.color === 'string' && HEX_COLOR_RE.test(r.color)
          ? { color: r.color.toLowerCase() }
          : {}),
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

  let cleanBuyZones: CustomMapJson['buyZones'] | undefined;
  if (obj.buyZones && typeof obj.buyZones === 'object') {
    const bzObj = obj.buyZones as Record<string, unknown>;
    const bzAtk = bzObj.attackers as Record<string, unknown> | undefined;
    const bzDef = bzObj.defenders as Record<string, unknown> | undefined;
    cleanBuyZones = {};
    if (bzAtk && isTuple2(bzAtk.position)) {
      cleanBuyZones.attackers = {
        position: [bzAtk.position[0], bzAtk.position[1]],
        radius: typeof bzAtk.radius === 'number' && bzAtk.radius >= 2 ? bzAtk.radius : 11,
      };
    }
    if (bzDef && isTuple2(bzDef.position)) {
      cleanBuyZones.defenders = {
        position: [bzDef.position[0], bzDef.position[1]],
        radius: typeof bzDef.radius === 'number' && bzDef.radius >= 2 ? bzDef.radius : 11,
      };
    }
    if (!cleanBuyZones.attackers && !cleanBuyZones.defenders) {
      cleanBuyZones = undefined;
    }
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

  const candidate: CustomMapJson = {
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
    ...(cleanBuyZones ? { buyZones: cleanBuyZones } : {}),
    botWaypoints: cleanWaypoints,
  };

  const compacted = compactCustomMapJson(candidate);
  const byteSize = getCustomMapByteSize(compacted);
  if (byteSize > CUSTOM_MAP_MAX_BYTES) {
    return {
      ok: false,
      error: `Map data is ${Math.round(byteSize / 1024)} KB, exceeding the ${Math.round(
        CUSTOM_MAP_MAX_BYTES / 1024
      )} KB multiplayer room limit. Simplify meshes or merge props.`,
    };
  }

  return {
    ok: true,
    data: compacted,
  };
}

function findClearWaypointXZ(x: number, z: number, boxes: MapBox[]): [number, number] {
  const blocked = (cx: number, cz: number) =>
    boxes.some(
      (b) =>
        b.y < 1.7 &&
        b.y + b.h > 0.2 &&
        cx >= b.x - b.w * 0.5 - 0.5 &&
        cx <= b.x + b.w * 0.5 + 0.5 &&
        cz >= b.z - b.d * 0.5 - 0.5 &&
        cz <= b.z + b.d * 0.5 + 0.5
    );
  if (!blocked(x, z)) return [x, z];
  for (let r = 2; r <= 12; r += 2) {
    for (let a = 0; a < 8; a++) {
      const ang = (a / 8) * Math.PI * 2;
      const nx = Math.round((x + Math.cos(ang) * r) * 10) / 10;
      const nz = Math.round((z + Math.sin(ang) * r) * 10) / 10;
      if (!blocked(nx, nz)) return [nx, nz];
    }
  }
  return [x, z];
}

export function customMapToDefinition(json: CustomMapJson): MapDefinition {
  const theme = SKY_THEMES[json.skyTheme] ?? SKY_THEMES.desert;
  const boxes: MapBox[] = [];
  const visualBlocks: MapVisualBlock[] = [];
  const ramps: MapRamp[] = [];

  let minX = -46;
  let maxX = 46;
  let minZ = -52;
  let maxZ = 52;

  for (let i = 0; i < json.blocks.length; i++) {
    const b = json.blocks[i];
    const id = b.id || `c_blk_${i}`;
    const mat = mapMaterialToEngine(b.material);
    const wallbang = b.wallbangable ?? (b.material === 'wood' || b.material === 'crate');
    const rotated = hasNonZeroRotation(b.rotation);
    const hasCustomVisual = rotated || Boolean(b.color) || Boolean(b.noCollision) || Boolean(b.mesh);

    if (!hasCustomVisual && (!b.colliders || b.colliders.length === 0)) {
      boxes.push({
        id,
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
    } else {
      visualBlocks.push({
        id,
        x: b.position[0],
        y: b.position[1],
        z: b.position[2],
        w: b.size[0],
        h: b.size[1],
        d: b.size[2],
        material: mat,
        ...(rotated && b.rotation ? { rotation: [...b.rotation] as [number, number, number] } : {}),
        ...(b.color ? { color: b.color } : {}),
        ...(b.mesh ? { mesh: b.mesh } : {}),
      });

      if (!b.noCollision) {
        const colliders =
          b.colliders && b.colliders.length > 0
            ? b.colliders
            : decomposeRotatedBoxColliders(b.position, b.size, b.rotation);
        for (let ci = 0; ci < colliders.length; ci++) {
          const c = colliders[ci];
          boxes.push({
            id: `${id}_col_${ci}`,
            x: c[0],
            y: c[1],
            z: c[2],
            w: c[3],
            h: c[4],
            d: c[5],
            material: mat,
            wallbangable: wallbang,
            penetrationFactor: wallbang ? 0.54 : 0,
            hiddenVisual: true,
          });
        }
      }
    }

    const halfExtent = Math.max(b.size[0], b.size[1], b.size[2]) * 0.5;
    minX = Math.min(minX, b.position[0] - halfExtent - 2);
    maxX = Math.max(maxX, b.position[0] + halfExtent + 2);
    minZ = Math.min(minZ, b.position[2] - halfExtent - 2);
    maxZ = Math.max(maxZ, b.position[2] + halfExtent + 2);
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
      ...(r.color ? { color: r.color } : {}),
    });

    minX = Math.min(minX, r.position[0] - r.size[0] * 0.5 - 2);
    maxX = Math.max(maxX, r.position[0] + r.size[0] * 0.5 + 2);
    minZ = Math.min(minZ, r.position[2] - r.size[2] * 0.5 - 2);
    maxZ = Math.max(maxZ, r.position[2] + r.size[2] * 0.5 + 2);

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

  for (const s of json.attackerSpawns) {
    minX = Math.min(minX, s.position[0] - 8);
    maxX = Math.max(maxX, s.position[0] + 8);
    minZ = Math.min(minZ, s.position[2] - 8);
    maxZ = Math.max(maxZ, s.position[2] + 8);
  }
  for (const s of json.defenderSpawns) {
    minX = Math.min(minX, s.position[0] - 8);
    maxX = Math.max(maxX, s.position[0] + 8);
    minZ = Math.min(minZ, s.position[2] - 8);
    maxZ = Math.max(maxZ, s.position[2] + 8);
  }

  const bounds = {
    minX: Math.max(-128, Math.floor(minX)),
    maxX: Math.min(128, Math.ceil(maxX)),
    minZ: Math.max(-128, Math.floor(minZ)),
    maxZ: Math.min(128, Math.ceil(maxZ)),
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

  const buyZoneAtk = json.buyZones?.attackers
    ? {
        x: json.buyZones.attackers.position[0],
        z: json.buyZones.attackers.position[1],
        radius: json.buyZones.attackers.radius ?? 11,
      }
    : { x: atkCenter.x, z: atkCenter.z, radius: 11 };
  const buyZoneDef = json.buyZones?.defenders
    ? {
        x: json.buyZones.defenders.position[0],
        z: json.buyZones.defenders.position[1],
        radius: json.buyZones.defenders.radius ?? 11,
      }
    : { x: defCenter.x, z: defCenter.z, radius: 11 };

  const [midX, midZ] = findClearWaypointXZ(
    (atkCenter.x + defCenter.x) * 0.5,
    (atkCenter.z + defCenter.z) * 0.5,
    boxes
  );
  const [siteAx, siteAz] = findClearWaypointXZ(
    json.bombSites.A.position[0],
    json.bombSites.A.position[1],
    boxes
  );
  const [siteBx, siteBz] = findClearWaypointXZ(
    json.bombSites.B.position[0],
    json.bombSites.B.position[1],
    boxes
  );

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
          { id: 'mid_center', x: midX, z: midZ, callout: 'Mid', neighbors: ['atk_spawn', 'def_spawn', 'a_site', 'b_site'] },
          { id: 'a_site', x: siteAx, z: siteAz, callout: 'Site A', neighbors: ['mid_center', 'atk_spawn', 'def_spawn'] },
          { id: 'b_site', x: siteBx, z: siteBz, callout: 'Site B', neighbors: ['mid_center', 'atk_spawn', 'def_spawn'] },
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
      attackers: buyZoneAtk,
      defenders: buyZoneDef,
    },
    spawnPoints: {
      attackers: atkSpawns,
      defenders: defSpawns,
    },
    ffaSpawns,
    boxes,
    visualBlocks,
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
    buyZones: {
      attackers: { position: [0, 39], radius: 11 },
      defenders: { position: [0, -39], radius: 11 },
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

/**
 * Reconstructs a Three.js BufferGeometry (with box-projected UVs and crisp vertex normals)
 * from compact serialized vertex positions/indices.
 */
export function buildGeometryFromCustomMesh(meshData: {
  positions: number[];
  indices?: number[];
}): THREE.BufferGeometry {
  const baseGeo = new THREE.BufferGeometry();
  baseGeo.setAttribute('position', new THREE.Float32BufferAttribute(meshData.positions, 3));
  if (meshData.indices && meshData.indices.length >= 3) {
    baseGeo.setIndex(meshData.indices);
  }
  const geo = baseGeo.index ? baseGeo.toNonIndexed() : baseGeo;
  if (geo !== baseGeo) baseGeo.dispose();

  geo.computeVertexNormals();
  const posAttr = geo.getAttribute('position');
  const normAttr = geo.getAttribute('normal');
  const uvs = new Float32Array(posAttr.count * 2);
  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const y = posAttr.getY(i);
    const z = posAttr.getZ(i);
    const nx = Math.abs(normAttr.getX(i));
    const ny = Math.abs(normAttr.getY(i));
    const nz = Math.abs(normAttr.getZ(i));
    if (ny >= nx && ny >= nz) {
      uvs[i * 2] = x * 0.25;
      uvs[i * 2 + 1] = z * 0.25;
    } else if (nx >= nz) {
      uvs[i * 2] = z * 0.25;
      uvs[i * 2 + 1] = y * 0.25;
    } else {
      uvs[i * 2] = x * 0.25;
      uvs[i * 2 + 1] = y * 0.25;
    }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

export function buildRampBufferGeometry(
  w: number,
  h: number,
  d: number,
  direction: RampDirection
): THREE.BufferGeometry {
  const hw = w * 0.5;
  const hd = d * 0.5;

  let h00 = 0; // (-hw, -hd) NW
  let h10 = 0; // (+hw, -hd) NE
  let h11 = 0; // (+hw, +hd) SE
  let h01 = 0; // (-hw, +hd) SW

  if (direction === 'n') {
    h00 = h;
    h10 = h;
  } else if (direction === 's') {
    h01 = h;
    h11 = h;
  } else if (direction === 'w') {
    h00 = h;
    h01 = h;
  } else {
    h10 = h;
    h11 = h;
  }

  const pos: number[] = [];
  const uvs: number[] = [];
  const pushTri = (
    ax: number, ay: number, az: number, au: number, av: number,
    bx: number, by: number, bz: number, bu: number, bv: number,
    cx: number, cy: number, cz: number, cu: number, cv: number
  ) => {
    pos.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    uvs.push(au, av, bu, bv, cu, cv);
  };
  const pushQuad = (
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number,
    dx: number, dy: number, dz: number,
    uScale = 1,
    vScale = 1
  ) => {
    pushTri(ax, ay, az, 0, 0, bx, by, bz, uScale, 0, cx, cy, cz, uScale, vScale);
    pushTri(ax, ay, az, 0, 0, cx, cy, cz, uScale, vScale, dx, dy, dz, 0, vScale);
  };

  pushQuad(
    -hw, h00, -hd,
    -hw, h01, hd,
    hw, h11, hd,
    hw, h10, -hd,
    Math.max(1, w / 2),
    Math.max(1, d / 2)
  );
  pushQuad(-hw, 0, -hd, hw, 0, -hd, hw, 0, hd, -hw, 0, hd);

  if (direction === 'n') {
    pushQuad(hw, 0, -hd, -hw, 0, -hd, -hw, h, -hd, hw, h, -hd);
    pushTri(-hw, 0, hd, 0, 0, -hw, 0, -hd, 1, 0, -hw, h, -hd, 1, 1);
    pushTri(hw, 0, hd, 0, 0, hw, h, -hd, 1, 1, hw, 0, -hd, 1, 0);
  } else if (direction === 's') {
    pushQuad(-hw, 0, hd, hw, 0, hd, hw, h, hd, -hw, h, hd);
    pushTri(-hw, 0, -hd, 0, 0, -hw, 0, hd, 1, 0, -hw, h, hd, 1, 1);
    pushTri(hw, 0, -hd, 0, 0, hw, h, hd, 1, 1, hw, 0, hd, 1, 0);
  } else if (direction === 'w') {
    pushQuad(-hw, 0, -hd, -hw, 0, hd, -hw, h, hd, -hw, h, -hd);
    pushTri(hw, 0, -hd, 0, 0, -hw, h, -hd, 1, 1, -hw, 0, -hd, 1, 0);
    pushTri(hw, 0, hd, 0, 0, -hw, 0, hd, 1, 0, -hw, h, hd, 1, 1);
  } else {
    pushQuad(hw, 0, hd, hw, 0, -hd, hw, h, -hd, hw, h, hd);
    pushTri(-hw, 0, -hd, 0, 0, hw, 0, -hd, 1, 0, hw, h, -hd, 1, 1);
    pushTri(-hw, 0, hd, 0, 0, hw, h, hd, 1, 1, hw, 0, hd, 1, 0);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.computeVertexNormals();
  return geo;
}
