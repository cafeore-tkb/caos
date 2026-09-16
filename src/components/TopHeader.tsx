import React from 'react';
import { Volume2, VolumeX, Plus, Play, Pause, RotateCcw } from 'lucide-react';
import { BeanCode } from '../types';
import { BEAN_LEGENDS } from '../data/initialData';
import { soundManager } from '../utils/audio';

interface TopHeaderProps {
  timeStr: string;
  unassignedCups: number;
  totalWaitingCups: number;
  selectedBeanFilter: BeanCode | null;
  onSelectBeanFilter: (code: BeanCode | null) => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  isRunning: boolean;
  onTogglePlay: () => void;
  simSpeed: number;
  onChangeSpeed: (speed: number) => void;
  onResetData: () => void;
  onOpenNewOrder: () => void;
}

export const TopHeader: React.FC<TopHeaderProps> = ({
  timeStr,
  unassignedCups,
  totalWaitingCups,
  selectedBeanFilter,
  onSelectBeanFilter,
  soundEnabled,
  onToggleSound,
  isRunning,
  onTogglePlay,
  simSpeed,
  onChangeSpeed,
  onResetData,
  onOpenNewOrder,
}) => {
  return (
    <header className="h-[64px] bg-white border-b border-[#e2e8f0] px-4 flex items-center justify-between shadow-xs select-none">
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
              className="p-1 hover:bg-white text-slate-700 rounded transition-colors text-xs"
            >
              {isRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            </button>
            <button
              id="sim-speed-btn"
              onClick={() => onChangeSpeed(simSpeed === 1 ? 2 : simSpeed === 2 ? 5 : 1)}
              title="シミュレーション速度切替"
              className="px-1.5 py-0.5 hover:bg-white text-[11px] font-mono font-bold text-slate-700 rounded transition-colors"
            >
              {simSpeed}x
            </button>
            <button
              id="sim-reset-btn"
              onClick={onResetData}
              title="初期状態にリセット"
              className="p-1 hover:bg-white text-slate-600 rounded transition-colors"
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
          <span className="text-[12px] font-semibold text-[#475569]">全ベイ待機杯数</span>
          <div className="flex items-baseline font-mono">
            <span className="text-[19px] font-extrabold text-[#0f172a] leading-none">
              {totalWaitingCups}
            </span>
            <span className="text-[12px] font-bold text-[#475569] ml-1">杯</span>
          </div>
        </div>
      </div>

      {/* Right side: Bean Legend Badges & Quick Action */}
      <div className="flex items-center gap-3">
        {/* Bean Legend list */}
        <div className="hidden lg:flex items-center gap-1.5">
          {BEAN_LEGENDS.map((bean) => {
            const isSelected = selectedBeanFilter === bean.code;
            return (
              <button
                key={bean.code}
                id={`legend-filter-${bean.code.toLowerCase()}`}
                onClick={() => onSelectBeanFilter(isSelected ? null : bean.code)}
                className={`flex items-center gap-1 px-2 py-1 rounded border text-[11px] font-semibold transition-all ${
                  isSelected
                    ? 'ring-2 ring-blue-500 scale-105 shadow-xs font-bold'
                    : 'opacity-90 hover:opacity-100 hover:scale-102'
                } ${
                  bean.code === 'ORE'
                    ? 'bg-[#18181b] text-white border-[#27272a]'
                    : bean.code === 'SP'
                    ? 'bg-[#064e3b] text-white border-[#059669]'
                    : `${bean.badgeBg} text-slate-800 ${bean.borderColor}`
                }`}
                title={`${bean.subLabel} で絞り込み`}
              >
                <span className="font-bold tracking-tight">{bean.subLabel}</span>
              </button>
            );
          })}
          {selectedBeanFilter && (
            <button
              onClick={() => onSelectBeanFilter(null)}
              className="text-[10px] text-blue-600 hover:underline px-1 py-0.5 ml-1"
            >
              解除
            </button>
          )}
        </div>

        {/* Quick Order Button */}
        <button
          id="btn-add-order"
          onClick={onOpenNewOrder}
          className="flex items-center gap-1 bg-[#0f172a] hover:bg-[#1e293b] text-white text-xs font-medium px-2.5 py-1.5 rounded-md shadow-xs transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>オーダー追加</span>
        </button>

        {/* Sound toggle */}
        <button
          id="btn-toggle-sound"
          onClick={() => {
            soundManager.enabled = !soundEnabled;
            onToggleSound();
          }}
          title={soundEnabled ? '通知音 ON' : '通知音 消音'}
          className={`p-1.5 rounded-md border text-xs transition-colors ${
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
