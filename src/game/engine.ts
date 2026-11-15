import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { soundEngine, type VoicelineEvent } from './audio';
import {
  type BotBrainState,
  createBotBrain,
  performBotBuyPhase,
  stepBotBrain,
} from './botAI';
import {
  ACTIVE_MAP,
  getPlantSiteAt,
  getSpawnAnchor,
  hasLineOfSight,
  isInBuyZone,
  MAP_BOUNDS,
  MAP_BOXES,
  raycastMapBoxes,
  resolvePlayerMovement,
  setActiveMap,
  SITE_ZONES,
} from './mapData';
import { networkClient, type RemoteActorSnapshot } from './network';
import {
  createOperatorModel,
  type HitboxUserData,
  type OperatorMeshHandle,
} from './playerModels';
import {
  calculateBulletDamage,
  calculateHeExplosionDamage,
  canBuyWeapon,
  checkMatchWinner,
  clampCash,
  computeRoundEndCash,
  computeWeaponSpread,
  ECONOMY_CONSTANTS,
  getArmorPurchaseCost,
  getKillReward,
  isHalftimeRound,
  ROUND_CONSTANTS,
} from './rules';
import { createProceduralMaterials, type ProceduralMaterialSet } from './textures';
import type {
  ActorState,
  AppScreen,
  ArmorType,
  BombState,
  BotDifficulty,
  GameMode,
  GrenadeId,
  HudSnapshot,
  KillFeedEntry,
  KnifeId,
  MapId,
  PrimaryWeaponId,
  RoomInfo,
  RoundPhase,
  SecondaryWeaponId,
  Team,
  WeaponId,
  WeaponSlot,
} from './types';
import { buildWeaponViewmodel, type ViewmodelHandle } from './viewmodels';
import { createWeaponInstance, getStarterPistol, WEAPONS } from './weapons';

interface ActiveGrenade {
  id: number;
  kind: GrenadeId;
  ownerId: string;
  team: Team;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  fuse: number;
  mesh: THREE.Mesh;
}

interface ActiveSmoke {
  x: number;
  y: number;
  z: number;
  radius: number;
  remaining: number;
  group: THREE.Group;
}

interface ActiveFire {
  x: number;
  y: number;
  z: number;
  radius: number;
  remaining: number;
  ownerId: string;
  ownerTeam: Team;
  tickAccum: number;
  group: THREE.Group;
}

interface DroppedWeapon {
  id: number;
  weaponId: PrimaryWeaponId;
  mag: number;
  reserve: number;
  x: number;
  y: number;
  z: number;
  mesh: THREE.Mesh;
}

interface TracerSlot {
  active: boolean;
  life: number;
  maxLife: number;
  matrix: THREE.Matrix4;
}

export interface MatchConfig {
  mode: GameMode;
  mapId: MapId;
  playerTeam: Team;
  playerName: string;
  difficulty: BotDifficulty;
  maxRounds: number;
  room?: RoomInfo | null;
  localClientId?: string | null;
}

export class GameEngine {
  private container: HTMLElement;
  private onHudUpdate: (snapshot: HudSnapshot) => void;

  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private isSoftwareGl = false;
  private materials!: ProceduralMaterialSet;

  private frameId = 0;
  private disposed = false;
  private lastTime = performance.now();

  private decalMesh!: THREE.InstancedMesh;
  private decalIndex = 0;
  private readonly maxDecals = 140;

  private tracerMesh!: THREE.InstancedMesh;
  private tracerSlots: TracerSlot[] = [];
  private readonly maxTracers = 48;

  private shellMesh!: THREE.InstancedMesh;
  private shellParticles: Array<{
    active: boolean;
    x: number;
    y: number;
    z: number;
    vx: number;
    vy: number;
    vz: number;
    rx: number;
    ry: number;
    life: number;
  }> = [];
  private readonly maxShells = 40;

  private actorMeshes = new Map<string, OperatorMeshHandle>();
  private remoteInterpolations = new Map<
    string,
    { target: RemoteActorSnapshot; lastSeen: number }
  >();
  private worldBombGroup!: THREE.Group;
  private worldBombLed!: THREE.Mesh;
  private muzzleLight!: THREE.PointLight;
  private muzzleLightTimer = 0;

  private viewmodelRig = new THREE.Group();
  private currentViewmodel: ViewmodelHandle | null = null;
  private currentViewmodelWeaponId: WeaponId | null = null;
  private walkBobPhase = 0;
  private recoilOffsetZ = 0;
  private recoilKickPitch = 0;
  private flinchPitch = 0;
  private recoilBloom = 0;
  private inspectTimer = 0;
  private meleeAnimTimer = 0;
  private reloadTimer = 0;
  private fireCooldown = 0;
  private burstQueue = 0;
  private burstQueueTimer = 0;
  private footstepAccum = 0;

  private screen: AppScreen = 'title';
  private config: MatchConfig = {
    mode: 'bots',
    mapId: 'sandline',
    playerTeam: 'attackers',
    playerName: 'Operator',
    difficulty: 55,
    maxRounds: ROUND_CONSTANTS.DEFAULT_MAX_ROUNDS,
  };
  private mapGroup = new THREE.Group();
  private outerFloorMesh!: THREE.Mesh;
  private arenaFloorMesh!: THREE.Mesh;
  private mesaMeshes: THREE.Mesh[] = [];
  private previousSlot: WeaponSlot = 2;
  private expectingUnlock = false;
  private onEscapePause?: () => void;
  private spectateTargetId: string | null = null;
  private isHostAuthority = true;
  private actors: ActorState[] = [];
  private botBrains = new Map<string, BotBrainState>();
  private localActorId = 'local';

  private roundNumber = 1;
  private attackerScore = 0;
  private defenderScore = 0;
  private attackerLossStreak = 0;
  private defenderLossStreak = 0;
  private phase: RoundPhase = 'buy';
  private phaseTimeRemaining = ROUND_CONSTANTS.BUY_PHASE_SECONDS;
  private roundBanner: string | null = null;
  private roundBannerTimer = 0;

  private bomb: BombState = {
    status: 'carried',
    carrierId: null,
    site: null,
    x: 0,
    y: 0,
    z: 0,
    timerRemaining: ROUND_CONSTANTS.C4_DETONATION_SECONDS,
    plantProgress: 0,
    defuseProgress: 0,
    defuserId: null,
  };
  private bombBeepAccum = 0;

  private activeGrenades: ActiveGrenade[] = [];
  private activeSmokes: ActiveSmoke[] = [];
  private activeFires: ActiveFire[] = [];
  private droppedWeapons: DroppedWeapon[] = [];
  private nextEntityUid = 1;

  private killFeed: KillFeedEntry[] = [];
  private nextKillId = 1;

  private scopeZoom: 0 | 1 | 2 = 0;
  private hitmarker: 'none' | 'body' | 'head' = 'none';
  private hitmarkerTimer = 0;
  private damageFlash = 0;
  private keys = new Set<string>();
  private mouseDownLeft = false;
  private pointerLocked = false;
  private grounded = true;
  private hudEmitAccum = 0;
  private netSyncAccum = 0;
  private roundSyncAccum = 0;

  private readonly _raycaster = new THREE.Raycaster();
  private readonly _vec3A = new THREE.Vector3();
  private readonly _vec3B = new THREE.Vector3();
  private readonly _vec3C = new THREE.Vector3();
  private readonly _quatA = new THREE.Quaternion();
  private readonly _mat4A = new THREE.Matrix4();
  private readonly _scaleVec = new THREE.Vector3();
  private readonly _zAxis = new THREE.Vector3(0, 0, 1);

  constructor(container: HTMLElement, onHudUpdate: (snapshot: HudSnapshot) => void) {
    this.container = container;
    this.onHudUpdate = onHudUpdate;
    this.initThree();
    this.buildStaticMap();
    this.loadMap(this.config.mapId);
    this.bindEvents();
    this.setupNetworkListeners();
    this.emitHud(true);
    this.startLoop();
  }

