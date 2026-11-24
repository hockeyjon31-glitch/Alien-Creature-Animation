/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useState } from 'react';
import { AlienSceneCanvas } from './components/AlienSceneCanvas';
import { ControlOverlay } from './components/ControlOverlay';
import { SimulationConfig, SimulationStats } from './types/alien';

export default function App() {
  const [config, setConfig] = useState<SimulationConfig>({
    mode: 'auto_loop',
    cameraPreset: 'isometric_25d',
    speedMultiplier: 1,
    turretsEnabled: false,
    soundEnabled: false,
    paused: false,
  });

  const [stats, setStats] = useState<SimulationStats>({
    phase: 'walking',
    pathProgress: 0,
    alienHp: 100,
    alienMaxHp: 100,
    baseHp: 100,
    baseMaxHp: 100,
    wave: 1,
    baseHits: 0,
  });

  const [resetToken, setResetToken] = useState(0);

  const handleChangeConfig = useCallback((patch: Partial<SimulationConfig>) => {
    setConfig((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleReset = useCallback(() => {
    setConfig((prev) => ({ ...prev, mode: 'auto_loop', paused: false }));
    setResetToken((t) => t + 1);
  }, []);

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#0b0e14]">
      <AlienSceneCanvas
        config={config}
        resetToken={resetToken}
        onStatsUpdate={setStats}
      />
      <ControlOverlay
        config={config}
        stats={stats}
        onChangeConfig={handleChangeConfig}
        onReset={handleReset}
      />
    </main>
  );
}
