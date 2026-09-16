import React from 'react';
import { Coffee, Clock, Snowflake, CheckCircle2, ArrowRightCircle, Plus, Sparkles } from 'lucide-react';
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
}) => {
  // Determine coefficient badge color
  let coefBg = 'bg-[#dcfce7] text-[#15803d] border-[#86efac]';
  if (barista.coefficientColor === 'orange') {
    coefBg = 'bg-[#ffedd5] text-[#c2410c] border-[#fed7aa]';
  } else if (barista.coefficientColor === 'blue') {
    coefBg = 'bg-[#e0f2fe] text-[#0369a1] border-[#bae6fd]';
  }

  // Determine if active ticket is imminent (<15s or flagged imminent)
  const activeTicket = barista.queue[0];
  const isImminent =
    barista.status === 'imminent' ||
    (activeTicket && activeTicket.status === 'brewing' && (activeTicket.timeRemainingSec ?? 999) <= 15);

  // Combine past completed tickets and current queue for full timeline view
  const allTickets: OrderTicket[] = [
    ...(barista.pastTickets || []).map((t) => ({ ...t, status: 'completed' as const })),
    ...barista.queue,
  ];

  // Calculate the end of the last ticket to position the Empty Slot button
  let lastTicketEndSec = 29300;
  if (allTickets.length > 0) {
    const lastT = allTickets[allTickets.length - 1];
    lastTicketEndSec = lastT.endTimeSec || (lastT.startTimeSec ? lastT.startTimeSec + lastT.totalDurationSec : 29350);
  }
  const emptySlotLeftPx = Math.max(
    1300,
    (lastTicketEndSec - timelineStartSec) * pixelsPerSec + 16
  );

  return (
    <div className="flex items-center min-h-[86px] border-b border-[#e2e8f0] bg-white hover:bg-[#fcfdff] transition-colors relative touch-manipulation">
      {/* 1. Barista Info Module - Sticky left column (200px) */}
      <div className="sticky left-0 z-20 w-[195px] shrink-0 pl-3 pr-2.5 py-2 flex items-center gap-2.5 bg-white border-r border-[#e2e8f0]/80 shadow-[2px_0_6px_rgba(0,0,0,0.03)]">
        {/* Bay Number Box - iPad friendly 42px touch size */}
        <div className="w-10 h-10 bg-[#0f172a] rounded-lg flex items-center justify-center text-white font-mono font-black text-lg shadow-xs shrink-0">
          {barista.bayNumber}
        </div>

        {/* Barista Name & Speed Coefficient */}
        <div className="flex flex-col min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-[15.5px] text-[#0f172a] tracking-tight truncate">
              {barista.name}
            </span>
            <span
              className={`font-mono text-[10.5px] font-black px-1.5 py-0.5 rounded border leading-none ${coefBg}`}
            >
              ×{barista.coefficient.toFixed(2)}
            </span>
          </div>

          {/* Subtext: Time remaining / Status */}
          <div className="flex items-center gap-1 text-[11px] mt-1 truncate font-medium">
            {barista.iconType === 'clock' ? (
              <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            ) : barista.iconType === 'snowflake' ? (
              <Snowflake className="w-3.5 h-3.5 text-cyan-600 shrink-0" />
            ) : (
              <Coffee className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            )}
            <span
              className={`font-mono text-[11px] ${
                isImminent ? 'text-emerald-700 font-black' : 'text-slate-600'
              }`}
            >
              {barista.remainingStr}
            </span>
          </div>
        </div>
      </div>

      {/* 2. Action Button - Sticky left column after barista info (95px) */}
      <div className="sticky left-[195px] z-20 w-[95px] shrink-0 px-2 flex items-center justify-center bg-white border-r border-[#cbd5e1] shadow-[2px_0_6px_rgba(0,0,0,0.04)]">
        {isImminent ? (
          /* Animated Pulse/Glow Completion Button on imminent completion */
          <div className="relative w-full">
            <span className="absolute -inset-1 rounded-lg bg-emerald-400 opacity-75 animate-ping" />
            <button
              id={`bay-action-btn-${barista.id}`}
              onClick={() => onAdvanceBay(barista.id)}
              className="relative w-full min-h-[46px] py-2 px-1.5 rounded-lg bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 text-white font-black text-[13px] tracking-tight flex flex-col items-center justify-center shadow-lg shadow-emerald-500/30 active:scale-95 transition-all cursor-pointer ring-2 ring-emerald-300"
              title="まもなく抽出完了！タップして完了"
            >
              <div className="flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4 animate-bounce" />
                <span>完了！</span>
              </div>
              <span className="text-[9px] font-bold text-emerald-100 leading-none mt-0.5">
                タップ確定
              </span>
            </button>
          </div>
        ) : (
          /* Normal Action Button */
          <button
            id={`bay-action-btn-${barista.id}`}
            onClick={() => onAdvanceBay(barista.id)}
            className={`w-full min-h-[44px] py-2.5 px-2 rounded-lg font-bold text-[13px] tracking-tight flex items-center justify-center gap-1 shadow-xs transition-all active:scale-95 touch-manipulation select-none cursor-pointer ${
              barista.queue.length === 0
                ? 'bg-slate-200 text-slate-500 hover:bg-slate-300'
                : barista.id === 1 || barista.id === 2
                ? 'bg-[#006c4a] hover:bg-[#005137] text-white'
                : 'bg-[#059669] hover:bg-[#047857] text-white'
            }`}
            title={`${barista.name}の抽出を進める / 完了`}
          >
            {barista.queue.length === 0 ? (
              <span>待機中</span>
            ) : barista.id === 1 || barista.id === 2 ? (
              <>
                <ArrowRightCircle className="w-4 h-4" />
                <span>次へ</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>完了</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* 3. Timeline Track with Ticket Queue scaled by duration */}
      <div
        className="relative h-[86px] py-2"
        style={{ width: `${timelineWidthPx}px` }}
      >
        {allTickets.map((ticket, idx) => {
          // Precise start seconds and width calculated from totalDurationSec
          const startSec =
            ticket.startTimeSec ??
            timelineStartSec + (idx === 0 ? 855 : 855 + idx * 140);
          const leftPx = Math.max(10, (startSec - timelineStartSec) * pixelsPerSec);
          const widthPx = Math.max(130, (ticket.totalDurationSec || 140) * pixelsPerSec);

          return (
            <div
              key={`${ticket.ticketUid || ticket.id}-${idx}`}
              className="absolute top-2 bottom-2"
              style={{
                left: `${leftPx}px`,
                width: `${widthPx}px`,
              }}
            >
              <TicketCard
                ticket={ticket}
                isFirst={ticket.status === 'brewing'}
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
          className="absolute top-2 bottom-2"
          style={{ left: `${emptySlotLeftPx}px` }}
        >
          <button
            id={`empty-slot-bay-${barista.id}`}
            onClick={() => onOpenEmptySlot(barista.id)}
            className="h-full min-w-[130px] px-3 border-2 border-dashed border-[#cbd5e1] hover:border-blue-400 active:bg-blue-100/70 bg-[#f8fafc] text-[#64748b] hover:text-blue-600 rounded-lg flex items-center justify-center gap-1.5 text-[12.5px] font-bold transition-all group select-none touch-manipulation cursor-pointer"
            title="タップして未割当オーダーをこのベイに割り当て"
          >
            <Plus className="w-4 h-4 group-hover:scale-110 transition-transform text-slate-500" />
            <span>空きスロット</span>
          </button>
        </div>
      </div>
    </div>
  );
};

