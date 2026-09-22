import { Sliders, Zap } from 'lucide-react';
import type React from 'react';
import type { LearningEngineLog } from '../types';

interface AiLearningEnginePanelProps {
  logs: LearningEngineLog[];
  onTriggerRecalibration: () => void;
}

export const AiLearningEnginePanel: React.FC<AiLearningEnginePanelProps> = ({ logs, onTriggerRecalibration }) => {
  return (
    <div className="bg-white rounded-lg border border-[#cbd5e1] p-3 shadow-xs w-full lg:w-[420px] shrink-0 flex flex-col justify-between">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-[#16a34a]" />
          <h2 className="text-[14px] font-bold text-[#0f172a] tracking-tight">抽出タイム自動学習エンジン</h2>
        </div>
        <button
          onClick={onTriggerRecalibration}
          className="text-[10px] text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1 hover:underline cursor-pointer"
          title="実績データをもとに係数を再計算"
        >
          <Zap className="w-3 h-3 text-amber-500" />
          <span>即時補正</span>
        </button>
      </div>

      {/* Rows Container */}
      <div className="flex flex-col gap-1.5 flex-1 justify-center">
        {logs.map((log) => {
          let statusColor = 'text-[#16a34a] font-bold';
          if (log.coefficientStatus.includes('連動')) {
            statusColor = 'text-[#d97706] font-bold';
          } else if (log.coefficientStatus.includes('最速')) {
            statusColor = 'text-[#0284c7] font-bold';
          }

          let deltaColor = 'text-[#16a34a]';
          if (log.deltaType === 'slower') {
            deltaColor = 'text-[#ea580c]';
          }

          return (
            <div
              key={log.id}
              className="bg-[#f0f7ff] border border-[#dbeafe] rounded px-3 py-2 flex items-center justify-between text-[12px] font-medium"
            >
              {/* Left: Barista & recent performance */}
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-900">{log.baristaKey}:</span>
                <span className="text-slate-600">直近実績</span>
                <span className="font-mono font-bold text-slate-800">{log.recentActual}</span>
                <span className={`font-mono text-[11px] font-bold ${deltaColor}`}>{log.deltaStr}</span>
              </div>

              {/* Right: AI Coefficient status */}
              <div className="flex items-center gap-1 shrink-0">
                <span className={`font-mono text-[11px] ${statusColor}`}>{log.coefficientStatus}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
