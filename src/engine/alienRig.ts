import * as THREE from 'three';
import { ProceduralTextureSet } from './textures';

export type LegId = 'FL' | 'FR' | 'RL' | 'RR';

export interface AlienLegRig {
  id: LegId;
  side: 1 | -1; // +1 = left (+X), -1 = right (-X)
  isFront: boolean;
  hipPivot: THREE.Group;
  femurPivot: THREE.Group;
  kneePivot: THREE.Group;
  baseYaw: number;
  baseFemurPitch: number;
  baseKneePitch: number;
  phaseOffset: number;
}

export interface AlienRig {
  root: THREE.Group;
  bodyPivot: THREE.Group;
  headPivot: THREE.Group;
  carapaceGroup: THREE.Group;
  leftMandible: THREE.Group;
  rightMandible: THREE.Group;
  dorsalSpines: THREE.Mesh[];
  screechBurstGroup: THREE.Group;
  eyeMaterial: THREE.MeshStandardMaterial;
  contactShadow: THREE.Mesh;
  legs: Record<LegId, AlienLegRig>;
  prevFootDown: Record<LegId, boolean>;
  dispose: () => void;
}

export interface AlienAnimResult {
  footfalls: Array<{ id: LegId; worldPos: THREE.Vector3 }>;
  strikeTriggered: boolean;
  screechTriggered: boolean;
}

// Reusable scratch vectors (zero per-frame GC)
const _footWorld = new THREE.Vector3();

function createCurvedSpineGeometry(
  height: number,
  width: number,
  thickness: number,
  curveBack: number
): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-width * 0.5, 0);
  shape.quadraticCurveTo(-width * 0.25, height * 0.55, -curveBack, height);
  shape.quadraticCurveTo(width * 0.35 - curveBack * 0.5, height * 0.52, width * 0.48, 0);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: true,
    bevelThickness: thickness * 0.38,
    bevelSize: thickness * 0.28,
    bevelSegments: 3,
    curveSegments: 10,
  });
  // Center along Z then rotate so blade lies along YZ plane pointing +Y and curving -Z
  geo.translate(0, 0, -thickness * 0.5);
  geo.rotateY(Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

function createArmorPlateGeometry(
  rx: number,
  ry: number,
  rz: number,
  arch = 0.25
): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(1, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.58);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);

    // Taper front/back slightly for stylized chitin shield contour
    const zTaper = z > 0 ? 1 - z * 0.16 : 1 + z * 0.08;
    x *= rx * zTaper;
    z *= rz;
    y = y * ry - (x * x) * arch * 0.12;
    pos.setXYZ(i, x, y, z);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

function createMandibleGeometry(): THREE.TubeGeometry {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.06, -0.05, 0.11),
    new THREE.Vector3(0.01, -0.11, 0.21),
    new THREE.Vector3(-0.09, -0.07, 0.24),
  ]);
  return new THREE.TubeGeometry(curve, 14, 0.052, 8, false);
}

