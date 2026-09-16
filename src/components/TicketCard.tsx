import React from 'react';
import { Check } from 'lucide-react';
import { OrderTicket, BeanCode } from '../types';

interface TicketCardProps {
  ticket: OrderTicket;
  highlightFilter: BeanCode | null;
  selectedOrderId: string | null;
  onSelectOrder: (orderId: string) => void;
  onOpenDetail: (ticket: OrderTicket) => void;
  widthPx?: number;
}

export const TicketCard: React.FC<TicketCardProps> = ({
  ticket,
  highlightFilter,
  selectedOrderId,
  onSelectOrder,
  onOpenDetail,
  widthPx,
}) => {
  const isMatchFilter = !highlightFilter || highlightFilter === ticket.beanCode;
  const isOrderSelected = selectedOrderId === ticket.id;

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
      onClick={() => {
        onSelectOrder(ticket.id);
        onOpenDetail(ticket);
      }}
      id={`ticket-${ticket.ticketUid || ticket.id.replace('#', '')}`}
      style={widthPx ? { width: `${widthPx}px` } : undefined}
      className={`relative group h-full overflow-hidden shrink-0 min-w-[135px] rounded-lg border-2 border-l-[5px] ${leftBorderColor} px-2 py-1.5 cursor-pointer transition-all select-none touch-manipulation active:scale-[0.98] flex flex-col justify-center ${
        isCompleted
          ? 'bg-slate-50/90 border-slate-200 text-slate-600 opacity-80 hover:opacity-100'
          : 'bg-white border-[#cbd5e1] hover:border-slate-400 shadow-xs hover:shadow-md'
      } ${
        isOrderSelected
          ? 'ring-4 ring-amber-400 border-amber-500 bg-amber-50/95 shadow-xl scale-[1.02] z-20'
          : ''
      } ${!isMatchFilter ? 'opacity-25 blur-[0.5px]' : ''}`}
    >
      {/* Top row: Ticket ID and Badges */}
      <div>
        <div className="flex items-center justify-between gap-1 mb-1">
          <div className="flex items-center gap-1 flex-wrap">
            {/* Large Order Number Label */}
            <span
              className={`font-mono text-[22px] font-black tracking-tight leading-none ${
                isOrderSelected ? 'text-amber-900 font-black' : isCompleted ? 'text-slate-600' : 'text-[#0f172a]'
              }`}
            >
              {ticket.id}
            </span>

            {/* Cup count badge */}
            <span className="bg-amber-500 text-white text-[10px] font-mono font-black px-1.5 py-0.5 rounded leading-none shadow-2xs">
              {ticket.cupCount}杯
            </span>

            {ticket.preferredBaristaId && <span className="rounded bg-violet-700 px-1.5 py-0.5 text-[11px] font-black text-white">指名</span>}
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

          </div>
        </div>

        {/* Coffee Name */}
        <div className="flex items-baseline justify-between gap-1">
          <span
            className={`text-[14px] font-bold truncate leading-tight tracking-tight flex-1 ${
              isOrderSelected ? 'text-amber-950 font-black' : isCompleted ? 'text-slate-600' : 'text-slate-900'
            }`}
            title={ticket.beanName}
          >
            {ticket.beanName}
          </span>
        </div>

        {/* Order Notes (e.g. チャンプ 2杯 + 俺ブレ 1杯) */}
      </div>

    </div>
  );
};
