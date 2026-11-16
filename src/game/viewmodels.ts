import * as THREE from 'three';
import type { WeaponId } from './types';

export interface ViewmodelHandle {
  root: THREE.Group;
  weaponPivot: THREE.Group;
  muzzlePoint: THREE.Object3D;
  ejectionPoint: THREE.Object3D;
  silencerMesh: THREE.Object3D | null;
  slideMesh?: THREE.Object3D;
  magPivot?: THREE.Group;
  bayonetPivot?: THREE.Group;
  butterflyLeftHandle?: THREE.Object3D;
  butterflyRightHandle?: THREE.Object3D;
  butterflyBlade?: THREE.Object3D;
  karambitPivot?: THREE.Object3D;
  awpBoltPivot?: THREE.Group;
  c4LedMesh?: THREE.Mesh;
}

function easeInOutCubic(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

function dampedSpringPulse(t: number, center: number, width: number): number {
  const d = (t - center) / Math.max(0.01, width);
  const bell = Math.exp(-d * d * 2.2);
  const ring = Math.cos(d * Math.PI * 1.4);
  return Math.max(0, bell * (0.85 + 0.15 * ring));
}

export function resetViewmodelArticulation(vm: ViewmodelHandle): void {
  vm.weaponPivot.position.set(0, 0, 0);
  vm.weaponPivot.rotation.set(0, 0, 0);
  if (vm.slideMesh) {
    vm.slideMesh.position.z = -0.04;
  }
  if (vm.magPivot) {
    vm.magPivot.position.set(0, 0, 0);
    vm.magPivot.rotation.set(0, 0, 0);
  }
  if (vm.bayonetPivot) {
    vm.bayonetPivot.position.set(0, 0, 0);
    vm.bayonetPivot.rotation.set(0, 0, 0);
  }
  if (vm.karambitPivot) {
    vm.karambitPivot.rotation.set(0, 0, 0);
  }
  if (vm.butterflyLeftHandle) {
    vm.butterflyLeftHandle.rotation.set(0, 0, 0);
  }
  if (vm.butterflyRightHandle) {
    vm.butterflyRightHandle.rotation.set(0, 0, 0);
  }
  if (vm.butterflyBlade) {
    vm.butterflyBlade.rotation.set(0, 0, 0);
  }
  if (vm.awpBoltPivot) {
    vm.awpBoltPivot.position.set(0.024, 0.036, 0.02);
    vm.awpBoltPivot.rotation.set(0, 0, 0);
  }
}

export function applyInspectTimeline(
  vm: ViewmodelHandle,
  weaponId: WeaponId,
  progress01: number
): void {
  const t = Math.max(0, Math.min(1, progress01));
  if (t <= 0 || t >= 1) {
    resetViewmodelArticulation(vm);
    return;
  }

  // Smooth entry & exit envelope so inspect returns cleanly to zero offsets
  const envIn = easeInOutCubic(Math.min(1, t / 0.16));
  const envOut = easeInOutCubic(Math.min(1, (1 - t) / 0.18));
  const envelope = Math.min(envIn, envOut);

  if (weaponId === 'karambit') {
    vm.weaponPivot.position.set(-0.04 * envelope, 0.035 * envelope, 0.05 * envelope);
    vm.weaponPivot.rotation.set(0.28 * envelope, 0.42 * envelope, 0.32 * envelope);
    if (vm.karambitPivot) {
      // Smooth continuous finger-ring spin (2 full damped rotations)
      const spinCurve = easeInOutCubic(t);
      vm.karambitPivot.rotation.x = spinCurve * Math.PI * 4;
      vm.karambitPivot.rotation.z = Math.sin(t * Math.PI * 2) * 0.22 * envelope;
    }
    return;
  }

  if (weaponId === 'butterfly') {
    vm.weaponPivot.position.set(-0.045 * envelope, 0.04 * envelope, 0.04 * envelope);
    vm.weaponPivot.rotation.set(
      0.32 * envelope + Math.sin(t * Math.PI * 3) * 0.16 * envelope,
      0.48 * envelope,
      Math.sin(t * Math.PI * 2) * 0.35 * envelope
    );
    const fanPhase = Math.sin(t * Math.PI * 2);
    if (vm.butterflyLeftHandle) {
      vm.butterflyLeftHandle.rotation.z = fanPhase * 1.45 * envelope;
      vm.butterflyLeftHandle.rotation.x = Math.sin(t * Math.PI * 4) * 0.35 * envelope;
    }
    if (vm.butterflyRightHandle) {
      vm.butterflyRightHandle.rotation.z = -fanPhase * 1.45 * envelope;
      vm.butterflyRightHandle.rotation.x = -Math.sin(t * Math.PI * 4) * 0.25 * envelope;
    }
    if (vm.butterflyBlade) {
      vm.butterflyBlade.rotation.z = Math.sin(t * Math.PI * 2) * 0.42 * envelope;
    }
    return;
  }

  if (weaponId === 'bayonet') {
    // Wrist roll + blade tilt showcase
    const roll = Math.sin(t * Math.PI * 1.5);
    vm.weaponPivot.position.set(-0.04 * envelope, 0.025 * envelope, 0.05 * envelope);
    vm.weaponPivot.rotation.set(
      0.36 * envelope,
      0.56 * envelope + roll * 0.22 * envelope,
      0.85 * Math.sin(t * Math.PI) * envelope
    );
    if (vm.bayonetPivot) {
      vm.bayonetPivot.rotation.z = roll * 0.45 * envelope;
    }
    return;
  }

  // Firearms: two-stage dual-side showcase toward camera + subtle mag/bolt check
  const sideA = dampedSpringPulse(t, 0.32, 0.24);
  const sideB = dampedSpringPulse(t, 0.68, 0.24);
  const flipBlend = sideB - sideA * 0.85;

  vm.weaponPivot.position.set(
    -0.05 * envelope + sideB * 0.03,
    0.03 * envelope + Math.sin(t * Math.PI) * 0.018,
    0.06 * envelope
  );
  vm.weaponPivot.rotation.set(
    0.16 * envelope + sideA * 0.14 - sideB * 0.08,
    0.62 * envelope + flipBlend * 0.38,
    0.42 * sideA - 0.52 * sideB
  );

  // Subtle magazine wiggle/check around mid-timeline
  if (vm.magPivot) {
    const magCheck = dampedSpringPulse(t, 0.48, 0.14);
    vm.magPivot.position.y = -0.024 * magCheck;
    vm.magPivot.rotation.x = 0.08 * magCheck;
  }

  // Subtle AWP bolt lift/check during inspect
  if (vm.awpBoltPivot) {
    const boltCheck = dampedSpringPulse(t, 0.52, 0.15);
    vm.awpBoltPivot.rotation.z = -0.65 * boltCheck;
    vm.awpBoltPivot.position.z = 0.02 + 0.032 * boltCheck;
  }
}

export function disposeViewmodel(vm: ViewmodelHandle | null | undefined): void {
  if (!vm) return;
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  vm.root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) geometries.add(mesh.geometry);
    if (mesh.material) {
      if (Array.isArray(mesh.material)) {
        for (const m of mesh.material) materials.add(m);
      } else {
        materials.add(mesh.material);
      }
    }
  });
  for (const g of geometries) g.dispose();
  for (const m of materials) m.dispose();
}