export function createAlienRig(textures: ProceduralTextureSet): AlienRig {
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    materials.push(m);
    return m;
  };

  // Materials calibrated with >= 0.25 roughness contrast between chitin, joints, spines, and claws
  const carapaceMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.carapaceMap,
      roughnessMap: textures.carapaceRoughnessMap,
      color: 0xffffff,
      roughness: 0.42,
      metalness: 0.08,
    })
  );

  const darkUnderbellyMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x3b3248,
      roughness: 0.82,
      metalness: 0.04,
    })
  );

  const browArmorMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.carapaceMap,
      color: 0xd9c2ff,
      roughness: 0.36,
      metalness: 0.12,
    })
  );

  const cyanSpineMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      map: textures.cyanArmorMap,
      color: 0x62f2ff,
      emissive: 0x0a5e78,
      emissiveIntensity: 0.45,
      roughness: 0.22,
      metalness: 0.1,
      clearcoat: 0.65,
      clearcoatRoughness: 0.18,
    })
  );

  const boneJointMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xc8bca8,
      roughness: 0.68,
      metalness: 0.02,
    })
  );

  const clawMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xe3dac6,
      roughness: 0.35,
      metalness: 0.06,
    })
  );

  const mawMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x7d293b,
      emissive: 0x26060d,
      roughness: 0.7,
    })
  );

  const eyeMaterial = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.eyeActiveMap,
      emissiveMap: textures.eyeActiveMap,
      emissive: 0xffffff,
      emissiveIntensity: 0.85,
      roughness: 0.15,
      metalness: 0.05,
    })
  );

  const screechBurstMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xfbbf24,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
    })
  );

  const root = new THREE.Group();
  root.name = 'ChitinStalker';

  // Soft Ground Contact Shadow
  const shadowGeo = trackGeo(new THREE.PlaneGeometry(2.35, 2.35));
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = trackMat(
    new THREE.MeshBasicMaterial({
      map: textures.contactShadowMap,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    })
  );
  const contactShadow = new THREE.Mesh(shadowGeo, shadowMat);
  contactShadow.position.y = 0.025;
  contactShadow.renderOrder = 1;
  root.add(contactShadow);

  // Body Pivot (sits ~0.72 above ground)
  const bodyPivot = new THREE.Group();
  bodyPivot.position.set(0, 0.72, 0);
  root.add(bodyPivot);

  // 1. Segmented Underbelly & Thorax Core
  const thoraxGeo = trackGeo(new THREE.SphereGeometry(0.46, 20, 16));
  thoraxGeo.scale(1.02, 0.72, 1.48);
  const thoraxMesh = new THREE.Mesh(thoraxGeo, darkUnderbellyMat);
  thoraxMesh.position.set(0, -0.05, -0.02);
  thoraxMesh.castShadow = true;
  thoraxMesh.receiveShadow = true;
  bodyPivot.add(thoraxMesh);

  // Ribbed ventral chest segments (visible during rear-up screech!)
  const ribGeo = trackGeo(new THREE.TorusGeometry(0.32, 0.065, 8, 18, Math.PI));
  for (let i = 0; i < 4; i++) {
    const rib = new THREE.Mesh(ribGeo, darkUnderbellyMat);
    rib.position.set(0, -0.11 + i * 0.03, 0.32 - i * 0.18);
    rib.rotation.x = Math.PI * 0.55;
    rib.rotation.z = Math.PI;
    rib.scale.set(1.05 - i * 0.08, 0.9, 1);
    rib.castShadow = true;
    bodyPivot.add(rib);
  }

  // 2. Layered Overlapping Purple Carapace Plates
  const carapaceGroup = new THREE.Group();
  bodyPivot.add(carapaceGroup);

  // Main upper saddle carapace
  const mainShellGeo = trackGeo(createArmorPlateGeometry(0.56, 0.44, 0.64, 0.2));
  const mainShell = new THREE.Mesh(mainShellGeo, carapaceMat);
  mainShell.position.set(0, 0.06, 0.06);
  mainShell.rotation.x = 0.14;
  mainShell.castShadow = true;
  mainShell.receiveShadow = true;
  carapaceGroup.add(mainShell);

  // Mid overlapping plate
  const midShellGeo = trackGeo(createArmorPlateGeometry(0.53, 0.39, 0.52, 0.25));
  const midShell = new THREE.Mesh(midShellGeo, carapaceMat);
  midShell.position.set(0, 0.03, -0.26);
  midShell.rotation.x = -0.22;
  midShell.castShadow = true;
  midShell.receiveShadow = true;
  carapaceGroup.add(midShell);

  // Rear abdomen tail plate
  const rearShellGeo = trackGeo(createArmorPlateGeometry(0.45, 0.34, 0.44, 0.3));
  const rearShell = new THREE.Mesh(rearShellGeo, carapaceMat);
  rearShell.position.set(0, -0.05, -0.52);
  rearShell.rotation.x = -0.54;
  rearShell.castShadow = true;
  rearShell.receiveShadow = true;
  carapaceGroup.add(rearShell);

  // Lateral shoulder armor pauldrons (left & right)
  const shoulderGeo = trackGeo(createArmorPlateGeometry(0.26, 0.22, 0.42, 0.15));
  for (const side of [-1, 1] as const) {
    const pauldron = new THREE.Mesh(shoulderGeo, carapaceMat);
    pauldron.position.set(side * 0.37, 0.04, 0.16);
    pauldron.rotation.set(0.18, side * 0.25, -side * 0.48);
    pauldron.castShadow = true;
    pauldron.receiveShadow = true;
    carapaceGroup.add(pauldron);

    const rearFlank = new THREE.Mesh(shoulderGeo, carapaceMat);
    rearFlank.position.set(side * 0.35, 0.01, -0.32);
    rearFlank.rotation.set(-0.2, -side * 0.2, -side * 0.54);
    rearFlank.scale.set(0.92, 0.9, 0.9);
    rearFlank.castShadow = true;
    carapaceGroup.add(rearFlank);
  }

  // 3. Sweeping Dorsal Cyan Spines (5 central ridge spikes + shoulder accent shards)
  const dorsalSpines: THREE.Mesh[] = [];
  const spineConfigs = [
    { z: 0.34, y: 0.36, h: 0.22, w: 0.14, t: 0.045, curve: 0.09, tilt: -0.25 },
    { z: 0.12, y: 0.42, h: 0.36, w: 0.20, t: 0.058, curve: 0.17, tilt: -0.32 },
    { z: -0.14, y: 0.38, h: 0.38, w: 0.22, t: 0.06, curve: 0.2, tilt: -0.45 },
    { z: -0.39, y: 0.28, h: 0.31, w: 0.19, t: 0.052, curve: 0.17, tilt: -0.62 },
    { z: -0.61, y: 0.12, h: 0.22, w: 0.15, t: 0.042, curve: 0.12, tilt: -0.82 },
  ];

  for (const cfg of spineConfigs) {
    const sGeo = trackGeo(createCurvedSpineGeometry(cfg.h, cfg.w, cfg.t, cfg.curve));
    const spine = new THREE.Mesh(sGeo, cyanSpineMat);
    spine.position.set(0, cfg.y, cfg.z);
    spine.rotation.x = cfg.tilt;
    spine.castShadow = true;
    carapaceGroup.add(spine);
    dorsalSpines.push(spine);
  }

  // Shoulder & brow cyan accent hornlets
  const shardGeo = trackGeo(createCurvedSpineGeometry(0.16, 0.1, 0.032, 0.07));
  for (const side of [-1, 1] as const) {
    const s1 = new THREE.Mesh(shardGeo, cyanSpineMat);
    s1.position.set(side * 0.28, 0.27, 0.22);
    s1.rotation.set(-0.35, 0, -side * 0.42);
    carapaceGroup.add(s1);
    dorsalSpines.push(s1);

    const s2 = new THREE.Mesh(shardGeo, cyanSpineMat);
    s2.position.set(side * 0.32, 0.2, -0.2);
    s2.rotation.set(-0.55, 0, -side * 0.52);
    s2.scale.setScalar(0.85);
    carapaceGroup.add(s2);
    dorsalSpines.push(s2);
  }

  // 4. Head Pivot (Angry Brow, Large Neon-Lime Eyes, Ivory Mandibles, Inner Maw)
  const headPivot = new THREE.Group();
  headPivot.position.set(0, 0.02, 0.52);
  bodyPivot.add(headPivot);

  // Inner head skull core
  const skullGeo = trackGeo(new THREE.SphereGeometry(0.32, 18, 14));
  skullGeo.scale(1.12, 0.86, 0.92);
  const skull = new THREE.Mesh(skullGeo, darkUnderbellyMat);
  skull.position.set(0, -0.02, 0.04);
  skull.castShadow = true;
  headPivot.add(skull);

  // Open Maw cavity
  const mawGeo = trackGeo(new THREE.SphereGeometry(0.14, 12, 10));
  mawGeo.scale(1.1, 0.72, 0.8);
  const maw = new THREE.Mesh(mawGeo, mawMat);
  maw.position.set(0, -0.15, 0.2);
  headPivot.add(maw);

  // Armored Forehead Helmet & V-Brow Ridge
  const helmGeo = trackGeo(createArmorPlateGeometry(0.38, 0.28, 0.36, 0.15));
  const helm = new THREE.Mesh(helmGeo, browArmorMat);
  helm.position.set(0, 0.07, 0.03);
  helm.rotation.x = 0.34;
  helm.castShadow = true;
  headPivot.add(helm);

  // Central forehead cyan diamond crest
  const crestGeo = trackGeo(new THREE.OctahedronGeometry(0.085, 0));
  crestGeo.scale(0.65, 0.5, 1.35);
  const crest = new THREE.Mesh(crestGeo, cyanSpineMat);
  crest.position.set(0, 0.21, 0.19);
  crest.rotation.x = 0.5;
  headPivot.add(crest);

  // Angry overhanging V-shaped brow ridges
  const browGeo = trackGeo(new THREE.BoxGeometry(0.24, 0.075, 0.18));
  for (const side of [-1, 1] as const) {
    const brow = new THREE.Mesh(browGeo, browArmorMat);
    brow.position.set(side * 0.18, 0.11, 0.22);
    brow.rotation.set(0.25, side * 0.28, -side * 0.36);
    brow.castShadow = true;
    headPivot.add(brow);
  }

  // Large Glowing Eyes (facing forward & slightly outward)
  const eyeGeo = trackGeo(new THREE.SphereGeometry(0.125, 18, 16));
  eyeGeo.scale(0.95, 1.05, 0.88);
  for (const side of [-1, 1] as const) {
    const eye = new THREE.Mesh(eyeGeo, eyeMaterial);
    eye.position.set(side * 0.195, -0.005, 0.22);
    // Rotate sphere UV so iris faces +Z outward
    eye.rotation.y = -Math.PI / 2 + side * 0.28;
    headPivot.add(eye);
  }

  // Ivory Mandibles (Left & Right curved fangs)
  const mandibleGeo = trackGeo(createMandibleGeometry());
  const tipGeo = trackGeo(new THREE.ConeGeometry(0.046, 0.11, 8));
  tipGeo.rotateX(Math.PI / 2);

  const buildMandible = (side: 1 | -1): THREE.Group => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.16, -0.14, 0.18);
    const mMesh = new THREE.Mesh(mandibleGeo, clawMat);
    mMesh.scale.x = side;
    mMesh.castShadow = true;
    pivot.add(mMesh);

    const tip = new THREE.Mesh(tipGeo, clawMat);
    tip.position.set(-side * 0.09, -0.07, 0.245);
    tip.rotation.y = -side * 0.95;
    pivot.add(tip);
    headPivot.add(pivot);
    return pivot;
  };

  const leftMandible = buildMandible(1);
  const rightMandible = buildMandible(-1);

  // Stylized Screech Burst Wedges (shown during rear-up roar!)
  const screechBurstGroup = new THREE.Group();
  screechBurstGroup.position.set(0, -0.08, 0.38);
  screechBurstGroup.visible = false;
  headPivot.add(screechBurstGroup);

  const burstConeGeo = trackGeo(new THREE.ConeGeometry(0.045, 0.28, 5));
  burstConeGeo.rotateX(-Math.PI / 2);
  const burstAngles = [-0.52, 0, 0.52];
  burstAngles.forEach((ang, idx) => {
    const wedge = new THREE.Mesh(burstConeGeo, screechBurstMat);
    wedge.position.set(Math.sin(ang) * 0.24, Math.cos(ang) * 0.16, 0.16);
    wedge.rotation.set(-0.2 + idx * 0.05, ang, 0);
    screechBurstGroup.add(wedge);
  });

  // 5. Four Articulated Legs (Hip Ball Joint -> Purple Femur -> Cyan Tibia -> Ivory Claw)
  const hipBallGeo = trackGeo(new THREE.SphereGeometry(0.11, 12, 10));
  const femurGeo = trackGeo(new THREE.CapsuleGeometry(0.085, 0.28, 6, 12));
  femurGeo.rotateZ(Math.PI / 2); // Align along +X outward
  femurGeo.translate(0.18, 0, 0);

  const femurArmorGeo = trackGeo(createArmorPlateGeometry(0.22, 0.11, 0.13, 0.1));
  femurArmorGeo.translate(0.2, 0.045, 0);

  const tibiaGeo = trackGeo(new THREE.CylinderGeometry(0.092, 0.048, 0.52, 10));
  tibiaGeo.translate(0, -0.26, 0); // Extends downward from knee at (0,0,0)

  const clawGeo = trackGeo(new THREE.ConeGeometry(0.052, 0.24, 9));
  clawGeo.rotateX(Math.PI); // Tip points downward -Y
  clawGeo.translate(0, -0.61, 0);

  const legConfigs: Array<{
    id: LegId;
    side: 1 | -1;
    isFront: boolean;
    hipPos: [number, number, number];
    baseYaw: number;
    baseFemurPitch: number;
    baseKneePitch: number;
    phaseOffset: number;
  }> = [
    {
      id: 'FL',
      side: 1,
      isFront: true,
      hipPos: [0.38, -0.05, 0.28],
      baseYaw: 0.48,
      baseFemurPitch: 0.34,
      baseKneePitch: -0.58,
      phaseOffset: 0,
    },
    {
      id: 'FR',
      side: -1,
      isFront: true,
      hipPos: [-0.38, -0.05, 0.28],
      baseYaw: -0.48,
      baseFemurPitch: 0.34,
      baseKneePitch: -0.58,
      phaseOffset: Math.PI,
    },
    {
      id: 'RL',
      side: 1,
      isFront: false,
      hipPos: [0.39, -0.04, -0.28],
      baseYaw: -0.44,
      baseFemurPitch: 0.32,
      baseKneePitch: -0.56,
      phaseOffset: Math.PI,
    },
    {
      id: 'RR',
      side: -1,
      isFront: false,
      hipPos: [-0.39, -0.04, -0.28],
      baseYaw: 0.44,
      baseFemurPitch: 0.32,
      baseKneePitch: -0.56,
      phaseOffset: 0,
    },
  ];

  const legs = {} as Record<LegId, AlienLegRig>;

  for (const cfg of legConfigs) {
    const hipPivot = new THREE.Group();
    hipPivot.position.set(...cfg.hipPos);
    hipPivot.rotation.y = cfg.baseYaw;
    bodyPivot.add(hipPivot);

    // Beige ball-socket joint (signature detail from turnaround!)
    const hipBall = new THREE.Mesh(hipBallGeo, boneJointMat);
    hipBall.castShadow = true;
    hipPivot.add(hipBall);

    const femurPivot = new THREE.Group();
    // Flip X direction for right-side legs (-1)
    femurPivot.scale.x = cfg.side;
    femurPivot.rotation.z = cfg.baseFemurPitch;
    hipPivot.add(femurPivot);

    const femurCore = new THREE.Mesh(femurGeo, darkUnderbellyMat);
    femurCore.castShadow = true;
    femurPivot.add(femurCore);

    const femurArmor = new THREE.Mesh(femurArmorGeo, carapaceMat);
    femurArmor.castShadow = true;
    femurPivot.add(femurArmor);

    const kneePivot = new THREE.Group();
    kneePivot.position.set(0.38, 0, 0);
    kneePivot.rotation.z = cfg.baseKneePitch;
    femurPivot.add(kneePivot);

    const kneeBall = new THREE.Mesh(hipBallGeo, carapaceMat);
    kneeBall.scale.setScalar(0.8);
    kneePivot.add(kneeBall);

    const tibia = new THREE.Mesh(tibiaGeo, cyanSpineMat);
    tibia.castShadow = true;
    kneePivot.add(tibia);

    const claw = new THREE.Mesh(clawGeo, clawMat);
    claw.castShadow = true;
    kneePivot.add(claw);

    legs[cfg.id] = {
      id: cfg.id,
      side: cfg.side,
      isFront: cfg.isFront,
      hipPivot,
      femurPivot,
      kneePivot,
      baseYaw: cfg.baseYaw,
      baseFemurPitch: cfg.baseFemurPitch,
      baseKneePitch: cfg.baseKneePitch,
      phaseOffset: cfg.phaseOffset,
    };
  }

  return {
    root,
    bodyPivot,
    headPivot,
    carapaceGroup,
    leftMandible,
    rightMandible,
    dorsalSpines,
    screechBurstGroup,
    eyeMaterial,
    contactShadow,
    legs,
    prevFootDown: { FL: true, FR: true, RL: true, RR: true },
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}

