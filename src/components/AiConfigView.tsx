import React from 'react';
import { Sparkles, Sliders, RefreshCw, Zap, TrendingDown, TrendingUp } from 'lucide-react';
import { Barista, LearningEngineLog } from '../types';

interface AiConfigViewProps {
  baristas: Barista[];
  logs: LearningEngineLog[];
  onUpdateCoefficient: (baristaId: number, newCoef: number) => void;
  onResetLearning: () => void;
}

export const AiConfigView: React.FC<AiConfigViewProps> = ({
  baristas,
  logs,
  onUpdateCoefficient,
  onResetLearning,
}) => {
  return (
    <div className="p-5 space-y-5 overflow-y-auto">
      <div className="flex items-center justify-between border-b border-slate-200 pb-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-emerald-600" />
            <span>抽出タイム自動学習エンジン (AI補正パラメータ)</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            各バリスタの直近抽出実績・タイムスプレッド（時間分散）を自動学習し、予定所要時間の係数を適応制御
          </p>
        </div>

        <button
          onClick={onResetLearning}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>学習パラメータ初期化</span>
        </button>
      </div>

      {/* Barista Coefficients Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {baristas.map((b) => (
          <div key={b.id} className="bg-white rounded-xl border border-slate-300 p-4 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-slate-900 text-white font-mono font-bold rounded flex items-center justify-center text-sm">
                  {b.id}
                </div>
                <div>
                  <h3 className="font-bold text-slate-900">{b.name} バリスタ</h3>
                  <span className="text-[10px] text-slate-500">ドリッパー {b.bayNumber}</span>
                </div>
              </div>
              <span className="font-mono text-base font-black text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-300">
                ×{b.coefficient.toFixed(2)}
              </span>
            </div>

            {/* Slider to adjust coefficient */}
            <div>
              <div className="flex items-center justify-between text-xs text-slate-600 mb-1">
                <span>速度補正係数 (0.80x 〜 1.30x):</span>
                <span className="font-semibold text-slate-900">
                  {b.coefficient < 1.0 ? '高速抽出タイプ' : b.coefficient === 1.0 ? '標準ペース' : '丁寧・大容量タイプ'}
                </span>
              </div>
              <input
                type="range"
                min="0.80"
                max="1.30"
                step="0.01"
                value={b.coefficient}
                onChange={(e) => onUpdateCoefficient(b.id, parseFloat(e.target.value))}
                className="w-full accent-slate-900 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                <span>0.80 (高速)</span>
                <span>1.00 (標準)</span>
                <span>1.30 (長時間)</span>
              </div>
            </div>

            <div className="p-2.5 bg-slate-50 rounded-lg text-xs space-y-1">
              <div className="flex justify-between text-slate-600">
                <span>標準予測 2分30秒 の場合:</span>
                <span className="font-mono font-bold text-slate-900">
                  {Math.floor((150 * b.coefficient) / 60)}分{Math.round((150 * b.coefficient) % 60)}秒
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Real-time Learning Logs */}
      <div className="bg-white rounded-xl border border-slate-300 p-4 shadow-xs">
        <h3 className="font-bold text-sm text-slate-900 mb-3 flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-500" />
          <span>最新の自動補正ログ (直近5件)</span>
        </h3>
        <div className="divide-y divide-slate-100 text-xs">
          {logs.map((log, idx) => (
            <div key={`${log.id}-${idx}`} className="py-2.5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="font-mono text-[11px] text-slate-400">{log.timestamp}</span>
                <span className="font-bold text-slate-900">{log.baristaKey}</span>
                <span className="text-slate-600">直近実績: <strong className="font-mono">{log.recentActual}</strong></span>
                <span className={`font-mono font-bold ${log.deltaType === 'slower' ? 'text-amber-600' : 'text-emerald-600'}`}>
                  {log.deltaStr}
                </span>
              </div>
              <span className="font-mono font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                {log.coefficientStatus}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
