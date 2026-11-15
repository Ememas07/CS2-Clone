import * as THREE from 'three';
import type { WeaponId } from './types';

export interface ViewmodelHandle {
  root: THREE.Group;
  weaponPivot: THREE.Group;
  muzzlePoint: THREE.Object3D;
  ejectionPoint: THREE.Object3D;
  silencerMesh: THREE.Object3D | null;
  butterflyLeftHandle?: THREE.Object3D;
  butterflyRightHandle?: THREE.Object3D;
  butterflyBlade?: THREE.Object3D;
  karambitPivot?: THREE.Object3D;
  awpBoltPivot?: THREE.Group;
  c4LedMesh?: THREE.Mesh;
}

export function buildWeaponViewmodel(weaponId: WeaponId): ViewmodelHandle {
  const root = new THREE.Group();
  const weaponPivot = new THREE.Group();
  root.add(weaponPivot);

  // Shared PBR material palette with varied roughness & metalness
  const steelMat = new THREE.MeshStandardMaterial({
    color: 0x3b414a,
    roughness: 0.34,
    metalness: 0.85,
  });
  const darkSteelMat = new THREE.MeshStandardMaterial({
    color: 0x1d2127,
    roughness: 0.42,
    metalness: 0.78,
  });
  const chromeMat = new THREE.MeshStandardMaterial({
    color: 0xc2c8d0,
    roughness: 0.18,
    metalness: 0.94,
  });
  const polymerMat = new THREE.MeshStandardMaterial({
    color: 0x202429,
    roughness: 0.76,
    metalness: 0.08,
  });
  const woodMat = new THREE.MeshStandardMaterial({
    color: 0x7c4622,
    roughness: 0.68,
    metalness: 0.04,
  });
  const oliveMat = new THREE.MeshStandardMaterial({
    color: 0x4b5a3c,
    roughness: 0.72,
    metalness: 0.12,
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
  let butterflyLeftHandle: THREE.Object3D | undefined;
  let butterflyRightHandle: THREE.Object3D | undefined;
  let butterflyBlade: THREE.Object3D | undefined;
  let karambitPivot: THREE.Object3D | undefined;
  let awpBoltPivot: THREE.Group | undefined;
  let c4LedMesh: THREE.Mesh | undefined;

  // First-person forearm & glove framing (bottom-right tactical stance)
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
    // Receiver
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.082, 0.34), darkSteelMat);
    receiver.position.set(0, 0.01, -0.02);
    weaponPivot.add(receiver);
    // Dust cover rib
    const dustCover = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.025, 0.28), steelMat);
    dustCover.position.set(0, 0.056, -0.02);
    weaponPivot.add(dustCover);
    // Wood stock
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.09, 0.26), woodMat);
    stock.position.set(0, -0.015, 0.26);
    stock.rotation.x = 0.09;
    weaponPivot.add(stock);
    // Wood handguard
    const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.072, 0.22), woodMat);
    handguard.position.set(0, 0.012, -0.29);
    weaponPivot.add(handguard);
    // Barrel & gas tube
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.42, 10), darkSteelMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.024, -0.52);
    weaponPivot.add(barrel);
    const gasTube = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.24, 8), steelMat);
    gasTube.rotation.x = Math.PI / 2;
    gasTube.position.set(0, 0.048, -0.32);
    weaponPivot.add(gasTube);
    // Front sight post
    const frontSight = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.038, 0.024), darkSteelMat);
    frontSight.position.set(0, 0.05, -0.66);
    weaponPivot.add(frontSight);
    // Curved AK magazine (2 angled segments)
    const magTop = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.11, 0.07), woodMat);
    magTop.position.set(0, -0.08, -0.1);
    magTop.rotation.x = 0.14;
    weaponPivot.add(magTop);
    const magBot = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.11, 0.068), woodMat);
    magBot.position.set(0, -0.175, -0.13);
    magBot.rotation.x = 0.34;
    weaponPivot.add(magBot);
    // Pistol grip
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.1, 0.048), polymerMat);
    grip.position.set(0, -0.075, 0.09);
    grip.rotation.x = -0.28;
    weaponPivot.add(grip);
    muzzlePoint.position.set(0, 0.024, -0.74);
  } else if (weaponId === 'm4a1s') {
    addForearm(true);
    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.078, 0.32), darkSteelMat);
    upper.position.set(0, 0.015, -0.02);
    weaponPivot.add(upper);
    // Picatinny rail & iron sight
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.018, 0.34), steelMat);
    rail.position.set(0, 0.062, -0.04);
    weaponPivot.add(rail);
    const carryHandle = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.035, 0.14), darkSteelMat);
    carryHandle.position.set(0, 0.082, 0.02);
    weaponPivot.add(carryHandle);
    // Stock
    const bufferTube = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.24, 10), steelMat);
    bufferTube.rotation.x = Math.PI / 2;
    bufferTube.position.set(0, 0.015, 0.24);
    weaponPivot.add(bufferTube);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.1, 0.18), polymerMat);
    stock.position.set(0, -0.01, 0.28);
    weaponPivot.add(stock);
    // Shroud handguard
    const shroud = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.028, 0.24, 10), polymerMat);
    shroud.rotation.x = Math.PI / 2;
    shroud.position.set(0, 0.02, -0.28);
    weaponPivot.add(shroud);
    // Barrel
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.22, 10), steelMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.02, -0.46);
    weaponPivot.add(barrel);
    // Detachable Suppressor
    const sup = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.24, 12), darkSteelMat);
    sup.rotation.x = Math.PI / 2;
    sup.position.set(0, 0.02, -0.65);
    weaponPivot.add(sup);
    silencerMesh = sup;
    // Straight 20-round mag
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.14, 0.062), steelMat);
    mag.position.set(0, -0.09, -0.1);
    mag.rotation.x = 0.08;
    weaponPivot.add(mag);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.095, 0.046), polymerMat);
    grip.position.set(0, -0.07, 0.08);
    grip.rotation.x = -0.26;
    weaponPivot.add(grip);
    muzzlePoint.position.set(0, 0.02, -0.78);
  } else if (weaponId === 'awp') {
    addForearm(true);
    // Olive polymer chassis
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.075, 0.56), oliveMat);
    chassis.position.set(0, 0.0, -0.08);
    weaponPivot.add(chassis);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.1, 0.26), oliveMat);
    stock.position.set(0, -0.015, 0.27);
    weaponPivot.add(stock);
    // Heavy fluted barrel & muzzle brake
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.018, 0.58, 12), darkSteelMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.025, -0.62);
    weaponPivot.add(barrel);
    const brake = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.032, 0.07), steelMat);
    brake.position.set(0, 0.025, -0.92);
    weaponPivot.add(brake);
    // Scope assembly
    const scopeTube = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.32, 12), darkSteelMat);
    scopeTube.rotation.x = Math.PI / 2;
    scopeTube.position.set(0, 0.082, -0.08);
    weaponPivot.add(scopeTube);
    const scopeBell = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.022, 0.09, 12), darkSteelMat);
    scopeBell.rotation.x = Math.PI / 2;
    scopeBell.position.set(0, 0.082, -0.26);
    weaponPivot.add(scopeBell);
    // Articulated Bolt assembly (lift + pull back + push + lock)
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
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.085, 0.095), polymerMat);
    mag.position.set(0, -0.065, -0.1);
    weaponPivot.add(mag);
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
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.14, 10), steelMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.02, -0.24);
    weaponPivot.add(barrel);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.11, 0.052), polymerMat);
    grip.position.set(0, -0.075, 0.01);
    grip.rotation.x = -0.12;
    weaponPivot.add(grip);
    const extMag = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.16, 0.04), steelMat);
    extMag.position.set(0, -0.13, isMac ? 0.01 : -0.12);
    extMag.rotation.x = isMac ? -0.12 : 0.1;
    weaponPivot.add(extMag);
    if (!isMac) {
      const topRail = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.016, 0.28), steelMat);
      topRail.position.set(0, 0.064, -0.06);
      weaponPivot.add(topRail);
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

    const slide = new THREE.Mesh(
      new THREE.BoxGeometry(0.036, 0.034, isDeagle ? 0.25 : 0.2),
      slideMat
    );
    slide.position.set(0, 0.03, -0.04);
    weaponPivot.add(slide);

    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.105, 0.052), frameMat);
    grip.position.set(0, -0.055, 0.03);
    grip.rotation.x = -0.24;
    weaponPivot.add(grip);

    if (isTec) {
      const tecMag = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.15, 0.038), steelMat);
      tecMag.position.set(0, -0.08, -0.09);
      tecMag.rotation.x = 0.08;
      weaponPivot.add(tecMag);
    }

    if (isUsp) {
      const sup = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.18, 12), darkSteelMat);
      sup.rotation.x = Math.PI / 2;
      sup.position.set(0, 0.026, -0.23);
      weaponPivot.add(sup);
      silencerMesh = sup;
      muzzlePoint.position.set(0, 0.026, -0.33);
    } else {
      muzzlePoint.position.set(0, 0.026, -0.18);
    }
  } else if (weaponId === 'bayonet') {
    addForearm(false);
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.018, 0.13, 10), oliveMat);
    grip.position.set(0, -0.02, -0.05);
    grip.rotation.x = -0.9;
    weaponPivot.add(grip);

    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.014, 0.024), darkSteelMat);
    guard.position.set(0, 0.025, -0.11);
    guard.rotation.x = -0.9;
    weaponPivot.add(guard);

    const bladeShape = new THREE.Shape();
    bladeShape.moveTo(0, 0);
    bladeShape.lineTo(0.028, 0);
    bladeShape.lineTo(0.022, 0.17);
    bladeShape.lineTo(0, 0.21);
    bladeShape.lineTo(0, 0);
    const bladeGeo = new THREE.ExtrudeGeometry(bladeShape, {
      depth: 0.005,
      bevelEnabled: true,
      bevelThickness: 0.001,
      bevelSize: 0.001,
      bevelSegments: 1,
    });
    const blade = new THREE.Mesh(bladeGeo, chromeMat);
    blade.position.set(-0.002, 0.03, -0.12);
    blade.rotation.set(-0.9, Math.PI / 2, 0);
    weaponPivot.add(blade);
  } else if (weaponId === 'karambit') {
    addForearm(false);
    karambitPivot = new THREE.Group();
    karambitPivot.position.set(0, 0, -0.06);
    weaponPivot.add(karambitPivot);

    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.005, 8, 16), darkSteelMat);
    ring.position.set(0, -0.06, 0.04);
    ring.rotation.y = Math.PI / 2;
    karambitPivot.add(ring);

    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.11, 0.032), polymerMat);
    handle.position.set(0, -0.01, 0);
    handle.rotation.x = -0.5;
    karambitPivot.add(handle);

    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.035, -0.025),
      new THREE.Vector3(0, 0.095, -0.08),
      new THREE.Vector3(0, 0.105, -0.155),
      new THREE.Vector3(0, 0.055, -0.195),
    ]);
    const claw = new THREE.Mesh(new THREE.TubeGeometry(curve, 14, 0.011, 6, false), chromeMat);
    claw.scale.set(0.35, 1, 1);
    karambitPivot.add(claw);
  } else if (weaponId === 'butterfly') {
    addForearm(false);
    const pivot = new THREE.Group();
    pivot.position.set(0, 0, -0.08);
    weaponPivot.add(pivot);

    butterflyLeftHandle = new THREE.Group();
    const lhMesh = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.13, 0.022), darkSteelMat);
    lhMesh.position.set(-0.01, -0.065, 0);
    butterflyLeftHandle.add(lhMesh);
    pivot.add(butterflyLeftHandle);

    butterflyRightHandle = new THREE.Group();
    const rhMesh = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.13, 0.022), steelMat);
    rhMesh.position.set(0.01, -0.065, 0);
    butterflyRightHandle.add(rhMesh);
    pivot.add(butterflyRightHandle);

    butterflyBlade = new THREE.Group();
    const bMesh = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.145, 0.024), chromeMat);
    bMesh.position.set(0, 0.075, 0);
    butterflyBlade.add(bMesh);
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
    // Grenade viewmodels
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
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.11, 12), nadeMat);
    body.position.set(0, -0.01, -0.12);
    body.rotation.x = 0.2;
    weaponPivot.add(body);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.024, 10), steelMat);
    cap.position.set(0, 0.05, -0.11);
    weaponPivot.add(cap);
  }

  // Base resting offset in camera space
  root.position.set(0.24, -0.22, -0.34);

  return {
    root,
    weaponPivot,
    muzzlePoint,
    ejectionPoint,
    silencerMesh,
    butterflyLeftHandle,
    butterflyRightHandle,
    butterflyBlade,
    karambitPivot,
    awpBoltPivot,
    c4LedMesh,
  };
}
