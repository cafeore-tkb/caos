import React, { useMemo } from 'react';
import {
  AlertTriangle,
  ArrowRightLeft,
  BarChart3,
  CheckCircle2,
  Clock3,
  Target,
} from 'lucide-react';
import { Barista, OrderTicket } from '../types';

interface AnalyticsViewProps {
  baristas: Barista[];
}

interface CompletedPart {
  ticket: OrderTicket;
  bayNumber: number;
  finishedAt: number;
}

interface SplitResult {
  orderId: string;
  expectedParts: number;
  totalCups: number;
  deltaSec: number;
  firstFinishedAt: number;
  lastFinishedAt: number;
  bayNumbers: number[];
}

const formatClock = (seconds: number) => {
  const normalized = ((seconds % 86400) + 86400) % 86400;
  const hours = Math.floor(normalized / 3600);
  const minutes = Math.floor((normalized % 3600) / 60);
  const secs = Math.floor(normalized % 60);
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

const deltaStatus = (deltaSec: number) => {
  if (deltaSec <= 15) return { label: '良好', className: 'bg-emerald-100 text-emerald-800 border-emerald-300' };
  if (deltaSec <= 30) return { label: '許容', className: 'bg-amber-100 text-amber-900 border-amber-300' };
  return { label: '要確認', className: 'bg-red-100 text-red-800 border-red-300' };
};

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({ baristas }) => {
  const completedParts = useMemo<CompletedPart[]>(() =>
    baristas.flatMap((barista) =>
      (barista.pastTickets || []).flatMap((ticket) => {
        const finishedAt = ticket.completedAtSec ?? ticket.endTimeSec;
        return ticket.totalItemsInOrder && ticket.totalItemsInOrder > 1 && finishedAt !== undefined
          ? [{ ticket, bayNumber: barista.bayNumber, finishedAt }]
          : [];
      })
    ), [baristas]);

  const splitResults = useMemo<SplitResult[]>(() => {
    const groups = new Map<string, CompletedPart[]>();
    completedParts.forEach((part) => {
      const current = groups.get(part.ticket.id) || [];
      current.push(part);
      groups.set(part.ticket.id, current);
    });

    return Array.from(groups, ([orderId, parts]) => {
      const expectedParts = Math.max(...parts.map((part) => part.ticket.totalItemsInOrder || 1));
      if (parts.length < expectedParts) return null;
      const sorted = [...parts].sort((a, b) => a.finishedAt - b.finishedAt);
      const firstFinishedAt = sorted[0].finishedAt;
      const lastFinishedAt = sorted[sorted.length - 1].finishedAt;
      return {
        orderId,
        expectedParts,
        totalCups: Math.max(...parts.map((part) => part.ticket.totalOrderCups || part.ticket.cupCount)),
        deltaSec: lastFinishedAt - firstFinishedAt,
        firstFinishedAt,
        lastFinishedAt,
        bayNumbers: [...new Set(parts.map((part) => part.bayNumber))].sort((a, b) => a - b),
      };
    })
      .filter((result): result is SplitResult => result !== null)
      .sort((a, b) => b.lastFinishedAt - a.lastFinishedAt);
  }, [completedParts]);

  const pendingSplitOrders = useMemo(() => {
    const groups = new Map<string, { expected: number; assigned: number; bays: Set<number> }>();
    baristas.forEach((barista) => {
      barista.queue.forEach((ticket) => {
        if (!ticket.totalItemsInOrder || ticket.totalItemsInOrder <= 1) return;
        const current = groups.get(ticket.id) || { expected: ticket.totalItemsInOrder, assigned: 0, bays: new Set<number>() };
        current.expected = Math.max(current.expected, ticket.totalItemsInOrder);
        current.assigned += 1;
        current.bays.add(barista.bayNumber);
        groups.set(ticket.id, current);
      });
    });
    return Array.from(groups, ([orderId, value]) => ({ orderId, ...value, bays: [...value.bays].sort((a, b) => a - b) }));
  }, [baristas]);

  const averageDelta = splitResults.length
    ? Math.round(splitResults.reduce((sum, result) => sum + result.deltaSec, 0) / splitResults.length)
    : null;
  const within15Count = splitResults.filter((result) => result.deltaSec <= 15).length;
  const within15Rate = splitResults.length ? Math.round((within15Count / splitResults.length) * 100) : null;
  const maxDelta = splitResults.length ? Math.max(...splitResults.map((result) => result.deltaSec)) : null;
  const sameLaneCount = splitResults.filter((result) => result.bayNumbers.length === 1).length;

  return (
    <div className="space-y-3">
      <div className="border-b border-slate-200 pb-3">
        <h2 className="flex items-center gap-2 text-[18px] font-black text-slate-950">
          <BarChart3 className="h-5 w-5 text-blue-700" />
          割り当て品質
        </h2>
        <p className="mt-1 text-[12px] font-medium text-slate-500">分割オーダーを、どれだけ同時に仕上げられたか</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-slate-300 bg-white p-3 shadow-xs">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500"><Clock3 className="h-4 w-4 text-blue-700" />平均仕上がりΔ</div>
          <div className="mt-1 font-mono text-[30px] font-black text-slate-950">{averageDelta === null ? '—' : `${averageDelta}秒`}</div>
        </div>
        <div className="rounded-xl border border-slate-300 bg-white p-3 shadow-xs">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500"><Target className="h-4 w-4 text-emerald-700" />15秒以内率</div>
          <div className="mt-1 font-mono text-[30px] font-black text-slate-950">{within15Rate === null ? '—' : `${within15Rate}%`}</div>
        </div>
        <div className="rounded-xl border border-slate-300 bg-white p-3 shadow-xs">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500"><CheckCircle2 className="h-4 w-4 text-indigo-700" />分析済み</div>
          <div className="mt-1 font-mono text-[30px] font-black text-slate-950">{splitResults.length}<span className="ml-1 text-[13px] text-slate-500">オーダー</span></div>
        </div>
        <div className="rounded-xl border border-slate-300 bg-white p-3 shadow-xs">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500"><AlertTriangle className="h-4 w-4 text-amber-700" />最大Δ</div>
          <div className="mt-1 font-mono text-[30px] font-black text-slate-950">{maxDelta === null ? '—' : `${maxDelta}秒`}</div>
        </div>
      </div>

      <section className="rounded-xl border border-slate-300 bg-white p-3 shadow-xs">
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-2">
          <div>
            <h3 className="text-[15px] font-black text-slate-950">分割オーダー別 仕上がりΔ</h3>
            <p className="mt-0.5 text-[11px] text-slate-500">最初と最後のカップが仕上がった時刻差</p>
          </div>
          <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600">目標 ≤ 15秒</span>
        </div>

        {splitResults.length > 0 ? (
          <div className="mt-2 space-y-2">
            {splitResults.slice(0, 12).map((result) => {
              const status = deltaStatus(result.deltaSec);
              return (
                <article key={result.orderId} className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[22px] font-black text-slate-950">{result.orderId}</span>
                    <span className="text-[11px] font-bold text-slate-500">計{result.totalCups}杯・{result.expectedParts}分割</span>
                    <span className={`ml-auto rounded border px-2 py-0.5 text-[11px] font-black ${status.className}`}>{status.label}</span>
                    <span className="min-w-[54px] text-right font-mono text-[20px] font-black text-slate-950">Δ{result.deltaSec}秒</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                    <div className={`h-full rounded-full ${result.deltaSec <= 15 ? 'bg-emerald-600' : result.deltaSec <= 30 ? 'bg-amber-500' : 'bg-red-600'}`} style={{ width: `${Math.min(100, Math.max(5, (result.deltaSec / 60) * 100))}%` }} />
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2 text-[11px] font-bold text-slate-600">
                    <span>レーン {result.bayNumbers.map((bay) => `#${bay}`).join(' + ')}</span>
                    <span className="font-mono">{formatClock(result.firstFinishedAt)} → {formatClock(result.lastFinishedAt)}</span>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="mt-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
            <div className="text-[14px] font-black text-slate-700">まだ分析できる完了データがありません</div>
            <p className="mt-1 text-[11px] text-slate-500">分割された全カードを「次へ」で完了すると、仕上がりΔを自動集計します。</p>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-300 bg-white p-3 shadow-xs">
        <h3 className="flex items-center gap-2 text-[15px] font-black text-slate-950"><ArrowRightLeft className="h-4 w-4 text-blue-700" />割り当て結果の読み取り</h3>
        <div className="mt-2 space-y-2 text-[12px]">
          {splitResults.length === 0 ? (
            <p className="rounded-lg bg-blue-50 p-3 font-bold text-blue-900">評価待ちです。分割カードを別レーンへ割り当て、仕上がりΔが15秒以内になるか確認できます。</p>
          ) : (
            <>
              <p className={`rounded-lg p-3 font-bold ${averageDelta !== null && averageDelta <= 15 ? 'bg-emerald-50 text-emerald-900' : 'bg-amber-50 text-amber-950'}`}>
                平均Δは {averageDelta}秒。{averageDelta !== null && averageDelta <= 15 ? '割り当てタイミングは良好です。' : '開始時刻または割り当て先の待ち時間を見直す余地があります。'}
              </p>
              {maxDelta !== null && maxDelta > 30 && <p className="rounded-lg bg-red-50 p-3 font-bold text-red-900">最大Δが30秒を超えています。該当オーダーのレーン組み合わせを上の一覧で確認してください。</p>}
              {sameLaneCount > 0 && <p className="rounded-lg bg-amber-50 p-3 font-bold text-amber-950">{sameLaneCount}件が同じレーン内で分割されています。同時仕上げを狙う場合は別レーンへの分散が有効です。</p>}
            </>
          )}
        </div>
      </section>

      {pendingSplitOrders.length > 0 && (
        <section className="rounded-xl border border-slate-300 bg-white p-3 shadow-xs">
          <h3 className="text-[14px] font-black text-slate-950">評価待ちの分割オーダー</h3>
          <div className="mt-2 space-y-1.5">
            {pendingSplitOrders.map((order) => (
              <div key={order.orderId} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-[11px] font-bold text-slate-600">
                <span className="font-mono text-[16px] font-black text-slate-900">{order.orderId}</span>
                <span>{order.assigned}/{order.expected}カード割当済み</span>
                <span>レーン {order.bays.map((bay) => `#${bay}`).join(' + ')}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
