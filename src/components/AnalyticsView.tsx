import React, { useState } from 'react';
import {
  BarChart3,
  TrendingUp,
  Clock,
  CheckCircle,
  Award,
  Activity,
  Filter,
  SlidersHorizontal,
  Info,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { Barista } from '../types';

interface AnalyticsViewProps {
  baristas: Barista[];
  completedCount: number;
  cph: number;
}

// Past 1 hour (07:05 ~ 08:05) time series extraction records
interface TimeSeriesPoint {
  time: string;
  sato: number;
  suzuki: number;
  takahashi: number;
  tanaka: number;
  ito: number;
  watanabe: number;
  // Variance from target
  sato_delta: number;
  suzuki_delta: number;
  takahashi_delta: number;
  tanaka_delta: number;
  ito_delta: number;
  watanabe_delta: number;
}

const PAST_HOUR_SERIES_DATA: TimeSeriesPoint[] = [
  { time: '07:10', sato: 124, suzuki: 149, takahashi: 132, tanaka: 154, ito: 126, watanabe: 110, sato_delta: 4, suzuki_delta: 4, takahashi_delta: 2, tanaka_delta: 4, ito_delta: -2, watanabe_delta: -2 },
  { time: '07:18', sato: 118, suzuki: 143, takahashi: 129, tanaka: 148, ito: 130, watanabe: 114, sato_delta: -2, suzuki_delta: -2, takahashi_delta: -1, tanaka_delta: -2, ito_delta: 2, watanabe_delta: 2 },
  { time: '07:25', sato: 126, suzuki: 153, takahashi: 131, tanaka: 153, ito: 127, watanabe: 108, sato_delta: 6, suzuki_delta: 8, takahashi_delta: 1, tanaka_delta: 3, ito_delta: -1, watanabe_delta: -4 },
  { time: '07:33', sato: 119, suzuki: 146, takahashi: 130, tanaka: 156, ito: 132, watanabe: 113, sato_delta: -1, suzuki_delta: 1, takahashi_delta: 0, tanaka_delta: 6, ito_delta: 4, watanabe_delta: 1 },
  { time: '07:40', sato: 122, suzuki: 144, takahashi: 128, tanaka: 149, ito: 129, watanabe: 111, sato_delta: 2, suzuki_delta: -1, takahashi_delta: -2, tanaka_delta: -1, ito_delta: 1, watanabe_delta: -1 },
  { time: '07:48', sato: 117, suzuki: 152, takahashi: 131, tanaka: 152, ito: 125, watanabe: 115, sato_delta: -3, suzuki_delta: 7, takahashi_delta: 1, tanaka_delta: 2, ito_delta: -3, watanabe_delta: 3 },
  { time: '07:55', sato: 125, suzuki: 148, takahashi: 129, tanaka: 147, ito: 131, watanabe: 109, sato_delta: 5, suzuki_delta: 3, takahashi_delta: -1, tanaka_delta: -3, ito_delta: 3, watanabe_delta: -3 },
  { time: '08:00', sato: 120, suzuki: 145, takahashi: 130, tanaka: 151, ito: 128, watanabe: 112, sato_delta: 0, suzuki_delta: 0, takahashi_delta: 0, tanaka_delta: 1, ito_delta: 0, watanabe_delta: 0 },
  { time: '08:05 (最新)', sato: 119, suzuki: 144, takahashi: 132, tanaka: 150, ito: 127, watanabe: 110, sato_delta: -1, suzuki_delta: -1, takahashi_delta: 2, tanaka_delta: 0, ito_delta: -1, watanabe_delta: -2 },
];

const BARISTA_CHART_CONFIG = [
  { key: 'sato', deltaKey: 'sato_delta', name: '佐藤 (ドリッパー 1)', bayId: 1, target: 120, color: '#4f46e5', specialty: '高速チャンピオン' },
  { key: 'suzuki', deltaKey: 'suzuki_delta', name: '鈴木 (ドリッパー 2)', bayId: 2, target: 145, color: '#d97706', specialty: 'ゲイシャ/限定' },
  { key: 'takahashi', deltaKey: 'takahashi_delta', name: '高橋 (ドリッパー 3)', bayId: 3, target: 130, color: '#059669', specialty: '標準ドリップ' },
  { key: 'tanaka', deltaKey: 'tanaka_delta', name: '田中 (ドリッパー 4)', bayId: 4, target: 150, color: '#0284c7', specialty: 'アイス急冷' },
  { key: 'ito', deltaKey: 'ito_delta', name: '伊藤 (ドリッパー 5)', bayId: 5, target: 128, color: '#e11d48', specialty: 'ブレンド/ミルク' },
  { key: 'watanabe', deltaKey: 'watanabe_delta', name: '渡辺 (ドリッパー 6)', bayId: 6, target: 112, color: '#7c3aed', specialty: 'ハイスピード' },
];

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({
  baristas,
  completedCount,
  cph,
}) => {
  // Chart Mode: 'actual' (seconds) vs 'delta' (deviation +/- sec)
  const [chartMode, setChartMode] = useState<'actual' | 'delta'>('actual');
  // Filter selected barista (null = all)
  const [activeBaristaKey, setActiveBaristaKey] = useState<string | null>(null);

  const hourlyData = [
    { hour: '06:00', cups: 24 },
    { hour: '07:00', cups: 68 },
    { hour: '08:00 (現在)', cups: 94 },
    { hour: '09:00 (予測)', cups: 110 },
    { hour: '10:00 (予測)', cups: 85 },
  ];

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-3 flex-wrap gap-2">
        <div>
          <h2 className="text-[16px] font-black text-slate-900 tracking-tight flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-indigo-600" />
            <span>シフト実績</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            提供数と抽出時間の推移
          </p>
        </div>
      </div>

      {/* Top Stat Cards */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-white rounded-xl border border-slate-300 p-4 shadow-xs">
          <div className="text-xs text-slate-500 font-semibold mb-1 flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4 text-emerald-600" />
            現在スループット
          </div>
          <div className="flex items-baseline gap-1 font-mono">
            <span className="text-3xl font-black text-slate-900">{cph}</span>
            <span className="text-sm font-bold text-slate-500">cph (杯/時)</span>
          </div>
          <div className="text-[11px] text-emerald-600 font-medium mt-1">
            ↑ 前週比 +12% (目標達成)
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-300 p-4 shadow-xs">
          <div className="text-xs text-slate-500 font-semibold mb-1 flex items-center gap-1.5">
            <CheckCircle className="w-4 h-4 text-blue-600" />
            本日提供完了杯数
          </div>
          <div className="flex items-baseline gap-1 font-mono">
            <span className="text-3xl font-black text-slate-900">{186 + completedCount}</span>
            <span className="text-sm font-bold text-slate-500">杯</span>
          </div>
          <div className="text-[11px] text-slate-500 font-medium mt-1">
            平均提供リードタイム 2分42秒
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-300 p-4 shadow-xs">
          <div className="text-xs text-slate-500 font-semibold mb-1 flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-amber-600" />
            予定時刻との平均偏差
          </div>
          <div className="flex items-baseline gap-1 font-mono">
            <span className="text-3xl font-black text-slate-900">±11</span>
            <span className="text-sm font-bold text-slate-500">秒以内</span>
          </div>
          <div className="text-[11px] text-emerald-600 font-medium mt-1">
            高精度抽出維持率 96.8%
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-300 p-4 shadow-xs">
          <div className="text-xs text-slate-500 font-semibold mb-1 flex items-center gap-1.5">
            <Award className="w-4 h-4 text-purple-600" />
            最速バリスタ
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-black text-slate-900">渡辺 (ドリッパー 6)</span>
          </div>
          <div className="text-[11px] text-slate-500 font-medium mt-1">
            補正係数 ×0.91 (平均1分52秒)
          </div>
        </div>
      </div>

      {/* NEW SECTION: Past 1-Hour Barista Extraction Variance Line Chart */}
        <div className="bg-white rounded-xl border border-slate-300 p-3 shadow-xs">
        {/* Section Header & Interactive Controls */}
        <div className="flex flex-col gap-2 pb-3 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-indigo-600" />
              <h3 className="font-bold text-base text-slate-900 tracking-tight">
                過去1時間の抽出時間推移・ブレ分析 (Recharts 折れ線グラフ)
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              各バリスタの直近1時間の実際の抽出時間推移と目標時間からのブレ幅（偏差）を可視化
            </p>
          </div>

          {/* Mode Switch Tabs */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-medium flex items-center gap-1 hidden md:flex">
              <SlidersHorizontal className="w-3.5 h-3.5" />
              表示軸:
            </span>
            <div className="inline-flex rounded-lg border border-slate-300 bg-slate-100 p-1 text-xs">
              <button
                onClick={() => setChartMode('actual')}
                className={`px-3 py-1 rounded-md font-bold transition-all cursor-pointer ${
                  chartMode === 'actual'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                実測抽出時間 (秒)
              </button>
              <button
                onClick={() => setChartMode('delta')}
                className={`px-3 py-1 rounded-md font-bold transition-all cursor-pointer ${
                  chartMode === 'delta'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                基準からのブレ (±秒)
              </button>
            </div>
          </div>
        </div>

        {/* Filter Barista Buttons */}
        <div className="py-3 flex items-center gap-1.5 flex-wrap text-xs select-none">
          <span className="text-slate-500 font-semibold mr-1 flex items-center gap-1">
            <Filter className="w-3.5 h-3.5" />
            <span>絞り込み:</span>
          </span>

          <button
            onClick={() => setActiveBaristaKey(null)}
            className={`px-2.5 py-1 rounded-full text-xs font-bold transition-all border cursor-pointer ${
              activeBaristaKey === null
                ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
            }`}
          >
            全バリスタ (6名)
          </button>

          {BARISTA_CHART_CONFIG.map((b) => {
            const isSelected = activeBaristaKey === b.key;
            return (
              <button
                key={b.key}
                onClick={() => setActiveBaristaKey(isSelected ? null : b.key)}
                className={`px-2.5 py-1 rounded-full text-xs font-bold transition-all border flex items-center gap-1.5 cursor-pointer ${
                  isSelected
                    ? 'text-white shadow-2xs'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                }`}
                style={{
                  backgroundColor: isSelected ? b.color : undefined,
                  borderColor: isSelected ? b.color : undefined,
                }}
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: isSelected ? '#ffffff' : b.color }}
                />
                <span>{b.name}</span>
              </button>
            );
          })}
        </div>

        {/* Recharts Responsive Line Chart */}
        <div className="w-full h-[260px] pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={PAST_HOUR_SERIES_DATA}
              margin={{ top: 10, right: 25, left: 0, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis
                dataKey="time"
                stroke="#64748b"
                fontSize={11}
                tickLine={false}
                axisLine={{ stroke: '#cbd5e1' }}
              />
              <YAxis
                stroke="#64748b"
                fontSize={11}
                tickLine={false}
                axisLine={{ stroke: '#cbd5e1' }}
                unit={chartMode === 'actual' ? '秒' : '秒'}
                domain={chartMode === 'actual' ? [95, 165] : [-12, 12]}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="bg-white/95 backdrop-blur-xs p-3 rounded-lg border border-slate-300 shadow-lg text-xs font-sans">
                        <div className="font-bold text-slate-900 border-b border-slate-200 pb-1 mb-1.5 flex items-center justify-between gap-4">
                          <span>{label} の抽出実績</span>
                          <span className="font-mono text-slate-500 font-normal">
                            {chartMode === 'actual' ? '実測抽出時間' : '基準からのブレ'}
                          </span>
                        </div>
                        <div className="space-y-1">
                          {payload.map((entry: any) => {
                            const config = BARISTA_CHART_CONFIG.find(
                              (c) => (chartMode === 'actual' ? c.key : c.deltaKey) === entry.dataKey
                            );
                            const val = entry.value;
                            const valDisplay =
                              chartMode === 'actual'
                                ? `${val}秒 (基準: ${config?.target}秒)`
                                : `${val > 0 ? `+${val}` : val}秒`;

                            return (
                              <div
                                key={entry.dataKey}
                                className="flex items-center justify-between gap-4"
                              >
                                <span
                                  className="font-semibold flex items-center gap-1.5"
                                  style={{ color: entry.color }}
                                >
                                  <span
                                    className="w-2 h-2 rounded-full inline-block"
                                    style={{ backgroundColor: entry.color }}
                                  />
                                  {entry.name}:
                                </span>
                                <span className="font-mono font-bold text-slate-800">
                                  {valDisplay}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }}
                iconType="circle"
              />

              {/* Benchmark reference lines */}
              {chartMode === 'delta' ? (
                <ReferenceLine
                  y={0}
                  stroke="#ef4444"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  label={{
                    value: '目標基準 ±0秒',
                    fill: '#ef4444',
                    fontSize: 10,
                    position: 'insideTopRight',
                  }}
                />
              ) : (
                <>
                  <ReferenceLine
                    y={120}
                    stroke="#94a3b8"
                    strokeDasharray="3 3"
                    label={{ value: '120秒目安', fill: '#94a3b8', fontSize: 10, position: 'insideRight' }}
                  />
                  <ReferenceLine
                    y={135}
                    stroke="#94a3b8"
                    strokeDasharray="3 3"
                    label={{ value: '135秒目安', fill: '#94a3b8', fontSize: 10, position: 'insideRight' }}
                  />
                  <ReferenceLine
                    y={150}
                    stroke="#94a3b8"
                    strokeDasharray="3 3"
                    label={{ value: '150秒目安', fill: '#94a3b8', fontSize: 10, position: 'insideRight' }}
                  />
                </>
              )}

              {/* Barista Lines */}
              {BARISTA_CHART_CONFIG.map((b) => {
                const isVisible = activeBaristaKey === null || activeBaristaKey === b.key;
                if (!isVisible) return null;

                const dataKey = chartMode === 'actual' ? b.key : b.deltaKey;

                return (
                  <Line
                    key={b.key}
                    type="monotone"
                    dataKey={dataKey}
                    name={b.name}
                    stroke={b.color}
                    strokeWidth={activeBaristaKey === b.key ? 3.5 : 2}
                    dot={{ r: 3, strokeWidth: 1 }}
                    activeDot={{ r: 6 }}
                    isAnimationActive={true}
                  />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Insight Breakdown Footnotes */}
        <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-1 gap-2 text-xs">
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 flex items-start gap-2">
            <Info className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-slate-800">最も安定したバリスタ</div>
              <div className="text-slate-600 text-[11px] mt-0.5">
                高橋（ドリッパー 3）：標準偏差 <span className="font-mono font-bold text-emerald-600">σ = ±1.4秒</span> 以内。再現性の極めて高い抽出を継続中。
              </div>
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 flex items-start gap-2">
            <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-slate-800">意図的ブレ要因（適正）</div>
              <div className="text-slate-600 text-[11px] mt-0.5">
                鈴木（ドリッパー 2）：ゲイシャ特有のガス抜け度合に応じた蒸らし時間調整のため、±7秒前後の適正ブレが発生。
              </div>
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 flex items-start gap-2">
            <Info className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-slate-800">許容レンジ (±15秒) 達成率</div>
              <div className="text-slate-600 text-[11px] mt-0.5">
                全バリスタ平均 <span className="font-mono font-bold text-emerald-600">98.2%</span> を達成。AI補正係数によりシフト全体のブレを抑制。
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Hourly Throughput Bar Visualizer */}
      <div className="bg-white rounded-xl border border-slate-300 p-3 shadow-xs">
        <h3 className="font-bold text-sm text-slate-900 mb-4">
          時間帯別 抽出杯数推移 (Cups Per Hour)
        </h3>
        <div className="space-y-3">
          {hourlyData.map((d) => (
            <div key={d.hour} className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="font-semibold text-slate-700">{d.hour}</span>
                <span className="font-mono font-bold text-slate-900">{d.cups} 杯</span>
              </div>
              <div className="h-4 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-slate-900 rounded-full transition-all"
                  style={{ width: `${(d.cups / 120) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Barista Efficiency Ranking */}
      <div className="bg-white rounded-xl border border-slate-300 p-3 shadow-xs">
        <h3 className="font-bold text-sm text-slate-900 mb-3">
          バリスタ別 抽出ペースと担当カテゴリ
        </h3>
        <div className="grid grid-cols-1 gap-2">
          {baristas.map((b) => (
            <div key={b.id} className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <div className="flex justify-between items-center mb-1">
                <span className="font-bold text-slate-900">{b.name} (ドリッパー {b.id})</span>
                <span className="font-mono text-xs font-bold text-emerald-700">×{b.coefficient}</span>
              </div>
              <p className="text-[11px] text-slate-600">
                担当: {b.id === 4 ? 'アイス急冷特化' : b.id === 2 ? 'ゲイシャ/限定ハンドドリップ' : b.id === 5 ? 'カフェオレ/スチーム' : 'ハイスピードドリップ'}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
