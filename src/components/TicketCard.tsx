import React from 'react';
import { Check, Info, Sparkles } from 'lucide-react';
import { OrderTicket, BeanCode } from '../types';
import { BEAN_LEGENDS } from '../data/initialData';

interface TicketCardProps {
  ticket: OrderTicket;
  isFirst?: boolean;
  highlightFilter: BeanCode | null;
  selectedOrderId: string | null;
  onSelectOrder: (orderId: string) => void;
  onOpenDetail: (ticket: OrderTicket) => void;
  widthPx?: number;
}

export const TicketCard: React.FC<TicketCardProps> = ({
  ticket,
  isFirst = false,
  highlightFilter,
  selectedOrderId,
  onSelectOrder,
  onOpenDetail,
  widthPx,
}) => {
  const isMatchFilter = !highlightFilter || highlightFilter === ticket.beanCode;
  const isOrderSelected = selectedOrderId === ticket.id;

  // Format time remaining for in-progress card
  const formatSec = (sec?: number) => {
    if (sec === undefined) return '';
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const formatClock = (totalSec?: number) => {
    if (totalSec === undefined) return '';
    const m = Math.floor(totalSec / 60) % 60;
    const h = Math.floor(totalSec / 3600) % 24;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  };

  // Progress percentage for bottom active bar
  const progressPercent =
    ticket.timeRemainingSec !== undefined
      ? Math.max(0, Math.min(100, (1 - ticket.timeRemainingSec / ticket.totalDurationSec) * 100))
      : 0;

  // Border accents according to bean / ticket status
  let leftBorderColor = 'border-l-slate-400';
  if (ticket.beanCode === 'KEN') leftBorderColor = 'border-l-[#f97316]';
  if (ticket.beanCode === 'BRA') leftBorderColor = 'border-l-[#22c55e]';
  if (ticket.beanCode === 'TNZ') leftBorderColor = 'border-l-[#0284c7]';
  if (ticket.beanCode === 'ORE') leftBorderColor = 'border-l-[#18181b]';
  if (ticket.beanCode === 'CHAMP') leftBorderColor = 'border-l-[#0ea5e9]';
  if (ticket.beanCode === 'SP') leftBorderColor = 'border-l-[#059669]';
  if (ticket.beanCode === 'ICE') leftBorderColor = 'border-l-[#06b6d4]';
  if (ticket.beanCode === 'MILK') leftBorderColor = 'border-l-[#8b5cf6]';

  const isCompleted = ticket.status === 'completed';

  return (
    <div
      onClick={() => onSelectOrder(ticket.id)}
      id={`ticket-${ticket.ticketUid || ticket.id.replace('#', '')}`}
      style={widthPx ? { width: `${widthPx}px` } : undefined}
      className={`relative group shrink-0 min-w-[135px] rounded-lg border-2 border-l-[5px] ${leftBorderColor} px-2.5 py-2 cursor-pointer transition-all select-none touch-manipulation active:scale-[0.98] flex flex-col justify-between ${
        isCompleted
          ? 'bg-slate-50/90 border-slate-200 text-slate-600 opacity-80 hover:opacity-100'
          : 'bg-white border-[#cbd5e1] hover:border-slate-400 shadow-xs hover:shadow-md'
      } ${
        isOrderSelected
          ? 'ring-4 ring-amber-400 border-amber-500 bg-amber-50/95 shadow-xl scale-[1.02] z-20'
          : ''
      } ${!isMatchFilter ? 'opacity-25 blur-[0.5px]' : ''}`}
    >
      {/* Top Linked Order Highlight Banner */}
      {isOrderSelected && (
        <div className="absolute -top-2.5 left-2 bg-amber-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-full shadow-xs flex items-center gap-1 z-30 animate-pulse">
          <Sparkles className="w-2.5 h-2.5" />
          <span>同一オーダー連動</span>
        </div>
      )}

      {/* Top row: Ticket ID and Badges */}
      <div>
        <div className="flex items-center justify-between gap-1 mb-1">
          <div className="flex items-center gap-1 flex-wrap">
            {/* Large Order Number Label */}
            <span
              className={`font-mono text-[16px] font-black tracking-tight leading-none ${
                isOrderSelected ? 'text-amber-900 font-black' : isCompleted ? 'text-slate-600' : 'text-[#0f172a]'
              }`}
            >
              {ticket.id}
            </span>

            {/* Cup count badge */}
            <span className="bg-amber-500 text-white text-[10px] font-mono font-black px-1.5 py-0.5 rounded leading-none shadow-2xs">
              {ticket.cupCount}杯
            </span>

            {/* Multi-item Order Indicator */}
            {ticket.totalItemsInOrder && ticket.totalItemsInOrder > 1 && (
              <span
                className={`text-[9px] font-bold px-1.5 py-0.5 rounded leading-none border ${
                  isOrderSelected
                    ? 'bg-amber-200 text-amber-950 border-amber-400'
                    : 'bg-slate-100 text-slate-700 border-slate-300'
                }`}
                title={`同一オーダー内に${ticket.totalItemsInOrder}品 (合計${ticket.totalOrderCups}杯)`}
              >
                [{ticket.itemIndex}/{ticket.totalItemsInOrder}]
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {/* Tag Badges */}
            {isCompleted ? (
              <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] font-bold px-1.5 py-0.5 rounded leading-none flex items-center gap-0.5">
                <Check className="w-3 h-3" />
                <span>済</span>
              </span>
            ) : ticket.tag === '★SP' ? (
              <span className="bg-[#064e3b] text-white text-[9px] font-mono font-bold px-1.5 py-0.5 rounded leading-none flex items-center gap-0.5">
                <span>★SP</span>
                {ticket.secondaryTag && <span className="text-emerald-200 text-[8px]">{ticket.secondaryTag}</span>}
              </span>
            ) : ticket.tag === 'BATCH' ? (
              <span className="bg-[#f1f5f9] text-slate-700 border border-slate-300 text-[9px] font-bold px-1.5 py-0.5 rounded leading-none">
                BATCH
              </span>
            ) : ticket.tag === 'ICE' || ticket.tag === '氷' ? (
              <span className="bg-[#0284c7] text-white text-[9px] font-bold px-1.5 py-0.5 rounded leading-none">
                {ticket.secondaryTag ? ticket.secondaryTag : '氷'}
              </span>
            ) : ticket.tag === '牛' || ticket.tag === '牛オレ' ? (
              <span className="bg-[#e2e8f0] text-slate-800 text-[9px] font-bold px-1.5 py-0.5 rounded leading-none">
                牛
              </span>
            ) : (
              <span className="bg-[#0f172a] text-white text-[9px] font-bold px-1.5 py-0.5 rounded leading-none">
                HOT
              </span>
            )}

            {/* Recipe Detail Button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onOpenDetail(ticket);
              }}
              className="w-5 h-5 rounded hover:bg-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-700 transition-colors"
              title="レシピ詳細を表示"
            >
              <Info className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Coffee Name */}
        <div className="flex items-baseline justify-between gap-1">
          <span
            className={`text-[12.5px] font-bold truncate leading-tight tracking-tight flex-1 ${
              isOrderSelected ? 'text-amber-950 font-black' : isCompleted ? 'text-slate-600' : 'text-slate-900'
            }`}
            title={ticket.beanName}
          >
            {ticket.beanName}
          </span>
        </div>

        {/* Order Notes (e.g. チャンプ 2杯 + 俺ブレ 1杯) */}
        {ticket.orderNotes && (
          <div className="text-[9.5px] text-slate-500 truncate mt-0.5 font-medium" title={ticket.orderNotes}>
            {ticket.orderNotes}
          </div>
        )}
      </div>

      {/* Bottom Timing Row */}
      <div className="flex items-center justify-between pt-1 mt-1 border-t border-slate-100 text-[10px]">
        {/* Total Duration Indicator */}
        <span className="text-slate-400 font-mono font-semibold">
          {Math.floor(ticket.totalDurationSec / 60)}:{(ticket.totalDurationSec % 60).toString().padStart(2, '0')}
        </span>

        {/* Status indicator */}
        {isCompleted ? (
          <span className="font-mono font-medium text-slate-500">
            {formatClock(ticket.startTimeSec)} - {formatClock(ticket.endTimeSec)}
          </span>
        ) : ticket.status === 'brewing' ? (
          <span
            className={`font-mono font-black ${
              (ticket.timeRemainingSec ?? 0) <= 15
                ? 'text-red-600 animate-pulse font-extrabold'
                : 'text-red-500'
            }`}
          >
            残 {formatSec(ticket.timeRemainingSec)}
          </span>
        ) : (
          <span className="font-mono font-bold text-slate-600">
            予定 {ticket.scheduledTimeStr}
          </span>
        )}
      </div>

      {/* Progress line at bottom for in-progress active ticket */}
      {isFirst && ticket.status === 'brewing' && (
        <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-slate-100 overflow-hidden rounded-b">
          <div
            className="h-full bg-[#0284c7] transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      )}
    </div>
  );
};

