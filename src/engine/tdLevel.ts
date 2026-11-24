import * as THREE from 'three';
import { ProceduralTextureSet } from './textures';

export interface TurretUnit {
  root: THREE.Group;
  headPivot: THREE.Group;
  barrelGroup: THREE.Group;
  muzzlePoint: THREE.Vector3;
  cooldown: number;
  recoil: number;
}

export interface ParticleSlot {
  mesh: THREE.Mesh;
  active: boolean;
  age: number;
  maxAge: number;
  vel: THREE.Vector3;
  startScale: number;
  endScale: number;
  kind: 'dust' | 'spark' | 'bolt' | 'ring';
}

export interface TowerDefenseLevel {
  group: THREE.Group;
  pathCurve: THREE.CatmullRomCurve3;
  turrets: TurretUnit[];
  baseGroup: THREE.Group;
  baseShieldMesh: THREE.Mesh;
  baseShieldMat: THREE.MeshPhysicalMaterial;
  baseCoreMesh: THREE.Mesh;
  portalRingMesh: THREE.Mesh;
  attackPosition: THREE.Vector3;
  attackLookTarget: THREE.Vector3;
  spawnDust: (pos: THREE.Vector3) => void;
  spawnImpactSparks: (pos: THREE.Vector3, colorHex?: number, count?: number) => void;
  spawnShockRing: (pos: THREE.Vector3, colorHex?: number) => void;
  spawnPlasmaBolt: (from: THREE.Vector3, target: THREE.Vector3) => void;
  triggerShieldHit: () => void;
  update: (
    dt: number,
    elapsed: number,
    alienPos: THREE.Vector3,
    alienAlive: boolean,
    turretsEnabled: boolean,
    onBoltHit: () => void
  ) => void;
  dispose: () => void;
}

const _tmpVec = new THREE.Vector3();
const _tmpDir = new THREE.Vector3();