export function buildWeaponViewmodel(weaponId: WeaponId): ViewmodelHandle {
  const root = new THREE.Group();
  const weaponPivot = new THREE.Group();
  root.add(weaponPivot);

  // Shared PBR material palette with varied roughness & metalness
  const steelMat = new THREE.MeshStandardMaterial({
    color: 0x3b414a,
    roughness: 0.3,
    metalness: 0.88,
  });
  const darkSteelMat = new THREE.MeshStandardMaterial({
    color: 0x1b1f25,
    roughness: 0.38,
    metalness: 0.82,
  });
  const chromeMat = new THREE.MeshStandardMaterial({
    color: 0xc8ced6,
    roughness: 0.16,
    metalness: 0.95,
  });
  const polymerMat = new THREE.MeshStandardMaterial({
    color: 0x202429,
    roughness: 0.78,
    metalness: 0.08,
  });
  const woodMat = new THREE.MeshStandardMaterial({
    color: 0x7c4622,
    roughness: 0.66,
    metalness: 0.04,
  });
  const oliveMat = new THREE.MeshStandardMaterial({
    color: 0x4b5a3c,
    roughness: 0.72,
    metalness: 0.12,
  });
  const opticLensMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x0c4a6e,
    emissiveIntensity: 0.55,
    roughness: 0.08,
    metalness: 0.18,
    transparent: true,
    opacity: 0.72,
  });
  const accentBrassMat = new THREE.MeshStandardMaterial({
    color: 0xc29b48,
    roughness: 0.25,
    metalness: 0.88,
  });
  const sleeveMat = new THREE.MeshStandardMaterial({
    color: 0x2d333b,
    roughness: 0.88,
    metalness: 0.04,
  });
  const gloveMat = new THREE.MeshStandardMaterial({
    color: 0x1b1d21,
    roughness: 0.74,
    metalness: 0.1,
  });

  const muzzlePoint = new THREE.Object3D();
  muzzlePoint.position.set(0, 0.04, -0.58);
  weaponPivot.add(muzzlePoint);

  const ejectionPoint = new THREE.Object3D();
  ejectionPoint.position.set(0.04, 0.03, -0.08);
  weaponPivot.add(ejectionPoint);

  let silencerMesh: THREE.Object3D | null = null;
  let slideMesh: THREE.Object3D | undefined;
  let magPivot: THREE.Group | undefined;
  let bayonetPivot: THREE.Group | undefined;
  let butterflyLeftHandle: THREE.Object3D | undefined;
  let butterflyRightHandle: THREE.Object3D | undefined;
  let butterflyBlade: THREE.Object3D | undefined;
  let karambitPivot: THREE.Object3D | undefined;
  let awpBoltPivot: THREE.Group | undefined;
  let c4LedMesh: THREE.Mesh | undefined;

  const addPicatinnyRail = (x: number, y: number, z: number, length: number) => {
    const railBase = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.01, length), darkSteelMat);
    railBase.position.set(x, y, z);
    weaponPivot.add(railBase);
    const teethCount = Math.max(3, Math.floor(length / 0.024));
    for (let i = 0; i < teethCount; i++) {
      const tz = z - length * 0.5 + 0.012 + i * (length / teethCount);
      const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.007, 0.011), steelMat);
      tooth.position.set(x, y + 0.007, tz);
      weaponPivot.add(tooth);
    }
  };

  const addFlutedBarrel = (y: number, zCenter: number, length: number, radius: number) => {
    const core = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius * 1.08, length, 12),
      darkSteelMat
    );
    core.rotation.x = Math.PI / 2;
    core.position.set(0, y, zCenter);
    weaponPivot.add(core);
    for (let i = -1; i <= 1; i += 2) {
      const collar = new THREE.Mesh(
        new THREE.CylinderGeometry(radius * 1.25, radius * 1.25, 0.018, 12),
        steelMat
      );
      collar.rotation.x = Math.PI / 2;
      collar.position.set(0, y, zCenter + i * length * 0.25);
      weaponPivot.add(collar);
    }
  };

  const addRibbedSuppressor = (y: number, zCenter: number, length: number, radius: number) => {
    const group = new THREE.Group();
    group.position.set(0, y, zCenter);
    const tube = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, length, 14),
      darkSteelMat
    );
    tube.rotation.x = Math.PI / 2;
    group.add(tube);
    // Heat-shield rings along suppressor body
    const rings = 4;
    for (let i = 0; i < rings; i++) {
      const ringZ = -length * 0.34 + i * (length * 0.22);
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(radius * 1.04, 0.0025, 6, 14),
        steelMat
      );
      ring.position.set(0, 0, ringZ);
      group.add(ring);
    }
    const muzzleCap = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.65, radius * 0.95, 0.015, 12),
      chromeMat
    );
    muzzleCap.rotation.x = Math.PI / 2;
    muzzleCap.position.set(0, 0, -length * 0.5 - 0.005);
    group.add(muzzleCap);
    weaponPivot.add(group);
    return group;
  };

  const addForearm = (isTwoHanded: boolean) => {
    const rightArm = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.085, 0.36), sleeveMat);
    rightArm.position.set(0.06, -0.14, 0.24);
    rightArm.rotation.set(0.28, -0.14, 0);
    weaponPivot.add(rightArm);

    const rightHand = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.075, 0.095), gloveMat);
    rightHand.position.set(0.005, -0.06, 0.07);
    weaponPivot.add(rightHand);

    if (isTwoHanded) {
      const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.38), sleeveMat);
      leftArm.position.set(-0.14, -0.12, 0.02);
      leftArm.rotation.set(0.22, 0.42, 0);
      weaponPivot.add(leftArm);

      const leftHand = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.065, 0.095), gloveMat);
      leftHand.position.set(-0.01, -0.035, -0.16);
      weaponPivot.add(leftHand);
    }
  };

  if (weaponId === 'ak47') {
    addForearm(true);
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.082, 0.34), darkSteelMat);
    receiver.position.set(0, 0.01, -0.02);
    weaponPivot.add(receiver);
    const dustCover = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.025, 0.28), steelMat);
    dustCover.position.set(0, 0.056, -0.02);
    weaponPivot.add(dustCover);
    const boltCarrier = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.018, 0.11), chromeMat);
    boltCarrier.position.set(0.031, 0.034, -0.04);
    weaponPivot.add(boltCarrier);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.09, 0.26), woodMat);
    stock.position.set(0, -0.015, 0.26);
    stock.rotation.x = 0.09;
    weaponPivot.add(stock);
    const buttPlate = new THREE.Mesh(new THREE.BoxGeometry(0.054, 0.094, 0.016), darkSteelMat);
    buttPlate.position.set(0, -0.026, 0.39);
    weaponPivot.add(buttPlate);
    const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.072, 0.22), woodMat);
    handguard.position.set(0, 0.012, -0.29);
    weaponPivot.add(handguard);
    addFlutedBarrel(0.024, -0.52, 0.42, 0.012);
    const gasTube = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.24, 8), steelMat);
    gasTube.rotation.x = Math.PI / 2;
    gasTube.position.set(0, 0.048, -0.32);
    weaponPivot.add(gasTube);
    const frontSight = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.038, 0.024), darkSteelMat);
    frontSight.position.set(0, 0.05, -0.66);
    weaponPivot.add(frontSight);
    const slantBrake = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.014, 0.042, 10), steelMat);
    slantBrake.rotation.x = Math.PI / 2;
    slantBrake.position.set(0, 0.024, -0.74);
    weaponPivot.add(slantBrake);

    // Articulated 3-segment curved banana magazine
    magPivot = new THREE.Group();
    const magTop = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.085, 0.068), woodMat);
    magTop.position.set(0, -0.065, -0.095);
    magTop.rotation.x = 0.1;
    magPivot.add(magTop);
    const magMid = new THREE.Mesh(new THREE.BoxGeometry(0.037, 0.085, 0.066), woodMat);
    magMid.position.set(0, -0.14, -0.118);
    magMid.rotation.x = 0.28;
    magPivot.add(magMid);
    const magTip = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.065, 0.064), darkSteelMat);
    magTip.position.set(0, -0.205, -0.145);
    magTip.rotation.x = 0.46;
    magPivot.add(magTip);
    weaponPivot.add(magPivot);

    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.1, 0.048), polymerMat);
    grip.position.set(0, -0.075, 0.09);
    grip.rotation.x = -0.28;
    weaponPivot.add(grip);
    muzzlePoint.position.set(0, 0.024, -0.76);
  } else if (weaponId === 'm4a1s') {
    addForearm(true);
    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.078, 0.32), darkSteelMat);
    upper.position.set(0, 0.015, -0.02);
    weaponPivot.add(upper);
    addPicatinnyRail(0, 0.058, -0.04, 0.34);

    // Holographic sight housing + tinted optical lens
    const holoHousing = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.042, 0.075), darkSteelMat);
    holoHousing.position.set(0, 0.084, -0.02);
    weaponPivot.add(holoHousing);
    const holoLens = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 0.028), opticLensMat);
    holoLens.position.set(0, 0.085, 0.019);
    weaponPivot.add(holoLens);

    const bufferTube = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.24, 10), steelMat);
    bufferTube.rotation.x = Math.PI / 2;
    bufferTube.position.set(0, 0.015, 0.24);
    weaponPivot.add(bufferTube);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.1, 0.18), polymerMat);
    stock.position.set(0, -0.01, 0.28);
    weaponPivot.add(stock);
    const shroud = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.028, 0.24, 12), polymerMat);
    shroud.rotation.x = Math.PI / 2;
    shroud.position.set(0, 0.02, -0.28);
    weaponPivot.add(shroud);
    addFlutedBarrel(0.02, -0.46, 0.22, 0.011);
    silencerMesh = addRibbedSuppressor(0.02, -0.65, 0.24, 0.021);

    magPivot = new THREE.Group();
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.145, 0.062), steelMat);
    mag.position.set(0, -0.09, -0.1);
    mag.rotation.x = 0.06;
    magPivot.add(mag);
    weaponPivot.add(magPivot);

    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.095, 0.046), polymerMat);
    grip.position.set(0, -0.07, 0.08);
    grip.rotation.x = -0.26;
    weaponPivot.add(grip);
    muzzlePoint.position.set(0, 0.02, -0.78);
  } else if (weaponId === 'awp') {
    addForearm(true);
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.075, 0.56), oliveMat);
    chassis.position.set(0, 0.0, -0.08);
    weaponPivot.add(chassis);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.1, 0.26), oliveMat);
    stock.position.set(0, -0.015, 0.27);
    weaponPivot.add(stock);
    const cheekRest = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.028, 0.14), polymerMat);
    cheekRest.position.set(0, 0.04, 0.22);
    weaponPivot.add(cheekRest);

    addFlutedBarrel(0.025, -0.62, 0.58, 0.016);
    const brake = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.032, 0.07), steelMat);
    brake.position.set(0, 0.025, -0.92);
    weaponPivot.add(brake);

    addPicatinnyRail(0, 0.044, -0.08, 0.28);
    // Scope rings & tube + front/rear tinted glass lenses
    for (const rz of [-0.15, -0.02]) {
      const mount = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.024, 12), steelMat);
      mount.rotation.x = Math.PI / 2;
      mount.position.set(0, 0.082, rz);
      weaponPivot.add(mount);
    }
    const scopeTube = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.34, 14), darkSteelMat);
    scopeTube.rotation.x = Math.PI / 2;
    scopeTube.position.set(0, 0.082, -0.08);
    weaponPivot.add(scopeTube);
    const scopeBell = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.022, 0.1, 14), darkSteelMat);
    scopeBell.rotation.x = Math.PI / 2;
    scopeBell.position.set(0, 0.082, -0.27);
    weaponPivot.add(scopeBell);
    const rearLens = new THREE.Mesh(new THREE.CircleGeometry(0.019, 14), opticLensMat);
    rearLens.position.set(0, 0.082, 0.091);
    weaponPivot.add(rearLens);
    const frontLens = new THREE.Mesh(new THREE.CircleGeometry(0.029, 14), opticLensMat);
    frontLens.rotation.y = Math.PI;
    frontLens.position.set(0, 0.082, -0.321);
    weaponPivot.add(frontLens);

    awpBoltPivot = new THREE.Group();
    awpBoltPivot.position.set(0.024, 0.036, 0.02);
    const boltSleeve = new THREE.Mesh(
      new THREE.CylinderGeometry(0.011, 0.011, 0.085, 8),
      chromeMat
    );
    boltSleeve.rotation.x = Math.PI / 2;
    awpBoltPivot.add(boltSleeve);
    const boltStem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.006, 0.006, 0.048, 8),
      chromeMat
    );
    boltStem.rotation.z = Math.PI / 2;
    boltStem.position.set(0.026, -0.003, 0.012);
    awpBoltPivot.add(boltStem);
    const boltKnob = new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 8), chromeMat);
    boltKnob.position.set(0.052, -0.005, 0.012);
    awpBoltPivot.add(boltKnob);
    weaponPivot.add(awpBoltPivot);

    magPivot = new THREE.Group();
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.085, 0.095), polymerMat);
    mag.position.set(0, -0.065, -0.1);
    magPivot.add(mag);
    weaponPivot.add(magPivot);
    muzzlePoint.position.set(0, 0.025, -0.96);
  } else if (weaponId === 'mac10' || weaponId === 'mp7') {
    const isMac = weaponId === 'mac10';
    addForearm(!isMac);
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(isMac ? 0.062 : 0.056, isMac ? 0.082 : 0.086, isMac ? 0.24 : 0.32),
      isMac ? darkSteelMat : polymerMat
    );
    body.position.set(0, 0.015, -0.06);
    weaponPivot.add(body);
    addFlutedBarrel(0.02, -0.24, 0.14, 0.012);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.11, 0.052), polymerMat);
    grip.position.set(0, -0.075, 0.01);
    grip.rotation.x = -0.12;
    weaponPivot.add(grip);

    magPivot = new THREE.Group();
    const extMag = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.16, 0.04), steelMat);
    extMag.position.set(0, -0.13, isMac ? 0.01 : -0.12);
    extMag.rotation.x = isMac ? -0.12 : 0.1;
    magPivot.add(extMag);
    weaponPivot.add(magPivot);

    if (!isMac) {
      addPicatinnyRail(0, 0.062, -0.06, 0.26);
      const microDot = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.03, 0.05), darkSteelMat);
      microDot.position.set(0, 0.082, -0.06);
      weaponPivot.add(microDot);
      const microLens = new THREE.Mesh(new THREE.PlaneGeometry(0.024, 0.02), opticLensMat);
      microLens.position.set(0, 0.082, -0.034);
      weaponPivot.add(microLens);
    }
    muzzlePoint.position.set(0, 0.02, -0.32);
  } else if (
    weaponId === 'usps' ||
    weaponId === 'glock18' ||
    weaponId === 'fiveseven' ||
    weaponId === 'tec9' ||
    weaponId === 'deagle'
  ) {
    addForearm(false);
    const isDeagle = weaponId === 'deagle';
    const isUsp = weaponId === 'usps';
    const isTec = weaponId === 'tec9';

    const slideMat = isDeagle ? chromeMat : isUsp ? darkSteelMat : steelMat;
    const frameMat = isDeagle ? darkSteelMat : polymerMat;

    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(0.038, 0.032, isDeagle ? 0.24 : 0.19),
      frameMat
    );
    frame.position.set(0, 0.002, -0.04);
    weaponPivot.add(frame);

    const triggerGuard = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.024, 0.045), frameMat);
    triggerGuard.position.set(0, -0.022, -0.035);
    weaponPivot.add(triggerGuard);

    // Blowback reciprocating slide + front/rear iron sights
    const slideGroup = new THREE.Group();
    slideGroup.position.set(0, 0.03, -0.04);
    const slideBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.036, 0.034, isDeagle ? 0.25 : 0.2),
      slideMat
    );
    slideGroup.add(slideBody);
    const rearSight = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.012, 0.012), darkSteelMat);
    rearSight.position.set(0, 0.021, isDeagle ? 0.105 : 0.082);
    slideGroup.add(rearSight);
    const frontSight = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.012, 0.012), accentBrassMat);
    frontSight.position.set(0, 0.021, isDeagle ? -0.108 : -0.084);
    slideGroup.add(frontSight);
    weaponPivot.add(slideGroup);
    slideMesh = slideGroup;

    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.105, 0.052), frameMat);
    grip.position.set(0, -0.055, 0.03);
    grip.rotation.x = -0.24;
    weaponPivot.add(grip);

    if (isTec) {
      magPivot = new THREE.Group();
      const tecMag = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.15, 0.038), steelMat);
      tecMag.position.set(0, -0.08, -0.09);
      tecMag.rotation.x = 0.08;
      magPivot.add(tecMag);
      weaponPivot.add(magPivot);
    }

    if (isUsp) {
      silencerMesh = addRibbedSuppressor(0.026, -0.23, 0.18, 0.017);
      muzzlePoint.position.set(0, 0.026, -0.33);
    } else {
      muzzlePoint.position.set(0, 0.026, -0.18);
    }
  } else if (weaponId === 'bayonet') {
    addForearm(false);
    bayonetPivot = new THREE.Group();
    weaponPivot.add(bayonetPivot);

    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.018, 0.13, 12), oliveMat);
    grip.position.set(0, -0.02, -0.05);
    grip.rotation.x = -0.9;
    bayonetPivot.add(grip);

    const pommel = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.018, 0.02, 12), darkSteelMat);
    pommel.position.set(0, -0.068, -0.008);
    pommel.rotation.x = -0.9;
    bayonetPivot.add(pommel);

    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.014, 0.026), darkSteelMat);
    guard.position.set(0, 0.025, -0.11);
    guard.rotation.x = -0.9;
    bayonetPivot.add(guard);

    const bladeShape = new THREE.Shape();
    bladeShape.moveTo(0, 0);
    bladeShape.lineTo(0.028, 0);
    bladeShape.lineTo(0.022, 0.17);
    bladeShape.lineTo(0, 0.215);
    bladeShape.lineTo(0, 0);
    const bladeGeo = new THREE.ExtrudeGeometry(bladeShape, {
      depth: 0.005,
      bevelEnabled: true,
      bevelThickness: 0.0012,
      bevelSize: 0.0012,
      bevelSegments: 2,
    });
    const blade = new THREE.Mesh(bladeGeo, chromeMat);
    blade.position.set(-0.002, 0.03, -0.12);
    blade.rotation.set(-0.9, Math.PI / 2, 0);
    bayonetPivot.add(blade);
  } else if (weaponId === 'karambit') {
    addForearm(false);
    karambitPivot = new THREE.Group();
    karambitPivot.position.set(0, 0, -0.06);
    weaponPivot.add(karambitPivot);

    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.019, 0.0055, 10, 18), steelMat);
    ring.position.set(0, -0.06, 0.04);
    ring.rotation.y = Math.PI / 2;
    karambitPivot.add(ring);

    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.11, 0.032), polymerMat);
    handle.position.set(0, -0.01, 0);
    handle.rotation.x = -0.5;
    karambitPivot.add(handle);

    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.016, 0.038), darkSteelMat);
    guard.position.set(0, 0.034, -0.022);
    guard.rotation.x = -0.5;
    karambitPivot.add(guard);

    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.035, -0.025),
      new THREE.Vector3(0, 0.098, -0.082),
      new THREE.Vector3(0, 0.108, -0.16),
      new THREE.Vector3(0, 0.055, -0.2),
    ]);
    const claw = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.011, 8, false), chromeMat);
    claw.scale.set(0.35, 1, 1);
    karambitPivot.add(claw);
  } else if (weaponId === 'butterfly') {
    addForearm(false);
    const pivot = new THREE.Group();
    pivot.position.set(0, 0, -0.08);
    weaponPivot.add(pivot);

    butterflyLeftHandle = new THREE.Group();
    const lhMesh = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.135, 0.022), darkSteelMat);
    lhMesh.position.set(-0.011, -0.065, 0);
    butterflyLeftHandle.add(lhMesh);
    const lhLatch = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.016, 0.016), accentBrassMat);
    lhLatch.position.set(-0.011, -0.132, 0);
    butterflyLeftHandle.add(lhLatch);
    pivot.add(butterflyLeftHandle);

    butterflyRightHandle = new THREE.Group();
    const rhMesh = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.135, 0.022), steelMat);
    rhMesh.position.set(0.011, -0.065, 0);
    butterflyRightHandle.add(rhMesh);
    pivot.add(butterflyRightHandle);

    butterflyBlade = new THREE.Group();
    const bMesh = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.15, 0.025), chromeMat);
    bMesh.position.set(0, 0.078, 0);
    butterflyBlade.add(bMesh);
    const bTip = new THREE.Mesh(new THREE.ConeGeometry(0.013, 0.035, 4), chromeMat);
    bTip.position.set(0, 0.17, 0);
    bTip.scale.set(0.28, 1, 0.9);
    butterflyBlade.add(bTip);
    pivot.add(butterflyBlade);
    pivot.rotation.x = -0.85;
  } else if (weaponId === 'c4') {
    addForearm(true);
    const brick = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.075, 0.12),
      new THREE.MeshStandardMaterial({ color: 0x5c5346, roughness: 0.85, metalness: 0.05 })
    );
    brick.position.set(0, -0.02, -0.14);
    brick.rotation.x = 0.45;
    weaponPivot.add(brick);

    const keypad = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.012, 0.07), darkSteelMat);
    keypad.position.set(0.025, 0.024, -0.14);
    keypad.rotation.x = 0.45;
    weaponPivot.add(keypad);

    c4LedMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.045, 0.01, 0.022),
      new THREE.MeshStandardMaterial({
        color: 0xff3b30,
        emissive: 0xff2a1a,
        emissiveIntensity: 1.4,
      })
    );
    c4LedMesh.position.set(-0.035, 0.028, -0.16);
    c4LedMesh.rotation.x = 0.45;
    weaponPivot.add(c4LedMesh);
  } else {
    addForearm(false);
    const nadeColor =
      weaponId === 'flashbang'
        ? 0xd6d9de
        : weaponId === 'smoke'
          ? 0x4b6a48
          : weaponId === 'molotov' || weaponId === 'incendiary'
            ? 0xa85224
            : 0x3b4832;
    const nadeMat = new THREE.MeshStandardMaterial({
      color: nadeColor,
      roughness: weaponId === 'molotov' ? 0.2 : 0.52,
      metalness: weaponId === 'molotov' ? 0.1 : 0.48,
    });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.11, 14), nadeMat);
    body.position.set(0, -0.01, -0.12);
    body.rotation.x = 0.2;
    weaponPivot.add(body);
    const spoon = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.075, 0.008), steelMat);
    spoon.position.set(0.028, 0.005, -0.115);
    spoon.rotation.x = 0.2;
    weaponPivot.add(spoon);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.024, 12), chromeMat);
    cap.position.set(0, 0.05, -0.11);
    weaponPivot.add(cap);
  }

  root.position.set(0.24, -0.22, -0.34);

  return {
    root,
    weaponPivot,
    muzzlePoint,
    ejectionPoint,
    silencerMesh,
    slideMesh,
    magPivot,
    bayonetPivot,
    butterflyLeftHandle,
    butterflyRightHandle,
    butterflyBlade,
    karambitPivot,
    awpBoltPivot,
    c4LedMesh,
  };
}
