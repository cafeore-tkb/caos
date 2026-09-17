import React, { useMemo } from 'react';
import {
  CheckCircle2,
  ChevronRight,
  CircleDot,
  ClipboardList,
  Link2,
} from 'lucide-react';
import { Barista, BeanCode, OrderTicket, UnassignedOrder } from '../types';

interface HumanCenteredControlViewProps {
  baristas: Barista[];
  unassignedOrders: UnassignedOrder[];
  simTimeSec: number;
  selectedOrderId: string | null;
  highlightFilter: BeanCode | null;
  onSelectOrder: (orderId: string) => void;
  onSelectQueueOrder: (order: UnassignedOrder) => void;
  onAdvanceBay: (bayId: number) => void;
  onOpenTicketDetail: (ticket: OrderTicket) => void;
  onOpenEmptySlot: (bayId: number) => void;
  onAssignOrder: (order: UnassignedOrder) => void;
}

interface OrderGroup {
  id: string;
  items: UnassignedOrder[];
}

const formatRemaining = (seconds: number) => {
  const safeSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return `${minutes}:${remainder.toString().padStart(2, '0')}`;
};

const getRemainingSeconds = (barista: Barista, simTimeSec: number) => {
  const current = barista.queue[0];
  if (!current) return 0;
  if (current.timeRemainingSec !== undefined) return current.timeRemainingSec;
  if (current.endTimeSec !== undefined) return Math.max(0, current.endTimeSec - simTimeSec);
  return Math.round(current.totalDurationSec * barista.coefficient);
};


