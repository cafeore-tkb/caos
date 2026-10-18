import { X } from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import type { BeanCode, OrderTicket } from '../types';
import { OperationalCard } from './OperationalCard';

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
  onRequestRebrew: (ticket: OrderTicket) => void;
  widthPx?: number;
}

export const TicketCard: React.FC<TicketCardProps> = ({
  ticket,
  highlightFilter,
  selectedOrderId,
  onOpenDetail,
  actionTicketKey,
  currentBayId,
  onMoveTicket,
  onReturnToUnassigned,
  onCloseAction,
  onRequestRebrew,
  widthPx,
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const suppressNextClick = useRef(false);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null);
  const [dragTargetBay, setDragTargetBay] = useState<number | null>(null);
  const isMatchFilter = !highlightFilter || highlightFilter === ticket.beanCode;
  const isOrderSelected = selectedOrderId === ticket.id;

  const isCompleted = ticket.status === 'completed';
  const ticketKey = ticket.ticketUid || `${ticket.id}-${ticket.itemIndex || 1}`;
  const isActionOpen = ticket.status === 'scheduled' && actionTicketKey === ticketKey;
  // While dragging, cancel the card's offset on the pad so the finger can slide onto 1-6.
  const padDragStyle = dragOffset ? { transform: `translate3d(${-dragOffset.x}px, ${-dragOffset.y}px, 0)` } : {};

  useEffect(() => {
    if (!isActionOpen) return;
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!cardRef.current?.contains(event.target as Node)) onCloseAction();
    };
    document.addEventListener('pointerdown', closeOnOutsidePress);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePress);
  }, [isActionOpen, onCloseAction]);

  const bayAtPoint = (clientX: number, clientY: number) => {
    const elements = document.elementsFromPoint(clientX, clientY);
    // A 1-6 pad button decides on its own: releasing on this card's own (disabled) number
    // must not fall through to the lane underneath the pad.
    const padButton = elements.find(
      (element): element is HTMLElement => element instanceof HTMLElement && element.matches('button[data-bay-target]')
    );
    if (padButton) {
      const bayId = Number(padButton.dataset.bayTarget);
      return bayId >= 1 && bayId <= 6 && bayId !== currentBayId ? bayId : null;
    }
    const lane = elements
      .map((element) => element.closest<HTMLElement>('[data-bay-target]'))
      .find((element) => {
        const bayId = Number(element?.dataset.bayTarget);
        return element && bayId >= 1 && bayId <= 6 && bayId !== currentBayId;
      });
    return lane ? Number(lane.dataset.bayTarget) : null;
  };

  const finishDrag = () => {
    dragStart.current = null;
    setDragOffset(null);
    setDragTargetBay(null);
  };

  return (
    <div
      ref={cardRef}
      onClick={() => {
        if (suppressNextClick.current) {
          suppressNextClick.current = false;
          return;
        }
        if (ticket.status !== 'scheduled') {
          onRequestRebrew(ticket);
          return;
        }
        if (isActionOpen) {
          onReturnToUnassigned(ticket);
          onCloseAction();
          return;
        }
        onOpenDetail(ticket);
      }}
      onPointerDown={(event) => {
        // A touch drag ends without a click, so drop any suppression left by it.
        suppressNextClick.current = false;
        if (ticket.status !== 'scheduled') return;
        if ((event.target as HTMLElement).closest('button')) return;
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        dragStart.current = { x: event.clientX, y: event.clientY };
      }}
      onPointerMove={(event) => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId) || !dragStart.current) return;
        const x = event.clientX - dragStart.current.x;
        const y = event.clientY - dragStart.current.y;
        if (!dragOffset && Math.hypot(x, y) < 10) return;
        event.preventDefault();
        setDragOffset({ x, y });
        setDragTargetBay(bayAtPoint(event.clientX, event.clientY));
      }}
      onPointerUp={(event) => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
        event.currentTarget.releasePointerCapture(event.pointerId);
        const start = dragStart.current;
        const moved = start ? Math.hypot(event.clientX - start.x, event.clientY - start.y) >= 10 : false;
        const targetBay = moved ? bayAtPoint(event.clientX, event.clientY) : null;
        finishDrag();
        if (moved) {
          suppressNextClick.current = true;
          if (targetBay && (!ticket.preferredBaristaId || ticket.preferredBaristaId === targetBay)) {
            onMoveTicket(ticket, targetBay);
            onCloseAction();
          }
        }
      }}
      onPointerCancel={finishDrag}
      id={`ticket-${ticket.ticketUid || ticket.id.replace('#', '')}`}
      style={{
        ...(widthPx ? { width: `${widthPx}px` } : {}),
        ...(dragOffset ? { transform: `translate3d(${dragOffset.x}px, ${dragOffset.y}px, 0)` } : {}),
      }}
      role="button"
      tabIndex={0}
      aria-label={`${ticket.id} ${ticket.beanName} ${ticket.cupCount}杯の操作`}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          event.currentTarget.click();
        }
      }}
      className={`relative group h-full shrink-0 min-w-[135px] rounded-lg ${dragOffset || isActionOpen ? 'overflow-visible z-[80]' : 'overflow-hidden'} ${ticket.status === 'scheduled' ? 'cursor-grab active:cursor-grabbing touch-none' : 'cursor-pointer touch-manipulation'} ${isOrderSelected ? 'ring-4 ring-amber-400' : ''} ${!isMatchFilter ? 'opacity-25' : ''}`}
    >
      {dragOffset && dragTargetBay && (
        <div className="absolute right-1 top-1 z-[130] rounded-full bg-blue-700 px-2 py-1 font-mono text-[12px] font-black text-white shadow-md pointer-events-none">
          → {dragTargetBay}
        </div>
      )}
      {isActionOpen && (
        <>
          {[1, 2, 3].map((bayId, index) => {
            const disabled =
              bayId === currentBayId || Boolean(ticket.preferredBaristaId && ticket.preferredBaristaId !== bayId);
            return (
              <button
                key={bayId}
                type="button"
                data-bay-target={bayId}
                disabled={disabled}
                onClick={(event) => {
                  event.stopPropagation();
                  onMoveTicket(ticket, bayId);
                  onCloseAction();
                }}
                className="absolute -top-[38px] z-[90] h-[34px] rounded-md border bg-white text-[17px] font-mono font-black shadow-lg disabled:bg-slate-200 disabled:text-slate-400 touch-none"
                style={{ left: `${index * 33.333}%`, width: '33.333%', ...padDragStyle }}
              >
                {bayId}
              </button>
            );
          })}
          {[4, 5, 6].map((bayId, index) => {
            const disabled =
              bayId === currentBayId || Boolean(ticket.preferredBaristaId && ticket.preferredBaristaId !== bayId);
            return (
              <button
                key={bayId}
                type="button"
                data-bay-target={bayId}
                disabled={disabled}
                onClick={(event) => {
                  event.stopPropagation();
                  onMoveTicket(ticket, bayId);
                  onCloseAction();
                }}
                className="absolute -bottom-[38px] z-[90] h-[34px] rounded-md border bg-white text-[17px] font-mono font-black shadow-lg disabled:bg-slate-200 disabled:text-slate-400 touch-none"
                style={{ left: `${index * 33.333}%`, width: '33.333%', ...padDragStyle }}
              >
                {bayId}
              </button>
            );
          })}
          <div className="absolute inset-0 z-[70] rounded-md bg-red-500/10 pointer-events-none flex items-center justify-center">
            <X className="w-10 h-10 text-red-600/35 stroke-[3]" />
          </div>
        </>
      )}
      <OperationalCard
        card={ticket}
        note={isCompleted ? (ticket.isInterrupted ? '中断' : '完了') : ticket.status === 'brewing' ? '抽出中' : '待機'}
      />
    </div>
  );
};
