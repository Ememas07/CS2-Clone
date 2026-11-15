import * as THREE from 'three';

export interface ProceduralMaterialSet {
  sandstone: THREE.MeshStandardMaterial;
  terracotta: THREE.MeshStandardMaterial;
  concrete: THREE.MeshStandardMaterial;
  floor: THREE.MeshStandardMaterial;
  wood: THREE.MeshStandardMaterial;
  metal_olive: THREE.MeshStandardMaterial;
  metal_slate: THREE.MeshStandardMaterial;
  metal_ochre: THREE.MeshStandardMaterial;
  dark_trim: THREE.MeshStandardMaterial;
  siteAFloor: THREE.MeshStandardMaterial;
  siteBFloor: THREE.MeshStandardMaterial;
  disposables: Array<{ dispose: () => void }>;
}

function makeCanvas(size = 512): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  return [c, ctx];
}

function seededRand(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function configureTexture(
  canvas: HTMLCanvasElement,
  isColor: boolean,
  anisotropy: number,
  repeatX = 1,
  repeatY = 1
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = anisotropy;
  if (isColor) {
    tex.colorSpace = THREE.SRGBColorSpace;
  }
  tex.needsUpdate = true;
  return tex;
}

export function createProceduralMaterials(
  maxAnisotropy: number
): ProceduralMaterialSet {
  const disposables: Array<{ dispose: () => void }> = [];
  const aniso = Math.max(1, Math.min(8, maxAnisotropy));

  // 1. Sunlit Sandstone Wall (512x512 albedo + bump)
  const [sandC, sandCtx] = makeCanvas(512);
  const [sandBumpC, sandBumpCtx] = makeCanvas(512);
  const rand1 = seededRand(1042);

  sandCtx.fillStyle = '#d9bf96';
  sandCtx.fillRect(0, 0, 512, 512);
  sandBumpCtx.fillStyle = '#808080';
  sandBumpCtx.fillRect(0, 0, 512, 512);

  // Masonry courses & weathered stucco grain
  const rows = 8;
  const rowH = 512 / rows;
  for (let r = 0; r < rows; r++) {
    const cols = 4;
    const colW = 512 / cols;
    const offset = (r % 2) * (colW * 0.5);
    for (let c = -1; c <= cols; c++) {
      const bx = c * colW + offset;
      const by = r * rowH;
      const shade = Math.floor((rand1() - 0.5) * 18);
      sandCtx.fillStyle = `rgb(${216 + shade}, ${190 + shade}, ${148 + shade})`;
      sandCtx.fillRect(bx + 2, by + 2, colW - 4, rowH - 4);

      const bShade = 128 + Math.floor((rand1() - 0.5) * 32);
      sandBumpCtx.fillStyle = `rgb(${bShade},${bShade},${bShade})`;
      sandBumpCtx.fillRect(bx + 3, by + 3, colW - 6, rowH - 6);
    }
    // Mortar line
    sandCtx.fillStyle = 'rgba(130, 108, 78, 0.35)';
    sandCtx.fillRect(0, r * rowH, 512, 3);
    sandBumpCtx.fillStyle = '#404040';
    sandBumpCtx.fillRect(0, r * rowH, 512, 3);
  }
  // Fine plaster speckles
  for (let i = 0; i < 4500; i++) {
    const x = rand1() * 512;
    const y = rand1() * 512;
    const s = 1 + rand1() * 2.5;
    const dark = rand1() > 0.5;
    sandCtx.fillStyle = dark ? 'rgba(95,78,55,0.12)' : 'rgba(255,244,222,0.14)';
    sandCtx.fillRect(x, y, s, s);
    sandBumpCtx.fillStyle = dark ? 'rgba(70,70,70,0.22)' : 'rgba(200,200,200,0.22)';
    sandBumpCtx.fillRect(x, y, s, s);
  }

  const sandMap = configureTexture(sandC, true, aniso, 2, 1);
  const sandBump = configureTexture(sandBumpC, false, aniso, 2, 1);
  disposables.push(sandMap, sandBump);
  const sandstone = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: sandMap,
    bumpMap: sandBump,
    bumpScale: 0.04,
    roughness: 0.86,
    metalness: 0.02,
  });

  // 2. Concrete Plaza Floor & Blocks (512x512)
  const [concC, concCtx] = makeCanvas(512);
  const [concBumpC, concBumpCtx] = makeCanvas(512);
  const rand2 = seededRand(2099);

  concCtx.fillStyle = '#b9b4a8';
  concCtx.fillRect(0, 0, 512, 512);
  concBumpCtx.fillStyle = '#888888';
  concBumpCtx.fillRect(0, 0, 512, 512);

  const tiles = 4;
  const tileS = 512 / tiles;
  for (let ty = 0; ty < tiles; ty++) {
    for (let tx = 0; tx < tiles; tx++) {
      const v = Math.floor((rand2() - 0.5) * 14);
      concCtx.fillStyle = `rgb(${186 + v},${179 + v},${165 + v})`;
      concCtx.fillRect(tx * tileS + 2, ty * tileS + 2, tileS - 4, tileS - 4);
      concCtx.strokeStyle = 'rgba(85,80,72,0.35)';
      concCtx.lineWidth = 3;
      concCtx.strokeRect(tx * tileS + 1.5, ty * tileS + 1.5, tileS - 3, tileS - 3);
      concBumpCtx.strokeStyle = '#383838';
      concBumpCtx.lineWidth = 3;
      concBumpCtx.strokeRect(tx * tileS + 1.5, ty * tileS + 1.5, tileS - 3, tileS - 3);
    }
  }
  for (let i = 0; i < 6000; i++) {
    const x = rand2() * 512;
    const y = rand2() * 512;
    const s = 1 + rand2() * 2;
    concCtx.fillStyle = rand2() > 0.5 ? 'rgba(65,60,55,0.1)' : 'rgba(245,240,230,0.1)';
    concCtx.fillRect(x, y, s, s);
    concBumpCtx.fillStyle = rand2() > 0.5 ? 'rgba(60,60,60,0.2)' : 'rgba(195,195,195,0.2)';
    concBumpCtx.fillRect(x, y, s, s);
  }

  const concMap = configureTexture(concC, true, aniso, 1, 1);
  const concBump = configureTexture(concBumpC, false, aniso, 1, 1);
  const floorMap = configureTexture(concC, true, aniso, 24, 27);
  const floorBump = configureTexture(concBumpC, false, aniso, 24, 27);
  disposables.push(concMap, concBump, floorMap, floorBump);

  const concrete = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: concMap,
    bumpMap: concBump,
    bumpScale: 0.03,
    roughness: 0.88,
    metalness: 0.04,
  });

  const floor = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: floorMap,
    bumpMap: floorBump,
    bumpScale: 0.025,
    roughness: 0.9,
    metalness: 0.02,
  });

  // 3. Wooden Tactical Crates (512x512)
  const [woodC, woodCtx] = makeCanvas(512);
  const [woodBumpC, woodBumpCtx] = makeCanvas(512);
  const rand3 = seededRand(3377);

  woodCtx.fillStyle = '#9c7143';
  woodCtx.fillRect(0, 0, 512, 512);
  woodBumpCtx.fillStyle = '#808080';
  woodBumpCtx.fillRect(0, 0, 512, 512);

  // Horizontal planks
  const planks = 6;
  const plankH = 512 / planks;
  for (let p = 0; p < planks; p++) {
    const py = p * plankH;
    const tone = Math.floor((rand3() - 0.5) * 20);
    woodCtx.fillStyle = `rgb(${156 + tone},${113 + tone},${67 + tone})`;
    woodCtx.fillRect(0, py + 2, 512, plankH - 4);
    for (let g = 0; g < 18; g++) {
      const gy = py + 4 + rand3() * (plankH - 8);
      woodCtx.fillStyle = 'rgba(72,46,20,0.22)';
      woodCtx.fillRect(0, gy, 512, 1.5);
      woodBumpCtx.fillStyle = '#606060';
      woodBumpCtx.fillRect(0, gy, 512, 1.5);
    }
    woodCtx.fillStyle = '#4c3219';
    woodCtx.fillRect(0, py, 512, 3);
    woodBumpCtx.fillStyle = '#282828';
    woodBumpCtx.fillRect(0, py, 512, 3);
  }
  // Outer crate frame & diagonal brace
  woodCtx.strokeStyle = '#6e4c29';
  woodCtx.lineWidth = 34;
  woodCtx.strokeRect(17, 17, 478, 478);
  woodCtx.beginPath();
  woodCtx.moveTo(24, 24);
  woodCtx.lineTo(488, 488);
  woodCtx.lineWidth = 26;
  woodCtx.stroke();
  // Stencil mark
  woodCtx.fillStyle = 'rgba(35, 28, 20, 0.55)';
  woodCtx.font = 'bold 40px monospace';
  woodCtx.fillText('ORD-04', 48, 92);

  woodBumpCtx.strokeStyle = '#b4b4b4';
  woodBumpCtx.lineWidth = 34;
  woodBumpCtx.strokeRect(17, 17, 478, 478);

  const woodMap = configureTexture(woodC, true, aniso, 1, 1);
  const woodBump = configureTexture(woodBumpC, false, aniso, 1, 1);
  disposables.push(woodMap, woodBump);
  const wood = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: woodMap,
    bumpMap: woodBump,
    bumpScale: 0.045,
    roughness: 0.78,
    metalness: 0.05,
  });

  // 4. Corrugated Steel Shipping Containers (512x512)
  function makeContainerMaterial(baseHex: string, stripeHex: string): THREE.MeshStandardMaterial {
    const [mc, mctx] = makeCanvas(512);
    const [mb, mbctx] = makeCanvas(512);
    mctx.fillStyle = baseHex;
    mctx.fillRect(0, 0, 512, 512);
    mbctx.fillStyle = '#808080';
    mbctx.fillRect(0, 0, 512, 512);

    const ribs = 16;
    const ribW = 512 / ribs;
    for (let i = 0; i < ribs; i++) {
      const rx = i * ribW;
      mctx.fillStyle = 'rgba(0,0,0,0.16)';
      mctx.fillRect(rx, 0, ribW * 0.35, 512);
      mctx.fillStyle = 'rgba(255,255,255,0.1)';
      mctx.fillRect(rx + ribW * 0.35, 0, ribW * 0.25, 512);

      mbctx.fillStyle = '#404040';
      mbctx.fillRect(rx, 0, ribW * 0.4, 512);
      mbctx.fillStyle = '#c8c8c8';
      mbctx.fillRect(rx + ribW * 0.4, 0, ribW * 0.4, 512);
    }
    // Top/bottom structural rails
    mctx.fillStyle = stripeHex;
    mctx.fillRect(0, 0, 512, 26);
    mctx.fillRect(0, 486, 512, 26);

    const map = configureTexture(mc, true, aniso, 1, 1);
    const bump = configureTexture(mb, false, aniso, 1, 1);
    disposables.push(map, bump);
    return new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map,
      bumpMap: bump,
      bumpScale: 0.05,
      roughness: 0.48,
      metalness: 0.55,
    });
  }

  const metal_olive = makeContainerMaterial('#4c5c43', '#36422f');
  const metal_slate = makeContainerMaterial('#415061', '#2c3744');
  const metal_ochre = makeContainerMaterial('#9a6d32', '#704d21');

  const dark_trim = new THREE.MeshStandardMaterial({
    color: 0x2a2f36,
    roughness: 0.52,
    metalness: 0.6,
  });

  // 5. Painted Bomb Site Markings ('A' and 'B' 512x512 floor decals)
  function makeSiteDecalMaterial(letter: 'A' | 'B', accent: string): THREE.MeshStandardMaterial {
    const [sc, sctx] = makeCanvas(512);
    sctx.clearRect(0, 0, 512, 512);

    // Hazard dashed border
    sctx.strokeStyle = accent;
    sctx.lineWidth = 14;
    sctx.setLineDash([34, 22]);
    sctx.strokeRect(20, 20, 472, 472);
    sctx.setLineDash([]);

    // Corner brackets
    sctx.fillStyle = accent;
    sctx.fillRect(10, 10, 64, 14);
    sctx.fillRect(10, 10, 14, 64);
    sctx.fillRect(438, 10, 64, 14);
    sctx.fillRect(488, 10, 14, 64);
    sctx.fillRect(10, 488, 64, 14);
    sctx.fillRect(10, 438, 14, 64);
    sctx.fillRect(438, 488, 64, 14);
    sctx.fillRect(488, 438, 14, 64);

    // Large stenciled site letter
    sctx.fillStyle = accent;
    sctx.globalAlpha = 0.85;
    sctx.font = 'bold 260px sans-serif';
    sctx.textAlign = 'center';
    sctx.textBaseline = 'middle';
    sctx.fillText(letter, 256, 262);

    const map = configureTexture(sc, true, aniso, 1, 1);
    disposables.push(map);
    return new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map,
      transparent: true,
      depthWrite: false,
      roughness: 0.85,
      metalness: 0.0,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
  }

  // 6. Terracotta Clay Masonry (512x512) for Mirage / Inferno
  const [terraC, terraCtx] = makeCanvas(512);
  const [terraBumpC, terraBumpCtx] = makeCanvas(512);
  const randT = seededRand(8821);
  terraCtx.fillStyle = '#c88d67';
  terraCtx.fillRect(0, 0, 512, 512);
  terraBumpCtx.fillStyle = '#7e7e7e';
  terraBumpCtx.fillRect(0, 0, 512, 512);

  const brickRows = 12;
  const brickCols = 6;
  const bH = 512 / brickRows;
  const bW = 512 / brickCols;
  for (let r = 0; r < brickRows; r++) {
    const off = (r % 2) * (bW * 0.5);
    for (let c = -1; c <= brickCols; c++) {
      const bx = c * bW + off;
      const by = r * bH;
      const v = Math.floor((randT() - 0.5) * 26);
      terraCtx.fillStyle = `rgb(${198 + v},${132 + Math.round(v * 0.7)},${94 + Math.round(v * 0.5)})`;
      terraCtx.fillRect(bx + 2, by + 2, bW - 4, bH - 4);
      terraCtx.strokeStyle = 'rgba(92, 58, 40, 0.45)';
      terraCtx.lineWidth = 3;
      terraCtx.strokeRect(bx + 1, by + 1, bW - 2, bH - 2);
      terraBumpCtx.strokeStyle = '#383838';
      terraBumpCtx.lineWidth = 3;
      terraBumpCtx.strokeRect(bx + 1, by + 1, bW - 2, bH - 2);
    }
  }
  for (let i = 0; i < 4200; i++) {
    const x = randT() * 512;
    const y = randT() * 512;
    terraCtx.fillStyle = randT() > 0.5 ? 'rgba(95,55,35,0.12)' : 'rgba(255,228,196,0.1)';
    terraCtx.fillRect(x, y, 2, 2);
  }
  const terraMap = configureTexture(terraC, true, aniso, 2, 2);
  const terraBump = configureTexture(terraBumpC, false, aniso, 2, 2);
  disposables.push(terraMap, terraBump);
  const terracotta = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: terraMap,
    bumpMap: terraBump,
    bumpScale: 0.045,
    roughness: 0.85,
    metalness: 0.03,
  });

  const siteAFloor = makeSiteDecalMaterial('A', '#d9483b');
  const siteBFloor = makeSiteDecalMaterial('B', '#e09b2d');

  disposables.push(
    sandstone,
    terracotta,
    concrete,
    floor,
    wood,
    metal_olive,
    metal_slate,
    metal_ochre,
    dark_trim,
    siteAFloor,
    siteBFloor
  );

  return {
    sandstone,
    terracotta,
    concrete,
    floor,
    wood,
    metal_olive,
    metal_slate,
    metal_ochre,
    dark_trim,
    siteAFloor,
    siteBFloor,
    disposables,
  };
}
