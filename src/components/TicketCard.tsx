import React, { useEffect, useRef } from 'react';
import { Check, X } from 'lucide-react';
import { OrderTicket, BeanCode } from '../types';

interface TicketCardProps {
  ticket: OrderTicket;
  highlightFilter: BeanCode | null;
  selectedOrderId: string | null;
  onSelectOrder: (orderId: string) => void;
  onOpenDetail: (ticket: OrderTicket) => void;
  actionTicketKey?: string | null;
  currentBayId: number;
  onMoveTicket: (ticket: OrderTicket, bayId: number) => void;
  onReturnToUnassigned: (ticket: OrderTicket) => void;
  onCloseAction: () => void;
  widthPx?: number;
}

export const TicketCard: React.FC<TicketCardProps> = ({
  ticket,
  highlightFilter,
  selectedOrderId,
  onSelectOrder,
  onOpenDetail,
  actionTicketKey,
  currentBayId,
  onMoveTicket,
  onReturnToUnassigned,
  onCloseAction,
  widthPx,
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const isMatchFilter = !highlightFilter || highlightFilter === ticket.beanCode;
  const isOrderSelected = selectedOrderId === ticket.id;

  // Operational color is reserved for drinks that require a special finish/person.
  let leftBorderColor = 'border-l-slate-400';
  if (ticket.beanCode === 'SP') leftBorderColor = 'border-l-[#059669]';
  if (ticket.beanCode === 'ICE') leftBorderColor = 'border-l-[#06b6d4]';
  if (ticket.beanCode === 'MILK') leftBorderColor = 'border-l-[#8b5cf6]';

  const isCompleted = ticket.status === 'completed';
  const isNamed = Boolean(ticket.preferredBaristaId);
  const ticketKey = ticket.ticketUid || `${ticket.id}-${ticket.itemIndex || 1}`;
  const isActionOpen = ticket.status === 'scheduled' && actionTicketKey === ticketKey;

  useEffect(() => {
    if (!isActionOpen) return;
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!cardRef.current?.contains(event.target as Node)) onCloseAction();
    };
    document.addEventListener('pointerdown', closeOnOutsidePress);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePress);
  }, [isActionOpen, onCloseAction]);

  return (
    <div
      ref={cardRef}
      onClick={() => {
        if (ticket.status !== 'scheduled') return;
        if (isActionOpen) {
          onReturnToUnassigned(ticket);
          onCloseAction();
          return;
        }
        onOpenDetail(ticket);
      }}
      id={`ticket-${ticket.ticketUid || ticket.id.replace('#', '')}`}
      style={widthPx ? { width: `${widthPx}px` } : undefined}
      className={`relative group h-full ${isActionOpen ? 'overflow-visible z-[80]' : 'overflow-hidden'} shrink-0 min-w-[135px] rounded-lg border-2 border-l-[5px] ${leftBorderColor} px-2 py-1.5 transition-[box-shadow,border-color] select-none touch-manipulation flex flex-col justify-center ${ticket.status === 'scheduled' ? 'cursor-pointer' : 'cursor-default'} ${
        isCompleted
          ? 'bg-slate-100 border-slate-200 text-slate-500 opacity-50 hover:opacity-70'
          : isNamed
          ? 'bg-violet-50 border-violet-300 hover:border-violet-400 shadow-xs hover:shadow-md'
          : 'bg-white border-[#cbd5e1] hover:border-slate-400 shadow-xs hover:shadow-md'
      } ${
        isOrderSelected
          ? 'ring-4 ring-amber-400 border-amber-500 bg-amber-50/95 shadow-xl scale-[1.02] z-20'
          : ''
      } ${!isMatchFilter ? 'opacity-25 blur-[0.5px]' : ''}`}
    >
      {isActionOpen && (
        <>
          {[1, 2, 3].map((bayId, index) => {
            const disabled = bayId === currentBayId || Boolean(ticket.preferredBaristaId && ticket.preferredBaristaId !== bayId);
            return <button key={bayId} type="button" disabled={disabled} onClick={(event) => { event.stopPropagation(); onMoveTicket(ticket, bayId); onCloseAction(); }} className="absolute -top-[38px] z-[90] h-[34px] rounded-md border bg-white text-[17px] font-mono font-black shadow-lg disabled:bg-slate-200 disabled:text-slate-400 touch-none" style={{ left: `${index * 33.333}%`, width: '33.333%' }}>{bayId}</button>;
          })}
          {[4, 5, 6].map((bayId, index) => {
            const disabled = bayId === currentBayId || Boolean(ticket.preferredBaristaId && ticket.preferredBaristaId !== bayId);
            return <button key={bayId} type="button" disabled={disabled} onClick={(event) => { event.stopPropagation(); onMoveTicket(ticket, bayId); onCloseAction(); }} className="absolute -bottom-[38px] z-[90] h-[34px] rounded-md border bg-white text-[17px] font-mono font-black shadow-lg disabled:bg-slate-200 disabled:text-slate-400 touch-none" style={{ left: `${index * 33.333}%`, width: '33.333%' }}>{bayId}</button>;
          })}
          <div className="absolute inset-0 z-[70] rounded-md bg-red-500/10 pointer-events-none flex items-center justify-center">
            <X className="w-10 h-10 text-red-600/35 stroke-[3]" />
          </div>
        </>
      )}
      {/* Top row: Ticket ID and Badges */}
      <div>
        <div className="flex items-center justify-between gap-1 mb-1">
          <div className="flex items-center gap-1 min-w-0">
            {/* Large Order Number Label */}
            <span
              className={`font-mono text-[22px] font-black tracking-tight leading-none ${
                isOrderSelected ? 'text-amber-900 font-black' : isNamed ? 'text-violet-700' : isCompleted ? 'text-slate-500' : 'text-[#0f172a]'
              }`}
            >
              {ticket.id}
            </span>

            {/* Cup count badge */}
            <span className="bg-slate-950 text-white text-[15px] font-mono font-black px-2 py-1 rounded-md leading-none shadow-2xs whitespace-nowrap shrink-0">
              {ticket.cupCount}杯
            </span>

            {ticket.preferredBaristaId && <span className="rounded bg-violet-700 px-1.5 py-0.5 text-[11px] font-black text-white">指名</span>}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {isCompleted && (
              <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] font-bold px-1.5 py-0.5 rounded leading-none flex items-center gap-0.5">
                <Check className="w-3 h-3" />
                <span className="sr-only">完了</span>
              </span>
            )}

          </div>
        </div>

        {/* Coffee Name */}
        <div className="flex items-baseline gap-2">
          <span
            className={`text-[14px] font-bold truncate leading-tight tracking-tight flex-1 ${
              isOrderSelected ? 'text-amber-950 font-black' : isCompleted ? 'text-slate-600' : 'text-slate-900'
            }`}
            title={ticket.beanName}
          >
            {ticket.beanName}
          </span>
          {ticket.totalItemsInOrder && !(ticket.totalItemsInOrder === 1 && ticket.totalOrderCups === 1) && (
            <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-mono font-black text-slate-700 whitespace-nowrap shrink-0">
              {ticket.itemIndex}/{ticket.totalItemsInOrder}・計{ticket.totalOrderCups}杯
            </span>
          )}
        </div>

        {/* Order Notes (e.g. チャンプ 2杯 + 俺ブレ 1杯) */}
      </div>

    </div>
  );
};
