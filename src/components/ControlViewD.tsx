import { ArrowRightCircle, ClipboardList, Table2, X } from 'lucide-react';
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import type { Barista, BeanCode, OrderTicket, UnassignedOrder } from '../types';
import { orderNumber } from '../utils/orderQueue';
import type { ControlViewBProps } from './ControlViewB';

export type ControlViewDProps = ControlViewBProps;

// 紙のマスターシートと同じく、完了済みの直近行を薄く残して流れを追えるようにする。
const PAST_ROWS = 2;
const MIN_WAITING_ROWS = 6;
const EMPTY_TRAILING_ROWS = 2;

interface SheetCup {
  key: string;
  id: string;
  beanCode: BeanCode;
  beanName: string;
  cupCount: number;
  preferredBaristaId?: number;
  isRebrew?: boolean;
}

interface OrderGroup {
  id: string;
  items: UnassignedOrder[];
  assigned: Array<{ ticket: OrderTicket; bayNumber: number }>;
}

const remainingSeconds = (barista: Barista, currentTimeSec: number) => {
  const current = barista.queue[0];
  if (!current) return 0;
  if (current.timeRemainingSec !== undefined) return current.timeRemainingSec;
  if (current.endTimeSec !== undefined) return Math.max(0, current.endTimeSec - currentTimeSec);
  return Math.round(current.totalDurationSec * barista.coefficient);
};

const formatRemaining = (seconds: number) => {
  const safeSeconds = Math.max(0, Math.round(seconds));
  return `${Math.floor(safeSeconds / 60)}:${(safeSeconds % 60).toString().padStart(2, '0')}`;
};

const sheetLabel: Record<BeanCode, string> = {
  CHAMP: 'チャンプ',
  ORE: '俺ブレ',
  TNZ: 'タンザ',
  KEN: 'ケニア',
  BRA: 'ブラジル',
  ICE: '氷',
  MILK: '牛',
  SP: '限定',
};

const cupColor = (cup: SheetCup) => {
  if (cup.beanCode === 'SP') return 'bg-red-200';
  if (cup.beanCode === 'ICE') return 'bg-sky-200';
  if (cup.beanCode === 'MILK') return 'bg-gray-200';
  return 'bg-white';
};

const ticketCup = (ticket: OrderTicket): SheetCup => ({
  key: ticket.ticketUid || `${ticket.id}-${ticket.itemIndex || 1}`,
  id: ticket.id,
  beanCode: ticket.beanCode,
  beanName: ticket.beanName,
  cupCount: ticket.cupCount,
  preferredBaristaId: ticket.preferredBaristaId,
  isRebrew: ticket.isRebrew,
});

const unassignedCup = (order: UnassignedOrder): SheetCup => ({
  key: order.ticketUid || order.id,
  id: order.id,
  beanCode: order.beanCode,
  beanName: order.beanName,
  cupCount: order.cupCount,
  preferredBaristaId: order.preferredBaristaId,
  isRebrew: order.isRebrew,
});

const CupChip: React.FC<{
  cup: SheetCup;
  baristaName?: string;
  note?: string;
  faded?: boolean;
  selected?: boolean;
  onClick?: () => void;
}> = ({ cup, baristaName, note, faded = false, selected = false, onClick }) => {
  const stacked = cup.cupCount >= 2;

  return (
    <div className={`relative h-full min-w-0 ${stacked ? 'mr-1.5 mb-1.5' : ''} ${faded ? 'opacity-45' : ''}`}>
      {stacked && (
        <div
          aria-hidden
          className={`absolute inset-0 translate-x-1.5 translate-y-1.5 rounded-lg border border-slate-500 shadow-xs ${cupColor(cup)}`}
        />
      )}
      <button
        type="button"
        disabled={!onClick}
        onClick={onClick}
        className={`relative z-[1] flex h-full w-full min-w-0 flex-col justify-center rounded-lg border px-1.5 py-1 text-left shadow-xs touch-manipulation ${cupColor(cup)} ${
          cup.isRebrew ? 'border-2 border-red-600' : 'border-slate-500'
        } ${selected ? 'ring-4 ring-blue-600' : onClick ? 'hover:ring-2 hover:ring-slate-400' : ''}`}
      >
        <span className="flex min-w-0 items-baseline justify-between gap-1">
          <span className="truncate text-[14px] font-black leading-tight text-slate-950">
            {sheetLabel[cup.beanCode]}
          </span>
          <span className="shrink-0 font-mono text-[11px] font-black text-slate-700">×{cup.cupCount}</span>
        </span>
        <span className="truncate font-mono text-[11px] font-bold text-slate-600">No. {cup.id.replace('#', '')}</span>
        {(baristaName || note || cup.isRebrew) && (
          <span className="truncate text-[10px] font-bold text-slate-700">
            {cup.isRebrew ? '入れ直し ' : ''}
            {baristaName ? `指名：${baristaName}` : ''}
            {note ? ` ${note}` : ''}
          </span>
        )}
      </button>
    </div>
  );
};