export const HumanCenteredControlView: React.FC<HumanCenteredControlViewProps> = ({
  baristas,
  unassignedOrders,
  simTimeSec,
  selectedOrderId,
  highlightFilter,
  onSelectOrder,
  onSelectQueueOrder,
  onAdvanceBay,
  onOpenTicketDetail,
  onOpenEmptySlot,
  onAssignOrder,
}) => {
  const sortedBaristas = useMemo(
    () => [...baristas].sort((a, b) => a.bayNumber - b.bayNumber),
    [baristas]
  );

  const orderGroups = useMemo<OrderGroup[]>(() => {
    const groups = new Map<string, UnassignedOrder[]>();
    unassignedOrders.forEach((order) => {
      const items = groups.get(order.id) || [];
      items.push(order);
      groups.set(order.id, items);
    });
    return Array.from(groups, ([id, items]) => ({ id, items }));
  }, [unassignedOrders]);

  const nextAvailable = useMemo(
    () =>
      sortedBaristas
        .map((barista) => ({
          bayNumber: barista.bayNumber,
          seconds: getRemainingSeconds(barista, simTimeSec),
          isStandby: barista.queue.length === 0,
        }))
        .sort((a, b) => a.seconds - b.seconds || a.bayNumber - b.bayNumber)
        .slice(0, 3),
    [sortedBaristas, simTimeSec]
  );

  const selectedRoutes = useMemo(() => {
    if (!selectedOrderId) return [];
    return sortedBaristas.flatMap((barista) =>
      barista.queue
        .filter((ticket) => ticket.id === selectedOrderId)
        .map((ticket) => ({
          uid: ticket.ticketUid || `${ticket.id}-${barista.id}-${ticket.beanCode}`,
          beanName: ticket.beanName,
          bayNumber: barista.bayNumber,
        }))
    );
  }, [selectedOrderId, sortedBaristas]);

  const visibleGroups = orderGroups.slice(0, 10);
  const totalUnassignedCups = unassignedOrders.reduce((sum, order) => sum + order.cupCount, 0);

  return (
    <section className="h-full flex flex-col gap-2 min-h-0 overflow-hidden" aria-label="Bコントロール画面">
      <div className="bg-white border border-slate-300 rounded-lg shadow-xs overflow-hidden shrink-0">
        <div className="h-[40px] px-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <CircleDot className="w-4 h-4 text-emerald-600 shrink-0" />
            <div className="min-w-0">
              <h2 className="text-[15px] font-black text-slate-900 tracking-wide">6人のドリッパー</h2>
            </div>
          </div>

        </div>

        {selectedOrderId && (
          <div className="h-[42px] px-3 bg-amber-50 border-b border-amber-200 flex items-center gap-2 text-[12px] text-amber-950">
            <Link2 className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span className="font-mono text-[20px] font-black">{selectedOrderId}</span>
            <span className="font-bold shrink-0">連動:</span>
            <span className="truncate font-medium">
              {selectedRoutes.length > 0
                ? selectedRoutes.map((route) => `${route.beanName} → ドリッパー ${route.bayNumber}`).join(' / ')
                : 'まだドリッパーに割り当てられていません'}
            </span>
            <button
              type="button"
              onClick={() => onSelectOrder('')}
              className="ml-auto min-w-[56px] min-h-[36px] px-2 rounded-lg border border-amber-300 bg-white hover:bg-amber-100 font-bold shrink-0 touch-manipulation"
            >
              解除
            </button>
          </div>
        )}

        <div className="grid grid-cols-6 divide-x divide-slate-200">
          {sortedBaristas.map((barista) => {
            const current = barista.queue[0];
            const next = barista.queue[1];
            const remainingSeconds = getRemainingSeconds(barista, simTimeSec);
            const isImminent = current && remainingSeconds <= 30;
            const isLinked = Boolean(
              selectedOrderId && barista.queue.some((ticket) => ticket.id === selectedOrderId)
            );

            return (
              <article
                key={barista.id}
                className={`min-w-0 p-2 flex flex-col gap-1.5 transition-colors ${
                  isLinked ? 'bg-amber-50 ring-2 ring-inset ring-amber-400' : 'bg-white'
                }`}
              >
                <div className="flex items-start justify-between gap-1 min-h-[32px]">
                  <div>
                    <div className="font-mono text-[11px] font-black text-slate-500 uppercase">
                      ドリッパー {barista.bayNumber}
                    </div>
                    <div className="text-[15px] font-black text-slate-950 leading-tight">{barista.name}</div>
                  </div>
                  {barista.canHandleSpecial && (
                    <span className="px-1.5 py-1 bg-emerald-950 text-emerald-100 rounded text-[9px] font-black tracking-wide whitespace-nowrap">
                      ★ SP
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  disabled={!current}
                  onClick={() => undefined}
                  className={`w-full text-left rounded-md border p-2 min-h-[104px] transition-colors touch-manipulation ${
                    current
                      ? isImminent
                        ? 'bg-red-50 border-red-300 hover:bg-red-100'
                        : 'bg-slate-950 border-slate-950 text-white hover:bg-slate-800'
                      : 'bg-slate-50 border-dashed border-slate-300 text-slate-400'
                  }`}
                >
                  <div className={`text-[9px] font-black tracking-[0.16em] ${isImminent ? 'text-red-600' : current ? 'text-slate-400' : 'text-slate-400'}`}>
                    NOW
                  </div>
                  {current ? (
                    <>
                      <div className={`mt-1 flex items-start justify-between gap-1 ${isImminent ? 'text-slate-950' : 'text-white'}`}>
                        <div className="min-w-0">
                          <div className="text-[15px] leading-tight font-black truncate">{current.beanName}</div>
                          <div className="mt-0.5 flex items-center gap-1 text-[10px] font-bold opacity-85">
                            <span className="rounded bg-white px-1.5 py-0.5 text-[14px] leading-none font-mono text-slate-950 opacity-100">{current.cupCount}杯</span>
                            {current.totalItemsInOrder && current.totalItemsInOrder > 1 && <span>{current.itemIndex}/{current.totalItemsInOrder}・計{current.totalOrderCups}杯</span>}
                          </div>
                        </div>
                        <span className="font-mono text-[21px] leading-none font-black shrink-0">{current.id}</span>
                      </div>
                      <div className={`mt-1.5 font-mono text-[30px] leading-none font-black tracking-tight ${isImminent ? 'text-red-600' : 'text-white'}`}>
                        {remainingSeconds === 0 ? '継続中' : formatRemaining(remainingSeconds)}
                      </div>
                    </>
                  ) : (
                    <div className="h-[62px] flex items-center justify-center text-[14px] font-bold">待機中</div>
                  )}
                </button>

                <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 min-h-[58px]">
                  <div className="text-[9px] font-black text-slate-500 tracking-[0.16em]">NEXT</div>
                  {next ? (
                    <button
                      type="button"
                      onClick={() => {
                        onSelectOrder(next.id);
                        onOpenTicketDetail(next);
                      }}
                      className="w-full mt-1 text-left flex items-center justify-between gap-1 hover:text-blue-700 touch-manipulation"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1"><span className="text-[12px] font-black truncate">{next.beanName}</span><span className="rounded bg-slate-950 px-1.5 py-0.5 text-[14px] leading-none font-mono font-black text-white">{next.cupCount}杯</span>{next.totalItemsInOrder && next.totalItemsInOrder > 1 && <span className="text-[10px] font-mono font-black">{next.itemIndex}/{next.totalItemsInOrder}・計{next.totalOrderCups}杯</span>}</div>
                        <div className="font-mono text-[15px] font-black text-slate-700">{next.id}</div>
                      </div>
                      <ChevronRight className="w-4 h-4 shrink-0 text-slate-400" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onOpenEmptySlot(barista.id)}
                      className="w-full mt-1 min-h-[36px] rounded border border-dashed border-slate-300 hover:border-blue-400 hover:bg-blue-50 text-[10px] font-bold text-slate-500 touch-manipulation"
                    >
                      + 次を割当
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  disabled={!current}
                  onClick={() => onAdvanceBay(barista.id)}
                  className="min-h-[42px] rounded-lg bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-200 disabled:text-slate-400 text-white text-[13px] font-black flex items-center justify-center gap-1.5 transition-colors touch-manipulation"
                >
                  <span>次へ</span>
                  <CheckCircle2 className="w-4 h-4" />
                </button>
              </article>
            );
          })}
        </div>
      </div>

      <div className="bg-white border border-slate-300 rounded-lg shadow-xs p-2 min-h-0 flex-1 overflow-hidden">
        <div className="h-[34px] flex items-center justify-between gap-3 mb-1">
          <div className="flex items-center gap-2 min-w-0">
            <ClipboardList className="w-4 h-4 text-blue-700 shrink-0" />
            <h2 className="text-[16px] font-black text-slate-950 tracking-wide">注文キュー</h2>
            <span className="px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-[12px] font-bold text-slate-600 whitespace-nowrap">
              {orderGroups.length} 件 / {totalUnassignedCups} 杯
            </span>
            <div className="flex items-center gap-1.5 overflow-x-auto">
              <span className="ml-1 text-[11px] font-bold text-slate-500 shrink-0">次に空く:</span>
              {nextAvailable.map((item, index) => (
                <span
                  key={item.bayNumber}
                  className={`px-2 py-0.5 rounded border font-mono text-[11px] font-black whitespace-nowrap ${
                    index === 0
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                      : 'bg-white text-slate-700 border-slate-200'
                  }`}
                >
                  #{item.bayNumber} {item.isStandby ? '待機' : formatRemaining(item.seconds)}
                </span>
              ))}
            </div>
          </div>
        </div>

        {visibleGroups.length > 0 ? (
          <div className="grid grid-cols-5 grid-rows-2 gap-1.5 h-[calc(100%-38px)]">
            {visibleGroups.map((group, index) => {
              const isSelected = selectedOrderId === group.id;
              const matchesHeaderFilter = Boolean(
                highlightFilter && group.items.some((item) => item.beanCode === highlightFilter)
              );
              const assignedRoutes = sortedBaristas.flatMap((barista) =>
                barista.queue
                  .filter((ticket) => ticket.id === group.id)
                  .map((ticket) => `${ticket.beanName} → ドリッパー${barista.bayNumber}`)
              );

              return (
                <article
                  key={group.id}
                  onClick={() => {
                    onSelectQueueOrder(group.items[0]);
                    onAssignOrder(group.items[0]);
                  }}
                  className={`relative rounded-lg border p-2 min-h-0 overflow-hidden cursor-pointer active:scale-[0.99] transition-all touch-manipulation ${
                    isSelected
                      ? 'bg-blue-50 border-blue-500 ring-2 ring-blue-400 shadow-sm'
                      : matchesHeaderFilter
                      ? 'bg-sky-50 border-sky-400'
                      : 'bg-white border-slate-300 hover:border-slate-500 hover:shadow-sm'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 pb-1.5 border-b border-slate-200">
                    <div className="flex items-center gap-2">
                      <span className={`w-7 h-7 rounded-md flex items-center justify-center font-mono text-[14px] font-black ${
                        isSelected ? 'bg-blue-700 text-white' : 'bg-slate-900 text-white'
                      }`}>
                        {index + 1}
                      </span>
                      <div>
                        <div className="font-mono text-[24px] leading-none font-black text-slate-950">{group.id}</div>
                        {group.items[0].preferredBaristaId && (
                          <div className="mt-1 inline-flex rounded bg-violet-700 px-1.5 py-0.5 text-[11px] font-black text-white">指名 {group.items[0].preferredBaristaId}</div>
                        )}
                        {group.items[0].totalOrderCups && (
                          <div className="mt-0.5 text-[11px] font-bold text-slate-500">計 {group.items[0].totalOrderCups}杯</div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="mt-1.5 space-y-1">
                    {group.items.map((item) => (
                      <button
                        type="button"
                        key={item.ticketUid || `${item.id}-${item.beanCode}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          onSelectQueueOrder(item);
                          onAssignOrder(item);
                        }}
                        className="w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-left transition-colors hover:border-blue-300 hover:bg-blue-50 touch-manipulation"
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[13px] font-black text-slate-900 truncate">{item.beanName}</span>
                          <span className="rounded bg-slate-950 px-1.5 py-0.5 font-mono text-[14px] leading-none font-black text-white shrink-0">{item.cupCount}杯</span>
                          {item.totalItemsInOrder && item.totalItemsInOrder > 1 && <span className="text-[10px] font-mono font-black text-slate-600 shrink-0">{item.itemIndex}/{item.totalItemsInOrder}・計{item.totalOrderCups}杯</span>}
                        </div>
                        {item.preferredBaristaId && <div className="mt-1 text-[10px] font-black text-violet-700">指名 {item.preferredBaristaId}</div>}
                      </button>
                    ))}
                  </div>

                  {assignedRoutes.length > 0 && (
                    <div className="mt-2 pt-1.5 border-t border-blue-200 text-[9px] font-bold text-blue-800 truncate">
                      {assignedRoutes.join(' / ')}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        ) : (
          <div className="min-h-[150px] rounded-lg border border-dashed border-slate-300 bg-slate-50 flex items-center justify-center text-[12px] font-bold text-slate-500">
            未割当オーダーはありません
          </div>
        )}

        {orderGroups.length > visibleGroups.length && (
          <div className="mt-2 text-right text-[10px] font-bold text-slate-500">
            他 {orderGroups.length - visibleGroups.length} 件はキュー後方
          </div>
        )}
      </div>
    </section>
  );
};
