import * as THREE from 'three';

export interface ProceduralTextureSet {
  carapaceMap: THREE.CanvasTexture;
  carapaceRoughnessMap: THREE.CanvasTexture;
  cyanArmorMap: THREE.CanvasTexture;
  eyeActiveMap: THREE.CanvasTexture;
  eyeDefeatMap: THREE.CanvasTexture;
  pathMap: THREE.CanvasTexture;
  terrainMap: THREE.CanvasTexture;
  contactShadowMap: THREE.CanvasTexture;
  dispose: () => void;
}

function seededNoise(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export function createProceduralTextures(maxAnisotropy: number): ProceduralTextureSet {
  const rand = seededNoise(4219);
  const textures: THREE.CanvasTexture[] = [];

  const registerColor = (canvas: HTMLCanvasElement, repeat = 1): THREE.CanvasTexture => {
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = maxAnisotropy;
    if (repeat !== 1) {
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(repeat, repeat);
    }
    textures.push(tex);
    return tex;
  };

  const registerData = (canvas: HTMLCanvasElement): THREE.CanvasTexture => {
    const tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = maxAnisotropy;
    textures.push(tex);
    return tex;
  };

  // 1. Purple Chitin Carapace Albedo + Bioluminescent Cyan Spots
  const carCanvas = document.createElement('canvas');
  carCanvas.width = 512;
  carCanvas.height = 512;
  const cCtx = carCanvas.getContext('2d')!;

  const grad = cCtx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#7844B8');
  grad.addColorStop(0.45, '#5E2D99');
  grad.addColorStop(1, '#3E1C6B');
  cCtx.fillStyle = grad;
  cCtx.fillRect(0, 0, 512, 512);

  // Organic chitin scale ridges
  for (let i = 0; i < 160; i++) {
    const x = rand() * 512;
    const y = rand() * 512;
    const rx = 14 + rand() * 34;
    const ry = 8 + rand() * 18;
    cCtx.save();
    cCtx.translate(x, y);
    cCtx.rotate((rand() - 0.5) * 0.5);
    cCtx.fillStyle = rand() > 0.5 ? 'rgba(138, 86, 206, 0.22)' : 'rgba(38, 16, 68, 0.28)';
    cCtx.beginPath();
    cCtx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    cCtx.fill();
    cCtx.restore();
  }

  // Signature cyan-turquoise carapace spots from turnaround sheets
  for (let i = 0; i < 42; i++) {
    const x = 32 + rand() * 448;
    const y = 32 + rand() * 448;
    const r = 4 + rand() * 11;
    const spotGrad = cCtx.createRadialGradient(x, y, 0, x, y, r * 1.4);
    spotGrad.addColorStop(0, '#58F2FF');
    spotGrad.addColorStop(0.55, '#19B8E8');
    spotGrad.addColorStop(1, 'rgba(25, 184, 232, 0)');
    cCtx.fillStyle = spotGrad;
    cCtx.beginPath();
    cCtx.ellipse(x, y, r * 1.25, r * 0.85, (rand() - 0.5) * 0.8, 0, Math.PI * 2);
    cCtx.fill();
  }
  const carapaceMap = registerColor(carCanvas);

  // 2. Carapace Roughness Map (slightly glossier ridges, matte crevices)
  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = 256;
  roughCanvas.height = 256;
  const rCtx = roughCanvas.getContext('2d')!;
  rCtx.fillStyle = '#909090';
  rCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 110; i++) {
    const x = rand() * 256;
    const y = rand() * 256;
    const r = 6 + rand() * 18;
    rCtx.fillStyle = rand() > 0.5 ? '#6e6e6e' : '#b2b2b2';
    rCtx.beginPath();
    rCtx.arc(x, y, r, 0, Math.PI * 2);
    rCtx.fill();
  }
  const carapaceRoughnessMap = registerData(roughCanvas);

  // 3. Cyan-Blue Lower Leg & Spine Armor Map
  const cyanCanvas = document.createElement('canvas');
  cyanCanvas.width = 256;
  cyanCanvas.height = 256;
  const cyCtx = cyanCanvas.getContext('2d')!;
  const cyGrad = cyCtx.createLinearGradient(0, 0, 0, 256);
  cyGrad.addColorStop(0, '#5BF3FF');
  cyGrad.addColorStop(0.45, '#1AB4E6');
  cyGrad.addColorStop(1, '#2B429E');
  cyCtx.fillStyle = cyGrad;
  cyCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 36; i++) {
    cyCtx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
    cyCtx.lineWidth = 2;
    const y = rand() * 256;
    cyCtx.beginPath();
    cyCtx.moveTo(0, y);
    cyCtx.lineTo(256, y + (rand() - 0.5) * 32);
    cyCtx.stroke();
  }
  const cyanArmorMap = registerColor(cyanCanvas);

  // 4. Active Glowing Lime-Green Eye Texture
  const eyeCanvas = document.createElement('canvas');
  eyeCanvas.width = 256;
  eyeCanvas.height = 256;
  const eCtx = eyeCanvas.getContext('2d')!;
  eCtx.fillStyle = '#4BB800';
  eCtx.fillRect(0, 0, 256, 256);
  const irisGrad = eCtx.createRadialGradient(128, 128, 12, 128, 128, 118);
  irisGrad.addColorStop(0, '#D4FF4D');
  irisGrad.addColorStop(0.45, '#86F70A');
  irisGrad.addColorStop(0.85, '#3CA100');
  irisGrad.addColorStop(1, '#1B4B00');
  eCtx.fillStyle = irisGrad;
  eCtx.fillRect(0, 0, 256, 256);

  // Subtle dark pupil vertical ellipse
  eCtx.fillStyle = '#122900';
  eCtx.beginPath();
  eCtx.ellipse(128, 128, 18, 42, 0, 0, Math.PI * 2);
  eCtx.fill();

  // Specular highlight dot
  eCtx.fillStyle = '#F3FFD6';
  eCtx.beginPath();
  eCtx.arc(104, 100, 12, 0, Math.PI * 2);
  eCtx.fill();
  const eyeActiveMap = registerColor(eyeCanvas);

  // 5. Defeat "X" Eye Texture (matching Image 1 bottom-right)
  const xCanvas = document.createElement('canvas');
  xCanvas.width = 256;
  xCanvas.height = 256;
  const xCtx = xCanvas.getContext('2d')!;
  xCtx.fillStyle = '#2B2235';
  xCtx.fillRect(0, 0, 256, 256);

  xCtx.strokeStyle = '#9CFF1A';
  xCtx.lineWidth = 28;
  xCtx.lineCap = 'round';
  xCtx.shadowColor = '#84FF00';
  xCtx.shadowBlur = 14;
  xCtx.beginPath();
  xCtx.moveTo(64, 64);
  xCtx.lineTo(192, 192);
  xCtx.moveTo(192, 64);
  xCtx.lineTo(64, 192);
  xCtx.stroke();
  const eyeDefeatMap = registerColor(xCanvas);

  // 6. Tower Defense Tactical Road Paving Texture
  const pathCanvas = document.createElement('canvas');
  pathCanvas.width = 512;
  pathCanvas.height = 512;
  const pCtx = pathCanvas.getContext('2d')!;
  pCtx.fillStyle = '#232834';
  pCtx.fillRect(0, 0, 512, 512);

  // Paved steel/stone tile seams
  pCtx.strokeStyle = '#141820';
  pCtx.lineWidth = 6;
  for (let y = 0; y <= 512; y += 64) {
    pCtx.beginPath();
    pCtx.moveTo(0, y);
    pCtx.lineTo(512, y);
    pCtx.stroke();
  }
  // Curb edge stripes
  pCtx.fillStyle = '#333b4d';
  pCtx.fillRect(0, 0, 42, 512);
  pCtx.fillRect(470, 0, 42, 512);

  // Subtle glowing tactical chevron directional markers
  pCtx.strokeStyle = 'rgba(56, 189, 248, 0.32)';
  pCtx.lineWidth = 10;
  pCtx.lineCap = 'round';
  pCtx.lineJoin = 'round';
  for (let y = 64; y < 512; y += 128) {
    pCtx.beginPath();
    pCtx.moveTo(185, y + 32);
    pCtx.lineTo(256, y - 16);
    pCtx.lineTo(327, y + 32);
    pCtx.stroke();
  }
  const pathMap = registerColor(pathCanvas);
  pathMap.wrapS = THREE.RepeatWrapping;
  pathMap.wrapT = THREE.RepeatWrapping;
  pathMap.repeat.set(1, 14);

  // 7. Basalt Canyon Terrain Texture
  const terCanvas = document.createElement('canvas');
  terCanvas.width = 512;
  terCanvas.height = 512;
  const tCtx = terCanvas.getContext('2d')!;
  tCtx.fillStyle = '#191D26';
  tCtx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 420; i++) {
    const x = rand() * 512;
    const y = rand() * 512;
    const s = 4 + rand() * 24;
    tCtx.fillStyle = rand() > 0.5 ? 'rgba(42, 48, 64, 0.25)' : 'rgba(12, 15, 21, 0.35)';
    tCtx.fillRect(x, y, s, s * 0.7);
  }
  // Subtle tactical grid hairlines
  tCtx.strokeStyle = 'rgba(148, 163, 184, 0.06)';
  tCtx.lineWidth = 1;
  for (let i = 0; i <= 512; i += 64) {
    tCtx.beginPath();
    tCtx.moveTo(i, 0);
    tCtx.lineTo(i, 512);
    tCtx.stroke();
    tCtx.beginPath();
    tCtx.moveTo(0, i);
    tCtx.lineTo(512, i);
    tCtx.stroke();
  }
  const terrainMap = registerColor(terCanvas, 10);

  // 8. Soft Radial Contact Shadow Map
  const shadCanvas = document.createElement('canvas');
  shadCanvas.width = 128;
  shadCanvas.height = 128;
  const sCtx = shadCanvas.getContext('2d')!;
  const sGrad = sCtx.createRadialGradient(64, 64, 6, 64, 64, 62);
  sGrad.addColorStop(0, 'rgba(0, 0, 0, 0.65)');
  sGrad.addColorStop(0.55, 'rgba(0, 0, 0, 0.28)');
  sGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  sCtx.fillStyle = sGrad;
  sCtx.fillRect(0, 0, 128, 128);
  const contactShadowMap = registerColor(shadCanvas);

  return {
    carapaceMap,
    carapaceRoughnessMap,
    cyanArmorMap,
    eyeActiveMap,
    eyeDefeatMap,
    pathMap,
    terrainMap,
    contactShadowMap,
    dispose: () => {
      textures.forEach((t) => t.dispose());
    },
  };
}
