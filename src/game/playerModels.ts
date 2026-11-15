import * as THREE from 'three';
import type { HitboxZone, Team } from './types';

export interface OperatorMeshHandle {
  root: THREE.Group;
  headGroup: THREE.Group;
  bodyGroup: THREE.Group;
  leftLeg: THREE.Mesh;
  rightLeg: THREE.Mesh;
  weaponAnchor: THREE.Group;
  hitboxes: THREE.Mesh[];
  armorMeshes: THREE.Mesh[];
  helmetMesh: THREE.Mesh;
  c4BackMesh: THREE.Mesh;
  shadowDisc: THREE.Mesh;
  xrayMeshes: THREE.Mesh[];
}

export interface HitboxUserData {
  actorId: string;
  zone: HitboxZone;
}

function makeHitboxMaterial(color: number, roughness: number, metalness: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
  });
}

export function createOperatorModel(actorId: string, team: Team): OperatorMeshHandle {
  const root = new THREE.Group();
  const isAtk = team === 'attackers';

  const clothMat = makeHitboxMaterial(isAtk ? 0x9b8262 : 0x35475e, 0.86, 0.05);
  const rigMat = makeHitboxMaterial(isAtk ? 0x8f3428 : 0x254e7a, 0.72, 0.14);
  const skinMat = makeHitboxMaterial(0xd3a787, 0.68, 0.02);
  const bootMat = makeHitboxMaterial(0x1f2124, 0.78, 0.1);
  const helmetMat = makeHitboxMaterial(isAtk ? 0x5c4738 : 0x222e3d, 0.45, 0.35);
  const visorMat = makeHitboxMaterial(0x182028, 0.18, 0.85);
  const xrayMat = new THREE.MeshBasicMaterial({
    color: isAtk ? 0xf59e0b : 0x38bdf8,
    transparent: true,
    opacity: 0.45,
    depthTest: true,
    depthFunc: THREE.GreaterDepth,
    depthWrite: false,
  });

  const hitboxes: THREE.Mesh[] = [];
  const xrayMeshes: THREE.Mesh[] = [];
  const tagMesh = (mesh: THREE.Mesh, zone: HitboxZone) => {
    mesh.userData = { actorId, zone } satisfies HitboxUserData;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    hitboxes.push(mesh);
    return mesh;
  };
  const addXrayClone = (parent: THREE.Object3D, source: THREE.Mesh) => {
    const xMesh = new THREE.Mesh(source.geometry, xrayMat);
    xMesh.position.copy(source.position);
    xMesh.rotation.copy(source.rotation);
    xMesh.scale.setScalar(1.04);
    xMesh.renderOrder = 999;
    xMesh.visible = false;
    parent.add(xMesh);
    xrayMeshes.push(xMesh);
    return xMesh;
  };

  // Grounded radial contact shadow disc
  const shadowDisc = new THREE.Mesh(
    new THREE.CircleGeometry(0.45, 16),
    new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
    })
  );
  shadowDisc.rotation.x = -Math.PI / 2;
  shadowDisc.position.y = 0.015;
  root.add(shadowDisc);

  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  // Legs (Limb hitbox)
  const leftLeg = tagMesh(new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.76, 0.2), clothMat), 'limb');
  leftLeg.position.set(-0.12, 0.42, 0);
  bodyGroup.add(leftLeg);
  addXrayClone(bodyGroup, leftLeg);

  const rightLeg = tagMesh(new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.76, 0.2), clothMat), 'limb');
  rightLeg.position.set(0.12, 0.42, 0);
  bodyGroup.add(rightLeg);
  addXrayClone(bodyGroup, rightLeg);

  // Boots
  const lBoot = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.14, 0.26), bootMat);
  lBoot.position.set(0, -0.33, -0.02);
  leftLeg.add(lBoot);

  const rBoot = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.14, 0.26), bootMat);
  rBoot.position.set(0, -0.33, -0.02);
  rightLeg.add(rBoot);

  // Torso / Chest-Stomach Hitbox
  const torso = tagMesh(new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.64, 0.28), clothMat), 'chest');
  torso.position.set(0, 1.12, 0);
  bodyGroup.add(torso);
  addXrayClone(bodyGroup, torso);

  // Tactical Kevlar Plate Carrier
  const vest = tagMesh(new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.44, 0.32), rigMat), 'chest');
  vest.position.set(0, 1.16, 0);
  bodyGroup.add(vest);

  // C4 Bomb pack on back (visible when carrying C4)
  const c4BackMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.24, 0.26, 0.12),
    makeHitboxMaterial(0xc93b2b, 0.6, 0.2)
  );
  c4BackMesh.position.set(0, 1.18, 0.21);
  c4BackMesh.visible = false;
  bodyGroup.add(c4BackMesh);

  // Arms (Limb hitbox)
  const leftArm = tagMesh(new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.52, 0.16), clothMat), 'limb');
  leftArm.position.set(-0.31, 1.18, -0.14);
  leftArm.rotation.x = 0.65;
  leftArm.rotation.z = 0.15;
  bodyGroup.add(leftArm);
  addXrayClone(bodyGroup, leftArm);

  const rightArm = tagMesh(new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.52, 0.16), clothMat), 'limb');
  rightArm.position.set(0.31, 1.18, -0.14);
  rightArm.rotation.x = 0.65;
  rightArm.rotation.z = -0.15;
  bodyGroup.add(rightArm);
  addXrayClone(bodyGroup, rightArm);

  // Head & Helmet Group (Head hitbox)
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 1.62, 0);
  bodyGroup.add(headGroup);

  const head = tagMesh(new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.27, 0.25), skinMat), 'head');
  headGroup.add(head);
  addXrayClone(headGroup, head);

  const helmetMesh = tagMesh(new THREE.Mesh(new THREE.BoxGeometry(0.29, 0.17, 0.29), helmetMat), 'head');
  helmetMesh.position.set(0, 0.08, 0);
  headGroup.add(helmetMesh);

  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.07, 0.05), visorMat);
  visor.position.set(0, 0.03, -0.14);
  headGroup.add(visor);

  // Third-person weapon silhouette in hand
  const weaponAnchor = new THREE.Group();
  weaponAnchor.position.set(0.2, 1.12, -0.34);
  bodyGroup.add(weaponAnchor);

  const gunBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 0.09, 0.62),
    makeHitboxMaterial(0x262a30, 0.4, 0.8)
  );
  gunBody.castShadow = true;
  weaponAnchor.add(gunBody);

  return {
    root,
    headGroup,
    bodyGroup,
    leftLeg,
    rightLeg,
    weaponAnchor,
    hitboxes,
    armorMeshes: [vest],
    helmetMesh,
    c4BackMesh,
    shadowDisc,
    xrayMeshes,
  };
}
