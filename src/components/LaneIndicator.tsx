import type { Barista } from '../types';

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
export function LaneIndicator({ bay, nowSec }: { bay: Barista; nowSec: number }) {
  const current = bay.queue[0];
  const seconds = Math.max(
    0,
    Math.round(
      current?.timeRemainingSec ?? (current ? (current.startTimeSec ?? nowSec) + current.totalDurationSec - nowSec : 0)
    )
  );
  const over = current
    ? Math.max(0, Math.floor(nowSec - (current.startTimeSec ?? nowSec) - current.totalDurationSec))
    : 0;
  const phase = !current
    ? '空き'
    : seconds > 15
      ? '抽出中'
      : seconds > 0
        ? 'まもなく'
        : over > 120
          ? '要確認'
          : '継続中';
  const tone = !current
    ? 'border-emerald-700 bg-emerald-500 text-white'
    : seconds > 15
      ? 'border-emerald-600 bg-white text-slate-950'
      : seconds > 0
        ? 'border-amber-600 bg-amber-300 text-slate-950'
        : 'border-red-400 bg-red-100 text-red-900';
  return (
    <div
      data-lane-phase={phase}
      className={`flex h-full min-h-[56px] w-[52px] shrink-0 flex-col items-center justify-center rounded-lg border-2 leading-tight ${tone}`}
    >
      <b className="font-mono text-[24px] font-black">{bay.bayNumber}</b>
      <span className="whitespace-nowrap text-[10px] font-black">{phase}</span>
      {current && (
        <span className="font-mono text-[12px] font-black">{seconds ? clock(seconds) : `+${clock(over)}`}</span>
      )}
    </div>
  );
}
