export type AnimationMode = 'auto_loop' | 'walk' | 'attack' | 'screech' | 'defeat';

export type CameraPreset = 'isometric_25d' | 'follow_td' | 'base_siege' | 'closeup';

export type CombatPhase =
  | 'spawning'
  | 'walking'
  | 'rearing'
  | 'attacking'
  | 'defeated'
  | 'breached';

export interface SimulationStats {
  phase: CombatPhase;
  pathProgress: number; // 0 to 1
  alienHp: number;
  alienMaxHp: number;
  baseHp: number;
  baseMaxHp: number;
  wave: number;
  baseHits: number;
}

export interface SimulationConfig {
  mode: AnimationMode;
  cameraPreset: CameraPreset;
  speedMultiplier: number;
  turretsEnabled: boolean;
  soundEnabled: boolean;
  paused: boolean;
}