function buildPathRibbonGeometry(curve: THREE.CatmullRomCurve3, width: number, segments: number): THREE.BufferGeometry {
  const halfW = width * 0.5;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const up = new THREE.Vector3(0, 1, 0);
  const tangent = new THREE.Vector3();
  const binormal = new THREE.Vector3();

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const pt = curve.getPointAt(t);
    curve.getTangentAt(t, tangent).normalize();
    binormal.crossVectors(up, tangent).normalize();

    const leftX = pt.x + binormal.x * halfW;
    const leftZ = pt.z + binormal.z * halfW;
    const rightX = pt.x - binormal.x * halfW;
    const rightZ = pt.z - binormal.z * halfW;

    positions.push(leftX, 0.03, leftZ);
    positions.push(rightX, 0.03, rightZ);
    normals.push(0, 1, 0, 0, 1, 0);
    uvs.push(0, t, 1, t);

    if (i < segments) {
      const a = i * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      indices.push(a, c, b);
      indices.push(b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return geo;
}

export function createTowerDefenseLevel(
  textures: ProceduralTextureSet,
  isSoftwareGl: boolean
): TowerDefenseLevel {
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

  const group = new THREE.Group();

  // 1. Extended Wasteland Ground Plane (fades smoothly into horizon fog)
  const groundGeo = trackGeo(new THREE.CircleGeometry(65, 48));
  groundGeo.rotateX(-Math.PI / 2);
  const groundMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.terrainMap,
      color: 0x9aa6bd,
      roughness: 0.92,
      metalness: 0.05,
    })
  );
  const groundMesh = new THREE.Mesh(groundGeo, groundMat);
  groundMesh.receiveShadow = true;
  group.add(groundMesh);

  // 2. Winding Tower Defense Lane Curve
  const pathPoints = [
    new THREE.Vector3(-11.0, 0, -7.2),
    new THREE.Vector3(-6.2, 0, -6.5),
    new THREE.Vector3(-2.6, 0, -2.8),
    new THREE.Vector3(-3.8, 0, 2.6),
    new THREE.Vector3(1.2, 0, 5.4),
    new THREE.Vector3(6.4, 0, 4.2),
    new THREE.Vector3(10.2, 0, 2.2),
  ];
  const pathCurve = new THREE.CatmullRomCurve3(pathPoints, false, 'catmullrom', 0.45);

  const roadGeo = trackGeo(buildPathRibbonGeometry(pathCurve, 2.75, 110));
  const roadMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.pathMap,
      color: 0xd8e2f0,
      roughness: 0.72,
      metalness: 0.18,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    })
  );
  const roadMesh = new THREE.Mesh(roadGeo, roadMat);
  roadMesh.receiveShadow = true;
  group.add(roadMesh);

  // Path Curb / Tactical Border Glow Bevel
  const curbGeo = trackGeo(buildPathRibbonGeometry(pathCurve, 3.05, 110));
  const curbMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x2d3548,
      roughness: 0.55,
      metalness: 0.4,
    })
  );
  const curbMesh = new THREE.Mesh(curbGeo, curbMat);
  curbMesh.position.y = -0.012; // sits cleanly beneath road ribbon with zero z-fight
  curbMesh.receiveShadow = true;
  group.add(curbMesh);

  // 3. Natural Canyon Mesa Rock Outcrops (InstancedMesh perimeter, zero rectangular box walls)
  const rockGeo = trackGeo(new THREE.DodecahedronGeometry(1, 1));
  const rockPos = rockGeo.attributes.position;
  for (let i = 0; i < rockPos.count; i++) {
    const vx = rockPos.getX(i);
    const vy = rockPos.getY(i);
    const vz = rockPos.getZ(i);
    const jag = 0.85 + ((i * 37) % 10) * 0.03;
    rockPos.setXYZ(i, vx * jag, vy * 0.68, vz * jag);
  }
  rockGeo.computeVertexNormals();

  const rockMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x2a3142,
      roughness: 0.88,
      metalness: 0.08,
      flatShading: true,
    })
  );

  const rockCount = 46;
  const rocksInstanced = new THREE.InstancedMesh(rockGeo, rockMat, rockCount);
  rocksInstanced.castShadow = true;
  rocksInstanced.receiveShadow = true;

  const dummy = new THREE.Object3D();
  const rockColor = new THREE.Color();
  for (let i = 0; i < rockCount; i++) {
    const angle = (i / rockCount) * Math.PI * 2 + (i % 3) * 0.14;
    const radius = 15.5 + (i % 5) * 3.8;
    const rx = Math.cos(angle) * radius;
    const rz = Math.sin(angle) * radius;
    const scaleBase = 1.0 + (i % 4) * 0.65;
    const scaleVar = 0.85 + ((i * 19) % 30) * 0.01;

    dummy.position.set(rx, scaleBase * 0.35, rz);
    dummy.rotation.set((i % 3) * 0.2, angle + i * 0.7, (i % 2) * 0.15);
    dummy.scale.set(scaleBase * scaleVar * 1.35, scaleBase * 0.9, scaleBase * scaleVar);
    dummy.updateMatrix();
    rocksInstanced.setMatrixAt(i, dummy.matrix);

    const shade = 0.82 + ((i * 13) % 24) * 0.015;
    rockColor.setRGB(0.18 * shade, 0.21 * shade, 0.29 * shade);
    rocksInstanced.setColorAt(i, rockColor);
  }
  rocksInstanced.instanceMatrix.needsUpdate = true;
  if (rocksInstanced.instanceColor) rocksInstanced.instanceColor.needsUpdate = true;
  rocksInstanced.computeBoundingSphere();
  group.add(rocksInstanced);

  // 4. Alien Breach Portal at Path Start
  const startPt = pathCurve.getPointAt(0);
  const startTan = pathCurve.getTangentAt(0).normalize();
  const portalGroup = new THREE.Group();
  portalGroup.position.copy(startPt);
  portalGroup.rotation.y = Math.atan2(startTan.x, startTan.z);
  group.add(portalGroup);

  const portalPillarGeo = trackGeo(new THREE.ConeGeometry(0.45, 2.2, 6));
  const portalPillarMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x3f2468,
      roughness: 0.45,
      metalness: 0.2,
      flatShading: true,
    })
  );
  for (const side of [-1, 1] as const) {
    const pillar = new THREE.Mesh(portalPillarGeo, portalPillarMat);
    pillar.position.set(side * 1.45, 0.95, -0.2);
    pillar.rotation.z = side * 0.22;
    pillar.castShadow = true;
    portalGroup.add(pillar);
  }

  const portalRingGeo = trackGeo(new THREE.TorusGeometry(1.15, 0.08, 10, 28));
  portalRingGeo.rotateX(Math.PI / 2);
  const portalRingMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0x22d3ee,
      transparent: true,
      opacity: 0.72,
    })
  );
  const portalRingMesh = new THREE.Mesh(portalRingGeo, portalRingMat);
  portalRingMesh.position.y = 0.06;
  portalGroup.add(portalRingMesh);

  // 5. Three Composite Defense Turrets Flanking the Lane
  const turretCoords: Array<[number, number]> = [
    [-5.4, -2.1],
    [-0.4, 2.2],
    [4.4, 1.3],
  ];

  const padGeo = trackGeo(new THREE.CylinderGeometry(1.05, 1.25, 0.34, 8));
  padGeo.translate(0, 0.17, 0);
  const pedGeo = trackGeo(new THREE.CylinderGeometry(0.56, 0.74, 0.42, 8));
  pedGeo.translate(0, 0.55, 0);
  const turretBodyGeo = trackGeo(new THREE.BoxGeometry(0.92, 0.48, 1.05));
  const turretCapGeo = trackGeo(new THREE.BoxGeometry(0.68, 0.22, 0.78));
  const barrelGeo = trackGeo(new THREE.CylinderGeometry(0.08, 0.1, 0.95, 10));
  barrelGeo.rotateX(Math.PI / 2);
  const visorGeo = trackGeo(new THREE.BoxGeometry(0.42, 0.14, 0.08));

  const turretMetalMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x475569,
      roughness: 0.35,
      metalness: 0.72,
    })
  );
  const turretTrimMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.62,
      metalness: 0.35,
    })
  );
  const turretOpticMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0ea5e9,
      emissiveIntensity: 1.4,
      roughness: 0.15,
    })
  );

  const turrets: TurretUnit[] = [];
  for (let i = 0; i < turretCoords.length; i++) {
    const [tx, tz] = turretCoords[i];
    const tRoot = new THREE.Group();
    tRoot.position.set(tx, 0, tz);
    group.add(tRoot);

    const pad = new THREE.Mesh(padGeo, turretTrimMat);
    pad.castShadow = true;
    pad.receiveShadow = true;
    tRoot.add(pad);

    const ped = new THREE.Mesh(pedGeo, turretMetalMat);
    ped.castShadow = true;
    ped.receiveShadow = true;
    tRoot.add(ped);

    const headPivot = new THREE.Group();
    headPivot.position.set(0, 0.96, 0);
    tRoot.add(headPivot);

    const hull = new THREE.Mesh(turretBodyGeo, turretMetalMat);
    hull.castShadow = true;
    headPivot.add(hull);

    const cap = new THREE.Mesh(turretCapGeo, turretTrimMat);
    cap.position.set(0, 0.3, -0.05);
    cap.castShadow = true;
    headPivot.add(cap);

    const visor = new THREE.Mesh(visorGeo, turretOpticMat);
    visor.position.set(0, 0.22, 0.35);
    headPivot.add(visor);

    const barrelGroup = new THREE.Group();
    barrelGroup.position.set(0, -0.02, 0.62);
    headPivot.add(barrelGroup);

    for (const bx of [-0.2, 0.2]) {
      const barrel = new THREE.Mesh(barrelGeo, turretTrimMat);
      barrel.position.set(bx, 0, 0.18);
      barrel.castShadow = true;
      barrelGroup.add(barrel);
    }

    turrets.push({
      root: tRoot,
      headPivot,
      barrelGroup,
      muzzlePoint: new THREE.Vector3(),
      cooldown: 0.5 + i * 0.45,
      recoil: 0,
    });
  }

  // 6. Fortified Command Base at Path End
  const endPt = pathCurve.getPointAt(1);
  const endTan = pathCurve.getTangentAt(1).normalize();
  const baseGroup = new THREE.Group();
  baseGroup.position.copy(endPt);
  baseGroup.rotation.y = Math.atan2(-endTan.x, -endTan.z); // Faces incoming lane
  group.add(baseGroup);

  const basePlinthGeo = trackGeo(new THREE.CylinderGeometry(2.6, 2.95, 0.42, 8));
  basePlinthGeo.translate(0, 0.21, 0);
  const baseTowerMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.38,
      metalness: 0.68,
    })
  );
  const baseDarkMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x172030,
      roughness: 0.68,
      metalness: 0.3,
    })
  );
  const basePlinth = new THREE.Mesh(basePlinthGeo, baseDarkMat);
  basePlinth.receiveShadow = true;
  basePlinth.castShadow = true;
  baseGroup.add(basePlinth);

  // Main Citadel Bulkhead
  const keepGeo = trackGeo(new THREE.CylinderGeometry(1.45, 1.85, 2.1, 8));
  keepGeo.translate(0, 1.45, -0.55);
  const keepMesh = new THREE.Mesh(keepGeo, baseTowerMat);
  keepMesh.castShadow = true;
  keepMesh.receiveShadow = true;
  baseGroup.add(keepMesh);

  // Twin Flanking Bastion Pylons
  const pylonGeo = trackGeo(new THREE.BoxGeometry(0.75, 2.45, 0.95));
  const stripGeo = trackGeo(new THREE.BoxGeometry(0.16, 1.85, 0.14));
  const beaconMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 1.35,
      roughness: 0.2,
    })
  );

  for (const side of [-1, 1] as const) {
    const pylon = new THREE.Mesh(pylonGeo, baseDarkMat);
    pylon.position.set(side * 1.65, 1.35, 0.25);
    pylon.castShadow = true;
    baseGroup.add(pylon);

    const strip = new THREE.Mesh(stripGeo, beaconMat);
    strip.position.set(side * 1.65, 1.35, 0.74);
    baseGroup.add(strip);
  }

  // Glowing Reactor Core Crystal
  const coreGeo = trackGeo(new THREE.OctahedronGeometry(0.62, 0));
  coreGeo.scale(0.85, 1.35, 0.85);
  const coreMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0x7dd3fc,
      emissive: 0x0ea5e9,
      emissiveIntensity: 1.15,
      roughness: 0.12,
      metalness: 0.15,
      clearcoat: 1.0,
    })
  );
  const baseCoreMesh = new THREE.Mesh(coreGeo, coreMat);
  baseCoreMesh.position.set(0, 2.95, -0.55);
  baseGroup.add(baseCoreMesh);

  // Energy Shield Barrier facing the alien lane
  const shieldGeo = trackGeo(new THREE.CylinderGeometry(1.95, 2.15, 2.2, 20, 1, true, -Math.PI * 0.42, Math.PI * 0.84));
  const baseShieldMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.45,
      roughness: 0.15,
      metalness: 0.05,
      transmission: isSoftwareGl ? 0 : 0.45,
      transparent: true,
      opacity: 0.34,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  const baseShieldMesh = new THREE.Mesh(shieldGeo, baseShieldMat);
  baseShieldMesh.position.set(0, 1.32, 0.25);
  baseShieldMesh.renderOrder = 4;
  baseGroup.add(baseShieldMesh);

  // Attack stop position right in front of the shield barrier
  const attackPosition = pathCurve.getPointAt(0.87);
  const attackLookTarget = endPt.clone();

  // 7. Pre-Allocated Particle Pool (Dust, Sparks, Bolts, Rings)
  const particles: ParticleSlot[] = [];
  const sphereParticleGeo = trackGeo(new THREE.SphereGeometry(0.11, 8, 6));
  const ringParticleGeo = trackGeo(new THREE.RingGeometry(0.32, 0.48, 24));
  ringParticleGeo.rotateX(-Math.PI / 2);

  const createPoolSlot = (kind: ParticleSlot['kind'], color: number): ParticleSlot => {
    const geo = kind === 'ring' ? ringParticleGeo : sphereParticleGeo;
    const mat = trackMat(
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        side: kind === 'ring' ? THREE.DoubleSide : THREE.FrontSide,
      })
    );
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    group.add(mesh);
    const slot: ParticleSlot = {
      mesh,
      active: false,
      age: 0,
      maxAge: 0.5,
      vel: new THREE.Vector3(),
      startScale: 1,
      endScale: 0.1,
      kind,
    };
    particles.push(slot);
    return slot;
  };

  for (let i = 0; i < 18; i++) createPoolSlot('dust', 0x64748b);
  for (let i = 0; i < 28; i++) createPoolSlot('spark', 0xf59e0b);
  for (let i = 0; i < 10; i++) createPoolSlot('bolt', 0x38bdf8);
  for (let i = 0; i < 6; i++) createPoolSlot('ring', 0x38bdf8);

  const acquireSlot = (kind: ParticleSlot['kind']): ParticleSlot | null => {
    for (let i = 0; i < particles.length; i++) {
      if (particles[i].kind === kind && !particles[i].active) {
        return particles[i];
      }
    }
    return null;
  };

  const spawnDust = (pos: THREE.Vector3) => {
    const slot = acquireSlot('dust');
    if (!slot) return;
    slot.active = true;
    slot.age = 0;
    slot.maxAge = 0.42;
    slot.startScale = 0.75;
    slot.endScale = 2.0;
    slot.mesh.position.copy(pos);
    slot.mesh.position.y = 0.08;
    slot.vel.set((Math.random() - 0.5) * 0.4, 0.55, (Math.random() - 0.5) * 0.4);
    (slot.mesh.material as THREE.MeshBasicMaterial).color.setHex(0x64748b);
    slot.mesh.visible = true;
  };

  const spawnImpactSparks = (pos: THREE.Vector3, colorHex = 0xf59e0b, count = 8) => {
    for (let i = 0; i < count; i++) {
      const slot = acquireSlot('spark');
      if (!slot) break;
      slot.active = true;
      slot.age = 0;
      slot.maxAge = 0.38 + Math.random() * 0.18;
      slot.startScale = 0.85;
      slot.endScale = 0.08;
      slot.mesh.position.copy(pos);
      slot.vel.set(
        (Math.random() - 0.5) * 4.5,
        1.5 + Math.random() * 3.2,
        (Math.random() - 0.5) * 4.5
      );
      (slot.mesh.material as THREE.MeshBasicMaterial).color.setHex(colorHex);
      slot.mesh.visible = true;
    }
  };

  const spawnShockRing = (pos: THREE.Vector3, colorHex = 0xf59e0b) => {
    const slot = acquireSlot('ring');
    if (!slot) return;
    slot.active = true;
    slot.age = 0;
    slot.maxAge = 0.48;
    slot.startScale = 0.5;
    slot.endScale = 4.4;
    slot.mesh.position.copy(pos);
    slot.mesh.position.y = 0.08;
    slot.vel.set(0, 0, 0);
    (slot.mesh.material as THREE.MeshBasicMaterial).color.setHex(colorHex);
    slot.mesh.visible = true;
  };

  const spawnPlasmaBolt = (from: THREE.Vector3, target: THREE.Vector3) => {
    const slot = acquireSlot('bolt');
    if (!slot) return;
    slot.active = true;
    slot.age = 0;
    slot.maxAge = 0.34;
    slot.startScale = 1.05;
    slot.endScale = 0.9;
    slot.mesh.position.copy(from);
    _tmpDir.subVectors(target, from);
    const dist = Math.max(0.5, _tmpDir.length());
    const speed = dist / 0.24;
    slot.vel.copy(_tmpDir).normalize().multiplyScalar(speed);
    slot.mesh.visible = true;
  };

  let shieldHitFlash = 0;

  const triggerShieldHit = () => {
    shieldHitFlash = 1.0;
  };

  const update = (
    dt: number,
    elapsed: number,
    alienPos: THREE.Vector3,
    alienAlive: boolean,
    turretsEnabled: boolean,
    onBoltHit: () => void
  ) => {
    // Rotate reactor core & pulse breach portal
    baseCoreMesh.rotation.y = elapsed * 1.1;
    baseCoreMesh.position.y = 2.95 + Math.sin(elapsed * 2.5) * 0.1;
    portalRingMesh.scale.setScalar(1 + Math.sin(elapsed * 3.5) * 0.06);

    // Shield hit flash decay
    if (shieldHitFlash > 0) {
      shieldHitFlash = Math.max(0, shieldHitFlash - dt * 3.6);
      baseShieldMat.color.setHex(0x38bdf8).lerp(new THREE.Color(0xf97316), shieldHitFlash);
      baseShieldMat.emissive.setHex(0x0284c7).lerp(new THREE.Color(0xea580c), shieldHitFlash);
      baseShieldMat.opacity = 0.34 + shieldHitFlash * 0.42;
    } else {
      baseShieldMat.color.setHex(0x38bdf8);
      baseShieldMat.emissive.setHex(0x0284c7);
      baseShieldMat.opacity = 0.32 + Math.sin(elapsed * 3) * 0.04;
    }

    // Turret tracking & firing
    for (const turret of turrets) {
      if (alienAlive) {
        const dx = alienPos.x - turret.root.position.x;
        const dz = alienPos.z - turret.root.position.z;
        const targetAngle = Math.atan2(dx, dz);
        // Shortest angular interpolation
        let diff = targetAngle - turret.headPivot.rotation.y;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        turret.headPivot.rotation.y += diff * Math.min(1, dt * 7);
      }

      turret.recoil = THREE.MathUtils.damp(turret.recoil, 0, 14, dt);
      turret.barrelGroup.position.z = 0.62 - turret.recoil * 0.18;

      if (turretsEnabled && alienAlive) {
        turret.cooldown -= dt;
        const dist = turret.root.position.distanceTo(alienPos);
        if (turret.cooldown <= 0 && dist < 8.5) {
          turret.cooldown = 1.15;
          turret.recoil = 1.0;
          turret.barrelGroup.getWorldPosition(turret.muzzlePoint);
          _tmpVec.copy(alienPos).add(new THREE.Vector3(0, 0.72, 0));
          spawnPlasmaBolt(turret.muzzlePoint, _tmpVec);
          onBoltHit();
        }
      }
    }

    // Update Particle Pool
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      if (!p.active) continue;
      p.age += dt;
      if (p.age >= p.maxAge) {
        p.active = false;
        p.mesh.visible = false;
        continue;
      }
      const t = p.age / p.maxAge;
      p.mesh.position.addScaledVector(p.vel, dt);
      if (p.kind === 'spark') {
        p.vel.y -= 9.5 * dt;
      } else if (p.kind === 'bolt') {
        // Check hit near alien
        _tmpVec.copy(alienPos).setY(0.72);
        if (p.mesh.position.distanceToSquared(_tmpVec) < 0.42) {
          p.active = false;
          p.mesh.visible = false;
          spawnImpactSparks(_tmpVec, 0x38bdf8, 5);
          continue;
        }
      }
      const scale = THREE.MathUtils.lerp(p.startScale, p.endScale, t);
      p.mesh.scale.setScalar(scale);
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - t) * (p.kind === 'ring' ? 0.78 : 0.85);
    }
  };

  return {
    group,
    pathCurve,
    turrets,
    baseGroup,
    baseShieldMesh,
    baseShieldMat,
    baseCoreMesh,
    portalRingMesh,
    attackPosition,
    attackLookTarget,
    spawnDust,
    spawnImpactSparks,
    spawnShockRing,
    spawnPlasmaBolt,
    triggerShieldHit,
    update,
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}
