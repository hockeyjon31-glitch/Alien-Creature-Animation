import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createAlienRig, updateAlienAnimation, AlienPoseState } from '../engine/alienRig';
import { createProceduralTextures } from '../engine/textures';
import { createTowerDefenseLevel } from '../engine/tdLevel';
import { soundEngine } from '../engine/audio';
import { CameraPreset, CombatPhase, SimulationConfig, SimulationStats } from '../types/alien';

interface AlienSceneCanvasProps {
  config: SimulationConfig;
  resetToken: number;
  onStatsUpdate: (stats: SimulationStats) => void;
}

// Pre-allocated scratch math helpers (zero per-frame GC)
const _pathPos = new THREE.Vector3();
const _pathTan = new THREE.Vector3();
const _camGoalPos = new THREE.Vector3();
const _camGoalTarget = new THREE.Vector3();
const _strikePoint = new THREE.Vector3();

function detectSoftwareWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export const AlienSceneCanvas: React.FC<AlienSceneCanvasProps> = ({
  config,
  resetToken,
  onStatsUpdate,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const configRef = useRef<SimulationConfig>(config);
  const onStatsRef = useRef(onStatsUpdate);
  const resetSignalRef = useRef<number>(resetToken);
  const [contextLost, setContextLost] = useState(false);
  const [webglUnsupported, setWebglUnsupported] = useState(false);

  useEffect(() => {
    const prevPreset = configRef.current.cameraPreset;
    configRef.current = config;
    soundEngine.setEnabled(config.soundEnabled);
    if (prevPreset !== config.cameraPreset) {
      cameraTransitionRef.current = true;
    }
  }, [config]);

  useEffect(() => {
    onStatsRef.current = onStatsUpdate;
  }, [onStatsUpdate]);

  const cameraTransitionRef = useRef(true);
  const resetPendingRef = useRef(false);

  useEffect(() => {
    if (resetToken !== resetSignalRef.current) {
      resetSignalRef.current = resetToken;
      resetPendingRef.current = true;
    }
  }, [resetToken]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareWebGL();
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglUnsupported(true);
      return;
    }

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    container.appendChild(renderer.domElement);

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      setContextLost(true);
    };
    const handleContextRestored = () => {
      setContextLost(false);
    };
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', handleContextRestored);

    // Scene & Atmospheric Fog
    const scene = new THREE.Scene();
    const bgHex = 0x0b0e14;
    scene.background = new THREE.Color(bgHex);
    scene.fog = new THREE.FogExp2(bgHex, 0.022);

    // Mandatory Studio Environment Reflection (RoomEnvironment)
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envTarget = pmremGenerator.fromScene(roomEnv, 0.04);
    scene.environment = envTarget.texture;
    roomEnv.dispose();
    pmremGenerator.dispose();

    // 2.5D Isometric Perspective Camera (36 deg FOV gives crisp diorama depth)
    const camera = new THREE.PerspectiveCamera(
      36,
      container.clientWidth / Math.max(1, container.clientHeight),
      0.2,
      140
    );
    camera.position.set(-2.5, 13.5, 18.5);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.minDistance = 2.6;
    controls.maxDistance = 36;
    controls.minPolarAngle = 0.18;
    controls.maxPolarAngle = Math.PI * 0.46;
    controls.target.set(0, 0.7, 0);
    controls.update();

    // Cancel automatic camera glide if user grabs orbit controls
    controls.addEventListener('start', () => {
      cameraTransitionRef.current = false;
    });

    // Balanced 3-Point Warm/Cool Studio + Canyon Lighting Rig
    const hemiLight = new THREE.HemisphereLight(0x7dd3fc, 0x1f192b, 0.65);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff1dc, 1.85);
    keyLight.position.set(11, 18, 12);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.camera.near = 2;
    keyLight.shadow.camera.far = 48;
    const d = 16;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.95);
    rimLight.position.set(-14, 9, -12);
    scene.add(rimLight);

    // Procedural Textures, Tower Defense Level & Alien Rig
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const textures = createProceduralTextures(maxAniso);
    const tdLevel = createTowerDefenseLevel(textures, isSoftwareGl);
    scene.add(tdLevel.group);

    const alienRig = createAlienRig(textures);
    scene.add(alienRig.root);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // Simulation State Variables
    let pathProgress = 0;
    let phase: CombatPhase = 'walking';
    let phaseTimer = 0;
    let alienHp = 100;
    const alienMaxHp = 100;
    let baseHp = 100;
    const baseMaxHp = 100;
    let wave = 1;
    let baseHits = 0;
    let animTime = 0;
    let totalElapsed = 0;
    let lastStatsEmit = 0;
    let lastMode = configRef.current.mode;

    const resetRun = (incrementWave: boolean) => {
      pathProgress = 0;
      phase = 'spawning';
      phaseTimer = 0;
      alienHp = alienMaxHp;
      if (baseHp <= 0 || !incrementWave) {
        baseHp = baseMaxHp;
      }
      if (incrementWave) {
        wave += 1;
      } else {
        wave = 1;
        baseHits = 0;
      }
    };

    const getCameraGoal = (preset: CameraPreset, alienWorldPos: THREE.Vector3) => {
      if (preset === 'isometric_25d') {
        _camGoalPos.set(-1.5, 14.2, 18.8);
        _camGoalTarget.set(0.0, 0.5, 0.2);
      } else if (preset === 'follow_td') {
        _camGoalPos.set(alienWorldPos.x - 3.6, 5.2, alienWorldPos.z + 6.4);
        _camGoalTarget.set(alienWorldPos.x, 0.85, alienWorldPos.z);
      } else if (preset === 'base_siege') {
        _camGoalPos.set(3.2, 6.2, 10.6);
        _camGoalTarget.set(8.6, 1.1, 2.7);
      } else {
        // closeup hero inspect
        _camGoalPos.set(alienWorldPos.x + 2.4, 2.1, alienWorldPos.z + 3.2);
        _camGoalTarget.set(alienWorldPos.x, 0.72, alienWorldPos.z);
      }
    };

    // Resize handling
    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = Math.max(1, container.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // Loop pacing with software-WebGL guard
    let frameId = 0;
    let disposed = false;
    const clock = new THREE.Clock();

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync ? gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0) : null;
      gl.flush();
      if (!sync) {
        frameId = window.setTimeout(cb, 80);
        return;
      }
      const poll = () => {
        if (disposed) {
          gl.deleteSync(sync);
          return;
        }
        const state = gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    const tick = () => {
      if (disposed) return;

      const rawDt = Math.min(clock.getDelta(), 0.05);
      const cfg = configRef.current;

      if (resetPendingRef.current) {
        resetPendingRef.current = false;
        resetRun(false);
      }

      // React to mode changes cleanly
      if (cfg.mode !== lastMode) {
        lastMode = cfg.mode;
        phaseTimer = 0;
        if (cfg.mode === 'attack' || cfg.mode === 'screech') {
          pathProgress = 0.87;
          phase = cfg.mode === 'screech' ? 'rearing' : 'attacking';
        } else if (cfg.mode === 'defeat') {
          phase = 'defeated';
          alienHp = 0;
          soundEngine.playDefeat();
        } else if (cfg.mode === 'walk') {
          phase = 'walking';
          alienHp = alienMaxHp;
        } else {
          resetRun(false);
        }
      }

      const simDt = cfg.paused ? 0 : rawDt * cfg.speedMultiplier;
      animTime += simDt;
      totalElapsed += rawDt;
      phaseTimer += simDt;

      let pose: AlienPoseState = 'idle';
      let alienAlive = true;

      if (cfg.mode === 'auto_loop') {
        if (phase === 'spawning') {
          pathProgress = 0;
          pose = 'idle';
          alienRig.root.scale.setScalar(THREE.MathUtils.clamp(phaseTimer / 0.45, 0.1, 1));
          if (phaseTimer >= 0.5) {
            alienRig.root.scale.setScalar(1);
            phase = 'walking';
            phaseTimer = 0;
          }
        } else if (phase === 'walking') {
          pose = 'walk';
          pathProgress += simDt * 0.088; // ~11.3s to traverse the winding lane at 1x
          if (pathProgress >= 0.87) {
            pathProgress = 0.87;
            phase = 'rearing';
            phaseTimer = 0;
            soundEngine.playScreech();
          }
        } else if (phase === 'rearing') {
          pose = 'rear_screech';
          if (phaseTimer >= 1.15) {
            phase = 'attacking';
            phaseTimer = 0;
          }
        } else if (phase === 'attacking') {
          pose = 'lunge_attack';
          if (baseHp <= 0) {
            phase = 'breached';
            phaseTimer = 0;
            tdLevel.spawnShockRing(tdLevel.attackLookTarget, 0x38bdf8);
          }
        } else if (phase === 'breached') {
          pose = 'rear_screech';
          if (phaseTimer >= 1.6) {
            resetRun(true);
          }
        } else if (phase === 'defeated') {
          pose = 'defeat';
          alienAlive = false;
          if (phaseTimer >= 2.3) {
            resetRun(true);
          }
        }
      } else if (cfg.mode === 'walk') {
        alienRig.root.scale.setScalar(1);
        pose = 'walk';
        phase = 'walking';
        pathProgress = (pathProgress + simDt * 0.095) % 0.87;
      } else if (cfg.mode === 'attack') {
        alienRig.root.scale.setScalar(1);
        pathProgress = 0.87;
        phase = 'attacking';
        pose = 'lunge_attack';
      } else if (cfg.mode === 'screech') {
        alienRig.root.scale.setScalar(1);
        pose = 'rear_screech';
        phase = 'rearing';
      } else if (cfg.mode === 'defeat') {
        alienRig.root.scale.setScalar(1);
        pose = 'defeat';
        phase = 'defeated';
        alienAlive = false;
      }

      // Position & Orient Alien Along Winding Tower Defense Curve
      tdLevel.pathCurve.getPointAt(THREE.MathUtils.clamp(pathProgress, 0, 1), _pathPos);
      tdLevel.pathCurve.getTangentAt(THREE.MathUtils.clamp(pathProgress, 0, 1), _pathTan);

      alienRig.root.position.copy(_pathPos);
      const targetYaw = Math.atan2(_pathTan.x, _pathTan.z);
      let yawDiff = targetYaw - alienRig.root.rotation.y;
      while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
      while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
      alienRig.root.rotation.y += yawDiff * Math.min(1, rawDt * 12);

      // Update Articulated Alien Pose & Footfalls / Strikes
      const animResult = updateAlienAnimation(
        alienRig,
        pose,
        animTime,
        simDt,
        textures,
        phaseTimer
      );

      for (const foot of animResult.footfalls) {
        tdLevel.spawnDust(foot.worldPos);
        soundEngine.playFootstep(foot.id === 'FL' || foot.id === 'RR' ? 0.3 : -0.2);
      }

      if (animResult.screechTriggered) {
        soundEngine.playScreech();
      }

      if (animResult.strikeTriggered) {
        _strikePoint.copy(_pathPos).addScaledVector(_pathTan, 1.35);
        _strikePoint.y = 0.82;
        tdLevel.spawnImpactSparks(_strikePoint, 0xf97316, 12);
        tdLevel.spawnShockRing(_strikePoint, 0xf59e0b);
        tdLevel.triggerShieldHit();
        soundEngine.playBaseStrike();
        baseHits += 1;
        if (cfg.mode === 'auto_loop') {
          baseHp = Math.max(0, baseHp - 20);
        }
      }

      // Update Turrets, Shield & Particles
      tdLevel.update(
        simDt,
        totalElapsed,
        alienRig.root.position,
        alienAlive && phase !== 'spawning',
        cfg.turretsEnabled && (cfg.mode === 'auto_loop' || cfg.mode === 'walk'),
        () => {
          soundEngine.playTurretShot();
          if (cfg.mode === 'auto_loop' && alienAlive) {
            alienHp = Math.max(0, alienHp - 10);
            if (alienHp <= 0 && phase !== 'defeated') {
              phase = 'defeated';
              phaseTimer = 0;
              soundEngine.playDefeat();
              tdLevel.spawnShockRing(alienRig.root.position, 0x84ff00);
            }
          }
        }
      );

      // Smooth Camera Preset Transitions (continuous tracking for follow_td, damp-and-release for static presets)
      if (cfg.cameraPreset === 'follow_td') {
        getCameraGoal('follow_td', alienRig.root.position);
        camera.position.x = THREE.MathUtils.damp(camera.position.x, _camGoalPos.x, 4.5, rawDt);
        camera.position.y = THREE.MathUtils.damp(camera.position.y, _camGoalPos.y, 4.5, rawDt);
        camera.position.z = THREE.MathUtils.damp(camera.position.z, _camGoalPos.z, 4.5, rawDt);
        controls.target.x = THREE.MathUtils.damp(controls.target.x, _camGoalTarget.x, 6, rawDt);
        controls.target.y = THREE.MathUtils.damp(controls.target.y, _camGoalTarget.y, 6, rawDt);
        controls.target.z = THREE.MathUtils.damp(controls.target.z, _camGoalTarget.z, 6, rawDt);
      } else if (cameraTransitionRef.current) {
        getCameraGoal(cfg.cameraPreset, alienRig.root.position);
        camera.position.x = THREE.MathUtils.damp(camera.position.x, _camGoalPos.x, 6, rawDt);
        camera.position.y = THREE.MathUtils.damp(camera.position.y, _camGoalPos.y, 6, rawDt);
        camera.position.z = THREE.MathUtils.damp(camera.position.z, _camGoalPos.z, 6, rawDt);
        controls.target.x = THREE.MathUtils.damp(controls.target.x, _camGoalTarget.x, 6, rawDt);
        controls.target.y = THREE.MathUtils.damp(controls.target.y, _camGoalTarget.y, 6, rawDt);
        controls.target.z = THREE.MathUtils.damp(controls.target.z, _camGoalTarget.z, 6, rawDt);

        if (
          camera.position.distanceToSquared(_camGoalPos) < 0.008 &&
          controls.target.distanceToSquared(_camGoalTarget) < 0.008
        ) {
          cameraTransitionRef.current = false;
        }
      }

      controls.update();
      renderer.render(scene, camera);

      // Throttle HUD updates to ~15Hz so React never stalls 60fps WebGL
      if (totalElapsed - lastStatsEmit > 0.065) {
        lastStatsEmit = totalElapsed;
        onStatsRef.current({
          phase,
          pathProgress,
          alienHp,
          alienMaxHp,
          baseHp,
          baseMaxHp,
          wave,
          baseHits,
        });
      }

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    };

    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', handleContextRestored);
      controls.dispose();
      alienRig.dispose();
      tdLevel.dispose();
      textures.dispose();
      envTarget.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  if (webglUnsupported) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-[#0b0e14] text-slate-300 p-8 text-center">
        <p className="font-display text-xl text-white mb-2">WebGL Unavailable</p>
        <p className="text-sm text-slate-400 max-w-md">
          This interactive 2.5D-3D alien animation requires WebGL graphics support in your browser.
        </p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      <div ref={mountRef} className="w-full h-full" />
      {contextLost && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/85 text-slate-200 z-20">
          <p className="font-display text-lg">Restoring 3D Viewport...</p>
        </div>
      )}
    </div>
  );
};
