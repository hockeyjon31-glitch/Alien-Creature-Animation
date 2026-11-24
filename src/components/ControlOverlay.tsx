import React, { useEffect, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Pause,
  Play,
  RotateCcw,
  Shield,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  AnimationMode,
  CameraPreset,
  CombatPhase,
  SimulationConfig,
  SimulationStats,
} from '../types/alien';

interface ControlOverlayProps {
  config: SimulationConfig;
  stats: SimulationStats;
  onChangeConfig: (patch: Partial<SimulationConfig>) => void;
  onReset: () => void;
}

const PHASE_LABELS: Record<CombatPhase, string> = {
  spawning: 'Entering Breach',
  walking: 'Advancing on Lane',
  rearing: 'Battle Screech',
  attacking: 'Attacking Base',
  defeated: 'Defeated',
  breached: 'Base Breached',
};

const MODE_OPTIONS: Array<{ id: AnimationMode; label: string }> = [
  { id: 'auto_loop', label: 'Auto Raid' },
  { id: 'walk', label: 'Walk Cycle' },
  { id: 'attack', label: 'Attack Base' },
  { id: 'screech', label: 'Rear Screech' },
  { id: 'defeat', label: 'Defeat Pose' },
];

const CAMERA_OPTIONS: Array<{ id: CameraPreset; label: string }> = [
  { id: 'isometric_25d', label: '2.5D Iso' },
  { id: 'follow_td', label: 'Follow' },
  { id: 'base_siege', label: 'Base View' },
  { id: 'closeup', label: 'Close-Up' },
];

const SPEED_OPTIONS = [0.5, 1, 2];