  private initThree(): void {
    this.isSoftwareGl = (() => {
      try {
        const probe = document.createElement('canvas').getContext('webgl2');
        if (!probe) return true;
        const ext = probe.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : probe.RENDERER;
        const gpu = String(probe.getParameter(param));
        probe.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return true;
      }
    })();

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2)
    );
    this.renderer.setSize(this.container.clientWidth || 1280, this.container.clientHeight || 720);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.innerHTML = '';
    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xd5e6f5);
    this.scene.fog = new THREE.Fog(0xdfd3bf, 48, 165);

    const aspect =
      (this.container.clientWidth || 1280) / Math.max(1, this.container.clientHeight || 720);
    this.camera = new THREE.PerspectiveCamera(78, aspect, 0.05, 260);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    this.camera.add(this.viewmodelRig);
    this.muzzleLight = new THREE.PointLight(0xffb454, 0, 5, 2);
    this.muzzleLight.position.set(0.18, -0.1, -0.75);
    this.camera.add(this.muzzleLight);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    const sky = new Sky();
    sky.scale.setScalar(450);
    this.scene.add(sky);
    const skyUniforms = sky.material.uniforms;
    skyUniforms.turbidity.value = 4.2;
    skyUniforms.rayleigh.value = 1.6;
    skyUniforms.mieCoefficient.value = 0.005;
    skyUniforms.mieDirectionalG.value = 0.82;

    const sunDir = new THREE.Vector3();
    const phi = THREE.MathUtils.degToRad(90 - 42);
    const theta = THREE.MathUtils.degToRad(142);
    sunDir.setFromSphericalCoords(1, phi, theta);
    skyUniforms.sunPosition.value.copy(sunDir);

    const sun = new THREE.DirectionalLight(0xfff1d6, 2.3);
    sun.position.copy(sunDir).multiplyScalar(85);
    sun.castShadow = !this.isSoftwareGl;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far = 180;
    sun.shadow.camera.left = -58;
    sun.shadow.camera.right = 58;
    sun.shadow.camera.top = 58;
    sun.shadow.camera.bottom = -58;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.02;
    this.scene.add(sun);

    const hemi = new THREE.HemisphereLight(0xaad2f5, 0x9b8262, 0.85);
    this.scene.add(hemi);

    this.materials = createProceduralMaterials(
      this.renderer.capabilities.getMaxAnisotropy()
    );

    const decalGeo = new THREE.PlaneGeometry(0.14, 0.14);
    const decalMat = new THREE.MeshBasicMaterial({
      color: 0x1a1816,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.decalMesh = new THREE.InstancedMesh(decalGeo, decalMat, this.maxDecals);
    this.decalMesh.frustumCulled = false;
    this._mat4A.makeScale(0, 0, 0);
    for (let i = 0; i < this.maxDecals; i++) {
      this.decalMesh.setMatrixAt(i, this._mat4A);
    }
    this.decalMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(this.decalMesh);

    const tracerGeo = new THREE.BoxGeometry(0.028, 0.028, 1);
    const tracerMat = new THREE.MeshBasicMaterial({
      color: 0xffdf91,
      transparent: true,
      opacity: 0.88,
    });
    this.tracerMesh = new THREE.InstancedMesh(tracerGeo, tracerMat, this.maxTracers);
    this.tracerMesh.frustumCulled = false;
    for (let i = 0; i < this.maxTracers; i++) {
      this.tracerSlots.push({
        active: false,
        life: 0,
        maxLife: 0.08,
        matrix: new THREE.Matrix4().makeScale(0, 0, 0),
      });
      this.tracerMesh.setMatrixAt(i, this.tracerSlots[i].matrix);
    }
    this.tracerMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(this.tracerMesh);

    const shellGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.032, 6);
    const shellMat = new THREE.MeshStandardMaterial({
      color: 0xd4a948,
      roughness: 0.25,
      metalness: 0.9,
    });
    this.shellMesh = new THREE.InstancedMesh(shellGeo, shellMat, this.maxShells);
    this.shellMesh.frustumCulled = false;
    for (let i = 0; i < this.maxShells; i++) {
      this.shellParticles.push({
        active: false,
        x: 0,
        y: -20,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        rx: 0,
        ry: 0,
        life: 0,
      });
      this.shellMesh.setMatrixAt(i, this._mat4A);
    }
    this.shellMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(this.shellMesh);

    this.worldBombGroup = new THREE.Group();
    const bombBrick = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.12, 0.2),
      new THREE.MeshStandardMaterial({ color: 0x564e42, roughness: 0.85, metalness: 0.05 })
    );
    bombBrick.position.y = 0.06;
    bombBrick.castShadow = true;
    this.worldBombGroup.add(bombBrick);
    this.worldBombLed = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.02, 0.04),
      new THREE.MeshBasicMaterial({ color: 0xff2a1a })
    );
    this.worldBombLed.position.set(0, 0.13, 0);
    this.worldBombGroup.add(this.worldBombLed);
    this.worldBombGroup.visible = false;
    this.scene.add(this.worldBombGroup);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }
  }

  private buildStaticMap(): void {
    this.outerFloorMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(340, 340),
      new THREE.MeshStandardMaterial({ color: 0xcab490, roughness: 0.94, metalness: 0 })
    );
    this.outerFloorMesh.rotation.x = -Math.PI / 2;
    this.outerFloorMesh.position.y = -0.04;
    this.outerFloorMesh.receiveShadow = true;
    this.scene.add(this.outerFloorMesh);

    this.arenaFloorMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(96, 108),
      this.materials.floor
    );
    this.arenaFloorMesh.rotation.x = -Math.PI / 2;
    this.arenaFloorMesh.position.y = 0;
    this.arenaFloorMesh.receiveShadow = true;
    this.scene.add(this.arenaFloorMesh);

    const mesaMat = new THREE.MeshStandardMaterial({
      color: 0xb59870,
      roughness: 0.92,
      metalness: 0.02,
    });
    const mesaPositions: Array<[number, number, number, number, number]> = [
      [0, -82, 190, 22, 28],
      [0, 82, 190, 20, 28],
      [-76, 0, 28, 24, 180],
      [76, 0, 28, 26, 180],
    ];
    for (const [x, z, w, h, d] of mesaPositions) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mesaMat);
      m.position.set(x, h * 0.5 - 0.1, z);
      this.scene.add(m);
      this.mesaMeshes.push(m);
    }

    this.scene.add(this.mapGroup);
  }

  public loadMap(mapId: MapId): void {
    setActiveMap(mapId);
    this.config.mapId = mapId;

    const theme = ACTIVE_MAP.theme;
    this.scene.background = new THREE.Color(theme.skyColor);
    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.color.setHex(theme.fogColor);
    }
    this.materials.floor.color.setHex(theme.floorTint);
    (this.outerFloorMesh.material as THREE.MeshStandardMaterial).color.setHex(
      theme.outerFloorColor
    );
    for (const m of this.mesaMeshes) {
      (m.material as THREE.MeshStandardMaterial).color.setHex(theme.mesaColor);
    }

    const mapW = MAP_BOUNDS.maxX - MAP_BOUNDS.minX;
    const mapD = MAP_BOUNDS.maxZ - MAP_BOUNDS.minZ;
    this.arenaFloorMesh.scale.set(mapW / 96, mapD / 108, 1);

    while (this.mapGroup.children.length > 0) {
      const child = this.mapGroup.children[0];
      this.mapGroup.remove(child);
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
      }
    }

    for (const b of MAP_BOXES) {
      const mat = this.materials[b.material];
      const geo = new THREE.BoxGeometry(b.w, b.h, b.d);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(b.x, b.y + b.h * 0.5, b.z);
      mesh.castShadow = !this.isSoftwareGl && b.h >= 1.2;
      mesh.receiveShadow = !this.isSoftwareGl;
      this.mapGroup.add(mesh);

      if (
        (b.material === 'sandstone' || b.material === 'terracotta') &&
        b.h >= 4.0 &&
        b.w < 50 &&
        b.d < 50
      ) {
        const cap = new THREE.Mesh(
          new THREE.BoxGeometry(b.w + 0.18, 0.24, b.d + 0.18),
          this.materials.concrete
        );
        cap.position.set(b.x, b.y + b.h + 0.12, b.z);
        this.mapGroup.add(cap);
      }
    }

    for (const [x, y, z, w, h, d, matKind] of ACTIVE_MAP.archLintels) {
      const lintel = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        this.materials[matKind ?? 'sandstone']
      );
      lintel.position.set(x, y, z);
      lintel.castShadow = !this.isSoftwareGl;
      this.mapGroup.add(lintel);
    }

    const siteA = SITE_ZONES.find((s) => s.site === 'A') ?? SITE_ZONES[0];
    const decalA = new THREE.Mesh(new THREE.PlaneGeometry(11.5, 11.5), this.materials.siteAFloor);
    decalA.rotation.x = -Math.PI / 2;
    decalA.position.set(siteA.x, 0.025, siteA.z);
    this.mapGroup.add(decalA);

    const siteB = SITE_ZONES.find((s) => s.site === 'B') ?? SITE_ZONES[1];
    const decalB = new THREE.Mesh(new THREE.PlaneGeometry(11.5, 11.5), this.materials.siteBFloor);
    decalB.rotation.x = -Math.PI / 2;
    decalB.position.set(siteB.x, 0.025, siteB.z);
    this.mapGroup.add(decalB);

    this.emitHud(true);
  }

  private bindEvents(): void {
    window.addEventListener('resize', this.handleResize);
    window.addEventListener('keydown', this.handleGlobalShortcutBlock, { capture: true });
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleWindowBlur);
    window.addEventListener('beforeunload', this.handleBeforeUnload);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    document.addEventListener('pointerlockchange', this.handlePointerLockChange);
    window.addEventListener('mousemove', this.handleMouseMove);
    window.addEventListener('mousedown', this.handleMouseDown);
    window.addEventListener('mouseup', this.handleMouseUp);
    window.addEventListener('wheel', this.handleWheel, { passive: true });
    window.addEventListener('contextmenu', this.handleContextMenu);
  }

  private unbindEvents(): void {
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('keydown', this.handleGlobalShortcutBlock, { capture: true });
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleWindowBlur);
    window.removeEventListener('beforeunload', this.handleBeforeUnload);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    document.removeEventListener('pointerlockchange', this.handlePointerLockChange);
    window.removeEventListener('mousemove', this.handleMouseMove);
    window.removeEventListener('mousedown', this.handleMouseDown);
    window.removeEventListener('mouseup', this.handleMouseUp);
    window.removeEventListener('wheel', this.handleWheel);
    window.removeEventListener('contextmenu', this.handleContextMenu);
  }

  private handleBeforeUnload = (e: BeforeUnloadEvent): void => {
    if (this.screen === 'playing') {
      e.preventDefault();
      e.returnValue = '';
    }
  };

  private handleGlobalShortcutBlock = (e: KeyboardEvent): void => {
    if (this.screen !== 'playing') return;
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;

    const blockedSingleKeys = new Set([
      'Tab',
      'Space',
      'ArrowUp',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
      'F1',
      'F2',
      'F3',
      'F4',
      'F5',
      'F6',
      'F7',
      'F8',
      'F9',
      'F10',
    ]);

    if (e.ctrlKey || e.metaKey || e.altKey || blockedSingleKeys.has(e.code)) {
      e.preventDefault();
    }
  };

  private handleResize = (): void => {
    const w = this.container.clientWidth || window.innerWidth;
    const h = Math.max(1, this.container.clientHeight || window.innerHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.renderer.render(this.scene, this.camera);
  };

  private handleWindowBlur = (): void => {
    this.keys.clear();
    this.mouseDownLeft = false;
  };

  private handleVisibilityChange = (): void => {
    if (document.hidden) {
      this.keys.clear();
      this.mouseDownLeft = false;
    }
  };

  public setEscapePauseHandler(cb: () => void): void {
    this.onEscapePause = cb;
  }

  private handlePointerLockChange = (): void => {
    const wasLocked = this.pointerLocked;
    this.pointerLocked = document.pointerLockElement === this.renderer.domElement;
    if (wasLocked && !this.pointerLocked) {
      if (this.expectingUnlock) {
        this.expectingUnlock = false;
      } else if (this.screen === 'playing') {
        this.onEscapePause?.();
        return;
      }
    }
    this.emitHud(true);
  };

  private handleContextMenu = (e: MouseEvent): void => {
    if (this.screen === 'playing') {
      e.preventDefault();
    }
  };

  public requestPointerLock(): void {
    if (this.screen !== 'playing') return;
    soundEngine.unlock();
    try {
      this.renderer.domElement.requestPointerLock?.();
    } catch {
      // Ignore in headless environments
    }
  }

  public exitPointerLock(intentional = true): void {
    if (document.pointerLockElement) {
      this.expectingUnlock = intentional;
      document.exitPointerLock?.();
    }
  }

  public async toggleFullscreenLock(): Promise<boolean> {
    try {
      const kb = (
        navigator as Navigator & {
          keyboard?: { lock?: (keys?: string[]) => Promise<void>; unlock?: () => void };
        }
      ).keyboard;

      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        if (kb?.lock) {
          await kb.lock([
            'KeyW',
            'KeyA',
            'KeyS',
            'KeyD',
            'KeyQ',
            'KeyE',
            'KeyR',
            'KeyF',
            'KeyG',
            'KeyB',
            'KeyC',
            'KeyM',
            'Tab',
            'Space',
            'ControlLeft',
            'ControlRight',
            'ShiftLeft',
            'Escape',
          ]);
        }
        return true;
      } else {
        kb?.unlock?.();
        await document.exitFullscreen();
        return false;
      }
    } catch {
      return Boolean(document.fullscreenElement);
    }
  }

  private handleMouseMove = (e: MouseEvent): void => {
    if (this.screen !== 'playing' || !this.pointerLocked) return;
    const local = this.getLocalActor();
    if (!local || !local.alive) return;

    const sens = this.scopeZoom === 2 ? 0.0007 : this.scopeZoom === 1 ? 0.0012 : 0.0022;
    local.yaw -= e.movementX * sens;
    local.pitch = THREE.MathUtils.clamp(
      local.pitch - e.movementY * sens,
      -Math.PI * 0.48,
      Math.PI * 0.48
    );
  };

  private handleMouseDown = (e: MouseEvent): void => {
    if (this.screen !== 'playing') return;
    const target = e.target as HTMLElement | null;
    if (target && target.closest('[data-ui-interactive="true"]')) return;

    soundEngine.unlock();
    if (!this.pointerLocked && target === this.renderer.domElement) {
      this.requestPointerLock();
    }

    const local = this.getLocalActor();
    if (!local) return;
    if (!local.alive) {
      if (e.button === 0) {
        this.cycleSpectateTarget(1);
      } else if (e.button === 2) {
        e.preventDefault();
        this.cycleSpectateTarget(-1);
      }
      return;
    }

    if (e.button === 0) {
      this.mouseDownLeft = true;
      this.tryLocalPrimaryAttack();
    } else if (e.button === 2) {
      this.tryLocalSecondaryAction();
    }
  };

  private handleMouseUp = (e: MouseEvent): void => {
    if (e.button === 0) {
      this.mouseDownLeft = false;
    }
  };

  private handleWheel = (e: WheelEvent): void => {
    if (this.screen !== 'playing') return;
    const local = this.getLocalActor();
    if (!local || !local.alive) return;
    const available = this.getAvailableSlots(local);
    if (available.length <= 1) return;
    const idx = available.indexOf(local.activeSlot);
    const dir = e.deltaY > 0 ? 1 : -1;
    const nextIdx = (idx + dir + available.length) % available.length;
    this.switchSlot(local, available[nextIdx]);
  };

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (this.screen !== 'playing') return;
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;

    const code = e.code;
    const isFresh = !this.keys.has(code);
    this.keys.add(code);

    const local = this.getLocalActor();
    if (!local) return;

    if (isFresh) {
      if (!local.alive) {
        if (code === 'KeyE') {
          this.takeOverSpectatedBot();
        } else if (code === 'Space' || code === 'ArrowRight') {
          this.cycleSpectateTarget(1);
        } else if (code === 'ArrowLeft') {
          this.cycleSpectateTarget(-1);
        }
        return;
      }

      if (code === 'Digit1' && local.primary) this.switchSlot(local, 1);
      else if (code === 'Digit2' && local.secondary) this.switchSlot(local, 2);
      else if (code === 'Digit3') this.switchSlot(local, 3);
      else if (code === 'Digit4' && local.grenades.length > 0) {
        if (local.activeSlot === 4 && local.grenades.length > 1) {
          const first = local.grenades.shift()!;
          local.grenades.push(first);
        }
        this.switchSlot(local, 4);
      } else if (code === 'Digit5' && local.hasC4) this.switchSlot(local, 5);
      else if (code === 'KeyQ') {
        const available = this.getAvailableSlots(local);
        let targetSlot = this.previousSlot;
        if (targetSlot === local.activeSlot || !available.includes(targetSlot)) {
          targetSlot = available.find((s) => s !== local.activeSlot) ?? local.activeSlot;
        }
        if (targetSlot !== local.activeSlot) {
          this.switchSlot(local, targetSlot);
        }
      } else if (code === 'KeyR') this.startReload(local);
      else if (code === 'KeyF') {
        this.inspectTimer = 1.45;
        soundEngine.playUiTick(520);
      } else if (code === 'KeyG') {
        this.dropPrimaryWeapon(local);
      }
    }
  };

  private handleKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  private getAvailableSlots(actor: ActorState): WeaponSlot[] {
    const slots: WeaponSlot[] = [];
    if (actor.primary) slots.push(1);
    if (actor.secondary) slots.push(2);
    slots.push(3);
    if (actor.grenades.length > 0) slots.push(4);
    if (actor.hasC4) slots.push(5);
    return slots;
  }

  public selectSlot(slot: WeaponSlot): void {
    const local = this.getLocalActor();
    if (!local || !local.alive) return;
    this.switchSlot(local, slot);
  }

  private switchSlot(actor: ActorState, slot: WeaponSlot): void {
    if (slot === 1 && !actor.primary) return;
    if (slot === 2 && !actor.secondary) return;
    if (slot === 4 && actor.grenades.length === 0) return;
    if (slot === 5 && !actor.hasC4) return;
    if (actor.isLocal && slot !== actor.activeSlot) {
      this.previousSlot = actor.activeSlot;
    }
    actor.activeSlot = slot;
    this.scopeZoom = 0;
    this.camera.fov = 78;
    this.camera.updateProjectionMatrix();
    this.reloadTimer = 0;
    this.inspectTimer = 0;
    soundEngine.playUiTick(740);
    this.emitHud(true);
  }

  private getActiveWeaponId(actor: ActorState): WeaponId {
    if (actor.activeSlot === 1 && actor.primary) return actor.primary.id;
    if (actor.activeSlot === 2 && actor.secondary) return actor.secondary.id;
    if (actor.activeSlot === 4 && actor.grenades.length > 0) return actor.grenades[0];
    if (actor.activeSlot === 5 && actor.hasC4) return 'c4';
    return actor.knife;
  }

  public startMatch(cfg: MatchConfig): void {
    this.config = cfg;
    this.loadMap(cfg.mapId);
    this.previousSlot = 2;
    this.roundNumber = 1;
    this.attackerScore = 0;
    this.defenderScore = 0;
    this.attackerLossStreak = 0;
    this.defenderLossStreak = 0;
    this.killFeed = [];
    this.clearRoundEntities();
    this.clearActorMeshes();

    this.actors = [];
    this.botBrains.clear();

    if (cfg.mode === 'bots') {
      this.isHostAuthority = true;
      this.localActorId = 'local';
      const enemyTeam: Team = cfg.playerTeam === 'attackers' ? 'defenders' : 'attackers';
      this.actors.push(this.createFreshActor('local', cfg.playerName || 'You', cfg.playerTeam, false, true));
      for (let i = 1; i < 5; i++) {
        const id = `ally_bot_${i}`;
        this.actors.push(this.createFreshActor(id, `Ally-${i}`, cfg.playerTeam, true, false));
        this.botBrains.set(id, createBotBrain(id, i));
      }
      for (let i = 0; i < 5; i++) {
        const id = `enemy_bot_${i}`;
        this.actors.push(this.createFreshActor(id, `Bot-${i + 1}`, enemyTeam, true, false));
        this.botBrains.set(id, createBotBrain(id, i));
      }
    } else {
      const room = cfg.room;
      const myId = cfg.localClientId || networkClient.clientId || 'local';
      this.localActorId = myId;
      this.isHostAuthority = !room || room.hostId === myId;

      const roomPlayers = room?.players ?? [
        { id: myId, name: cfg.playerName || 'You', team: cfg.playerTeam, isHost: true },
      ];
      for (const rp of roomPlayers) {
        this.actors.push(
          this.createFreshActor(rp.id, rp.name, rp.team, false, rp.id === myId)
        );
      }

      if (cfg.mode === 'mixed') {
        const atkPlayers = this.actors.filter((a) => a.team === 'attackers').length;
        const defPlayers = this.actors.filter((a) => a.team === 'defenders').length;
        for (let i = atkPlayers; i < 5; i++) {
          const id = `bot_atk_${i}`;
          this.actors.push(this.createFreshActor(id, `Bot-A${i + 1}`, 'attackers', true, false));
          this.botBrains.set(id, createBotBrain(id, i));
        }
        for (let i = defPlayers; i < 5; i++) {
          const id = `bot_def_${i}`;
          this.actors.push(this.createFreshActor(id, `Bot-D${i + 1}`, 'defenders', true, false));
          this.botBrains.set(id, createBotBrain(id, i));
        }
      }
    }

    for (const actor of this.actors) {
      if (!actor.isLocal) {
        const handle = createOperatorModel(actor.id, actor.team);
        this.scene.add(handle.root);
        this.actorMeshes.set(actor.id, handle);
      }
    }

    this.screen = 'playing';
    document.body.dataset.state = 'playing';
    this.setupRound();
    this.emitHud(true);
  }

  private createFreshActor(
    id: string,
    name: string,
    team: Team,
    isBot: boolean,
    isLocal: boolean
  ): ActorState {
    const starterId = getStarterPistol(team);
    return {
      id,
      name,
      team,
      isBot,
      isLocal,
      alive: true,
      hp: 100,
      armor: 0,
      hasHelmet: false,
      cash: ECONOMY_CONSTANTS.STARTING_CASH,
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
      activeSlot: 2,
      primary: null,
      secondary: createWeaponInstance(starterId),
      knife: 'bayonet',
      grenades: [],
      hasC4: false,
      blindTimer: 0,
      inBuyZone: true,
      hurtFlash: 0,
    };
  }

  private setupRound(): void {
    this.clearRoundEntities();
    this.phase = 'buy';
    this.phaseTimeRemaining = ROUND_CONSTANTS.BUY_PHASE_SECONDS;
    this.roundBanner = `ROUND ${this.roundNumber} · BUY PHASE`;
    this.roundBannerTimer = 3.0;
    this.scopeZoom = 0;
    this.camera.fov = 78;
    this.camera.updateProjectionMatrix();
    this.reloadTimer = 0;
    this.recoilBloom = 0;
    this.flinchPitch = 0;
    this.spectateTargetId = null;

    if (isHalftimeRound(this.roundNumber, this.config.maxRounds)) {
      const prevAtk = this.attackerScore;
      this.attackerScore = this.defenderScore;
      this.defenderScore = prevAtk;
      this.attackerLossStreak = 0;
      this.defenderLossStreak = 0;
      for (const a of this.actors) {
        a.team = a.team === 'attackers' ? 'defenders' : 'attackers';
        a.cash = ECONOMY_CONSTANTS.STARTING_CASH;
        a.armor = 0;
        a.hasHelmet = false;
        a.primary = null;
        a.secondary = createWeaponInstance(getStarterPistol(a.team));
        a.grenades = [];
      }
      this.rebuildActorMeshes();
      this.roundBanner = 'HALFTIME · SIDES SWAPPED ($800)';
      this.roundBannerTimer = 4.0;
    }

    let atkIdx = 0;
    let defIdx = 0;
    let c4Assigned = false;

    for (const actor of this.actors) {
      const slotIdx = actor.team === 'attackers' ? atkIdx++ : defIdx++;
      const spawn = getSpawnAnchor(actor.team, slotIdx);
      actor.x = spawn.x;
      actor.y = spawn.y;
      actor.z = spawn.z;
      actor.vx = 0;
      actor.vy = 0;
      actor.vz = 0;
      actor.yaw = spawn.yaw;
      actor.pitch = 0;
      actor.crouching = false;

      if (!actor.alive) {
        actor.primary = null;
        actor.secondary = createWeaponInstance(getStarterPistol(actor.team));
        actor.grenades = [];
        actor.armor = 0;
        actor.hasHelmet = false;
      } else {
        if (actor.primary) {
          const s = WEAPONS[actor.primary.id];
          actor.primary.mag = s.magSize;
          actor.primary.reserve = s.reserveAmmo;
        }
        if (actor.secondary) {
          const s = WEAPONS[actor.secondary.id];
          actor.secondary.mag = s.magSize;
          actor.secondary.reserve = s.reserveAmmo;
        } else {
          actor.secondary = createWeaponInstance(getStarterPistol(actor.team));
        }
      }

      actor.alive = true;
      actor.hp = 100;
      actor.blindTimer = 0;
      actor.hurtFlash = 0;
      actor.hasC4 = false;
      actor.inBuyZone = true;
      actor.activeSlot = actor.primary ? 1 : 2;

      if (actor.team === 'attackers' && !c4Assigned && (!actor.isBot || atkIdx === 1)) {
        actor.hasC4 = true;
        c4Assigned = true;
      }
    }

    if (!c4Assigned) {
      const firstAtk = this.actors.find((a) => a.team === 'attackers');
      if (firstAtk) firstAtk.hasC4 = true;
    }

    const carrier = this.actors.find((a) => a.hasC4);
    this.bomb = {
      status: 'carried',
      carrierId: carrier?.id ?? null,
      site: null,
      x: carrier?.x ?? 0,
      y: 0,
      z: carrier?.z ?? 0,
      timerRemaining: ROUND_CONSTANTS.C4_DETONATION_SECONDS,
      plantProgress: 0,
      defuseProgress: 0,
      defuserId: null,
    };
    this.worldBombGroup.visible = false;

    if (this.isHostAuthority) {
      let bIdx = 0;
      for (const actor of this.actors) {
        if (actor.isBot) {
          performBotBuyPhase(actor, bIdx++);
          const brain = this.botBrains.get(actor.id);
          if (brain) {
            brain.path = [];
            brain.lastGoalId = '';
            brain.targetSite = Math.random() > 0.5 ? 'A' : 'B';
          }
        }
      }
    }

    this.syncCameraToLocal();
    if (this.roundNumber === 1) {
      soundEngine.preloadVoicelines();
    }
    soundEngine.playVoiceline('round_start');
    this.emitHud(true);
  }

  private rebuildActorMeshes(): void {
    this.clearActorMeshes();
    for (const actor of this.actors) {
      if (!actor.isLocal) {
        const handle = createOperatorModel(actor.id, actor.team);
        this.scene.add(handle.root);
        this.actorMeshes.set(actor.id, handle);
      }
    }
  }

  private clearActorMeshes(): void {
    for (const handle of this.actorMeshes.values()) {
      this.scene.remove(handle.root);
    }
    this.actorMeshes.clear();
  }

  private clearRoundEntities(): void {
    for (const g of this.activeGrenades) this.scene.remove(g.mesh);
    this.activeGrenades = [];
    for (const s of this.activeSmokes) this.scene.remove(s.group);
    this.activeSmokes = [];
    for (const f of this.activeFires) this.scene.remove(f.group);
    this.activeFires = [];
    for (const d of this.droppedWeapons) this.scene.remove(d.mesh);
    this.droppedWeapons = [];
  }

  public setScreen(screen: AppScreen): void {
    this.screen = screen;
    document.body.dataset.state = screen;
    if (screen !== 'playing') {
      this.exitPointerLock(true);
      this.keys.clear();
      this.mouseDownLeft = false;
      const kb = (
        navigator as Navigator & {
          keyboard?: { unlock?: () => void };
        }
      ).keyboard;
      kb?.unlock?.();
    }
    this.emitHud(true);
  }

  public buyWeaponOrItem(itemId: WeaponId | ArmorType): { ok: boolean; reason?: string } {
    const local = this.getLocalActor();
    if (!local) return { ok: false, reason: 'No active player' };
    const isBuy = this.phase === 'buy';

    if (itemId === 'kevlar' || itemId === 'kevlar_helmet') {
      if (!local.alive) return { ok: false, reason: 'Cannot buy while dead' };
      if (!isBuy) return { ok: false, reason: 'Buy phase ended' };
      if (!local.inBuyZone) return { ok: false, reason: 'Outside spawn buy zone' };
      const cost = getArmorPurchaseCost(local, itemId);
      if (cost === null) return { ok: false, reason: 'Armor already equipped' };
      if (local.cash < cost) return { ok: false, reason: 'Insufficient funds' };
      local.cash -= cost;
      local.armor = 100;
      if (itemId === 'kevlar_helmet') local.hasHelmet = true;
      soundEngine.playUiTick(880);
      this.emitHud(true);
      return { ok: true };
    }

    if (itemId === 'none') return { ok: false };

    const check = canBuyWeapon(local, itemId, isBuy);
    if (!check.ok) return check;

    local.cash -= check.cost;
    const spec = WEAPONS[itemId];
    if (spec.category === 'knife') {
      local.knife = itemId as KnifeId;
      local.activeSlot = 3;
    } else if (spec.slot === 1) {
      local.primary = createWeaponInstance(itemId);
      local.activeSlot = 1;
    } else if (spec.slot === 2) {
      local.secondary = createWeaponInstance(itemId);
      local.activeSlot = 2;
    } else if (spec.slot === 4) {
      local.grenades.push(itemId as GrenadeId);
      local.activeSlot = 4;
    }

    soundEngine.playUiTick(920);
    this.emitHud(true);
    return { ok: true };
  }

  public toggleMute(): boolean {
    soundEngine.setMuted(!soundEngine.muted);
    this.emitHud(true);
    return soundEngine.muted;
  }

  private startReload(actor: ActorState): void {
    if (!actor.alive || this.reloadTimer > 0) return;
    const inst = actor.activeSlot === 1 ? actor.primary : actor.activeSlot === 2 ? actor.secondary : null;
    if (!inst) return;
    const spec = WEAPONS[inst.id];
    if (inst.mag >= spec.magSize || inst.reserve <= 0) return;

    this.reloadTimer = spec.reloadTime;
    this.scopeZoom = 0;
    this.camera.fov = 78;
    this.camera.updateProjectionMatrix();
    if (actor.isLocal) soundEngine.playReload();
    this.emitHud(true);
  }

  private finishReload(actor: ActorState): void {
    const inst = actor.activeSlot === 1 ? actor.primary : actor.activeSlot === 2 ? actor.secondary : null;
    if (!inst) return;
    const spec = WEAPONS[inst.id];
    const needed = spec.magSize - inst.mag;
    const take = Math.min(needed, inst.reserve);
    inst.mag += take;
    inst.reserve -= take;
    this.emitHud(true);
  }

  private dropPrimaryWeapon(actor: ActorState): void {
    if (!actor.alive || !actor.primary) return;
    const dropped = actor.primary;
    actor.primary = null;
    actor.activeSlot = 2;
    this.scopeZoom = 0;
    this.camera.fov = 78;
    this.camera.updateProjectionMatrix();

    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.14, 0.72),
      new THREE.MeshStandardMaterial({ color: 0x3b4148, roughness: 0.45, metalness: 0.75 })
    );
    const fx = -Math.sin(actor.yaw);
    const fz = -Math.cos(actor.yaw);
    const px = actor.x + fx * 1.1;
    const pz = actor.z + fz * 1.1;
    mesh.position.set(px, 0.12, pz);
    mesh.rotation.y = actor.yaw;
    this.scene.add(mesh);

    this.droppedWeapons.push({
      id: this.nextEntityUid++,
      weaponId: dropped.id as PrimaryWeaponId,
      mag: dropped.mag,
      reserve: dropped.reserve,
      x: px,
      y: 0.12,
      z: pz,
      mesh,
    });
    this.emitHud(true);
  }

  private tryLocalPrimaryAttack(): void {
    const local = this.getLocalActor();
    if (!local || !local.alive || this.phase === 'buy') return;
    if (this.fireCooldown > 0 || this.reloadTimer > 0) return;

    if (local.activeSlot === 3) {
      this.performKnifeAttack(local, false);
      return;
    }
    if (local.activeSlot === 4 && local.grenades.length > 0) {
      const nadeId = local.grenades.shift()!;
      this.throwGrenade(local, nadeId, false);
      local.activeSlot = local.grenades.length > 0 ? 4 : local.primary ? 1 : 2;
      this.emitHud(true);
      return;
    }
    if (local.activeSlot === 5) return;

    const inst = local.activeSlot === 1 ? local.primary : local.secondary;
    if (!inst) return;
    if (inst.mag <= 0) {
      this.startReload(local);
      return;
    }

    this.fireBulletWeapon(local, inst);
    if (inst.burstMode && inst.id === 'glock18' && inst.mag > 0) {
      this.burstQueue = Math.min(2, inst.mag);
      this.burstQueueTimer = 0.065;
    }
  }

  private tryLocalSecondaryAction(): void {
    const local = this.getLocalActor();
    if (!local || !local.alive) return;

    if (local.activeSlot === 3) {
      if (this.fireCooldown <= 0 && this.phase !== 'buy') {
        this.performKnifeAttack(local, true);
      }
      return;
    }

    if (local.activeSlot === 4 && local.grenades.length > 0 && this.phase !== 'buy') {
      const nadeId = local.grenades.shift()!;
      this.throwGrenade(local, nadeId, true);
      local.activeSlot = local.grenades.length > 0 ? 4 : local.primary ? 1 : 2;
      this.emitHud(true);
      return;
    }

    const inst = local.activeSlot === 1 ? local.primary : local.secondary;
    if (!inst) return;
    const spec = WEAPONS[inst.id];

    if (spec.hasScope) {
      this.scopeZoom = ((this.scopeZoom + 1) % 3) as 0 | 1 | 2;
      this.camera.fov = this.scopeZoom === 2 ? 18 : this.scopeZoom === 1 ? 35 : 78;
      this.camera.updateProjectionMatrix();
      soundEngine.playUiTick(1050);
      this.emitHud(true);
    } else if (spec.hasSilencer) {
      inst.silenced = !inst.silenced;
      soundEngine.playUiTick(600);
      this.emitHud(true);
    } else if (spec.hasBurst) {
      inst.burstMode = !inst.burstMode;
      soundEngine.playUiTick(820);
      this.emitHud(true);
    }
  }

  private fireBulletWeapon(
    actor: ActorState,
    inst: { id: WeaponId; mag: number; reserve: number; silenced?: boolean }
  ): void {
    const spec = WEAPONS[inst.id];
    inst.mag = Math.max(0, inst.mag - 1);
    const interval = 60 / Math.max(30, spec.fireRateRpm);
    if (actor.isLocal) {
      this.fireCooldown = interval;
      this.recoilOffsetZ = 0.085;
      this.recoilKickPitch += spec.recoilKick;
      this.recoilBloom = Math.min(0.065, this.recoilBloom + spec.recoilSpread);
      this.muzzleLight.intensity = inst.silenced ? 1.0 : 4.2;
      this.muzzleLightTimer = 0.04;
      this.spawnShellCasing(actor);
    }

    const eyeY = actor.y + (actor.crouching ? 1.08 : 1.62);
    const horizSpeed = Math.hypot(actor.vx, actor.vz);
    const spread = computeWeaponSpread({
      weaponId: inst.id,
      horizontalSpeed: horizSpeed,
      isCrouching: actor.crouching,
      isAirborne: actor.y > 0.08,
      recoilBloom: actor.isLocal ? this.recoilBloom : 0.004,
      scopeZoom: actor.isLocal ? this.scopeZoom : 0,
    });

    const pitch =
      actor.pitch +
      (actor.isLocal ? this.recoilKickPitch * 0.45 + this.flinchPitch * 0.65 : 0);
    const cosP = Math.cos(pitch);
    let dx = -Math.sin(actor.yaw) * cosP;
    let dy = Math.sin(pitch);
    let dz = -Math.cos(actor.yaw) * cosP;

    dx += (Math.random() - 0.5) * spread * 2;
    dy += (Math.random() - 0.5) * spread * 2;
    dz += (Math.random() - 0.5) * spread * 2;
    const len = Math.hypot(dx, dy, dz) || 1;
    dx /= len;
    dy /= len;
    dz /= len;

    const local = this.getLocalActor();
    const distToLocal = local ? Math.hypot(actor.x - local.x, actor.z - local.z) : 0;
    soundEngine.playGunshot(inst.id, Boolean(inst.silenced), actor.isLocal ? 0 : distToLocal);

    if (actor.isLocal && this.config.mode !== 'bots') {
      networkClient.send({
        type: 'shoot',
        payload: {
          ox: actor.x,
          oy: eyeY,
          oz: actor.z,
          dx,
          dy,
          dz,
          weaponId: inst.id,
          silenced: Boolean(inst.silenced),
        },
      });
    }

    this.resolveBallisticRay(actor, actor.x, eyeY, actor.z, dx, dy, dz, inst.id);

    if (actor.isLocal && inst.id === 'awp' && this.scopeZoom > 0) {
      this.scopeZoom = 0;
      this.camera.fov = 78;
      this.camera.updateProjectionMatrix();
    }
  }

  private resolveBallisticRay(
    shooter: ActorState,
    ox: number,
    oy: number,
    oz: number,
    dx: number,
    dy: number,
    dz: number,
    weaponId: WeaponId
  ): void {
    const maxDist = 140;
    const wallHit = raycastMapBoxes(ox, oy, oz, dx, dy, dz, maxDist);
    let wallDist = wallHit ? wallHit.distance : maxDist;
    let wallbangFactor = 1.0;
    let isWallbang = false;

    if (wallHit && wallHit.box.wallbangable) {
      const exitOriginX = wallHit.hx + dx * 0.65;
      const exitOriginY = wallHit.hy + dy * 0.65;
      const exitOriginZ = wallHit.hz + dz * 0.65;
      const secondWall = raycastMapBoxes(exitOriginX, exitOriginY, exitOriginZ, dx, dy, dz, maxDist);
      wallDist = secondWall ? wallHit.distance + 0.65 + secondWall.distance : maxDist;
      wallbangFactor = wallHit.box.penetrationFactor;
      isWallbang = true;
    }

    if (wallHit) {
      this.spawnDecal(
        wallHit.hx + wallHit.nx * 0.015,
        wallHit.hy + wallHit.ny * 0.015,
        wallHit.hz + wallHit.nz * 0.015,
        wallHit.nx,
        wallHit.ny,
        wallHit.nz
      );
    }

    const hitboxMeshes: THREE.Mesh[] = [];
    for (const a of this.actors) {
      if (!a.alive || a.id === shooter.id || a.team === shooter.team) continue;
      const handle = this.actorMeshes.get(a.id);
      if (handle) {
        hitboxMeshes.push(...handle.hitboxes);
      } else if (a.isLocal) {
        const hitZone = this.raycastLocalPlayerSphere(ox, oy, oz, dx, dy, dz, a, wallDist);
        if (hitZone) {
          const dist = Math.hypot(a.x - ox, a.z - oz);
          const result = calculateBulletDamage({
            weaponId,
            zone: hitZone,
            distanceMeters: dist,
            targetArmor: a.armor,
            targetHasHelmet: a.hasHelmet,
            wallbangMultiplier: dist > (wallHit?.distance ?? maxDist) ? wallbangFactor : 1.0,
          });
          this.applyDamage(
            shooter,
            a,
            result.hpDamage,
            result.armorDamage,
            weaponId,
            hitZone === 'head',
            isWallbang && dist > (wallHit?.distance ?? maxDist),
            result.aimpunch
          );
          this.spawnTracer(ox, oy - 0.08, oz, a.x, a.y + 1.35, a.z);
          return;
        }
      }
    }

    let finalEndDist = wallHit ? wallHit.distance : 95;
    if (hitboxMeshes.length > 0) {
      this._vec3A.set(ox, oy, oz);
      this._vec3B.set(dx, dy, dz);
      this._raycaster.set(this._vec3A, this._vec3B);
      this._raycaster.far = wallDist;
      const hits = this._raycaster.intersectObjects(hitboxMeshes, false);
      if (hits.length > 0) {
        const first = hits[0];
        const ud = first.object.userData as HitboxUserData;
        const target = this.actors.find((a) => a.id === ud.actorId);
        if (target && target.alive) {
          finalEndDist = first.distance;
          const throughWall = Boolean(wallHit && first.distance > wallHit.distance);
          const result = calculateBulletDamage({
            weaponId,
            zone: ud.zone,
            distanceMeters: first.distance,
            targetArmor: target.armor,
            targetHasHelmet: target.hasHelmet,
            wallbangMultiplier: throughWall ? wallbangFactor : 1.0,
          });

          if (shooter.isLocal) {
            this.hitmarker = ud.zone === 'head' ? 'head' : 'body';
            this.hitmarkerTimer = 0.22;
            if (ud.zone === 'head') soundEngine.playHeadshotDink(0);
          }

          if (this.config.mode !== 'bots' && !target.isBot && shooter.isLocal) {
            networkClient.send({
              type: 'hit_claim',
              payload: {
                targetId: target.id,
                damage: result.hpDamage,
                armorDamage: result.armorDamage,
                headshot: ud.zone === 'head',
                wallbang: throughWall,
                weaponId,
              },
            });
          }

          this.applyDamage(
            shooter,
            target,
            result.hpDamage,
            result.armorDamage,
            weaponId,
            ud.zone === 'head',
            throughWall,
            result.aimpunch
          );
        }
      }
    }

    this.spawnTracer(
      ox,
      oy - 0.08,
      oz,
      ox + dx * finalEndDist,
      oy + dy * finalEndDist,
      oz + dz * finalEndDist
    );
  }

  private raycastLocalPlayerSphere(
    ox: number,
    oy: number,
    oz: number,
    dx: number,
    dy: number,
    dz: number,
    target: ActorState,
    maxDist: number
  ): 'head' | 'chest' | 'limb' | null {
    const headY = target.y + (target.crouching ? 1.08 : 1.62);
    const chestY = target.y + (target.crouching ? 0.72 : 1.15);

    const checkPoint = (px: number, py: number, pz: number, r: number): boolean => {
      const vx = px - ox;
      const vy = py - oy;
      const vz = pz - oz;
      const proj = vx * dx + vy * dy + vz * dz;
      if (proj < 0 || proj > maxDist) return false;
      const cx = ox + dx * proj - px;
      const cy = oy + dy * proj - py;
      const cz = oz + dz * proj - pz;
      return cx * cx + cy * cy + cz * cz <= r * r;
    };

    if (checkPoint(target.x, headY, target.z, 0.22)) return 'head';
    if (checkPoint(target.x, chestY, target.z, 0.36)) return 'chest';
    if (checkPoint(target.x, target.y + 0.45, target.z, 0.32)) return 'limb';
    return null;
  }

  private performKnifeAttack(actor: ActorState, heavy: boolean): void {
    this.fireCooldown = heavy ? 0.72 : 0.42;
    this.meleeAnimTimer = 0.26;
    soundEngine.playKnifeSlash(heavy);

    const fx = -Math.sin(actor.yaw);
    const fz = -Math.cos(actor.yaw);

    for (const target of this.actors) {
      if (!target.alive || target.team === actor.team) continue;
      const dx = target.x - actor.x;
      const dz = target.z - actor.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 2.35) continue;
      const dot = (dx * fx + dz * fz) / Math.max(0.01, dist);
      if (dot < 0.45) continue;
      const dmg = heavy ? 68 : 40;
      if (actor.isLocal) {
        this.hitmarker = 'body';
        this.hitmarkerTimer = 0.2;
      }
      this.applyDamage(actor, target, dmg, 4, actor.knife, false, false, 0.05);
      break;
    }
  }

  private applyDamage(
    attacker: ActorState | null,
    victim: ActorState,
    hpDamage: number,
    armorDamage: number,
    weaponId: WeaponId,
    headshot: boolean,
    wallbang: boolean,
    aimpunch: number
  ): void {
    if (!victim.alive) return;
    victim.armor = Math.max(0, victim.armor - armorDamage);
    victim.hp = Math.max(0, victim.hp - hpDamage);
    victim.hurtFlash = 1.0;

    if (victim.isLocal) {
      this.damageFlash = Math.min(1, 0.45 + hpDamage * 0.008);
      if (aimpunch > 0) {
        this.flinchPitch = Math.min(0.18, this.flinchPitch + aimpunch);
      }
    }

    if (victim.hp <= 0) {
      victim.alive = false;
      victim.deaths += 1;

      if (this.bomb.status === 'defusing' && this.bomb.defuserId === victim.id) {
        this.bomb.status = 'planted';
        this.bomb.defuserId = null;
        this.bomb.defuseProgress = 0;
      }

      if (victim.isLocal) {
        this.scopeZoom = 0;
        this.camera.fov = 78;
        this.camera.updateProjectionMatrix();
        this.reloadTimer = 0;
        this.burstQueue = 0;
        this.mouseDownLeft = false;
        this.inspectTimer = 0;
        this.meleeAnimTimer = 0;
        this.flinchPitch = 0;
        victim.blindTimer = 0;
      }

      if (attacker && attacker.id !== victim.id) {
        attacker.kills += 1;
        if (headshot) attacker.headshots += 1;
        attacker.cash = clampCash(attacker.cash + getKillReward(weaponId));
      }

      if (victim.hasC4) {
        victim.hasC4 = false;
        this.bomb.status = 'dropped';
        this.bomb.carrierId = null;
        this.bomb.plantProgress = 0;
        this.bomb.x = victim.x;
        this.bomb.y = victim.y;
        this.bomb.z = victim.z;
        this.worldBombGroup.position.set(victim.x, victim.y, victim.z);
        this.worldBombGroup.visible = true;
      }

      this.killFeed.unshift({
        id: this.nextKillId++,
        killerName: attacker?.name ?? 'Environment',
        killerTeam: attacker?.team ?? 'environment',
        victimName: victim.name,
        victimTeam: victim.team,
        weaponName: WEAPONS[weaponId]?.name ?? weaponId,
        headshot,
        wallbang,
        timestamp: performance.now(),
      });
      if (this.killFeed.length > 6) this.killFeed.pop();

      this.checkRoundEndConditions();
    }
    this.emitHud(true);
  }

  private throwGrenade(actor: ActorState, kind: GrenadeId, underhand: boolean): void {
    const eyeY = actor.y + (actor.crouching ? 1.05 : 1.55);
    const cosP = Math.cos(actor.pitch);
    const dx = -Math.sin(actor.yaw) * cosP;
    const dy = Math.sin(actor.pitch);
    const dz = -Math.cos(actor.yaw) * cosP;
    const speed = underhand ? 8.5 : 17.5;

    const color =
      kind === 'flashbang'
        ? 0xe2e8f0
        : kind === 'smoke'
          ? 0x4b6a48
          : kind === 'molotov' || kind === 'incendiary'
            ? 0xea580c
            : 0x3b4832;
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 0.16, 8),
      new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.4 })
    );
    mesh.position.set(actor.x + dx * 0.6, eyeY, actor.z + dz * 0.6);
    this.scene.add(mesh);

    this.activeGrenades.push({
      id: this.nextEntityUid++,
      kind,
      ownerId: actor.id,
      team: actor.team,
      x: mesh.position.x,
      y: mesh.position.y,
      z: mesh.position.z,
      vx: dx * speed,
      vy: dy * speed + (underhand ? 2.5 : 4.2),
      vz: dz * speed,
      fuse: kind === 'flashbang' ? 1.45 : kind === 'he' ? 1.65 : 2.2,
      mesh,
    });

    if (actor.isLocal && this.config.mode !== 'bots') {
      networkClient.send({
        type: 'grenade_event',
        payload: {
          grenadeId: kind,
          ox: mesh.position.x,
          oy: mesh.position.y,
          oz: mesh.position.z,
          vx: dx * speed,
          vy: dy * speed + (underhand ? 2.5 : 4.2),
          vz: dz * speed,
        },
      });
    }
  }

  private stepGrenades(dt: number): void {
    const local = this.getLocalActor();
    for (let i = this.activeGrenades.length - 1; i >= 0; i--) {
      const g = this.activeGrenades[i];
      g.fuse -= dt;
      g.vy -= 18 * dt;

      const nextX = g.x + g.vx * dt;
      const nextY = g.y + g.vy * dt;
      const nextZ = g.z + g.vz * dt;

      const segLen = Math.hypot(nextX - g.x, nextY - g.y, nextZ - g.z);
      if (segLen > 0.001) {
        const hit = raycastMapBoxes(
          g.x,
          g.y,
          g.z,
          (nextX - g.x) / segLen,
          (nextY - g.y) / segLen,
          (nextZ - g.z) / segLen,
          segLen + 0.08
        );
        if (hit) {
          const d = local ? Math.hypot(g.x - local.x, g.z - local.z) : 0;
          soundEngine.playGrenadeBounce(d);
          if (hit.nx !== 0) g.vx *= -0.55;
          if (hit.ny !== 0) g.vy *= -0.45;
          if (hit.nz !== 0) g.vz *= -0.55;
          g.x = hit.hx + hit.nx * 0.1;
          g.y = hit.hy + hit.ny * 0.1;
          g.z = hit.hz + hit.nz * 0.1;
        } else {
          g.x = nextX;
          g.y = nextY;
          g.z = nextZ;
        }
      }

      let floorHit = false;
      if (g.y <= 0.08) {
        g.y = 0.08;
        g.vy = Math.abs(g.vy) * 0.42;
        g.vx *= 0.72;
        g.vz *= 0.72;
        floorHit = true;
        if (Math.abs(g.vy) > 1.2) {
          const d = local ? Math.hypot(g.x - local.x, g.z - local.z) : 0;
          soundEngine.playGrenadeBounce(d);
        }
      }

      g.mesh.position.set(g.x, g.y, g.z);
      g.mesh.rotation.x += dt * 7;

      const shouldDetonate =
        g.fuse <= 0 || ((g.kind === 'molotov' || g.kind === 'incendiary') && floorHit);

      if (shouldDetonate) {
        this.detonateGrenade(g);
        this.scene.remove(g.mesh);
        this.activeGrenades.splice(i, 1);
      }
    }

    for (let i = this.activeSmokes.length - 1; i >= 0; i--) {
      const s = this.activeSmokes[i];
      s.remaining -= dt;
      s.group.rotation.y += dt * 0.18;
      if (s.remaining < 2.0) {
        s.group.scale.setScalar(Math.max(0.05, s.remaining / 2.0));
      }
      if (s.remaining <= 0) {
        this.scene.remove(s.group);
        this.activeSmokes.splice(i, 1);
      }
    }

    for (let i = this.activeFires.length - 1; i >= 0; i--) {
      const f = this.activeFires[i];
      f.remaining -= dt;
      f.tickAccum += dt;
      f.group.rotation.y -= dt * 1.4;
      if (f.tickAccum >= 0.35) {
        f.tickAccum = 0;
        const owner = this.actors.find((a) => a.id === f.ownerId) ?? null;
        for (const a of this.actors) {
          if (!a.alive) continue;
          const dist = Math.hypot(a.x - f.x, a.z - f.z);
          if (dist <= f.radius && a.y < 1.2) {
            this.applyDamage(owner, a, 14, 0, 'molotov', false, false, 0);
          }
        }
      }
      if (f.remaining <= 0) {
        this.scene.remove(f.group);
        this.activeFires.splice(i, 1);
      }
    }
  }

  private detonateGrenade(g: ActiveGrenade): void {
    const local = this.getLocalActor();
    const distLocal = local ? Math.hypot(g.x - local.x, g.z - local.z) : 0;

    if (g.kind === 'flashbang') {
      soundEngine.playExplosion(distLocal * 1.6);
      for (const a of this.actors) {
        if (!a.alive) continue;
        const eyeY = a.y + 1.55;
        const dx = g.x - a.x;
        const dy = g.y - eyeY;
        const dz = g.z - a.z;
        const dist = Math.hypot(dx, dy, dz);
        if (dist > 34) continue;
        if (!hasLineOfSight(a.x, eyeY, a.z, g.x, g.y, g.z, this.activeSmokes)) continue;

        const lookX = -Math.sin(a.yaw) * Math.cos(a.pitch);
        const lookY = Math.sin(a.pitch);
        const lookZ = -Math.cos(a.yaw) * Math.cos(a.pitch);
        const dot = (dx * lookX + dy * lookY + dz * lookZ) / Math.max(0.01, dist);
        if (dot > 0.25) {
          const intensity = THREE.MathUtils.clamp((1 - dist / 34) * (0.45 + dot * 0.55), 0.2, 1.0);
          a.blindTimer = Math.max(a.blindTimer, 3.2 * intensity);
          if (a.isLocal) {
            soundEngine.playFlashbangRing(intensity);
          }
        }
      }
      return;
    }

    if (g.kind === 'he') {
      soundEngine.playExplosion(distLocal);
      const owner = this.actors.find((a) => a.id === g.ownerId) ?? null;
      for (const a of this.actors) {
        if (!a.alive) continue;
        const dist = Math.hypot(a.x - g.x, a.y + 1.0 - g.y, a.z - g.z);
        const { hpDamage, armorDamage } = calculateHeExplosionDamage(dist, a.armor);
        if (hpDamage > 0) {
          this.applyDamage(owner, a, hpDamage, armorDamage, 'he', false, false, 0.06);
        }
      }
      return;
    }

    if (g.kind === 'smoke') {
      soundEngine.playSmokeHiss(distLocal);
      for (let i = this.activeFires.length - 1; i >= 0; i--) {
        const f = this.activeFires[i];
        if (Math.hypot(f.x - g.x, f.z - g.z) <= 5.0) {
          this.scene.remove(f.group);
          this.activeFires.splice(i, 1);
        }
      }

      const group = new THREE.Group();
      group.position.set(g.x, Math.max(1.2, g.y + 1.0), g.z);
      const smokeMat = new THREE.MeshStandardMaterial({
        color: 0xd5dadf,
        roughness: 0.96,
        metalness: 0,
        transparent: true,
        opacity: 0.88,
      });
      const puffOffsets = [
        [0, 0.3, 0, 2.3],
        [1.4, -0.1, 0.8, 1.8],
        [-1.3, 0.1, -0.9, 1.85],
        [0.6, 0.8, -1.2, 1.75],
        [-0.8, -0.2, 1.3, 1.8],
      ];
      for (const [px, py, pz, pr] of puffOffsets) {
        const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(pr, 1), smokeMat);
        puff.position.set(px, py, pz);
        group.add(puff);
      }
      this.scene.add(group);
      this.activeSmokes.push({
        x: group.position.x,
        y: group.position.y,
        z: group.position.z,
        radius: 3.8,
        remaining: 18.0,
        group,
      });
      return;
    }

    if (g.kind === 'molotov' || g.kind === 'incendiary') {
      for (const s of this.activeSmokes) {
        if (Math.hypot(s.x - g.x, s.z - g.z) <= s.radius + 1.2) {
          soundEngine.playSmokeHiss(distLocal);
          return;
        }
      }

      soundEngine.playSmokeHiss(distLocal);
      const group = new THREE.Group();
      group.position.set(g.x, 0.04, g.z);
      const emberRing = new THREE.Mesh(
        new THREE.CircleGeometry(3.6, 18),
        new THREE.MeshBasicMaterial({
          color: 0xf97316,
          transparent: true,
          opacity: 0.62,
          depthWrite: false,
        })
      );
      emberRing.rotation.x = -Math.PI / 2;
      group.add(emberRing);
      const flameMat = new THREE.MeshBasicMaterial({
        color: 0xfacc15,
        transparent: true,
        opacity: 0.78,
      });
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * Math.PI * 2;
        const cone = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.15, 6), flameMat);
        cone.position.set(Math.cos(ang) * 1.8, 0.5, Math.sin(ang) * 1.8);
        group.add(cone);
      }
      this.scene.add(group);
      this.activeFires.push({
        x: g.x,
        y: 0,
        z: g.z,
        radius: 3.6,
        remaining: 7.0,
        ownerId: g.ownerId,
        ownerTeam: g.team,
        tickAccum: 0,
        group,
      });
    }
  }

  private checkRoundEndConditions(): void {
    if (!this.isHostAuthority) return;
    if (this.phase !== 'live' && this.phase !== 'planted') return;

    const atkAlive = this.actors.filter((a) => a.team === 'attackers' && a.alive).length;
    const defAlive = this.actors.filter((a) => a.team === 'defenders' && a.alive).length;

    if (defAlive === 0) {
      this.concludeRound('attackers', 'DEFENDERS ELIMINATED', false);
    } else if (atkAlive === 0 && this.phase !== 'planted') {
      this.concludeRound('defenders', 'ATTACKERS ELIMINATED', false);
    }
  }

  private concludeRound(
    winner: Team,
    reason: string,
    viaBombObjective: boolean
  ): void {
    if (this.phase === 'round_end' || this.phase === 'match_end') return;
    this.phase = 'round_end';
    this.phaseTimeRemaining = ROUND_CONSTANTS.ROUND_END_DELAY_SECONDS;
    this.roundBanner = `${winner === 'attackers' ? 'ATTACKERS' : 'DEFENDERS'} WIN · ${reason}`;
    this.roundBannerTimer = 4.0;

    if (winner === 'attackers') {
      this.attackerScore++;
      this.attackerLossStreak = 0;
      this.defenderLossStreak++;
    } else {
      this.defenderScore++;
      this.defenderLossStreak = 0;
      this.attackerLossStreak++;
    }

    for (const actor of this.actors) {
      const won = actor.team === winner;
      const streak =
        actor.team === 'attackers' ? this.attackerLossStreak : this.defenderLossStreak;
      actor.cash = computeRoundEndCash({
        currentCash: actor.cash,
        won,
        viaBombObjective,
        consecutiveLosses: streak,
      });
    }

    const local = this.getLocalActor();
    if (local) {
      soundEngine.playRoundCue(local.team === winner);
    }

    const matchWinner = checkMatchWinner(
      this.attackerScore,
      this.defenderScore,
      this.config.maxRounds
    );
    if (matchWinner) {
      this.phase = 'match_end';
      this.roundBanner =
        matchWinner === 'draw'
          ? 'MATCH DRAW'
          : `${matchWinner === 'attackers' ? 'ATTACKERS' : 'DEFENDERS'} VICTORY`;
    }

    const voiceEvent: VoicelineEvent =
      matchWinner === 'attackers'
        ? 'match_end_attackers'
        : matchWinner === 'defenders'
          ? 'match_end_defenders'
          : winner === 'attackers'
            ? 'round_end_attackers'
            : 'round_end_defenders';
    soundEngine.playVoiceline(voiceEvent);

    this.broadcastRoundSync();
    this.emitHud(true);
  }

  private spawnDecal(
    x: number,
    y: number,
    z: number,
    nx: number,
    ny: number,
    nz: number
  ): void {
    this._vec3A.set(x, y, z);
    this._vec3B.set(nx, ny, nz);
    this._quatA.setFromUnitVectors(this._zAxis, this._vec3B);
    this._scaleVec.set(1, 1, 1);
    this._mat4A.compose(this._vec3A, this._quatA, this._scaleVec);
    this.decalMesh.setMatrixAt(this.decalIndex, this._mat4A);
    this.decalMesh.instanceMatrix.needsUpdate = true;
    this.decalIndex = (this.decalIndex + 1) % this.maxDecals;
  }

  private spawnTracer(
    x1: number,
    y1: number,
    z1: number,
    x2: number,
    y2: number,
    z2: number
  ): void {
    const slot = this.tracerSlots.find((s) => !s.active) ?? this.tracerSlots[0];
    this._vec3A.set(x1, y1, z1);
    this._vec3B.set(x2, y2, z2);
    const dist = this._vec3A.distanceTo(this._vec3B);
    if (dist < 0.2) return;

    this._vec3C.copy(this._vec3A).lerp(this._vec3B, 0.5);
    this._vec3B.sub(this._vec3A).normalize();
    this._quatA.setFromUnitVectors(this._zAxis, this._vec3B);
    this._scaleVec.set(1, 1, Math.min(dist, 80));
    slot.matrix.compose(this._vec3C, this._quatA, this._scaleVec);
    slot.active = true;
    slot.life = 0.075;
    slot.maxLife = 0.075;
  }

  private spawnShellCasing(actor: ActorState): void {
    const p = this.shellParticles.find((s) => !s.active) ?? this.shellParticles[0];
    const rx = Math.cos(actor.yaw);
    const rz = -Math.sin(actor.yaw);
    p.active = true;
    p.x = actor.x + rx * 0.25;
    p.y = actor.y + 1.48;
    p.z = actor.z + rz * 0.25;
    p.vx = rx * (2.1 + Math.random() * 1.1);
    p.vy = 1.6 + Math.random() * 0.9;
    p.vz = rz * (2.1 + Math.random() * 1.1);
    p.rx = Math.random() * Math.PI;
    p.ry = Math.random() * Math.PI;
    p.life = 1.1;
  }

  private setupNetworkListeners(): void {
    networkClient.setCallbacks({
      onPlayerState: (senderId, snap) => {
        const actor = this.actors.find((a) => a.id === senderId);
        if (!actor || actor.isLocal) return;
        this.remoteInterpolations.set(senderId, {
          target: snap,
          lastSeen: performance.now(),
        });
      },
      onShoot: (senderId, payload) => {
        const shooter = this.actors.find((a) => a.id === senderId);
        if (!shooter || shooter.isLocal) return;
        const local = this.getLocalActor();
        const dist = local ? Math.hypot(shooter.x - local.x, shooter.z - local.z) : 0;
        soundEngine.playGunshot(payload.weaponId, payload.silenced, dist);
        this.resolveBallisticRay(
          shooter,
          payload.ox,
          payload.oy,
          payload.oz,
          payload.dx,
          payload.dy,
          payload.dz,
          payload.weaponId
        );
      },
      onGrenadeEvent: (senderId, payload) => {
        const sender = this.actors.find((a) => a.id === senderId);
        if (!sender || sender.isLocal) return;
        const mesh = new THREE.Mesh(
          new THREE.CylinderGeometry(0.06, 0.06, 0.16, 8),
          new THREE.MeshStandardMaterial({ color: 0x4b6a48, roughness: 0.45 })
        );
        mesh.position.set(payload.ox, payload.oy, payload.oz);
        this.scene.add(mesh);
        this.activeGrenades.push({
          id: this.nextEntityUid++,
          kind: payload.grenadeId,
          ownerId: senderId,
          team: sender.team,
          x: payload.ox,
          y: payload.oy,
          z: payload.oz,
          vx: payload.vx,
          vy: payload.vy,
          vz: payload.vz,
          fuse: payload.grenadeId === 'flashbang' ? 1.45 : 1.65,
          mesh,
        });
      },
      onHitClaim: (senderId, payload) => {
        if (payload.targetId !== this.localActorId) return;
        const attacker = this.actors.find((a) => a.id === senderId) ?? null;
        const local = this.getLocalActor();
        if (local && local.alive) {
          this.applyDamage(
            attacker,
            local,
            payload.damage,
            payload.armorDamage,
            payload.weaponId,
            payload.headshot,
            payload.wallbang,
            0.03
          );
        }
      },
      onBombEvent: (_senderId, payload) => {
        if (payload.action === 'planted') {
          this.bomb.status = 'planted';
          this.bomb.site = payload.site as 'A' | 'B';
          this.bomb.x = Number(payload.x);
          this.bomb.y = Number(payload.y);
          this.bomb.z = Number(payload.z);
          this.bomb.timerRemaining = ROUND_CONSTANTS.C4_DETONATION_SECONDS;
          this.phase = 'planted';
          this.phaseTimeRemaining = ROUND_CONSTANTS.C4_DETONATION_SECONDS;
          this.worldBombGroup.position.set(this.bomb.x, this.bomb.y, this.bomb.z);
          this.worldBombGroup.visible = true;
          this.roundBanner = 'BOMB HAS BEEN PLANTED · 40s';
          this.roundBannerTimer = 3.5;
          soundEngine.playVoiceline('bomb_planted');
        } else if (payload.action === 'defused') {
          this.bomb.status = 'defused';
          soundEngine.playVoiceline('bomb_defused');
          if (this.isHostAuthority) {
            this.concludeRound('defenders', 'C4 DEFUSED', true);
          }
        }
      },
      onRoundSync: (_senderId, payload) => {
        if (this.isHostAuthority) return;
        const prevRound = this.roundNumber;
        const prevPhase = this.phase;
        const prevAtkScore = this.attackerScore;
        const prevDefScore = this.defenderScore;

        this.roundNumber = Number(payload.roundNumber ?? this.roundNumber);
        this.attackerScore = Number(payload.attackerScore ?? this.attackerScore);
        this.defenderScore = Number(payload.defenderScore ?? this.defenderScore);
        this.phase = (payload.phase as RoundPhase) ?? this.phase;
        this.phaseTimeRemaining = Number(payload.phaseTimeRemaining ?? this.phaseTimeRemaining);

        if (this.roundNumber !== prevRound && this.phase === 'buy') {
          soundEngine.playVoiceline('round_start');
        } else if (
          prevPhase !== 'round_end' &&
          prevPhase !== 'match_end' &&
          (this.phase === 'round_end' || this.phase === 'match_end')
        ) {
          if (this.attackerScore > prevAtkScore) {
            soundEngine.playVoiceline(
              this.phase === 'match_end' ? 'match_end_attackers' : 'round_end_attackers'
            );
          } else if (this.defenderScore > prevDefScore) {
            soundEngine.playVoiceline(
              this.phase === 'match_end' ? 'match_end_defenders' : 'round_end_defenders'
            );
          }
        }

        if (Array.isArray(payload.actors)) {
          for (const remote of payload.actors as Array<Partial<ActorState>>) {
            const target = this.actors.find((a) => a.id === remote.id);
            if (!target) continue;
            target.alive = Boolean(remote.alive);
            target.hp = Number(remote.hp ?? target.hp);
            target.kills = Number(remote.kills ?? target.kills);
            target.deaths = Number(remote.deaths ?? target.deaths);
            if (target.isBot && remote.x !== undefined) {
              target.x = remote.x;
              target.y = remote.y ?? 0;
              target.z = remote.z ?? 0;
              target.yaw = remote.yaw ?? 0;
            }
          }
        }
      },
    });
  }

  private broadcastRoundSync(): void {
    if (this.config.mode === 'bots' || !this.isHostAuthority) return;
    networkClient.send({
      type: 'round_sync',
      payload: {
        roundNumber: this.roundNumber,
        attackerScore: this.attackerScore,
        defenderScore: this.defenderScore,
        phase: this.phase,
        phaseTimeRemaining: this.phaseTimeRemaining,
        actors: this.actors.map((a) => ({
          id: a.id,
          alive: a.alive,
          hp: a.hp,
          kills: a.kills,
          deaths: a.deaths,
          x: a.x,
          y: a.y,
          z: a.z,
          yaw: a.yaw,
        })),
      },
    });
  }

  private startLoop(): void {
    const tick = () => {
      if (this.disposed) return;
      const now = performance.now();
      const rawDt = (now - this.lastTime) / 1000;
      this.lastTime = now;
      const dt = Math.min(Math.max(rawDt, 0.001), 0.05);

      this.update(dt, now);
      this.renderer.render(this.scene, this.camera);

      if (this.isSoftwareGl) {
        this.afterDraw(tick);
      } else {
        this.frameId = requestAnimationFrame(tick);
      }
    };

    tick();
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync?.(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) return;
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private update(dt: number, nowMs: number): void {
    if (this.screen === 'title') {
      const t = nowMs * 0.00018;
      this.viewmodelRig.visible = false;
      this.camera.position.set(Math.sin(t) * 34, 15 + Math.sin(t * 2) * 3, Math.cos(t) * 38);
      this.camera.lookAt(0, 1.5, 0);
      return;
    }

    if (this.screen === 'paused') {
      return;
    }

    if (this.roundBannerTimer > 0) {
      this.roundBannerTimer -= dt;
      if (this.roundBannerTimer <= 0) this.roundBanner = null;
    }

    if (this.phase === 'buy') {
      this.phaseTimeRemaining -= dt;
      if (this.phaseTimeRemaining <= 0) {
        this.phase = 'live';
        this.phaseTimeRemaining = ROUND_CONSTANTS.LIVE_ROUND_SECONDS;
        this.roundBanner = 'ROUND LIVE · SECURE THE OBJECTIVE';
        this.roundBannerTimer = 2.5;
        soundEngine.playUiTick(1100);
        this.emitHud(true);
      }
    } else if (this.phase === 'live') {
      this.phaseTimeRemaining -= dt;
      if (this.phaseTimeRemaining <= 0 && this.isHostAuthority) {
        this.concludeRound('defenders', 'TIME EXPIRED', false);
      }
    } else if (this.phase === 'planted') {
      this.bomb.timerRemaining -= dt;
      this.phaseTimeRemaining = this.bomb.timerRemaining;
      this.bombBeepAccum += dt;
      const beepInterval = this.bomb.timerRemaining < 10 ? 0.28 : 0.75;
      if (this.bombBeepAccum >= beepInterval) {
        this.bombBeepAccum = 0;
        soundEngine.playBombBeep(this.bomb.timerRemaining < 10);
        (this.worldBombLed.material as THREE.MeshBasicMaterial).color.setHex(0xffffff);
        setTimeout(() => {
          (this.worldBombLed.material as THREE.MeshBasicMaterial).color.setHex(0xff2a1a);
        }, 90);
      }
      if (this.bomb.timerRemaining <= 0 && this.isHostAuthority) {
        this.bomb.status = 'detonated';
        soundEngine.playExplosion(0);
        this.concludeRound('attackers', 'C4 DETONATED', true);
      }
    } else if (this.phase === 'round_end') {
      this.phaseTimeRemaining -= dt;
      if (this.phaseTimeRemaining <= 0 && this.isHostAuthority) {
        this.roundNumber++;
        this.setupRound();
      }
    } else if (this.phase === 'match_end') {
      this.phaseTimeRemaining -= dt;
      if (this.phaseTimeRemaining <= 0) {
        this.setScreen('gameover');
      }
    }

    const local = this.getLocalActor();
    if (local) {
      this.updateLocalPlayer(local, dt);
    }

    if (this.isHostAuthority && this.phase !== 'round_end' && this.phase !== 'match_end') {
      for (const actor of this.actors) {
        if (!actor.isBot || !actor.alive) continue;
        const brain = this.botBrains.get(actor.id);
        if (!brain) continue;
        actor.blindTimer = Math.max(0, actor.blindTimer - dt);
        const cmd = stepBotBrain({
          bot: actor,
          brain,
          allActors: this.actors,
          bomb: this.bomb,
          smokes: this.activeSmokes,
          difficulty: this.config.difficulty,
          isBuyPhase: this.phase === 'buy',
          dt,
        });

        actor.yaw = cmd.targetYaw;
        actor.pitch = cmd.targetPitch;
        actor.vx = cmd.moveX;
        actor.vz = cmd.moveZ;

        const nextX = actor.x + actor.vx * dt;
        const nextZ = actor.z + actor.vz * dt;
        const res = resolvePlayerMovement(nextX, actor.y, nextZ, actor.vy, 0.42, 1.8);
        actor.x = res.x;
        actor.y = res.y;
        actor.z = res.z;

        if (cmd.wantReload) {
          const inst = actor.activeSlot === 1 ? actor.primary : actor.secondary;
          if (inst) {
            const spec = WEAPONS[inst.id];
            const take = Math.min(spec.magSize - inst.mag, inst.reserve);
            inst.mag += take;
            inst.reserve -= take;
          }
        }
        if (cmd.wantFire) {
          const inst = actor.activeSlot === 1 ? actor.primary : actor.secondary;
          if (inst && inst.mag > 0) {
            this.fireBulletWeapon(actor, inst);
          }
        }
        if (cmd.throwGrenade) {
          const idx = actor.grenades.indexOf(cmd.throwGrenade);
          if (idx >= 0) {
            actor.grenades.splice(idx, 1);
            this.throwGrenade(actor, cmd.throwGrenade, false);
          }
        }
        if (cmd.wantPlant && actor.hasC4 && this.phase === 'live') {
          const site = getPlantSiteAt(actor.x, actor.z);
          if (site) {
            this.bomb.plantProgress += dt / ROUND_CONSTANTS.C4_PLANT_SECONDS;
            if (this.bomb.plantProgress >= 1) {
              this.completeBombPlant(actor, site);
            }
          }
        }
        if (cmd.wantDefuse && this.phase === 'planted') {
          this.bomb.defuseProgress += dt / ROUND_CONSTANTS.C4_DEFUSE_SECONDS;
          if (this.bomb.defuseProgress >= 1) {
            this.completeBombDefuse();
          }
        }
      }
    }

    for (const [id, interp] of this.remoteInterpolations.entries()) {
      const actor = this.actors.find((a) => a.id === id);
      if (!actor) continue;
      const alpha = 1 - Math.exp(-16 * dt);
      actor.x = THREE.MathUtils.lerp(actor.x, interp.target.x, alpha);
      actor.y = THREE.MathUtils.lerp(actor.y, interp.target.y, alpha);
      actor.z = THREE.MathUtils.lerp(actor.z, interp.target.z, alpha);
      actor.yaw = interp.target.yaw;
      actor.pitch = interp.target.pitch;
      actor.crouching = interp.target.crouching;
      actor.alive = interp.target.alive;
      actor.hp = interp.target.hp;
      actor.hasC4 = interp.target.hasC4;
    }

    const activeSpec = local && !local.alive ? this.getSpectateTarget(local) : null;

    for (const actor of this.actors) {
      if (actor.isLocal) continue;
      const handle = this.actorMeshes.get(actor.id);
      if (!handle) continue;
      handle.root.visible = actor.alive && actor.id !== activeSpec?.id;
      if (!actor.alive) continue;
      handle.root.position.set(actor.x, actor.y, actor.z);
      handle.root.rotation.y = actor.yaw;
      handle.headGroup.rotation.x = actor.pitch * 0.65;
      handle.bodyGroup.scale.y = actor.crouching ? 0.72 : 1.0;
      handle.c4BackMesh.visible = actor.hasC4;
      handle.helmetMesh.visible = actor.hasHelmet;

      const speed = Math.hypot(actor.vx, actor.vz);
      if (speed > 0.3) {
        const stride = Math.sin(nowMs * 0.012) * 0.45;
        handle.leftLeg.rotation.x = stride;
        handle.rightLeg.rotation.x = -stride;
      } else {
        handle.leftLeg.rotation.x = 0;
        handle.rightLeg.rotation.x = 0;
      }
    }

    if (local && !local.alive) {
      this.syncSpectatorCamera(activeSpec, dt, nowMs);
    }

    this.stepGrenades(dt);
    this.stepTracersAndShells(dt);

    if (this.muzzleLightTimer > 0) {
      this.muzzleLightTimer -= dt;
      if (this.muzzleLightTimer <= 0) this.muzzleLight.intensity = 0;
    }

    if (this.config.mode !== 'bots' && local) {
      this.netSyncAccum += dt;
      if (this.netSyncAccum >= 0.05) {
        this.netSyncAccum = 0;
        networkClient.send({
          type: 'player_state',
          state: {
            id: local.id,
            x: local.x,
            y: local.y,
            z: local.z,
            yaw: local.yaw,
            pitch: local.pitch,
            crouching: local.crouching,
            alive: local.alive,
            hp: local.hp,
            armor: local.armor,
            hasHelmet: local.hasHelmet,
            weaponId: this.getActiveWeaponId(local),
            hasC4: local.hasC4,
          },
        });
      }
      if (this.isHostAuthority) {
        this.roundSyncAccum += dt;
        if (this.roundSyncAccum >= 0.45) {
          this.roundSyncAccum = 0;
          this.broadcastRoundSync();
        }
      }
    }

    this.hudEmitAccum += dt;
    if (this.hudEmitAccum >= 0.08) {
      this.hudEmitAccum = 0;
      this.emitHud(false);
    }
  }

  private updateLocalPlayer(local: ActorState, dt: number): void {
    local.blindTimer = Math.max(0, local.blindTimer - dt);
    this.damageFlash = Math.max(0, this.damageFlash - dt * 2.4);
    if (this.hitmarkerTimer > 0) {
      this.hitmarkerTimer -= dt;
      if (this.hitmarkerTimer <= 0) this.hitmarker = 'none';
    }

    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    this.recoilBloom = Math.max(0, this.recoilBloom - dt * 0.14);
    this.recoilOffsetZ = THREE.MathUtils.damp(this.recoilOffsetZ, 0, 14, dt);
    this.recoilKickPitch = THREE.MathUtils.damp(this.recoilKickPitch, 0, 12, dt);
    this.flinchPitch = THREE.MathUtils.damp(this.flinchPitch, 0, 10, dt);

    if (this.reloadTimer > 0) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        this.reloadTimer = 0;
        this.finishReload(local);
      }
    }

    if (this.burstQueue > 0) {
      this.burstQueueTimer -= dt;
      if (this.burstQueueTimer <= 0) {
        this.burstQueue--;
        this.burstQueueTimer = 0.065;
        if (local.secondary && local.secondary.mag > 0) {
          this.fireBulletWeapon(local, local.secondary);
        } else {
          this.burstQueue = 0;
        }
      }
    }

    if (!local.alive) {
      return;
    }

    if (this.mouseDownLeft && this.phase !== 'buy') {
      const inst = local.activeSlot === 1 ? local.primary : local.activeSlot === 2 ? local.secondary : null;
      if (inst && WEAPONS[inst.id].automatic && this.fireCooldown <= 0 && this.reloadTimer <= 0) {
        if (inst.mag > 0) {
          this.fireBulletWeapon(local, inst);
        } else {
          this.startReload(local);
        }
      }
    }

    local.crouching = this.keys.has('ControlLeft') || this.keys.has('KeyC');
    const walking = this.keys.has('ShiftLeft');

    let wishFwd = 0;
    let wishStrafe = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) wishFwd += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) wishFwd -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) wishStrafe += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) wishStrafe -= 1;

    if (this.phase === 'buy') {
      wishFwd = 0;
      wishStrafe = 0;
    }

    const activeSpec = WEAPONS[this.getActiveWeaponId(local)];
    let maxSpeed = activeSpec.moveSpeed;
    if (local.crouching) maxSpeed *= 0.52;
    else if (walking) maxSpeed *= 0.56;
    if (this.scopeZoom > 0) maxSpeed *= 0.58;

    const fx = -Math.sin(local.yaw);
    const fz = -Math.cos(local.yaw);
    const rx = Math.cos(local.yaw);
    const rz = -Math.sin(local.yaw);

    let dirX = fx * wishFwd + rx * wishStrafe;
    let dirZ = fz * wishFwd + rz * wishStrafe;
    const dirLen = Math.hypot(dirX, dirZ);
    if (dirLen > 0.001) {
      dirX /= dirLen;
      dirZ /= dirLen;
    }

    const accel = this.grounded ? 14 : 4;
    local.vx = THREE.MathUtils.lerp(local.vx, dirX * maxSpeed, 1 - Math.exp(-accel * dt));
    local.vz = THREE.MathUtils.lerp(local.vz, dirZ * maxSpeed, 1 - Math.exp(-accel * dt));

    if (this.keys.has('Space') && this.grounded && this.phase !== 'buy') {
      local.vy = 6.6;
      this.grounded = false;
    }
    local.vy -= 18.5 * dt;

    const nextX = local.x + local.vx * dt;
    const nextY = local.y + local.vy * dt;
    const nextZ = local.z + local.vz * dt;
    const col = resolvePlayerMovement(
      nextX,
      nextY,
      nextZ,
      local.vy,
      0.42,
      local.crouching ? 1.3 : 1.85
    );
    local.x = col.x;
    local.y = col.y;
    local.z = col.z;
    this.grounded = col.grounded;
    if (col.grounded) local.vy = 0;

    local.inBuyZone = isInBuyZone(local.team, local.x, local.z);

    if (!local.primary) {
      for (let i = this.droppedWeapons.length - 1; i >= 0; i--) {
        const d = this.droppedWeapons[i];
        if (Math.hypot(d.x - local.x, d.z - local.z) < 1.5) {
          local.primary = { id: d.weaponId, mag: d.mag, reserve: d.reserve };
          local.activeSlot = 1;
          this.scene.remove(d.mesh);
          this.droppedWeapons.splice(i, 1);
          soundEngine.playUiTick(780);
          break;
        }
      }
    }
    if (
      local.team === 'attackers' &&
      this.bomb.status === 'dropped' &&
      Math.hypot(this.bomb.x - local.x, this.bomb.z - local.z) < 1.6
    ) {
      local.hasC4 = true;
      this.bomb.status = 'carried';
      this.bomb.carrierId = local.id;
      this.worldBombGroup.visible = false;
      soundEngine.playUiTick(840);
    }

    const holdingE = this.keys.has('KeyE');
    if (holdingE && this.phase === 'live' && local.team === 'attackers' && local.hasC4) {
      const site = getPlantSiteAt(local.x, local.z);
      if (site) {
        this.bomb.status = 'planting';
        this.bomb.site = site;
        this.bomb.plantProgress += dt / ROUND_CONSTANTS.C4_PLANT_SECONDS;
        if (this.bomb.plantProgress >= 1) {
          this.completeBombPlant(local, site);
        }
      }
    } else if (this.bomb.status === 'planting') {
      this.bomb.status = 'carried';
      this.bomb.plantProgress = 0;
    }

    if (
      holdingE &&
      this.phase === 'planted' &&
      local.team === 'defenders' &&
      Math.hypot(this.bomb.x - local.x, this.bomb.z - local.z) < 2.5
    ) {
      this.bomb.status = 'defusing';
      this.bomb.defuserId = local.id;
      this.bomb.defuseProgress += dt / ROUND_CONSTANTS.C4_DEFUSE_SECONDS;
      if (this.bomb.defuseProgress >= 1) {
        this.completeBombDefuse();
      }
    } else if (this.bomb.status === 'defusing') {
      this.bomb.status = 'planted';
      this.bomb.defuseProgress = 0;
      this.bomb.defuserId = null;
    }

    const horizSpeed = Math.hypot(local.vx, local.vz);
    if (this.grounded && horizSpeed > 1.2) {
      this.walkBobPhase += horizSpeed * dt * 2.2;
      if (!walking && !local.crouching) {
        this.footstepAccum += horizSpeed * dt;
        if (this.footstepAccum >= 2.2) {
          this.footstepAccum = 0;
          soundEngine.playFootstep();
        }
      }
    }

    this.syncCameraToLocal();
    this.updateViewmodel(local, dt, wishStrafe, horizSpeed);
  }

  private completeBombPlant(planter: ActorState, site: 'A' | 'B'): void {
    planter.hasC4 = false;
    planter.cash = clampCash(planter.cash + ECONOMY_CONSTANTS.BOMB_PLANT_REWARD);
    planter.activeSlot = planter.primary ? 1 : 2;
    this.bomb.status = 'planted';
    this.bomb.carrierId = null;
    this.bomb.site = site;
    this.bomb.x = planter.x;
    this.bomb.y = planter.y;
    this.bomb.z = planter.z;
    this.bomb.timerRemaining = ROUND_CONSTANTS.C4_DETONATION_SECONDS;
    this.bomb.plantProgress = 0;
    this.phase = 'planted';
    this.phaseTimeRemaining = ROUND_CONSTANTS.C4_DETONATION_SECONDS;
    this.worldBombGroup.position.set(this.bomb.x, this.bomb.y, this.bomb.z);
    this.worldBombGroup.visible = true;
    this.roundBanner = 'BOMB HAS BEEN PLANTED · 40s';
    this.roundBannerTimer = 3.5;
    soundEngine.playBombBeep(true);
    soundEngine.playVoiceline('bomb_planted');

    if (this.config.mode !== 'bots') {
      networkClient.send({
        type: 'bomb_event',
        payload: { action: 'planted', site, x: this.bomb.x, y: this.bomb.y, z: this.bomb.z },
      });
    }
    this.emitHud(true);
  }

  private completeBombDefuse(): void {
    this.bomb.status = 'defused';
    this.bomb.defuseProgress = 0;
    this.worldBombGroup.visible = false;
    soundEngine.playVoiceline('bomb_defused');
    if (this.config.mode !== 'bots') {
      networkClient.send({ type: 'bomb_event', payload: { action: 'defused' } });
    }
    this.concludeRound('defenders', 'C4 DEFUSED', true);
  }

  private getSpectateTarget(local: ActorState): ActorState | null {
    const aliveAllies = this.actors.filter((a) => a.alive && a.team === local.team && !a.isLocal);
    const pool = aliveAllies.length > 0 ? aliveAllies : this.actors.filter((a) => a.alive && !a.isLocal);
    if (pool.length === 0) {
      this.spectateTargetId = null;
      return null;
    }
    const current = pool.find((a) => a.id === this.spectateTargetId);
    if (current) return current;
    this.spectateTargetId = pool[0].id;
    return pool[0];
  }

  private cycleSpectateTarget(dir: 1 | -1): void {
    const local = this.getLocalActor();
    if (!local || local.alive) return;
    const aliveAllies = this.actors.filter((a) => a.alive && a.team === local.team && !a.isLocal);
    const pool = aliveAllies.length > 0 ? aliveAllies : this.actors.filter((a) => a.alive && !a.isLocal);
    if (pool.length <= 1) return;
    const idx = Math.max(0, pool.findIndex((a) => a.id === this.spectateTargetId));
    const nextIdx = (idx + dir + pool.length) % pool.length;
    this.spectateTargetId = pool[nextIdx].id;
    soundEngine.playUiTick(660);
    this.emitHud(true);
  }

  private takeOverSpectatedBot(): void {
    const local = this.getLocalActor();
    if (!local || local.alive) return;
    const target = this.getSpectateTarget(local);
    if (!target || !target.isBot || !target.alive || target.team !== local.team) return;

    local.x = target.x;
    local.y = target.y;
    local.z = target.z;
    local.vx = target.vx;
    local.vy = target.vy;
    local.vz = target.vz;
    local.yaw = target.yaw;
    local.pitch = target.pitch;
    local.crouching = target.crouching;
    local.hp = target.hp;
    local.armor = target.armor;
    local.hasHelmet = target.hasHelmet;
    local.activeSlot = target.activeSlot;
    local.primary = target.primary ? { ...target.primary } : null;
    local.secondary = target.secondary ? { ...target.secondary } : null;
    local.knife = target.knife;
    local.grenades = [...target.grenades];
    local.hasC4 = target.hasC4;
    local.blindTimer = target.blindTimer;
    local.inBuyZone = isInBuyZone(local.team, local.x, local.z);
    local.alive = true;

    if (this.bomb.carrierId === target.id) {
      this.bomb.carrierId = local.id;
    }
    if (this.bomb.defuserId === target.id) {
      this.bomb.defuserId = local.id;
    }

    target.alive = false;
    target.hasC4 = false;
    target.primary = null;
    target.grenades = [];
    this.spectateTargetId = null;
    this.previousSlot = local.activeSlot === 1 && local.secondary ? 2 : 3;
    this.flinchPitch = 0;
    this.recoilKickPitch = 0;
    this.scopeZoom = 0;
    this.camera.fov = 78;
    this.camera.updateProjectionMatrix();

    this.syncCameraToLocal();
    soundEngine.playUiTick(880);
    this.emitHud(true);
  }

  private syncSpectatorCamera(
    specTarget: ActorState | null,
    dt: number,
    nowMs: number
  ): void {
    if (specTarget) {
      const eyeY = specTarget.y + (specTarget.crouching ? 1.08 : 1.62);
      this.camera.position.set(specTarget.x, eyeY, specTarget.z);
      this.camera.rotation.set(specTarget.pitch, specTarget.yaw, 0, 'YXZ');
      const horizSpeed = Math.hypot(specTarget.vx, specTarget.vz);
      this.walkBobPhase += horizSpeed * dt * 2.0;
      this.updateViewmodel(specTarget, dt, 0, horizSpeed);
      return;
    }

    // Fallback orbital camera if all players are eliminated (e.g. mutual kill / planted bomb)
    this.viewmodelRig.visible = false;
    const focusX = this.bomb.status === 'planted' ? this.bomb.x : 0;
    const focusZ = this.bomb.status === 'planted' ? this.bomb.z : 0;
    const angle = nowMs * 0.00045;
    this.camera.position.set(
      focusX + Math.sin(angle) * 14,
      8.5,
      focusZ + Math.cos(angle) * 14
    );
    this.camera.lookAt(focusX, 1.2, focusZ);
  }

  private syncCameraToLocal(): void {
    const local = this.getLocalActor();
    if (!local) return;
    const eyeY = local.y + (local.crouching ? 1.08 : 1.62);
    this.camera.position.set(local.x, eyeY, local.z);
    this.camera.rotation.set(
      local.pitch + this.recoilKickPitch + this.flinchPitch,
      local.yaw,
      0,
      'YXZ'
    );
  }

  private updateViewmodel(
    local: ActorState,
    dt: number,
    wishStrafe: number,
    horizSpeed: number
  ): void {
    const activeId = this.getActiveWeaponId(local);
    if (activeId !== this.currentViewmodelWeaponId) {
      if (this.currentViewmodel) {
        this.viewmodelRig.remove(this.currentViewmodel.root);
      }
      this.currentViewmodel = buildWeaponViewmodel(activeId);
      this.currentViewmodelWeaponId = activeId;
      this.viewmodelRig.add(this.currentViewmodel.root);
    }

    this.viewmodelRig.visible = this.scopeZoom === 0;
    if (!this.currentViewmodel) return;

    const vm = this.currentViewmodel;
    const inst = local.activeSlot === 1 ? local.primary : local.activeSlot === 2 ? local.secondary : null;
    if (vm.silencerMesh) {
      vm.silencerMesh.visible = Boolean(inst?.silenced);
    }

    const bobX = Math.cos(this.walkBobPhase) * Math.min(0.014, horizSpeed * 0.002);
    const bobY = Math.abs(Math.sin(this.walkBobPhase)) * Math.min(0.016, horizSpeed * 0.0022);
    const reloadDip = this.reloadTimer > 0 ? Math.sin(this.reloadTimer * 4) * 0.08 - 0.12 : 0;

    vm.root.position.set(
      0.21 + bobX - wishStrafe * 0.012,
      -0.19 - bobY + reloadDip,
      -0.41 + this.recoilOffsetZ
    );

    if (this.inspectTimer > 0) {
      this.inspectTimer = Math.max(0, this.inspectTimer - dt);
      const p = 1 - this.inspectTimer / 1.45;
      vm.weaponPivot.rotation.set(
        Math.sin(p * Math.PI) * 0.35,
        Math.sin(p * Math.PI * 2) * 0.7,
        Math.sin(p * Math.PI) * 0.4
      );
      if (vm.karambitPivot) {
        vm.karambitPivot.rotation.x = p * Math.PI * 4;
      }
      if (vm.butterflyLeftHandle && vm.butterflyRightHandle && vm.butterflyBlade) {
        const flip = Math.sin(p * Math.PI * 3);
        vm.butterflyLeftHandle.rotation.z = flip * 1.9;
        vm.butterflyRightHandle.rotation.z = -flip * 1.9;
        vm.butterflyBlade.rotation.x = flip * 0.8;
      }
    } else if (this.meleeAnimTimer > 0) {
      this.meleeAnimTimer = Math.max(0, this.meleeAnimTimer - dt);
      const s = Math.sin((this.meleeAnimTimer / 0.26) * Math.PI);
      vm.weaponPivot.rotation.set(-s * 0.9, s * 0.4, 0);
      vm.weaponPivot.position.set(0, 0, -s * 0.16);
    } else {
      vm.weaponPivot.rotation.set(0, 0, -wishStrafe * 0.04);
      vm.weaponPivot.position.set(0, 0, 0);
      if (vm.karambitPivot) vm.karambitPivot.rotation.x = 0;
      if (vm.butterflyLeftHandle && vm.butterflyRightHandle && vm.butterflyBlade) {
        vm.butterflyLeftHandle.rotation.z = 0;
        vm.butterflyRightHandle.rotation.z = 0;
        vm.butterflyBlade.rotation.x = 0;
      }
    }
  }

  private stepTracersAndShells(dt: number): void {
    let tracerDirty = false;
    for (let i = 0; i < this.maxTracers; i++) {
      const slot = this.tracerSlots[i];
      if (!slot.active) continue;
      slot.life -= dt;
      if (slot.life <= 0) {
        slot.active = false;
        slot.matrix.makeScale(0, 0, 0);
      }
      this.tracerMesh.setMatrixAt(i, slot.matrix);
      tracerDirty = true;
    }
    if (tracerDirty) this.tracerMesh.instanceMatrix.needsUpdate = true;

    let shellDirty = false;
    for (let i = 0; i < this.maxShells; i++) {
      const p = this.shellParticles[i];
      if (!p.active) continue;
      p.life -= dt;
      p.vy -= 12 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.rx += dt * 11;
      p.ry += dt * 8;
      if (p.y < 0.02) {
        p.y = 0.02;
        p.vy *= -0.35;
        p.vx *= 0.6;
        p.vz *= 0.6;
      }
      if (p.life <= 0) {
        p.active = false;
        this._mat4A.makeScale(0, 0, 0);
      } else {
        this._vec3A.set(p.x, p.y, p.z);
        this._quatA.setFromEuler(new THREE.Euler(p.rx, p.ry, 0));
        this._scaleVec.set(1, 1, 1);
        this._mat4A.compose(this._vec3A, this._quatA, this._scaleVec);
      }
      this.shellMesh.setMatrixAt(i, this._mat4A);
      shellDirty = true;
    }
    if (shellDirty) this.shellMesh.instanceMatrix.needsUpdate = true;
  }

  private getLocalActor(): ActorState | undefined {
    return this.actors.find((a) => a.id === this.localActorId) ?? this.actors[0];
  }

  private emitHud(_immediate: boolean): void {
    const local = this.getLocalActor();
    if (!local) {
      this.onHudUpdate({
        screen: this.screen,
        mode: this.config.mode,
        mapId: this.config.mapId,
        roundNumber: 1,
        maxRounds: this.config.maxRounds,
        halftimeRound: Math.floor(this.config.maxRounds / 2) + 1,
        phase: 'buy',
        phaseTimeRemaining: 15,
        attackerScore: 0,
        defenderScore: 0,
        roundBanner: null,
        localTeam: this.config.playerTeam,
        localAlive: true,
        spectatingName: null,
        spectatingTeam: null,
        spectatingCanControl: false,
        hp: 100,
        armor: 0,
        hasHelmet: false,
        cash: 800,
        inBuyZone: true,
        canBuy: true,
        activeSlot: 2,
        activeWeaponId: getStarterPistol(this.config.playerTeam),
        activeWeaponName: WEAPONS[getStarterPistol(this.config.playerTeam)].name,
        mag: 12,
        reserve: 24,
        silenced: true,
        burstMode: false,
        scopeZoom: 0,
        isReloading: false,
        primaryId: null,
        secondaryId: getStarterPistol(this.config.playerTeam),
        knifeId: 'bayonet',
        grenades: [],
        hasC4: false,
        bomb: this.bomb,
        crosshairSpread: 6,
        blindAlpha: 0,
        damageFlash: 0,
        hitmarker: 'none',
        interactPrompt: null,
        killFeed: [],
        radarBlips: [],
        localYaw: 0,
        localX: 0,
        localZ: 44,
        attackersAlive: 5,
        defendersAlive: 5,
        scoreboard: [],
        pointerLocked: false,
        muted: soundEngine.muted,
      });
      return;
    }

    const specTarget = !local.alive ? this.getSpectateTarget(local) : null;
    const displayActor = specTarget ?? local;

    const activeId = this.getActiveWeaponId(displayActor);
    const activeInst =
      displayActor.activeSlot === 1
        ? displayActor.primary
        : displayActor.activeSlot === 2
          ? displayActor.secondary
          : null;
    const horizSpeed = Math.hypot(displayActor.vx, displayActor.vz);
    const spreadRad = computeWeaponSpread({
      weaponId: activeId,
      horizontalSpeed: horizSpeed,
      isCrouching: displayActor.crouching,
      isAirborne: displayActor.y > 0.08,
      recoilBloom: local.alive ? this.recoilBloom : 0,
      scopeZoom: local.alive ? this.scopeZoom : 0,
    });

    let interactPrompt: string | null = null;
    if (local.alive) {
      if (this.phase === 'live' && local.team === 'attackers' && local.hasC4) {
        const site = getPlantSiteAt(local.x, local.z);
        if (site) {
          interactPrompt =
            this.bomb.status === 'planting'
              ? `Planting C4 at Site ${site}...`
              : `Hold [E] to Plant C4 at Site ${site}`;
        }
      } else if (
        this.phase === 'planted' &&
        local.team === 'defenders' &&
        Math.hypot(this.bomb.x - local.x, this.bomb.z - local.z) < 2.5
      ) {
        interactPrompt =
          this.bomb.status === 'defusing'
            ? 'Defusing C4...'
            : 'Hold [E] to Defuse C4';
      }
    }

    const radarBlips = this.actors.map((a) => {
      const sameTeam = a.team === local.team;
      const spotted =
        sameTeam ||
        (a.alive &&
          hasLineOfSight(
            displayActor.x,
            displayActor.y + 1.6,
            displayActor.z,
            a.x,
            a.y + 1.5,
            a.z,
            this.activeSmokes
          ));
      return {
        id: a.id,
        x: a.x,
        z: a.z,
        team: a.team,
        isLocal: a.id === displayActor.id,
        hasC4: a.hasC4 && sameTeam,
        spotted,
        alive: a.alive,
      };
    });

    this.onHudUpdate({
      screen: this.screen,
      mode: this.config.mode,
      mapId: this.config.mapId,
      roundNumber: this.roundNumber,
      maxRounds: this.config.maxRounds,
      halftimeRound: Math.floor(this.config.maxRounds / 2) + 1,
      phase: this.phase,
      phaseTimeRemaining: Math.max(0, this.phaseTimeRemaining),
      attackerScore: this.attackerScore,
      defenderScore: this.defenderScore,
      roundBanner: this.roundBanner,
      localTeam: local.team,
      localAlive: local.alive,
      spectatingName: specTarget?.name ?? null,
      spectatingTeam: specTarget?.team ?? null,
      spectatingCanControl: Boolean(
        specTarget && specTarget.isBot && specTarget.team === local.team
      ),
      hp: Math.round(displayActor.hp),
      armor: Math.round(displayActor.armor),
      hasHelmet: displayActor.hasHelmet,
      cash: local.cash,
      inBuyZone: displayActor.inBuyZone,
      canBuy: local.alive && local.inBuyZone && this.phase === 'buy',
      activeSlot: displayActor.activeSlot,
      activeWeaponId: activeId,
      activeWeaponName: WEAPONS[activeId].name,
      mag: activeInst?.mag ?? (displayActor.activeSlot === 4 ? displayActor.grenades.length : 0),
      reserve: activeInst?.reserve ?? 0,
      silenced: Boolean(activeInst?.silenced),
      burstMode: Boolean(activeInst?.burstMode),
      scopeZoom: local.alive ? this.scopeZoom : 0,
      isReloading: local.alive && this.reloadTimer > 0,
      primaryId: (displayActor.primary?.id as PrimaryWeaponId) ?? null,
      secondaryId: (displayActor.secondary?.id as SecondaryWeaponId) ?? null,
      knifeId: displayActor.knife,
      grenades: [...displayActor.grenades],
      hasC4: displayActor.hasC4,
      bomb: { ...this.bomb },
      crosshairSpread: Math.min(44, Math.max(4, spreadRad * 680)),
      blindAlpha: Math.min(1, displayActor.blindTimer / 2.2),
      damageFlash: local.alive ? this.damageFlash : 0,
      hitmarker: local.alive ? this.hitmarker : 'none',
      interactPrompt,
      killFeed: [...this.killFeed],
      radarBlips,
      localYaw: displayActor.yaw,
      localX: displayActor.x,
      localZ: displayActor.z,
      attackersAlive: this.actors.filter((a) => a.team === 'attackers' && a.alive).length,
      defendersAlive: this.actors.filter((a) => a.team === 'defenders' && a.alive).length,
      scoreboard: this.actors.map((a) => ({
        id: a.id,
        name: a.name,
        team: a.team,
        isBot: a.isBot,
        isLocal: a.isLocal,
        alive: a.alive,
        kills: a.kills,
        deaths: a.deaths,
        headshots: a.headshots,
        cash: a.cash,
      })),
      pointerLocked: this.pointerLocked,
      muted: soundEngine.muted,
    });
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    this.unbindEvents();
    this.exitPointerLock();
    this.clearRoundEntities();
    this.clearActorMeshes();
    for (const d of this.materials.disposables) {
      d.dispose();
    }
    this.renderer.dispose();
  }
}