export type AlienPoseState = 'idle' | 'walk' | 'rear_screech' | 'lunge_attack' | 'defeat';

export function updateAlienAnimation(
  rig: AlienRig,
  pose: AlienPoseState,
  animTime: number,
  dt: number,
  textures: ProceduralTextureSet,
  stateTimer: number
): AlienAnimResult {
  const result: AlienAnimResult = {
    footfalls: [],
    strikeTriggered: false,
    screechTriggered: false,
  };

  // Eye Texture Swap for Defeat vs Active
  const wantDefeatEyes = pose === 'defeat';
  const currentMap = rig.eyeMaterial.map;
  if (wantDefeatEyes && currentMap !== textures.eyeDefeatMap) {
    rig.eyeMaterial.map = textures.eyeDefeatMap;
    rig.eyeMaterial.emissiveMap = textures.eyeDefeatMap;
    rig.eyeMaterial.emissiveIntensity = 1.05;
    rig.eyeMaterial.needsUpdate = true;
  } else if (!wantDefeatEyes && currentMap !== textures.eyeActiveMap) {
    rig.eyeMaterial.map = textures.eyeActiveMap;
    rig.eyeMaterial.emissiveMap = textures.eyeActiveMap;
    rig.eyeMaterial.emissiveIntensity = 0.85;
    rig.eyeMaterial.needsUpdate = true;
  }

  // Smooth damping targets
  let targetBodyY = 0.72;
  let targetBodyPitch = 0;
  let targetBodyRoll = 0;
  let targetBodyZ = 0;
  let targetHeadPitch = 0;
  let targetMandibleOpen = 0.08;
  let showScreech = false;

  if (pose === 'idle') {
    const breath = Math.sin(animTime * 2.4);
    targetBodyY = 0.72 + breath * 0.025;
    targetBodyPitch = breath * 0.03;
    targetHeadPitch = Math.sin(animTime * 1.6) * 0.06;
    targetMandibleOpen = 0.06 + Math.max(0, Math.sin(animTime * 3.1)) * 0.14;
  } else if (pose === 'walk') {
    const strideFreq = 9.0;
    const phase = animTime * strideFreq;
    // Double-frequency body bob & lateral roll matching alternating diagonal gait
    targetBodyY = 0.72 + Math.abs(Math.sin(phase)) * 0.055;
    targetBodyPitch = Math.sin(phase * 2) * 0.035;
    targetBodyRoll = Math.cos(phase) * 0.045;
    targetHeadPitch = Math.sin(phase * 2 + 0.5) * 0.05;
    targetMandibleOpen = 0.12 + Math.sin(phase * 1.5) * 0.08;
  } else if (pose === 'rear_screech') {
    // Signature Image 1 bottom-left pose: rear up high onto hind legs, head skyward, jaws wide!
    const roarPulse = Math.sin(animTime * 14) * 0.04;
    targetBodyY = 0.96 + roarPulse;
    targetBodyPitch = -0.82; // Nose pitched up ~47 deg
    targetBodyZ = -0.14;
    targetHeadPitch = -0.32 + Math.sin(animTime * 18) * 0.05;
    targetMandibleOpen = 0.62 + Math.sin(animTime * 20) * 0.14;
    showScreech = true;
    if (stateTimer < dt * 1.5) {
      result.screechTriggered = true;
    }
  } else if (pose === 'lunge_attack') {
    // 1.15s rhythmic siege cycle: wind-up rear (0..0.45) -> fierce forward chomp lunge (0.45..0.72) -> recover (0.72..1.15)
    const cycle = stateTimer % 1.15;
    if (cycle < 0.45) {
      const t = cycle / 0.45;
      const ease = Math.sin(t * Math.PI * 0.5);
      targetBodyY = THREE.MathUtils.lerp(0.72, 0.98, ease);
      targetBodyPitch = THREE.MathUtils.lerp(0, -0.78, ease);
      targetBodyZ = THREE.MathUtils.lerp(0, -0.2, ease);
      targetHeadPitch = -0.25 * ease;
      targetMandibleOpen = 0.15 + 0.52 * ease;
      showScreech = t > 0.55;
    } else if (cycle < 0.72) {
      const t = (cycle - 0.45) / 0.27;
      const slam = Math.sin(t * Math.PI * 0.5);
      targetBodyY = THREE.MathUtils.lerp(0.98, 0.66, slam);
      targetBodyPitch = THREE.MathUtils.lerp(-0.78, 0.34, slam);
      targetBodyZ = THREE.MathUtils.lerp(-0.2, 0.42, slam);
      targetHeadPitch = 0.2 * slam;
      targetMandibleOpen = THREE.MathUtils.lerp(0.67, 0.04, slam);
      if (cycle - dt < 0.58 && cycle >= 0.58) {
        result.strikeTriggered = true;
      }
    } else {
      const t = (cycle - 0.72) / 0.43;
      targetBodyY = THREE.MathUtils.lerp(0.66, 0.72, t);
      targetBodyPitch = THREE.MathUtils.lerp(0.34, 0, t);
      targetBodyZ = THREE.MathUtils.lerp(0.42, 0, t);
      targetHeadPitch = THREE.MathUtils.lerp(0.2, 0, t);
      targetMandibleOpen = 0.12;
    }
  } else if (pose === 'defeat') {
    // Signature Image 1 bottom-right pose: body flat on ground, splayed out
    targetBodyY = 0.32;
    targetBodyPitch = 0.06;
    targetBodyRoll = 0.04;
    targetHeadPitch = 0.16;
    targetMandibleOpen = 0.18;
  }

  const dampSpeed = pose === 'lunge_attack' ? 18 : 11;
  rig.bodyPivot.position.y = THREE.MathUtils.damp(rig.bodyPivot.position.y, targetBodyY, dampSpeed, dt);
  rig.bodyPivot.position.z = THREE.MathUtils.damp(rig.bodyPivot.position.z, targetBodyZ, dampSpeed, dt);
  rig.bodyPivot.rotation.x = THREE.MathUtils.damp(rig.bodyPivot.rotation.x, targetBodyPitch, dampSpeed, dt);
  rig.bodyPivot.rotation.z = THREE.MathUtils.damp(rig.bodyPivot.rotation.z, targetBodyRoll, dampSpeed, dt);

  rig.headPivot.rotation.x = THREE.MathUtils.damp(rig.headPivot.rotation.x, targetHeadPitch, 14, dt);
  rig.leftMandible.rotation.y = THREE.MathUtils.damp(rig.leftMandible.rotation.y, targetMandibleOpen, 18, dt);
  rig.rightMandible.rotation.y = THREE.MathUtils.damp(rig.rightMandible.rotation.y, -targetMandibleOpen, 18, dt);

  // Screech sonic lines
  rig.screechBurstGroup.visible = showScreech;
  if (showScreech) {
    const pulse = 0.85 + Math.sin(animTime * 28) * 0.25;
    rig.screechBurstGroup.scale.setScalar(pulse);
  }

  // Subtle dorsal spine wave
  rig.dorsalSpines.forEach((spine, idx) => {
    const baseTilt = idx < 5 ? [-0.25, -0.32, -0.45, -0.62, -0.82][idx] : spine.rotation.x;
    if (idx < 5) {
      const wave =
        pose === 'defeat'
          ? 0
          : Math.sin(animTime * (pose === 'walk' ? 9 : 4) - idx * 0.65) * 0.055;
      spine.rotation.x = baseTilt + wave;
    }
  });

  // Contact shadow adapts to body height/splay
  const shadowScale = pose === 'defeat' ? 1.24 : pose === 'rear_screech' ? 0.86 : 1.0;
  rig.contactShadow.scale.setScalar(
    THREE.MathUtils.damp(rig.contactShadow.scale.x, shadowScale, 8, dt)
  );

  // Articulated 4-Leg Kinematics
  const legIds: LegId[] = ['FL', 'FR', 'RL', 'RR'];
  for (const id of legIds) {
    const leg = rig.legs[id];
    let targetYaw = leg.baseYaw;
    let targetFemur = leg.baseFemurPitch;
    let targetKnee = leg.baseKneePitch;

    if (pose === 'idle') {
      const sway = Math.sin(animTime * 2.4) * 0.03;
      targetFemur = leg.baseFemurPitch - sway;
      targetKnee = leg.baseKneePitch + sway * 1.1;
    } else if (pose === 'walk') {
      const phase = animTime * 9.0 + leg.phaseOffset;
      const swing = Math.sin(phase); // forward/back sweep
      const lift = Math.max(0, Math.cos(phase)); // 0 during ground stance, >0 during forward swing

      // Diagonal scuttle sweep around hip yaw
      const yawAmp = leg.isFront ? 0.36 : 0.32;
      targetYaw = leg.baseYaw + swing * yawAmp * leg.side * (leg.isFront ? 1 : 0.9);
      targetFemur = leg.baseFemurPitch + lift * 0.42;
      targetKnee = leg.baseKneePitch - lift * 0.34;

      // Detect ground contact transition for footfall dust & tick
      const isDown = lift < 0.14;
      if (isDown && !rig.prevFootDown[id]) {
        leg.kneePivot.getWorldPosition(_footWorld);
        _footWorld.y = 0.04;
        result.footfalls.push({ id, worldPos: _footWorld.clone() });
      }
      rig.prevFootDown[id] = isDown;
    } else if (pose === 'rear_screech') {
      if (leg.isFront) {
        // Front legs lifted high into the air with claws menacingly curled!
        const twitch = Math.sin(animTime * 12 + leg.side) * 0.08;
        targetYaw = leg.baseYaw + leg.side * 0.18;
        targetFemur = 0.72 + twitch;
        targetKnee = -0.35 + twitch;
      } else {
        // Hind legs plant firmly downward to support the reared body
        targetYaw = leg.baseYaw - leg.side * 0.12;
        targetFemur = -0.25;
        targetKnee = 0.18;
      }
    } else if (pose === 'lunge_attack') {
      const cycle = stateTimer % 1.15;
      if (cycle < 0.45) {
        const ease = Math.sin((cycle / 0.45) * Math.PI * 0.5);
        if (leg.isFront) {
          targetYaw = leg.baseYaw + leg.side * 0.15 * ease;
          targetFemur = THREE.MathUtils.lerp(leg.baseFemurPitch, 0.75, ease);
          targetKnee = THREE.MathUtils.lerp(leg.baseKneePitch, -0.25, ease);
        } else {
          targetFemur = THREE.MathUtils.lerp(leg.baseFemurPitch, -0.2, ease);
          targetKnee = THREE.MathUtils.lerp(leg.baseKneePitch, 0.12, ease);
        }
      } else if (cycle < 0.72) {
        const slam = Math.sin(((cycle - 0.45) / 0.27) * Math.PI * 0.5);
        if (leg.isFront) {
          targetYaw = leg.baseYaw + leg.side * 0.28 * slam;
          targetFemur = THREE.MathUtils.lerp(0.75, 0.12, slam);
          targetKnee = THREE.MathUtils.lerp(-0.25, -0.68, slam);
        } else {
          targetFemur = THREE.MathUtils.lerp(-0.2, 0.42, slam);
          targetKnee = THREE.MathUtils.lerp(0.12, -0.65, slam);
        }
      }
    } else if (pose === 'defeat') {
      // Splay all 4 legs flat outward like Image 1 bottom-right
      targetYaw = leg.baseYaw * 1.15;
      targetFemur = 0.06;
      targetKnee = 0.34;
    }

    const legDamp = pose === 'walk' ? 22 : 13;
    leg.hipPivot.rotation.y = THREE.MathUtils.damp(leg.hipPivot.rotation.y, targetYaw, legDamp, dt);
    leg.femurPivot.rotation.z = THREE.MathUtils.damp(leg.femurPivot.rotation.z, targetFemur, legDamp, dt);
    leg.kneePivot.rotation.z = THREE.MathUtils.damp(leg.kneePivot.rotation.z, targetKnee, legDamp, dt);
  }

  return result;
}
