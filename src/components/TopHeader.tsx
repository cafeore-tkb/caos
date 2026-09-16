import React from 'react';
import { Volume2, VolumeX, Play, Pause, RotateCcw, Undo2 } from 'lucide-react';
import { soundManager } from '../utils/audio';

interface TopHeaderProps {
  timeStr: string;
  unassignedCups: number;
  totalWaitingCups: number;
  soundEnabled: boolean;
  onToggleSound: () => void;
  isRunning: boolean;
  onTogglePlay: () => void;
  simSpeed: number;
  onChangeSpeed: (speed: number) => void;
  onResetData: () => void;
  canUndo: boolean;
  undoLabel: string | null;
  onUndo: () => void;
}

export const TopHeader: React.FC<TopHeaderProps> = ({
  timeStr,
  unassignedCups,
  totalWaitingCups,
  soundEnabled,
  onToggleSound,
  isRunning,
  onTogglePlay,
  simSpeed,
  onChangeSpeed,
  onResetData,
  canUndo,
  undoLabel,
  onUndo,
}) => {
  return (
    <header className="h-[56px] bg-white border-b border-[#e2e8f0] px-4 flex items-center justify-between shadow-xs select-none shrink-0">
      {/* Left side: Clock and Top Metrics */}
      <div className="flex items-center gap-4">
        {/* Large Digital Clock */}
        <div className="flex items-center gap-2">
          <div className="font-mono text-[28px] font-bold tracking-tight text-[#0f172a] leading-none">
            {timeStr}
          </div>
          {/* Quick Sim Controls */}
          <div className="flex items-center gap-1 bg-[#f1f5f9] p-1 rounded-md border border-[#e2e8f0]">
            <button
              id="sim-play-pause-btn"
              onClick={onTogglePlay}
              title={isRunning ? '一時停止' : 'タイマー再開'}
              className="w-10 h-10 hover:bg-white text-slate-700 rounded-lg transition-colors text-xs flex items-center justify-center touch-manipulation"
            >
              {isRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            </button>
            <button
              id="sim-speed-btn"
              onClick={() => onChangeSpeed(simSpeed === 1 ? 2 : simSpeed === 2 ? 5 : 1)}
              title="シミュレーション速度切替"
              className="min-w-10 h-10 px-1.5 hover:bg-white text-[11px] font-mono font-bold text-slate-700 rounded-lg transition-colors touch-manipulation"
            >
              {simSpeed}x
            </button>
            <button
              id="sim-reset-btn"
              onClick={onResetData}
              title="初期状態にリセット"
              className="w-10 h-10 hover:bg-white text-slate-600 rounded-lg transition-colors flex items-center justify-center touch-manipulation"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Metric 1: 未割当オーダー (Unassigned Orders) */}
        <div className="bg-[#eef5fc] border border-[#d3e5f8] rounded-md px-3 py-1.5 flex items-baseline gap-1.5">
          <span className="text-[12px] font-semibold text-[#475569]">未割当オーダー</span>
          <div className="flex items-baseline font-mono">
            <span className="text-[19px] font-extrabold text-[#ef4444] leading-none">
              {unassignedCups}
            </span>
            <span className="text-[12px] font-bold text-[#475569] ml-1">杯</span>
          </div>
        </div>

        {/* Metric 2: 全ベイ待機杯数 (Total Queued Cups in Bays) */}
        <div className="bg-[#eef5fc] border border-[#d3e5f8] rounded-md px-3 py-1.5 flex items-baseline gap-1.5">
          <span className="text-[12px] font-semibold text-[#475569]">全ドリッパー待機杯数</span>
          <div className="flex items-baseline font-mono">
            <span className="text-[19px] font-extrabold text-[#0f172a] leading-none">
              {totalWaitingCups}
            </span>
            <span className="text-[12px] font-bold text-[#475569] ml-1">杯</span>
          </div>
        </div>
      </div>

      {/* Right side: only persistent operational controls */}
      <div className="flex items-center gap-3">
        <button
          id="btn-undo"
          type="button"
          disabled={!canUndo}
          onClick={onUndo}
          title={undoLabel ? `${undoLabel}を元に戻す` : '元に戻せる操作はありません'}
          className="min-h-[44px] flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-black text-slate-800 shadow-xs transition-colors hover:bg-slate-100 disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 touch-manipulation"
        >
          <Undo2 className="w-4 h-4" />
          <span>1つ戻す</span>
        </button>

        {/* Sound toggle */}
        <button
          id="btn-toggle-sound"
          onClick={() => {
            soundManager.enabled = !soundEnabled;
            onToggleSound();
          }}
          title={soundEnabled ? '通知音 ON' : '通知音 消音'}
          className={`w-11 h-11 rounded-lg border text-xs transition-colors flex items-center justify-center touch-manipulation ${
            soundEnabled
              ? 'bg-[#f1f5f9] text-slate-700 border-[#cbd5e1]'
              : 'bg-red-50 text-red-500 border-red-200'
          }`}
        >
          {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
        </button>
      </div>
    </header>
  );
};
