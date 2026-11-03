import React from 'react';
import { Sliders, Type, AlignLeft, Clock, Zap } from 'lucide-react';
import { SrtMode, StitchOptions, WeightMode } from '../types';

interface SrtSettingsPanelProps {
  options: StitchOptions;
  onOptionsChange: (options: StitchOptions) => void;
  totalWords: number;
}

export const SrtSettingsPanel: React.FC<SrtSettingsPanelProps> = ({
  options,
  onOptionsChange,
  totalWords,
}) => {
  const setMode = (mode: SrtMode) => {
    onOptionsChange({ ...options, mode });
  };

  const setWordsPerSub = (val: number) => {
    const clamped = Math.max(1, Math.min(10, Math.round(val)));
    onOptionsChange({ ...options, wordsPerSub: clamped });
  };

  const setGapMs = (val: number) => {
    const clamped = Math.max(0, Math.min(3000, Math.round(val)));
    onOptionsChange({ ...options, gapMs: clamped });
  };

  const setWeightMode = (weightMode: WeightMode) => {
    onOptionsChange({ ...options, weightMode });
  };

  const estimatedCues =
    options.mode === 'words'
      ? Math.max(1, Math.ceil(totalWords / options.wordsPerSub))
      : 'Line-based';

  return (
    <div className="rounded-xl bg-slate-900/80 border border-slate-800 p-4 space-y-5">
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
        <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
          <Sliders className="w-4 h-4 text-purple-400" />
          Subtitle & Stitching Settings
        </h2>
        <span className="text-xs text-slate-400 font-mono">
          Est. Cues: <strong className="text-blue-400 font-semibold">{estimatedCues}</strong>
        </span>
      </div>

      {/* Mode Selector */}
      <div className="space-y-2">
        <label className="text-xs font-semibold text-slate-300 block">
          Subtitle Segmentation Mode:
        </label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setMode('words')}
            className={`p-3 rounded-lg border text-left transition-all ${
              options.mode === 'words'
                ? 'bg-blue-950/40 border-blue-500/80 text-white'
                : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center gap-2 font-semibold text-xs mb-1">
              <Type className="w-3.5 h-3.5 text-blue-400" />
              Words Per Subtitle
            </div>
            <p className="text-[11px] text-slate-400 leading-tight">
              Group 1 to 10 words per cue with natural speaking cadence.
            </p>
          </button>

          <button
            type="button"
            onClick={() => setMode('lines')}
            className={`p-3 rounded-lg border text-left transition-all ${
              options.mode === 'lines'
                ? 'bg-blue-950/40 border-blue-500/80 text-white'
                : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center gap-2 font-semibold text-xs mb-1">
              <AlignLeft className="w-3.5 h-3.5 text-emerald-400" />
              Line-Wise
            </div>
            <p className="text-[11px] text-slate-400 leading-tight">
              Respect script line breaks (one full line per subtitle cue).
            </p>
          </button>
        </div>
      </div>

      {/* Words Per Subtitle Slider & Fast Tap Buttons (if mode === 'words') */}
      {options.mode === 'words' && (
        <div className="space-y-3 p-3 rounded-lg bg-slate-950/50 border border-slate-800/80">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-slate-200 flex items-center gap-1.5">
              <span>Words per Subtitle:</span>
              <span className="font-mono text-sm font-bold text-blue-400 tabular-nums">
                {options.wordsPerSub} {options.wordsPerSub === 1 ? 'word' : 'words'}
              </span>
            </label>
            <span className="text-[11px] text-slate-500 font-mono">1 – 10 words</span>
          </div>

          <input
            type="range"
            min={1}
            max={10}
            step={1}
            value={options.wordsPerSub}
            onChange={e => setWordsPerSub(Number(e.target.value))}
            className="w-full accent-blue-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
          />

          {/* Quick-tap 1 to 10 buttons */}
          <div className="grid grid-cols-10 gap-1 pt-1">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
              <button
                key={n}
                type="button"
                onClick={() => setWordsPerSub(n)}
                className={`py-1 rounded text-xs font-mono font-semibold transition-colors ${
                  options.wordsPerSub === n
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <div className="flex justify-between text-[10px] text-slate-500 font-mono px-0.5">
            <span>1 (Fast Karaoke/Shorts)</span>
            <span>4 (Standard)</span>
            <span>10 (Full phrases)</span>
          </div>
        </div>
      )}

      {/* Inter-clip Silence Gap */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-slate-200 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            Silence Gap Between Clips:
            <span className="font-mono font-semibold text-amber-400 tabular-nums">
              {options.gapMs}ms
            </span>
          </label>
          <span className="text-[11px] text-slate-500 font-mono">0 – 2000ms</span>
        </div>

        <input
          type="range"
          min={0}
          max={2000}
          step={50}
          value={options.gapMs}
          onChange={e => setGapMs(Number(e.target.value))}
          className="w-full accent-amber-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
        />

        <div className="flex items-center gap-2 pt-0.5">
          {[0, 100, 250, 500, 1000].map(ms => (
            <button
              key={ms}
              type="button"
              onClick={() => setGapMs(ms)}
              className={`px-2.5 py-1 rounded text-[11px] font-mono transition-colors ${
                options.gapMs === ms
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50'
                  : 'bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {ms === 0 ? '0ms (Seamless)' : `${ms}ms`}
            </button>
          ))}
        </div>
      </div>

      {/* Speech Pacing Weight */}
      <div className="space-y-1.5 pt-1 border-t border-slate-800/80">
        <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5 text-blue-400" />
          Timing Pacing Weight:
        </label>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <button
            type="button"
            onClick={() => setWeightMode('chars')}
            className={`p-2 rounded border text-left transition-colors ${
              options.weightMode === 'chars'
                ? 'bg-blue-950/40 border-blue-500 text-blue-200'
                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <div className="font-semibold text-xs">Character-Weighted</div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              Longer words get more time (Natural speech)
            </div>
          </button>

          <button
            type="button"
            onClick={() => setWeightMode('equal')}
            className={`p-2 rounded border text-left transition-colors ${
              options.weightMode === 'equal'
                ? 'bg-blue-950/40 border-blue-500 text-blue-200'
                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <div className="font-semibold text-xs">Equal Duration</div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              Even division across all chunks
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};
