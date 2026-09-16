import React from 'react';
import { Thermometer, Gauge, ShieldCheck, Activity, Coffee } from 'lucide-react';
import { Barista } from '../types';

interface BaysOverviewViewProps {
  baristas: Barista[];
  onSelectBayForDispatch: (bayId: number) => void;
}

export const BaysOverviewView: React.FC<BaysOverviewViewProps> = ({
  baristas,
  onSelectBayForDispatch,
}) => {
  const baySpecs = [
    { bay: 1, grinder: 'Comandante C40 MK4 (#24)', kettleTemp: '93.5°C', scale: 'Acaia Lunar (0.1g精度)', status: '抽出中 (順調)' },
    { bay: 2, grinder: 'EK43 S (#7.8)', kettleTemp: '91.0°C', scale: 'Acaia Pearl S', status: '抽出中 (ハンドポア)' },
    { bay: 3, grinder: 'EK43 S (#8.0)', kettleTemp: '92.5°C', scale: 'Acaia Lunar', status: '落としきり段階' },
    { bay: 4, grinder: 'Comandante C40 (#21)', kettleTemp: '95.0°C', scale: 'Felicita Arc (急冷対応)', status: 'アイス急冷中' },
    { bay: 5, grinder: 'EK43 S (#7.0)', kettleTemp: '92.0°C', scale: 'Acaia Lunar + スチーマー', status: '待機・オレ抽出' },
    { bay: 6, grinder: 'Mahlkönig Peak (#2.4)', kettleTemp: '94.0°C', scale: 'Acaia Pearl S', status: '抽出中 (浅煎り特化)' },
  ];

  return (
    <div className="p-5 space-y-5 overflow-y-auto">
      <div className="flex items-center justify-between border-b border-slate-200 pb-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <span>6人のドリッパーと使用設備</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            抽出担当者ごとの現在キューと使用設備
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            全ドリッパー稼働中 (RUN 6/6)
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {baristas.map((barista) => {
          const spec = baySpecs.find((s) => s.bay === barista.id);
          return (
            <div
              key={barista.id}
              className="bg-white rounded-xl border border-slate-300 p-4 shadow-xs flex flex-col justify-between hover:shadow-md transition-shadow"
            >
              <div>
                <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 border border-slate-300 bg-slate-100 text-slate-600 font-mono font-bold rounded-lg flex items-center justify-center text-sm">
                      {barista.id}
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900">{barista.name} バリスタ</h3>
                      <span className="text-[10px] text-slate-500">ドリッパー {barista.bayNumber}</span>
                    </div>
                  </div>
                  {barista.canHandleSpecial && (
                    <span className="text-[10px] font-black px-2 py-1 rounded bg-emerald-950 text-emerald-100">★ SP</span>
                  )}
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between p-2 bg-slate-50 rounded border border-slate-200">
                    <span className="text-slate-500 flex items-center gap-1.5">
                      <Thermometer className="w-3.5 h-3.5 text-amber-500" />
                      ケトル実測水温:
                    </span>
                    <span className="font-mono font-bold text-slate-800">{spec?.kettleTemp}</span>
                  </div>

                  <div className="flex items-center justify-between p-2 bg-slate-50 rounded border border-slate-200">
                    <span className="text-slate-500 flex items-center gap-1.5">
                      <Gauge className="w-3.5 h-3.5 text-blue-500" />
                      グラインダー設定:
                    </span>
                    <span className="font-mono text-slate-800 font-semibold">{spec?.grinder}</span>
                  </div>

                  <div className="flex items-center justify-between p-2 bg-slate-50 rounded border border-slate-200">
                    <span className="text-slate-500 flex items-center gap-1.5">
                      <Activity className="w-3.5 h-3.5 text-purple-500" />
                      計量スケール:
                    </span>
                    <span className="text-slate-700 font-medium">{spec?.scale}</span>
                  </div>
                </div>

                {/* Queue Summary */}
                <div className="mt-3 pt-3 border-t border-slate-100">
                  <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                    <span>現在キュー待機:</span>
                    <span className="font-mono font-bold text-slate-900">{barista.queue.length} 件</span>
                  </div>
                  <div className="flex gap-1 overflow-x-hidden">
                    {barista.queue.map((t) => (
                      <span key={t.id} className="font-mono text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-700 border border-slate-200">
                        {t.id}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <button
                onClick={() => onSelectBayForDispatch(barista.id)}
                className="mt-4 w-full min-h-[44px] bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors touch-manipulation"
              >
                <Coffee className="w-3.5 h-3.5" />
                <span>管制盤でこのドリッパーを表示</span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