export const ControlViewD: React.FC<ControlViewDProps> = ({
  baristas,
  unassignedOrders,
  simTimeSec,
  selectedOrderId,
  onSelectOrder,
  onAdvanceBay,
  onOpenTicketDetail,
  onOpenEmptySlot,
  onAssignToBay,
  onRequestRebrew,
}) => {
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const sortedBaristas = useMemo(
    () => [...baristas].sort((left, right) => left.bayNumber - right.bayNumber),
    [baristas]
  );
  const baristaNames = useMemo(
    () => new Map(sortedBaristas.map((barista) => [barista.id, barista.name])),
    [sortedBaristas]
  );
  const selectedOrder = useMemo(
    () => unassignedOrders.find((order) => (order.ticketUid || order.id) === selectedUid) ?? null,
    [selectedUid, unassignedOrders]
  );

  useEffect(() => {
    if (selectedUid && !selectedOrder) setSelectedUid(null);
  }, [selectedOrder, selectedUid]);

  const waitingRowCount = Math.max(
    MIN_WAITING_ROWS,
    ...sortedBaristas.map((barista) => barista.queue.length + EMPTY_TRAILING_ROWS)
  );
  const rowOffsets = Array.from({ length: PAST_ROWS + waitingRowCount }, (_, index) => index - PAST_ROWS);

  const ticketAt = (barista: Barista, rowOffset: number) => {
    if (rowOffset >= 0) return barista.queue[rowOffset];
    const past = barista.pastTickets || [];
    return past[past.length + rowOffset];
  };

  const orderGroups = useMemo<OrderGroup[]>(() => {
    const groups = new Map<string, OrderGroup>();
    unassignedOrders.forEach((order) => {
      const group = groups.get(order.id) || { id: order.id, items: [], assigned: [] };
      group.items.push(order);
      groups.set(order.id, group);
    });
    sortedBaristas.forEach((barista) => {
      barista.queue.forEach((ticket) => {
        groups.get(ticket.id)?.assigned.push({ ticket, bayNumber: barista.bayNumber });
      });
    });
    return Array.from(groups.values()).sort((left, right) => orderNumber(left.id) - orderNumber(right.id));
  }, [sortedBaristas, unassignedOrders]);

  const totalUnassignedCups = unassignedOrders.reduce((sum, order) => sum + order.cupCount, 0);

  const canAssignTo = (barista: Barista) =>
    Boolean(selectedOrder && (!selectedOrder.preferredBaristaId || selectedOrder.preferredBaristaId === barista.id));

  const clearSelection = () => {
    setSelectedUid(null);
    onSelectOrder('');
  };

  const toggleSelection = (order: UnassignedOrder) => {
    const uid = order.ticketUid || order.id;
    if (selectedUid === uid) {
      clearSelection();
      return;
    }
    setSelectedUid(uid);
    if (selectedOrderId !== order.id) onSelectOrder(order.id);
  };

  const assignSelected = (barista: Barista) => {
    if (!selectedOrder || !canAssignTo(barista)) return;
    onAssignToBay(selectedOrder, barista.id);
    clearSelection();
  };

  return (
    <section
      className="grid h-full min-h-0 grid-cols-[minmax(0,2.2fr)_minmax(280px,1fr)] gap-2"
      aria-label="Dコントロール画面"
    >
      <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border-2 border-slate-900 bg-white shadow-xs">
        <header className="flex h-11 shrink-0 items-center gap-2 border-b-2 border-slate-900 bg-slate-50 px-3">
          <Table2 className="h-4 w-4 text-slate-700" />
          <h2 className="shrink-0 text-[15px] font-black text-slate-950">マスターシート</h2>
          <p className="min-w-0 truncate text-[11px] font-bold text-slate-500">
            {selectedOrder
              ? `${selectedOrder.id} ${selectedOrder.beanName} ${selectedOrder.cupCount}杯 → 配置する枠を選択`
              : '右の注文カードを選び、表の枠を選んで割り振ります'}
          </p>
          {selectedOrder && (
            <button
              type="button"
              onClick={clearSelection}
              className="ml-auto flex h-8 shrink-0 items-center gap-1 rounded-md border border-slate-300 bg-white px-2 text-[11px] font-black text-slate-700 touch-manipulation"
            >
              <X className="h-3.5 w-3.5" />
              解除
            </button>
          )}
        </header>

        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[720px] table-fixed border-collapse">
            <colgroup>
              <col className="w-[76px]" />
              {sortedBaristas.map((barista) => (
                <col key={barista.id} />
              ))}
              <col className="w-[52px]" />
            </colgroup>
            <thead className="sticky top-0 z-10 bg-slate-100">
              <tr>
                <th className="border-b-4 border-r-4 border-slate-900 px-1 text-[13px] font-black">注文 No.</th>
                {sortedBaristas.map((barista) => {
                  const current = barista.queue[0];
                  const seconds = remainingSeconds(barista, simTimeSec);
                  return (
                    <th key={barista.id} className="border-b-4 border-r-2 border-slate-900 p-1 align-top">
                      <div className="flex items-center justify-center gap-1">
                        <span className="font-mono text-[20px] font-black leading-none">{barista.bayNumber}</span>
                        <span className="truncate text-[12px] font-black">{barista.name}</span>
                      </div>
                      <button
                        type="button"
                        disabled={!current}
                        onClick={() => onAdvanceBay(barista.id)}
                        className={`mt-1 flex h-8 w-full items-center justify-center gap-1 rounded-md text-[11px] font-black touch-manipulation ${
                          current ? 'bg-emerald-700 text-white' : 'bg-slate-200 text-slate-500'
                        }`}
                      >
                        {current ? (
                          <>
                            <span className="font-mono">{seconds === 0 ? '継続' : formatRemaining(seconds)}</span>
                            <span>次へ</span>
                            <ArrowRightCircle className="h-3.5 w-3.5" />
                          </>
                        ) : (
                          '待機'
                        )}
                      </button>
                    </th>
                  );
                })}
                <th className="border-b-4 border-l-4 border-slate-900 px-1 text-[12px] font-black">総杯数</th>
              </tr>
            </thead>
            <tbody>
              {rowOffsets.map((rowOffset) => {
                const isPast = rowOffset < 0;
                const isNow = rowOffset === 0;
                const rowTickets = sortedBaristas.flatMap<OrderTicket>((barista) => {
                  const ticket = ticketAt(barista, rowOffset);
                  return ticket ? [ticket] : [];
                });
                const rowOrderIds = Array.from(new Set<string>(rowTickets.map((ticket) => ticket.id))).sort(
                  (left, right) => orderNumber(left) - orderNumber(right)
                );
                const rowCups = rowTickets.reduce((sum, ticket) => sum + ticket.cupCount, 0);

                return (
                  <tr
                    key={rowOffset}
                    className={`h-[84px] ${isPast ? 'bg-slate-100 text-slate-500 grayscale' : isNow ? 'bg-emerald-50/60' : ''}`}
                  >
                    <th
                      className={`border-b-2 border-r-4 border-slate-900 px-1 text-center ${isNow ? 'border-t-4 border-t-emerald-600' : ''}`}
                    >
                      {isNow && (
                        <div className="mb-0.5 text-[9px] font-black tracking-[0.16em] text-emerald-700">NOW</div>
                      )}
                      {rowOrderIds.length === 0 ? (
                        <span className="text-[20px] text-slate-300">—</span>
                      ) : (
                        <div className="flex flex-wrap justify-center gap-0.5">
                          {rowOrderIds.map((id) => (
                            <span
                              key={id}
                              className="rounded bg-slate-900 px-1 py-0.5 font-mono text-[10px] font-black text-white"
                            >
                              {id.replace('#', '')}
                            </span>
                          ))}
                        </div>
                      )}
                    </th>
                    {sortedBaristas.map((barista) => {
                      const ticket = ticketAt(barista, rowOffset);
                      const isNextSlot = rowOffset === barista.queue.length;
                      const isTarget = isNextSlot && canAssignTo(barista);
                      const isLinked = Boolean(ticket && !isPast && selectedOrderId && ticket.id === selectedOrderId);
                      const seconds = remainingSeconds(barista, simTimeSec);

                      return (
                        <td
                          key={barista.id}
                          className={`border-b-2 border-r-2 border-slate-900 p-1 align-top ${isNow ? 'border-t-4 border-t-emerald-600' : ''} ${
                            isLinked ? 'bg-amber-50' : ''
                          }`}
                        >
                          <div
                            className={`h-[72px] rounded border p-0.5 ${
                              isTarget
                                ? 'border-2 border-blue-600 bg-blue-50'
                                : ticket
                                  ? 'border-transparent'
                                  : 'border-dashed border-slate-300'
                            }`}
                          >
                            {ticket ? (
                              <CupChip
                                cup={ticketCup(ticket)}
                                baristaName={
                                  ticket.preferredBaristaId ? baristaNames.get(ticket.preferredBaristaId) : undefined
                                }
                                note={
                                  isNow && seconds > 0
                                    ? `残${formatRemaining(seconds)}`
                                    : ticket.isInterrupted
                                      ? '中断'
                                      : undefined
                                }
                                selected={isLinked}
                                onClick={
                                  isPast
                                    ? undefined
                                    : isNow
                                      ? () => onRequestRebrew(ticket, barista.id)
                                      : () => {
                                          onSelectOrder(ticket.id);
                                          onOpenTicketDetail(ticket);
                                        }
                                }
                              />
                            ) : isPast ? null : isTarget ? (
                              <button
                                type="button"
                                aria-label={`ドリッパー${barista.bayNumber}に配置`}
                                onClick={() => assignSelected(barista)}
                                className="h-full w-full rounded text-[11px] font-black text-blue-700 touch-manipulation"
                              >
                                ここに配置
                              </button>
                            ) : isNextSlot && !selectedOrder ? (
                              <button
                                type="button"
                                onClick={() => onOpenEmptySlot(barista.id)}
                                className="h-full w-full rounded text-[10px] font-bold text-slate-400 touch-manipulation"
                              >
                                枠を選択
                              </button>
                            ) : null}
                          </div>
                        </td>
                      );
                    })}
                    <td
                      className={`border-b-2 border-l-4 border-slate-900 px-1 text-center font-mono text-[20px] font-black ${isNow ? 'border-t-4 border-t-emerald-600' : ''}`}
                    >
                      {rowCups || ''}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border-2 border-slate-900 bg-white shadow-xs">
        <header className="flex h-11 shrink-0 items-center justify-between gap-2 border-b-2 border-slate-900 bg-slate-50 px-3">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-slate-700" />
            <h2 className="text-[15px] font-black text-slate-950">注文内容</h2>
          </div>
          <span className="text-[12px] font-black text-slate-700">未割り振り {totalUnassignedCups}杯</span>
        </header>

        {orderGroups.length === 0 ? (
          <p className="flex-1 py-8 text-center text-[13px] font-bold text-slate-400">未割り振りの注文はありません</p>
        ) : (
          <div className="grid min-h-0 flex-1 auto-rows-max content-start gap-2 overflow-y-auto p-2">
            {orderGroups.map((group) => {
              const totalCups =
                group.items[0]?.totalOrderCups ??
                [...group.items, ...group.assigned.map((entry) => entry.ticket)].reduce(
                  (sum, entry) => sum + entry.cupCount,
                  0
                );
              const notes = group.items[0]?.orderNotes;

              return (
                <article key={group.id} className="overflow-hidden rounded-md border-2 border-slate-900">
                  <div className="flex items-center justify-between gap-2 border-b-2 border-slate-900 bg-slate-100 px-2 py-1">
                    <h3 className="font-mono text-[17px] font-black">注文 No. {group.id.replace('#', '')}</h3>
                    <span className="text-[13px] font-black">{totalCups}杯</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 p-2">
                    {group.items.map((order) => {
                      const uid = order.ticketUid || order.id;
                      return (
                        <div key={uid} className="h-[60px]">
                          <CupChip
                            cup={unassignedCup(order)}
                            baristaName={
                              order.preferredBaristaId ? baristaNames.get(order.preferredBaristaId) : undefined
                            }
                            selected={selectedUid === uid}
                            onClick={() => toggleSelection(order)}
                          />
                        </div>
                      );
                    })}
                    {group.assigned.map(({ ticket, bayNumber }) => (
                      <div key={ticketCup(ticket).key} className="h-[60px]">
                        <CupChip cup={ticketCup(ticket)} note={`→ ${bayNumber}`} faded />
                      </div>
                    ))}
                  </div>
                  {notes && (
                    <p className="border-t border-slate-200 px-2 py-1 text-[11px] font-bold text-slate-600">{notes}</p>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </aside>
    </section>
  );
};