export const ControlOverlay: React.FC<ControlOverlayProps> = ({
  config,
  stats,
  onChangeConfig,
  onReset,
}) => {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'h' || e.key === 'H') {
        setCollapsed((prev) => !prev);
      } else if (e.code === 'Space') {
        e.preventDefault();
        onChangeConfig({ paused: !config.paused });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [config.paused, onChangeConfig]);

  const progressPct = Math.round((stats.pathProgress / 0.87) * 100);
  const alienPct = Math.max(0, Math.min(100, (stats.alienHp / stats.alienMaxHp) * 100));
  const basePct = Math.max(0, Math.min(100, (stats.baseHp / stats.baseMaxHp) * 100));

  return (
    <div className="pointer-events-none fixed inset-0 z-10">
      {/* Minimal Top-Left Title & Live Readout */}
      <div className="pointer-events-auto absolute top-4 left-4 bg-[#111622]/92 border border-white/10 rounded-xl px-4 py-3 max-w-xs sm:max-w-sm shadow-xl">
        <div className="flex items-baseline justify-between gap-4">
          <h1 className="font-display text-base font-bold tracking-tight text-white whitespace-nowrap">
            Chitin Stalker
          </h1>
          <span className="font-mono-num text-xs text-cyan-300 whitespace-nowrap">
            Wave {stats.wave}
          </span>
        </div>

        <div className="mt-1 flex items-center gap-2 text-xs text-slate-400 whitespace-nowrap">
          <span className="text-slate-200 font-medium">{PHASE_LABELS[stats.phase]}</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono-num">Lane {Math.min(100, progressPct)}%</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono-num">Hits {stats.baseHits}</span>
        </div>

        {/* Clean Dual Integrity Bars */}
        <div className="mt-2.5 grid grid-cols-2 gap-3">
          <div>
            <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
              <span>Alien HP</span>
              <span className="font-mono-num text-slate-200">{stats.alienHp}</span>
            </div>
            <div className="h-1.5 w-full bg-slate-800 rounded-sm overflow-hidden">
              <div
                className="h-full bg-lime-400 transition-transform duration-150 origin-left"
                style={{ transform: `scaleX(${alienPct / 100})` }}
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
              <span>Base Shield</span>
              <span className="font-mono-num text-slate-200">{stats.baseHp}</span>
            </div>
            <div className="h-1.5 w-full bg-slate-800 rounded-sm overflow-hidden">
              <div
                className="h-full bg-sky-400 transition-transform duration-150 origin-left"
                style={{ transform: `scaleX(${basePct / 100})` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Collapsible Unified Bottom Control Dock */}
      <div
        className="pointer-events-auto fixed bottom-5 left-1/2 -translate-x-1/2 transition-transform duration-200 ease-out"
        style={{
          width: 'min(940px, 94vw)',
          transform: collapsed
            ? 'translate(-50%, calc(100% + 24px))'
            : 'translate(-50%, 0)',
        }}
      >
        {/* Collapse / Expand Handle */}
        <div className="flex justify-center -mb-px">
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="flex items-center gap-1.5 px-3 py-1 bg-[#111622]/94 border border-b-0 border-white/12 rounded-t-lg text-xs font-medium text-slate-300 hover:text-white transition-colors focus-visible:outline-2 focus-visible:outline-sky-400 whitespace-nowrap"
            style={{
              transform: collapsed ? 'translateY(-36px)' : 'translateY(0)',
            }}
            title="Toggle Controls (H)"
          >
            {collapsed ? (
              <>
                <ChevronUp className="w-3.5 h-3.5" />
                <span>Show Controls</span>
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5" />
                <span>Hide Controls</span>
              </>
            )}
          </button>
        </div>

        {/* Main Bottom Dock Surface */}
        <div className="bg-[#111622]/94 border border-white/12 rounded-xl px-4 py-3 shadow-2xl">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Animation Mode Selector */}
            <div className="flex items-center gap-1 bg-slate-900/90 p-1 rounded-lg border border-white/6 overflow-x-auto">
              {MODE_OPTIONS.map((opt) => {
                const active = config.mode === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onChangeConfig({ mode: opt.id })}
                    className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-sky-400 ${
                      active
                        ? 'bg-cyan-500 text-slate-950 font-semibold'
                        : 'text-slate-300 hover:text-white hover:bg-white/6'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

            {/* Camera View Selector */}
            <div className="flex items-center gap-1 bg-slate-900/90 p-1 rounded-lg border border-white/6 overflow-x-auto">
              {CAMERA_OPTIONS.map((cam) => {
                const active = config.cameraPreset === cam.id;
                return (
                  <button
                    key={cam.id}
                    type="button"
                    onClick={() => onChangeConfig({ cameraPreset: cam.id })}
                    className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-sky-400 ${
                      active
                        ? 'bg-slate-100 text-slate-950 font-semibold'
                        : 'text-slate-300 hover:text-white hover:bg-white/6'
                    }`}
                  >
                    {cam.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Secondary Compact Playback & Environment Strip */}
          <div className="mt-2.5 pt-2.5 border-t border-white/8 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onChangeConfig({ paused: !config.paused })}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-xs font-medium text-white transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-sky-400"
              >
                {config.paused ? (
                  <>
                    <Play className="w-3.5 h-3.5" />
                    <span>Resume</span>
                  </>
                ) : (
                  <>
                    <Pause className="w-3.5 h-3.5" />
                    <span>Pause</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={onReset}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-sky-400"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Restart</span>
              </button>

              <div className="flex items-center gap-0.5 bg-slate-900/90 p-0.5 rounded-md border border-white/6">
                {SPEED_OPTIONS.map((spd) => (
                  <button
                    key={spd}
                    type="button"
                    onClick={() => onChangeConfig({ speedMultiplier: spd })}
                    className={`px-2 py-1 rounded text-xs font-mono-num transition-colors whitespace-nowrap shrink-0 ${
                      config.speedMultiplier === spd
                        ? 'bg-slate-700 text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {spd}x
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onChangeConfig({ turretsEnabled: !config.turretsEnabled })}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-sky-400 ${
                  config.turretsEnabled
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-400/35'
                    : 'bg-slate-800 text-slate-300 border border-transparent hover:bg-slate-700'
                }`}
              >
                <Shield className="w-3.5 h-3.5" />
                <span>{config.turretsEnabled ? 'Turrets Firing' : 'Turrets Standby'}</span>
              </button>

              <button
                type="button"
                onClick={() => onChangeConfig({ soundEnabled: !config.soundEnabled })}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-sky-400 ${
                  config.soundEnabled
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/35'
                    : 'bg-slate-800 text-slate-300 border border-transparent hover:bg-slate-700'
                }`}
              >
                {config.soundEnabled ? (
                  <>
                    <Volume2 className="w-3.5 h-3.5" />
                    <span>Sound On</span>
                  </>
                ) : (
                  <>
                    <VolumeX className="w-3.5 h-3.5" />
                    <span>Muted</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
