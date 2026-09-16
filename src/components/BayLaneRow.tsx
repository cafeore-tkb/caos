import React from 'react';
import { ArrowRightCircle, Plus } from 'lucide-react';
import { Barista, BeanCode, OrderTicket } from '../types';
import { TicketCard } from './TicketCard';

interface BayLaneRowProps {
  barista: Barista;
  highlightFilter: BeanCode | null;
  selectedOrderId: string | null;
  onSelectOrder: (orderId: string) => void;
  onAdvanceBay: (bayId: number) => void;
  onOpenTicketDetail: (ticket: OrderTicket) => void;
  onOpenEmptySlot: (bayId: number) => void;
  timelineStartSec: number;
  pixelsPerSec: number;
  timelineWidthPx: number;
  simTimeSec: number;
}

export const BayLaneRow: React.FC<BayLaneRowProps> = ({
  barista,
  highlightFilter,
  selectedOrderId,
  onSelectOrder,
  onAdvanceBay,
  onOpenTicketDetail,
  onOpenEmptySlot,
  timelineStartSec,
  pixelsPerSec,
  timelineWidthPx,
  simTimeSec,
}) => {
  // Determine if active ticket is imminent (<15s or flagged imminent)
  const activeTicket = barista.queue[0];
  const isImminent =
    barista.status === 'imminent' ||
    (activeTicket && activeTicket.status === 'brewing' && (activeTicket.timeRemainingSec ?? 999) <= 15);
  const isOvertime = Boolean(activeTicket && activeTicket.status === 'brewing' && activeTicket.timeRemainingSec === 0);
  const formatRemaining = (seconds?: number) => {
    if (seconds === undefined) return '--:--';
    const safeSeconds = Math.max(0, seconds);
    return `${Math.floor(safeSeconds / 60)}:${(safeSeconds % 60).toString().padStart(2, '0')}`;
  };

  // Combine past completed tickets and current queue for full timeline view
  const allTickets: OrderTicket[] = [
    ...(barista.pastTickets || []).map((t) => ({ ...t, status: 'completed' as const })),
    ...barista.queue,
  ];

  let queueCursorSec: number | null = null;
  const positionedTickets = allTickets.map((ticket) => {
    let startSec = ticket.startTimeSec ?? timelineStartSec + 855;
    if (queueCursorSec !== null && ticket.status !== 'completed') startSec = Math.max(startSec, queueCursorSec + 15);
    const plannedEndSec = startSec + ticket.totalDurationSec;
    const endSec = ticket === activeTicket ? Math.max(plannedEndSec, simTimeSec) : plannedEndSec;
    if (ticket.status !== 'completed') queueCursorSec = endSec;
    return { ticket, startSec, endSec };
  });

  // Calculate the end of the last ticket to position the Empty Slot button
  let lastTicketEndSec = 29300;
  if (positionedTickets.length > 0) {
    lastTicketEndSec = positionedTickets[positionedTickets.length - 1].endSec;
  }
  const emptySlotLeftPx = Math.max(
    1300,
    (lastTicketEndSec - timelineStartSec) * pixelsPerSec + 16
  );

  return (
    <div data-bay-target={barista.id} className="flex items-center h-[72px] border-b border-[#e2e8f0] bg-white hover:bg-[#fcfdff] transition-colors relative touch-manipulation">
      {/* 1. Barista Info Module - Sticky left column (200px) */}
      <div className="sticky left-0 z-50 w-[195px] shrink-0 self-stretch px-2 py-1.5 flex items-start gap-2 bg-white border-r border-[#e2e8f0] shadow-[4px_0_10px_rgba(15,23,42,0.08)] isolate">
        {/* Bay Number Box - iPad friendly 42px touch size */}
        <div className="w-9 h-9 bg-[#0f172a] rounded-lg flex items-center justify-center text-white font-mono font-black text-lg shadow-xs shrink-0">
          {barista.bayNumber}
        </div>

        {/* Barista Name & Speed Coefficient */}
        <div className="flex flex-col min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <span className="font-bold text-[16px] text-[#0f172a] tracking-tight truncate">
              {barista.name}
            </span>
            {barista.canHandleSpecial && (
              <span className="px-1 py-0.5 rounded bg-emerald-950 text-emerald-100 text-[8px] font-black whitespace-nowrap">
                ★SP
              </span>
            )}
          </div>

          <div className="flex items-baseline justify-between gap-1 min-w-0">
            <span className="text-[12px] font-bold text-slate-800 truncate" title={activeTicket?.beanName}>
              {activeTicket ? `${activeTicket.beanName} ×${activeTicket.cupCount}` : '待機中'}
            </span>
            {activeTicket && (
              <span className="font-mono text-[17px] font-black text-slate-950 shrink-0">{activeTicket.id}</span>
            )}
          </div>
          <div className={`font-mono text-[20px] leading-none font-black ${isImminent ? 'text-red-600' : 'text-slate-950'}`}>
            {activeTicket ? (isOvertime ? '継続中' : formatRemaining(activeTicket.timeRemainingSec)) : '--:--'}
          </div>
        </div>
      </div>

      {/* 2. Action Button - Sticky left column after barista info (95px) */}
      <div className="sticky left-[195px] z-50 w-[95px] shrink-0 self-stretch px-2 flex items-center justify-center bg-white border-r border-[#cbd5e1] shadow-[4px_0_10px_rgba(15,23,42,0.08)] isolate">
        <button
          id={`bay-action-btn-${barista.id}`}
          disabled={barista.queue.length === 0}
          onClick={() => onAdvanceBay(barista.id)}
          className={`w-full min-h-[48px] rounded-lg font-black text-[15px] flex items-center justify-center gap-1.5 shadow-xs active:scale-95 touch-manipulation ${barista.queue.length === 0 ? 'bg-slate-200 text-slate-500' : isImminent ? 'bg-amber-500 text-slate-950 ring-2 ring-amber-200' : 'bg-[#006c4a] text-white'}`}
          title={`${barista.name}の現在の抽出を確定して次へ`}
        >
          <ArrowRightCircle className="w-5 h-5" />
          <span>{barista.queue.length === 0 ? '待機' : '次へ'}</span>
        </button>
      </div>

      {/* 3. Timeline Track with Ticket Queue scaled by duration */}
      <div
        className="relative h-[72px] py-1.5"
        style={{ width: `${timelineWidthPx}px` }}
      >
        {positionedTickets.map(({ ticket, startSec, endSec }, idx) => {
          const leftPx = Math.max(10, (startSec - timelineStartSec) * pixelsPerSec);
          const widthPx = Math.max(130, (endSec - startSec) * pixelsPerSec);

          return (
            <div
              key={`${ticket.ticketUid || ticket.id}-${idx}`}
              className="absolute top-1.5 bottom-1.5"
              style={{
                left: `${leftPx}px`,
                width: `${widthPx}px`,
              }}
            >
              <TicketCard
                ticket={ticket}
                highlightFilter={highlightFilter}
                selectedOrderId={selectedOrderId}
                onSelectOrder={onSelectOrder}
                onOpenDetail={onOpenTicketDetail}
                widthPx={widthPx}
              />
            </div>
          );
        })}

        {/* Empty Slot Button positioned after the last scheduled ticket */}
        <div
          className="absolute top-1.5 bottom-1.5"
          style={{ left: `${emptySlotLeftPx}px` }}
        >
          <button
            id={`empty-slot-bay-${barista.id}`}
            onClick={() => onOpenEmptySlot(barista.id)}
            className="h-full min-w-[130px] px-3 border-2 border-dashed border-[#cbd5e1] hover:border-blue-400 active:bg-blue-100/70 bg-[#f8fafc] text-[#64748b] hover:text-blue-600 rounded-lg flex items-center justify-center gap-1.5 text-[12.5px] font-bold transition-all group select-none touch-manipulation cursor-pointer"
            title="タップして未割当オーダーをこのドリッパーに割り当て"
          >
            <Plus className="w-4 h-4 group-hover:scale-110 transition-transform text-slate-500" />
            <span>空きスロット</span>
          </button>
        </div>
      </div>
    </div>
  );
};
